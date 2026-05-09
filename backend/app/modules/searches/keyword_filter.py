"""
Postgres FTS keyword filter for search results.

Pulls user-entered keywords like "протезирование, имплантация" and turns them
into a safe `tsquery` so we never inject raw text into Postgres operators.
Used both to filter the result list and to report which words actually matched
on each result.
"""

from __future__ import annotations

import re
from typing import Iterable, List, Tuple

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.search import SearchResultPage


# Anything that isn't a letter/digit is treated as a separator. Cyrillic and
# Latin both pass through unchanged. We strip control chars / punctuation so a
# tsquery can never break out via parens, "&", "|", "!", etc.
_TOKEN_RE = re.compile(r"[^\W_]+", re.UNICODE)


def parse_keywords(raw: str | Iterable[str] | None) -> List[str]:
    """Normalise user input into a list of lowercase, deduplicated tokens.

    Accepts comma/space-separated string OR list of strings. Drops anything
    shorter than 3 characters (common typo / noise) and anything that isn't a
    real word. Order is preserved for display purposes.
    """
    if raw is None:
        return []
    if isinstance(raw, str):
        candidates = [raw]
    else:
        candidates = [str(s) for s in raw]

    seen: set[str] = set()
    out: List[str] = []
    for chunk in candidates:
        for tok in _TOKEN_RE.findall(chunk.lower()):
            if len(tok) < 3:
                continue
            if tok in seen:
                continue
            seen.add(tok)
            out.append(tok)
    return out


def build_tsquery(keywords: List[str], mode: str = "or") -> str | None:
    """Compose a tsquery body from cleaned keywords.

    `mode='or'` → "kw1:* | kw2:* | kw3:*"     (any word matches)
    `mode='and'` → "kw1:* & kw2:* & kw3:*"   (all words must match)

    The `:*` suffix turns each token into a prefix match so "протез" hits
    "протезирование", "протезы", "протезированию" without us shipping a
    morphological dictionary on top of Postgres' russian config.
    """
    if not keywords:
        return None
    sep = " & " if mode == "and" else " | "
    return sep.join(f"{kw}:*" for kw in keywords)


async def find_matching_result_ids(
    db: AsyncSession,
    *,
    search_id: int,
    tsquery: str,
) -> set[int]:
    """Return the set of search_result IDs that have at least one crawled page
    matching the tsquery."""
    stmt = (
        select(SearchResultPage.search_result_id)
        .where(SearchResultPage.search_id == search_id)
        .where(SearchResultPage.search_vector.op("@@")(func.to_tsquery("russian", tsquery)))
        .distinct()
    )
    rows = (await db.execute(stmt)).scalars().all()
    return set(rows)


async def get_keyword_hits_per_result(
    db: AsyncSession,
    *,
    search_id: int,
    keywords: List[str],
) -> dict[int, List[str]]:
    """For each matched result, return the subset of `keywords` that actually
    occur on its pages. Used purely for UI badges; not for filtering."""
    if not keywords:
        return {}

    hits: dict[int, set[str]] = {}
    for kw in keywords:
        per_kw_query = f"{kw}:*"
        stmt = (
            select(SearchResultPage.search_result_id)
            .where(SearchResultPage.search_id == search_id)
            .where(
                SearchResultPage.search_vector.op("@@")(
                    func.to_tsquery("russian", per_kw_query)
                )
            )
            .distinct()
        )
        rows = (await db.execute(stmt)).scalars().all()
        for rid in rows:
            hits.setdefault(rid, set()).add(kw)

    return {rid: sorted(words) for rid, words in hits.items()}


def parse_keywords_and_query(
    raw: str | Iterable[str] | None,
    mode: str = "or",
) -> Tuple[List[str], str | None]:
    """One-shot helper: clean tokens + build tsquery in a single call."""
    kws = parse_keywords(raw)
    return kws, build_tsquery(kws, mode=mode)


