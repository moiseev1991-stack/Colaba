"""
Site type classifier + description cleaner.

Runs on the search-result level (after crawl, before saving). Cheap, deterministic,
no LLM. Goal: tell whether the URL is a real company site, a catalog/aggregator,
a social profile, news/blog, gov registry, or broken — so the UI can default to
showing only company-grade leads.

Output classes (kept short — they end up as bilingual badges on the frontend):
    company   — likely the company's own site
    catalog   — directory/aggregator/review site (Zoon, 2GIS web, Otzovik, Yell, …)
    market    — marketplace / classifieds (Avito, Yula, Profi.ru, Yandex.Uslugi)
    social    — social network or messenger profile (vk, t.me, instagram, ok.ru)
    news      — media outlet / news article
    gov       — gov / public registry
    broken    — crawl failed / page is dead
    unknown   — heuristics gave up (kept visible by default)
"""

from __future__ import annotations

import re
from typing import Iterable, Optional
from urllib.parse import urlparse


# --- Domain blocklists ------------------------------------------------------

# Russian-market focused: domains of well-known catalogs, marketplaces,
# social/news/gov properties. Matched as suffixes (foo.example.com counts).
_CATALOG_DOMAINS: frozenset[str] = frozenset({
    "zoon.ru", "yell.ru", "otzovik.com", "irecommend.ru", "flamp.ru",
    "spr.ru", "rusprofile.ru", "list-org.com", "sbis.ru", "kontur.ru",
    "tiu.ru", "pulscen.ru", "blizko.ru", "bestcompanyru.ru", "moscow.cataloxy.ru",
    "cataloxy.ru", "1nsk.ru", "msk.ru", "tutu.ru", "yandex.ru/maps",
    "2gis.ru", "yandex.ru", "yandex.com", "google.com", "search.yahoo.com",
    "tripadvisor.ru", "tripadvisor.com", "restoclub.ru", "afisha.ru",
    "doc.ua", "prodoctorov.ru", "docdoc.ru", "krasotaimedicina.ru",
    "auto.ru", "drom.ru",
})

_MARKETPLACE_DOMAINS: frozenset[str] = frozenset({
    "avito.ru", "youla.ru", "profi.ru", "uslugi.yandex.ru",
    "wildberries.ru", "ozon.ru", "market.yandex.ru", "aliexpress.ru",
    "leroymerlin.ru", "lamoda.ru", "kazanexpress.ru", "petrovich.ru",
})

_SOCIAL_DOMAINS: frozenset[str] = frozenset({
    "vk.com", "vk.ru", "ok.ru", "t.me", "telegram.me", "telegram.org",
    "instagram.com", "facebook.com", "fb.com", "twitter.com", "x.com",
    "youtube.com", "youtu.be", "rutube.ru", "tiktok.com", "dzen.ru",
    "zen.yandex.ru", "pikabu.ru", "habr.com", "vc.ru", "tenchat.ru",
    "linkedin.com",
})

_NEWS_DOMAINS: frozenset[str] = frozenset({
    "rbc.ru", "lenta.ru", "ria.ru", "tass.ru", "kommersant.ru", "vedomosti.ru",
    "kp.ru", "mk.ru", "rg.ru", "iz.ru", "fontanka.ru", "e1.ru", "ngs.ru",
    "74.ru", "ura.news", "interfax.ru", "gazeta.ru",
})

_GOV_DOMAINS: frozenset[str] = frozenset({
    "gov.ru", "government.ru", "kremlin.ru", "minfin.gov.ru", "nalog.gov.ru",
    "nalog.ru", "egrul.nalog.ru", "rkn.gov.ru", "fas.gov.ru", "rosreestr.ru",
    "zakupki.gov.ru", "gosuslugi.ru", "pravo.gov.ru",
})

# Keyword hints for catalog-style pages even when the domain is unknown.
_CATALOG_TITLE_HINTS: tuple[str, ...] = (
    "каталог", "рейтинг", "отзывы", "топ-", "топ ", "список ", "лучшие ",
    "обзор ", "цены и услуги", "адреса и телефоны", "сравнение",
    "directory", "ranking",
)

