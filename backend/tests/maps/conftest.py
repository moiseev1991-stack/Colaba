"""Общие фикстуры для тестов модуля maps."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

FIXTURES_DIR = Path(__file__).parent / "fixtures"


def _load(name: str) -> dict:
    return json.loads((FIXTURES_DIR / name).read_text(encoding="utf-8"))


@pytest.fixture
def twogis_search_page1() -> dict:
    return _load("twogis_search_page1.json")


@pytest.fixture
def twogis_search_page2() -> dict:
    return _load("twogis_search_page2.json")


@pytest.fixture
def twogis_reviews_response() -> dict:
    return _load("twogis_reviews_response.json")