# ---------------------------------------------------------------------------
# Wordstat-style filter builder.
#
# The form sends:
#   { "logic": "and" | "or",
#     "conditions": [
#         { "field": "text" | "title" | "meta" | "site_type" | "has_phone" | "has_email" | "domain",
#           "op":    "contains" | "not_contains" | "equals" | "not_equals" | "starts_with" | "is_true" | "is_false",
#           "value": "..." }
#     ] }
#
# We fan that out into:
#   - per-result FTS hits via search_result_pages (text/title/meta/contains)
#   - SQL filters on search_results columns (domain, has_phone, has_email)
#   - SQL filter on extra_data->'classification'->>'site_type'
#
# Each branch returns a SET of search_result IDs; we combine them with the
# top-level logic ("and" → intersection, "or" → union) before paginating.
# ---------------------------------------------------------------------------

# Field → which FTS document section it queries. None means "not an FTS field"
# and is handled by SQL instead.
_FTS_SECTION: dict[str, str | None] = {
    "text": None,   # full document — no extra restriction
    "title": "A",
    "meta": "B",
    "h1": "B",
    # Non-FTS fields:
    "site_type": None,
    "has_phone": None,
    "has_email": None,
    "domain": None,
}

_FTS_FIELDS = {"text", "title", "meta", "h1"}
_TEXT_OPS = {"contains", "not_contains", "equals", "not_equals", "starts_with"}
_BOOL_OPS = {"is_true", "is_false"}


def _build_fts_query_for_condition(field: str, op: str, value: str) -> str | None:
    """Compose tsquery body for a single FTS-style condition.

    `equals` is treated as a phrase match (we don't have exact-string FTS without
    introducing a separate column). For domain-style exact match use the
    `domain` field instead.
    """
    tokens = parse_keywords(value)
    if not tokens:
        return None

    if op in ("contains", "not_contains", "starts_with"):
        body = " & ".join(f"{t}:*" for t in tokens)
    elif op in ("equals", "not_equals"):
        # phraseto_tsquery would be ideal but we keep it simple — exact phrase
        # match by chaining tokens with `<->` ("followed by") instead of `&`.
        body = " <-> ".join(tokens)
    else:
        return None

    # Section restriction (e.g. `field:A` for title-only matches) — not exposed
    # in the public API yet; each FTS field uses the whole tsvector for now.
    return body if op != "not_contains" and op != "not_equals" else f"!({body})"


async def _ids_matching_fts_condition(
    db: AsyncSession,
    *,
    search_id: int,
    field: str,
    op: str,
    value: str,
) -> set[int]:
    body = _build_fts_query_for_condition(field, op, value)
    if not body:
        return set()
    stmt = (
        select(SearchResultPage.search_result_id)
        .where(SearchResultPage.search_id == search_id)
        .where(SearchResultPage.search_vector.op("@@")(func.to_tsquery("russian", body)))
        .distinct()
    )
    return set((await db.execute(stmt)).scalars().all())