_NEWS_TITLE_HINTS: tuple[str, ...] = (
    "новости", "статья", "журнал", "интервью", "блог",
    "news", "article", "blog",
)

_BROKEN_URL_HINTS: tuple[str, ...] = (
    "/parking", "domain-for-sale", "domain.for.sale", "expired-domain",
    "default-page", "suspended-page", "/maintenance",
)


def _suffix_match(host: str, blocklist: Iterable[str]) -> bool:
    """True when host equals or ends with `.{entry}` for any entry."""
    h = host.lower().lstrip(".")
    for entry in blocklist:
        e = entry.lower()
        if h == e or h.endswith("." + e):
            return True
    return False


# --- Description cleaner ----------------------------------------------------

# Trim leading emoji/dingbats and other symbol noise that often shows up in
# titles/meta-desc ("🏆 Юридические…", "★ Лучший автосервис…").
# Matches the broad symbol/pictograph blocks at the start of the string.
_LEAD_NOISE_RE = re.compile(
    r"^[\s -⁯←-⟿⤀-⯿\U0001F000-\U0001FFFF★☆■□●◆▶▷✓✔✦✧✪✫•·]+"
)
_TRAILING_TAIL_RE = re.compile(r"\s+\|\s+[^|]{0,80}$")
_WHITESPACE_RE = re.compile(r"\s+")
_MIN_USEFUL_LEN = 20


def clean_description(text: Optional[str]) -> Optional[str]:
    """Strip leading emoji/symbols, collapse whitespace, drop trailing branding,
    discard fully-uppercase noise like "ПОСМОТРЕТЬ. КАРТОЧКИ." and short snippets.

    Returns None when nothing useful is left — callers should fall back or show "—".
    """
    if not text:
        return None
    s = _LEAD_NOISE_RE.sub("", text).strip()
    s = _WHITESPACE_RE.sub(" ", s)
    s = _TRAILING_TAIL_RE.sub("", s).strip()
    if len(s) < _MIN_USEFUL_LEN:
        return None
    # Bare numbers / fully uppercase short blocks aren't a description.
    if s.isdigit():
        return None
    letters = [c for c in s if c.isalpha()]
    if letters and all(c.isupper() for c in letters) and len(s) < 60:
        return None
    return s


# --- Site type classifier ---------------------------------------------------

def classify_site(
    *,
    domain: Optional[str],
    url: Optional[str] = None,
    title: Optional[str] = None,
    meta_description: Optional[str] = None,
    crawl_failed: bool = False,
) -> str:
    """Decide one of: company | catalog | market | social | news | gov | broken | unknown.

    Order of checks is deliberate: hard signals (broken / known domains) win
    over soft text heuristics. We never invoke LLMs here — this runs on every
    search result.
    """
    if crawl_failed:
        return "broken"

    host = (domain or "").strip().lower()
    if not host and url:
        try:
            host = (urlparse(url).netloc or "").lower()
        except Exception:
            host = ""
    if host.startswith("www."):
        host = host[4:]

    if host:
        if _suffix_match(host, _GOV_DOMAINS):
            return "gov"
        if _suffix_match(host, _SOCIAL_DOMAINS):
            return "social"
        if _suffix_match(host, _MARKETPLACE_DOMAINS):
            return "market"
        if _suffix_match(host, _CATALOG_DOMAINS):
            return "catalog"
        if _suffix_match(host, _NEWS_DOMAINS):
            return "news"

    lurl = (url or "").lower()
    if any(hint in lurl for hint in _BROKEN_URL_HINTS):
        return "broken"

    haystack = " ".join(filter(None, [title, meta_description])).lower()
    if haystack:
        if any(h in haystack for h in _CATALOG_TITLE_HINTS):
            return "catalog"
        if any(h in haystack for h in _NEWS_TITLE_HINTS):
            return "news"

    # Defaults: when we have *some* page content, treat as a company; with
    # nothing at all, stay honest and say unknown.
    if title or meta_description:
        return "company"
    return "unknown"
