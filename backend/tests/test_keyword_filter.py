"""Unit tests for the keyword tokenizer / tsquery builder.

These don't hit Postgres — they just verify the input sanitisation and query
shape, which is the part where injection or empty-result bugs would live.
"""

import pytest

from app.modules.searches.keyword_filter import (
    parse_keywords,
    build_tsquery,
    parse_keywords_and_query,
    _build_fts_query_for_condition,
)


class TestParseKeywords:
    def test_returns_empty_for_none(self):
        assert parse_keywords(None) == []

    def test_returns_empty_for_blank_string(self):
        assert parse_keywords("") == []
        assert parse_keywords("   ") == []

    def test_splits_on_comma(self):
        assert parse_keywords("протезирование, имплантация") == [
            "протезирование",
            "имплантация",
        ]

    def test_splits_on_whitespace(self):
        assert parse_keywords("протезирование имплантация") == [
            "протезирование",
            "имплантация",
        ]

    def test_lowercases_input(self):
        assert parse_keywords("Протезирование, ИМПЛАНТАЦИЯ") == [
            "протезирование",
            "имплантация",
        ]

    def test_dedupes_keeping_first_occurrence(self):
        assert parse_keywords("стома, СТОМА, стома") == ["стома"]

    def test_drops_short_tokens(self):
        # 1- and 2-char tokens are typo bait; we drop them.
        assert parse_keywords("ok, no, протезирование") == ["протезирование"]

    def test_strips_tsquery_metacharacters(self):
        # Bare "&", "|", "!", "(", ")" must never reach the tsquery.
        cleaned = parse_keywords("протез & имплант | (или)!")
        assert cleaned == ["протез", "имплант", "или"]

    def test_accepts_list_input(self):
        assert parse_keywords(["Протезирование", "Имплантация"]) == [
            "протезирование",
            "имплантация",
        ]


class TestBuildTsquery:
    def test_returns_none_for_empty(self):
        assert build_tsquery([]) is None
        assert build_tsquery([], mode="and") is None

    def test_or_mode_joins_with_pipe(self):
        assert (
            build_tsquery(["протез", "имплант"], mode="or")
            == "протез:* | имплант:*"
        )

    def test_and_mode_joins_with_amp(self):
        assert (
            build_tsquery(["протез", "имплант"], mode="and")
            == "протез:* & имплант:*"
        )

    def test_uses_prefix_match(self):
        # Each token gets `:*` so "протез" hits "протезирование".
        assert build_tsquery(["протез"]) == "протез:*"


class TestParseKeywordsAndQuery:
    def test_full_pipeline_or(self):
        kws, q = parse_keywords_and_query("Протез, Имплант", mode="or")
        assert kws == ["протез", "имплант"]
        assert q == "протез:* | имплант:*"

    def test_full_pipeline_empty_input(self):
        kws, q = parse_keywords_and_query("", mode="or")
        assert kws == []
        assert q is None

    def test_full_pipeline_only_noise(self):
        kws, q = parse_keywords_and_query("a, &, !!!", mode="and")
        assert kws == []
        assert q is None


class TestBuildFtsQueryForCondition:
    """Composes the per-condition tsquery body inside the structured filter."""

    def test_contains_makes_and_prefix_chain(self):
        # All words required, prefix-matched.
        assert (
            _build_fts_query_for_condition("text", "contains", "протез импл")
            == "протез:* & импл:*"
        )

    def test_not_contains_wraps_in_negation(self):
        assert (
            _build_fts_query_for_condition("text", "not_contains", "бесплатно")
            == "!(бесплатно:*)"
        )

    def test_starts_with_uses_prefix(self):
        # "starts_with" reuses prefix matching; deeper prefix anchoring would
        # need a separate tsvector config — out of scope here.
        assert (
            _build_fts_query_for_condition("title", "starts_with", "прото")
            == "прото:*"
        )

    def test_equals_chains_with_phrase_operator(self):
        # phrase match (`<->`) so "офис компании" matches the exact sequence.
        assert (
            _build_fts_query_for_condition("text", "equals", "офис компании")
            == "офис <-> компании"
        )

    def test_not_equals_negates_phrase(self):
        assert (
            _build_fts_query_for_condition("text", "not_equals", "офис")
            == "!(офис)"
        )

    def test_unknown_op_returns_none(self):
        assert _build_fts_query_for_condition("text", "wat", "foo") is None

    def test_blank_value_returns_none(self):
        assert _build_fts_query_for_condition("text", "contains", "") is None
        assert _build_fts_query_for_condition("text", "contains", "  ") is None

    def test_metachars_in_value_are_stripped(self):
        # "&" should not leak into the tsquery body.
        assert (
            _build_fts_query_for_condition("text", "contains", "протез & импл")
            == "протез:* & импл:*"
        )
