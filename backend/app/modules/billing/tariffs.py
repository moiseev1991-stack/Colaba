"""Тарифы и цены операций в кредитах — единственный источник правды.

Экономика (расчёт из api_call_log за 30 дней, 2026-09-17,
docs/guides/BILLING_CREDITS.md):

  Себестоимость поиска по картам: среднее 5.77₽, медиана 2.73₽
  (serpapi-тяжёлые — до 8.26₽; yandex_html и 2gis — 0₽).
  LLM (КП/черновики): gpt-4o-mini 0.017₽/вызов, GLM по подписке — 0₽.
  Email: smtp 0.04₽/письмо. Embeddings: ~0.003₽/вызов.

  Базовая единица: 1 поиск лидов = 10 кредитов.
    Старт:    990₽  →  500 кредитов (50 поисков)  = 1.98₽/кредит
    Бизнес:  2990₽  → 2000 кредитов (200 поисков) = 1.50₽/кредит
    Pro:     7990₽  → 6000 кредитов (600 поисков) = 1.33₽/кредит

  Маржа при blended-себестоимости поиска ~6₽: 53–70% (Pro–Старт);
  КП/письма/enrich стоят в кредитах дороже себестоимости на порядок.

Правила подписок (адаптация z.ai devpack):
  - Тариф действует до конца оплаченного периода (30 дней).
  - Подписочные кредиты сгорают в конце периода ( квота периода ),
    докупка не сгорает (списание FIFO: сначала истекающие).
  - Смена тарифа/отмена — вручную, действует с следующего цикла;
    автопродление можно выключить в любой момент.
"""

from typing import Dict, List, Optional

SUBSCRIPTION_PERIOD_DAYS = 30

# Приветственные кредиты нового пользователя (бесплатный тариф:
# 10 поисков — попробовать продукт). Решение владельца 19.09 (вернули 100).
WELCOME_CREDITS = 100


class Tariff:
    def __init__(
        self,
        code: str,
        name: str,
        price_rub: int,
        credits: int,
        description: str,
        purchasable: bool = True,
    ):
        self.code = code
        self.name = name
        self.price_rub = price_rub
        self.credits = credits
        self.description = description
        # Бесплатный тариф нельзя купить — он выдаётся при регистрации.
        self.purchasable = purchasable

    @property
    def rub_per_credit(self) -> float:
        return round(self.price_rub / self.credits, 2)

    def dict(self) -> dict:
        return {
            "id": self.code,
            "code": self.code,
            "name": self.name,
            "price_rub": self.price_rub,
            "credits": self.credits,
            "searches": self.credits // OPERATIONS_PRICES["map_search"],
            "rub_per_credit": self.rub_per_credit,
            "description": self.description,
            "purchasable": self.purchasable,
        }


TARIFFS: Dict[str, Tariff] = {
    t.code: t
    for t in [
        Tariff(
            "free",
            "Бесплатный",
            0,
            WELCOME_CREDITS,
            "10 поисков при регистрации — без карты и оплаты",
            purchasable=False,
        ),
        Tariff(
            "starter",
            "Старт",
            990,
            500,
            "50 поисков лидов в месяц, КП и рассылки",
        ),
        Tariff(
            "business",
            "Бизнес",
            2990,
            2000,
            "200 поисков, командная работа, приоритетная поддержка",
        ),
        Tariff(
            "pro",
            "Pro",
            7990,
            6000,
            "600 поисков и максимальные лимиты операций",
        ),
    ]
}

TARIFF_ORDER: List[str] = ["free", "starter", "business", "pro"]

# Цены операций в кредитах. Прозрачность — мировая практика (z.ai, Claude):
# юзер видит, сколько стоит каждое действие.
OPERATIONS_PRICES: Dict[str, int] = {
    "map_search": 10,  # поиск компаний по картам
    "sites_search": 10,  # поиск сайтов (Яндекс/Google)
    "kp_generate": 2,  # генерация одного КП
    "draft_email": 1,  # черновик письма под компанию
    "enrich_team": 3,  # поиск ЛПР/команды
    "enrich_dm": 2,  # поиск маркетолога/контактов для DM
    "kp_send": 1,  # отправка одного письма/сообщения
}

OPERATION_LABELS: Dict[str, str] = {
    "map_search": "Поиск компаний по картам",
    "sites_search": "Поиск сайтов",
    "kp_generate": "Генерация КП",
    "draft_email": "Черновик письма",
    "enrich_team": "Поиск ЛПР",
    "enrich_dm": "Поиск контактов",
    "kp_send": "Отправка сообщения",
}


def get_tariff(code: str) -> Optional[Tariff]:
    return TARIFFS.get(code)


def tariffs_payload() -> List[dict]:
    return [TARIFFS[c].dict() for c in TARIFF_ORDER]