async def _ids_matching_sql_condition(
    db: AsyncSession,
    *,
    search_id: int,
    field: str,
    op: str,
    value: str,
) -> set[int]:
    """SQL-based conditions: domain, site_type, has_phone, has_email."""
    from sqlalchemy import or_ as sa_or
    from app.models.search import SearchResult

    stmt = select(SearchResult.id).where(SearchResult.search_id == search_id)
    v = (value or "").strip()

    if field == "domain":
        if op == "contains":
            stmt = stmt.where(SearchResult.domain.ilike(f"%{v}%"))
        elif op == "not_contains":
            stmt = stmt.where(~SearchResult.domain.ilike(f"%{v}%"))
        elif op == "equals":
            stmt = stmt.where(SearchResult.domain == v)
        elif op == "not_equals":
            stmt = stmt.where(SearchResult.domain != v)
        elif op == "starts_with":
            stmt = stmt.where(SearchResult.domain.ilike(f"{v}%"))
        else:
            return set()
    elif field == "site_type":
        # Stored as JSON: extra_data->'classification'->>'site_type'.
        site_type_expr = SearchResult.extra_data["classification"]["site_type"].astext
        if op == "equals":
            stmt = stmt.where(site_type_expr == v)
        elif op == "not_equals":
            stmt = stmt.where(sa_or(site_type_expr != v, site_type_expr.is_(None)))
        else:
            return set()
    elif field == "has_phone":
        if op == "is_true":
            stmt = stmt.where(SearchResult.phone.isnot(None)).where(SearchResult.phone != "")
        elif op == "is_false":
            stmt = stmt.where(sa_or(SearchResult.phone.is_(None), SearchResult.phone == ""))
        else:
            return set()
    elif field == "has_email":
        if op == "is_true":
            stmt = stmt.where(SearchResult.email.isnot(None)).where(SearchResult.email != "")
        elif op == "is_false":
            stmt = stmt.where(sa_or(SearchResult.email.is_(None), SearchResult.email == ""))
        else:
            return set()
    else:
        return set()

    return set((await db.execute(stmt)).scalars().all())


async def _all_result_ids_for_search(db: AsyncSession, search_id: int) -> set[int]:
    """Used when a top-level OR has any condition that returns 'no match' — we
    still need the union to be over the full result set, not zero."""
    from app.models.search import SearchResult

    stmt = select(SearchResult.id).where(SearchResult.search_id == search_id)
    return set((await db.execute(stmt)).scalars().all())


async def apply_filter_spec(
    db: AsyncSession,
    *,
    search_id: int,
    spec: dict,
) -> Tuple[set[int] | None, List[str]]:
    """Resolve the structured filter into a set of matching result IDs.

    Returns (matched_ids_or_None, keyword_hits_words):
      - matched_ids_or_None — None means "no filter active" (caller skips
        filtering); a concrete (possibly empty) set means "use this set".
      - keyword_hits_words — flat list of search words for highlighting.

    Spec is permissive: missing fields, empty values, unknown ops are skipped
    rather than raising — broken filters degrade gracefully to "no filter".
    """
    if not isinstance(spec, dict):
        return None, []

    conditions = spec.get("conditions") or []
    if not isinstance(conditions, list) or not conditions:
        return None, []

    logic = (spec.get("logic") or "and").lower()
    if logic not in ("and", "or"):
        logic = "and"

    per_condition_ids: List[set[int]] = []
    highlight_words: List[str] = []

    for cond in conditions:
        if not isinstance(cond, dict):
            continue
        field = cond.get("field")
        op = cond.get("op")
        value = cond.get("value")
        if not field or not op:
            continue

        if field in _FTS_FIELDS and op in _TEXT_OPS:
            if not isinstance(value, str) or not value.strip():
                continue
            ids = await _ids_matching_fts_condition(
                db, search_id=search_id, field=field, op=op, value=value
            )
            highlight_words.extend(parse_keywords(value))
        elif field in {"domain", "site_type"}:
            if not isinstance(value, str) or not value.strip():
                continue
            ids = await _ids_matching_sql_condition(
                db, search_id=search_id, field=field, op=op, value=value
            )
        elif field in {"has_phone", "has_email"} and op in _BOOL_OPS:
            ids = await _ids_matching_sql_condition(
                db, search_id=search_id, field=field, op=op, value=""
            )
        else:
            continue

        per_condition_ids.append(ids)

    if not per_condition_ids:
        return None, []

    if logic == "and":
        matched = per_condition_ids[0]
        for s in per_condition_ids[1:]:
            matched = matched & s
            if not matched:
                break
    else:
        matched = set()
        for s in per_condition_ids:
            matched = matched | s

    # Dedupe highlight words preserving order.
    seen: set[str] = set()
    deduped: List[str] = []
    for w in highlight_words:
        if w not in seen:
            seen.add(w)
            deduped.append(w)

    return matched, deduped
