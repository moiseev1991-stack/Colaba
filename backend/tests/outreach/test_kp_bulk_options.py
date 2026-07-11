"""Тесты 2026-07-12: bulk-КП по общей боли — schema-часть.

Проверяем что новые поля KpBulkGenerateRequest валидируются pydantic-ом,
не ломают старый интерфейс. Интеграционные тесты с БД покрываются другими
файлами conftest+fixtures.
"""

from __future__ import annotations

from app.modules.outreach.kp_schemas import (
    KpBulkGenerateRequest,
    KpCommonPainOut,
)


def test_kp_bulk_generate_request_accepts_legacy_fields_only():
    """Совместимость: старые запросы без новых полей должны валидироваться."""
    req = KpBulkGenerateRequest(
        company_ids=[1, 2, 3],
        template_key="webstudio",
    )
    assert req.tone == "neutral"
    assert req.pain_tag_ids is None
    assert req.use_4hods is False
    assert req.channel == "email"
    assert req.my_offer_step is None


def test_kp_bulk_generate_request_accepts_new_fields():
    req = KpBulkGenerateRequest(
        company_ids=[1, 2, 3],
        template_key="marketing",
        tone="bold",
        pain_tag_ids=[10, 20],
        use_4hods=True,
        channel="messenger",
        my_offer_step="созвон 10 минут",
    )
    assert req.pain_tag_ids == [10, 20]
    assert req.use_4hods is True
    assert req.channel == "messenger"
    assert req.my_offer_step == "созвон 10 минут"


def test_kp_bulk_generate_request_pain_tag_ids_max_3():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        KpBulkGenerateRequest(
            company_ids=[1, 2],
            template_key="webstudio",
            pain_tag_ids=[1, 2, 3, 4],  # max_length=3
        )


def test_kp_bulk_generate_request_channel_literal():
    import pytest
    from pydantic import ValidationError

    with pytest.raises(ValidationError):
        KpBulkGenerateRequest(
            company_ids=[1, 2],
            template_key="webstudio",
            channel="tg",  # not in Literal
        )


def test_kp_common_pain_out_shape():
    p = KpCommonPainOut(
        pain_tag_id=42,
        label="Проблемы с дозвоном",
        companies_hit=5,
        total_mentions=17,
        example_quote="Не могу дозвониться уже час",
    )
    assert p.pain_tag_id == 42
    assert p.companies_hit == 5


def test_kp_common_pain_out_example_quote_optional():
    p = KpCommonPainOut(
        pain_tag_id=1,
        label="X",
        companies_hit=2,
        total_mentions=3,
    )
    assert p.example_quote is None
