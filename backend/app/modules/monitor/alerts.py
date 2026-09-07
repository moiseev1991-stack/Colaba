"""Алерты по здоровью внешних интеграций (урок аудита 2026-09-07).

Месяц (08–09.2026) интеграции умирали молча: OpenAI 402 (нет оплаты),
DaData 403 (квота), 2GIS 0%, SerpAPI rate-limit — при живом CI/CD и
зелёных деплоях. api_call_log всё писал, но никто не смотрел.

Этот модуль — «кто-то смотрит»: celery-beat раз в 30 минут агрегирует
ok% по провайдерам за последний час; при ok% < порога (или спецкодах
402/403) шлёт TG владельцу. Анти-спам: один и тот же провайдер
алертится не чаще раза в ALERT_COOLDOWN_SEC.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.core.config import settings
from app.models.api_call_log import ApiCallLog

logger = logging.getLogger(__name__)

# Пороги. ok_pct ниже → алерт. MIN_CALLS отсекает шум редких вызовов.
ALERT_OK_PCT = 80.0
MIN_CALLS = 20
WINDOW_MINUTES = 60
ALERT_COOLDOWN_SEC = 6 * 3600  # повторный алерт того же провайдера не чаще 6ч

# Спец-коды, которые алертим даже при малом числе вызовов —
# это «умер ключ/оплаченный счёт», а не транзиент.
HARD_HTTP_STATUSES = {401, 402, 403}
MIN_CALLS_HARD = 3

# Friendly-имена для сообщения
PROVIDER_LABELS = {
    "dadata": "DaData (юр.данные)",
    "openai": "OpenAI (LLM)",
    "openai_emb": "OpenAI (embeddings — боли!)",
    "serpapi": "SerpAPI (Google Maps)",
    "2gis": "2GIS",
    "postbox": "Postbox (email)",
    "timeweb": "Timeweb (email)",
}


async def collect_provider_health(db) -> list[dict]:
    """Агрегирует ok%/кол-во/топ-ошибку по провайдерам за WINDOW_MINUTES."""
    since = datetime.now(timezone.utc) - timedelta(minutes=WINDOW_MINUTES)
    rows = (
        await db.execute(
            select(
                ApiCallLog.provider,
                func.count(ApiCallLog.id),
                func.count().filter(ApiCallLog.ok.is_(True)),
            )
            .where(ApiCallLog.created_at >= since)
            .group_by(ApiCallLog.provider)
        )
    ).all()

    out: list[dict] = []
    for provider, total, ok in rows:
        ok_pct = (ok / total * 100) if total else 100.0
        top_status = None
        if ok_pct < 100:
            top_status = (
                await db.execute(
                    select(ApiCallLog.http_status, func.count(ApiCallLog.id))
                    .where(
                        ApiCallLog.created_at >= since,
                        ApiCallLog.provider == provider,
                        ApiCallLog.ok.is_(False),
                    )
                    .group_by(ApiCallLog.http_status)
                    .order_by(func.count(ApiCallLog.id).desc())
                    .limit(1)
                )
            ).first()
        out.append(
            {
                "provider": provider,
                "calls": total,
                "ok": ok,
                "ok_pct": round(ok_pct, 1),
                "top_status": top_status[0] if top_status else None,
            }
        )
    return out


def _should_alert(stat: dict) -> bool:
    """Пороговая логика: мягкий (ok% при объёме) + жёсткий (платёжные коды)."""
    if stat["calls"] >= MIN_CALLS and stat["ok_pct"] < ALERT_OK_PCT:
        return True
    if stat["calls"] >= MIN_CALLS_HARD and stat["top_status"] in HARD_HTTP_STATUSES:
        return True
    return False


def build_alert_text(bad: list[dict]) -> str:
    """Формирует HTML-текст алерта (Telegram, parse_mode=HTML)."""
    lines = ["⚠️ <b>Интеграции деградируют</b> (за последний час):", ""]
    for s in bad:
        label = PROVIDER_LABELS.get(s["provider"], s["provider"])
        status = f", топ-статус {s['top_status']}" if s["top_status"] else ""
        hint = ""
        if s["top_status"] == 402:
            hint = " — <b>нет оплаты на аккаунте!</b>"
        elif s["top_status"] == 403:
            hint = " — ключ/квота"
        lines.append(f"• <b>{label}</b>: {s['ok_pct']}% ok ({s['ok']}/{s['calls']}{status}){hint}")
    lines.append("")
    lines.append("Детали: /monitor в админке. Источник: api_call_log.")
    return "\n".join(lines)


async def run_integration_alerts(db, redis_client=None) -> dict:
    """Точка входа: собрать → отфильтровать → анти-спам → отправить.

    Возвращает сводку для логов/тестов. Никогда не поднимает исключение
    наружу — мониторинг не должен ломать планировщик.
    """
    try:
        stats = await collect_provider_health(db)
        bad = [s for s in stats if _should_alert(s)]
        if not bad:
            return {"status": "ok", "providers": len(stats), "alerts": 0}

        # Анти-спам через Redis-ключ (если передан): provider → cooldown.
        if redis_client is not None:
            fresh_bad = []
            now = datetime.now(timezone.utc)
            for s in bad:
                key = f"alert:integration:{s['provider']}"
                prev = redis_client.get(key)
                if prev is not None:
                    try:
                        if (now - datetime.fromisoformat(prev.decode())).total_seconds() < ALERT_COOLDOWN_SEC:
                            continue  # недавно алертили — молчим
                    except Exception:
                        pass  # кривое значение ключа — просто алертим
                redis_client.set(key, now.isoformat(), ex=ALERT_COOLDOWN_SEC)
                fresh_bad.append(s)
            bad = fresh_bad
            if not bad:
                return {"status": "ok", "providers": len(stats), "alerts": 0, "suppressed": True}

        text = build_alert_text(bad)
        chat_id = (settings.OWNER_TG_CHAT_ID or "").strip()
        sent = False
        if chat_id:
            try:
                from app.modules.outreach.telegram_bot import send_text_message

                await send_text_message(chat_id, text)
                sent = True
            except Exception as e:
                # TG мог лечь — алерт всё равно должен попасть в логи.
                logger.error("integration-alert: TG send failed: %s | text=%s", e, text)
        else:
            logger.error("integration-alert: OWNER_TG_CHAT_ID не задан, TG не отправлен | text=%s", text)
        return {
            "status": "alert",
            "providers": len(stats),
            "alerts": len(bad),
            "tg_sent": sent,
            "bad": bad,
        }
    except Exception as e:  # noqa: BLE001
        logger.exception("integration-alerts failed: %s", e)
        return {"status": "error", "error": str(e)[:200]}
