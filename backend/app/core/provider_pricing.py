"""Статичная таблица цен внешних API-провайдеров в рублях.

Источник цен — публичные тарифы провайдеров на июль 2026.
Обновляется ВРУЧНУЮ при изменении тарифов: правьте PROVIDER_PRICING
и обновляйте LAST_UPDATED.

Тарификация:
- 'per_request' — фиксированная цена за вызов. cost_rub = cost_rub.
- 'per_token'   — цена за 1K tokens. cost_rub = tokens_in * input_per_1k/1000
                   + tokens_out * output_per_1k/1000.
- 'commission'  — комиссия с платежа. cost_rub = amount_rub * rate.

Все суммы — в рублях (₽), с учётом НДС или без — провайдер сам решает,
для аналитики важен порядок величины, не копеечная точность.

Используется api_tracker.compute_cost_rub(). Не попадает в ответ API
секретов (только публичные тарифы).
"""

from decimal import Decimal
from typing import Any, Dict

LAST_UPDATED = "2026-07-05"

# Цены в ₽. Курсы (для $-тарифов): ~91 ₽/$ (июль 2026).
# per_token — за 1K tokens (input/output раздельно).
PROVIDER_PRICING: Dict[str, Dict[str, Any]] = {
    # ── Карты / гео ──────────────────────────────────────────────────
    # 2GIS Catalog API: free 1000/день, далее платно. Считаем 0 на MVP
    # (free tier покрывает dev-нагрузку). После превышения free — обновить.
    "2gis": {"type": "per_request", "cost_rub": Decimal("0.0")},
    # SerpAPI: $50/мес за 5000 запросов ≈ 0.91₽/req.
    "serpapi": {"type": "per_request", "cost_rub": Decimal("0.91")},
    # ── DaData (юридические данные) ──────────────────────────────────
    # Free 10 000/день. Считаем 0 на MVP.
    "dadata": {"type": "per_request", "cost_rub": Decimal("0.0")},
    # ── Captcha solvers ──────────────────────────────────────────────
    # 2captcha: ~$1/1000 решений ≈ 0.091₽.
    "2captcha": {"type": "per_request", "cost_rub": Decimal("0.09")},
    # anti-captcha: ~$0.7/1000 ≈ 0.064₽.
    "anticaptcha": {"type": "per_request", "cost_rub": Decimal("0.06")},
    # ── LLM (per-token) ──────────────────────────────────────────────
    # OpenAI gpt-4o-mini: $0.15/1M input, $0.60/1M output ≈
    #   input 0.0137₽/1K, output 0.0546₽/1K.
    "openai": {
        "type": "per_token",
        "input_per_1k": Decimal("0.0137"),
        "output_per_1k": Decimal("0.0546"),
    },
    # Anthropic claude-3.5-haiku: $0.80/1M input, $4.00/1M output ≈
    #   input 0.073₽/1K, output 0.364₽/1K.
    "anthropic": {
        "type": "per_token",
        "input_per_1k": Decimal("0.073"),
        "output_per_1k": Decimal("0.364"),
    },
    # ── Embeddings (OpenAI text-embedding-3-small) ───────────────────
    # $0.02/1M tokens ≈ 0.0018₽/1K.
    "openai_emb": {
        "type": "per_token",
        "input_per_1k": Decimal("0.0018"),
        "output_per_1k": Decimal("0.0"),
    },
    # ── Email ────────────────────────────────────────────────────────
    # Hyvor Relay: self-hosted, бесплатно (только cost серверов).
    "hyvor": {"type": "per_request", "cost_rub": Decimal("0.0")},
    # SMTP через Yandex Cloud Postbox: ~39₽/1000 писем ≈ 0.039₽/mail.
    "smtp": {"type": "per_request", "cost_rub": Decimal("0.039")},
    # ── YooKassa (комиссия с платежа) ────────────────────────────────
    # 2.8% стандартная эквайринговая комиссия.
    "yookassa": {"type": "commission", "rate": Decimal("0.028")},
}


def compute_cost_rub(
    provider: str,
    *,
    tokens_in: int = 0,
    tokens_out: int = 0,
    amount_rub: float | int | Decimal | None = None,
) -> Decimal:
    """Считает стоимость одного вызова в рублях по тарифу провайдера.

    Возвращает Decimal(0) если провайдер не найден (не падает —
    unknown provider просто не учитывается в стоимости, но вызов
    всё равно логируется через api_tracker.log_call).
    """
    p = PROVIDER_PRICING.get(provider)
    if p is None:
        return Decimal("0")
    ptype = p.get("type")
    if ptype == "per_request":
        return Decimal(p.get("cost_rub", 0))
    if ptype == "per_token":
        cost = (
            Decimal(tokens_in or 0) * Decimal(p.get("input_per_1k", 0))
            + Decimal(tokens_out or 0) * Decimal(p.get("output_per_1k", 0))
        ) / Decimal(1000)
        return cost.quantize(Decimal("0.000001"))
    if ptype == "commission":
        if amount_rub is None:
            return Decimal("0")
        return (Decimal(str(amount_rub)) * Decimal(p.get("rate", 0))).quantize(
            Decimal("0.000001")
        )
    return Decimal("0")
