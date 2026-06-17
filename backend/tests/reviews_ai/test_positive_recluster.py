"""Юнит-тесты positive-recluster pure-функций (без БД).

Проверяем:
- _is_abstract_strength_label: ловит «Хорошее обслуживание», «Качество услуг»
  и т.п., но пропускает конкретные label-ы.
- service.recluster_pains_for_niche: rejects невалидный sentiment до
  любых обращений к БД.
- service.match_reviews_to_pain_tags: то же самое для force_sentiment.

Интеграционные тесты на полный pipeline (recluster + match с реальной БД +
embeddings) делаются отдельно когда поднимем тестовый Postgres.
"""

from __future__ import annotations

import pytest

from app.modules.reviews_ai import service
from app.modules.reviews_ai.llm import _is_abstract_strength_label


# --- _is_abstract_strength_label ------------------------------------------


@pytest.mark.parametrize(
    "label",
    [
        "Качество услуг",
        "Качество стоматологических услуг",
        "Хорошее обслуживание",
        "Хорошее отношение к клиентам",
        "Отличный сервис",
        "Отличная клиника",
        "Положительные отзывы",
        "Положительный отзыв пациентов",
        "Обслуживание клиентов",
        "Клиентский опыт",
        "Сервис на уровне",
    ],
)
def test_abstract_strength_label_caught(label: str):
    assert _is_abstract_strength_label(label), f"должно быть абстрактным: {label!r}"


@pytest.mark.parametrize(
    "label",
    [
        "Безболезненное лечение",
        "Внимательные администраторы",
        "Чистота и стерильность",
        "Быстрая запись на приём",
        "Подробное объяснение плана лечения",
        "Честные цены без допработ",
        "Детский подход к маленьким пациентам",
        "Современное оборудование",
        "Удобное расположение",
        "Гарантия на работу",
    ],
)
def test_concrete_strength_label_passes(label: str):
    assert not _is_abstract_strength_label(label), f"должно быть конкретным: {label!r}"


def test_empty_label_is_abstract():
    assert _is_abstract_strength_label("")
    assert _is_abstract_strength_label("   ")


# --- service.recluster_pains_for_niche: validation ------------------------


@pytest.mark.asyncio
async def test_recluster_rejects_invalid_sentiment():
    # Невалидный sentiment должен ронять до любого touch'а БД — поэтому
    # передаём db=None и ждём ValueError, а не AttributeError.
    with pytest.raises(ValueError, match="invalid sentiment"):
        await service.recluster_pains_for_niche(
            db=None,  # type: ignore[arg-type]
            niche="стоматология",
            city="Балашиха",
            sentiment="mixed",
        )


# --- service.match_reviews_to_pain_tags: validation -----------------------


@pytest.mark.asyncio
async def test_match_rejects_invalid_force_sentiment():
    # review_ids непустой — иначе ранний return [] перекроет валидацию.
    with pytest.raises(ValueError, match="invalid force_sentiment"):
        await service.match_reviews_to_pain_tags(
            db=None,  # type: ignore[arg-type]
            review_ids=[1, 2, 3],
            force_sentiment="anything",
        )
