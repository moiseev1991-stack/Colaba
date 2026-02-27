"""Payment schemas."""

from typing import Optional, Literal
from pydantic import BaseModel, Field


PLANS = {
    "starter": {"name": "Старт", "price_rub": 990, "searches": 50, "description": "50 поисков в месяц"},
    "business": {"name": "Бизнес", "price_rub": 2990, "searches": 300, "description": "300 поисков в месяц"},
    "pro": {"name": "Pro", "price_rub": 7990, "searches": -1, "description": "Безлимитные поиски"},
}


class CreatePaymentRequest(BaseModel):
    plan: Literal["starter", "business", "pro"] = Field(..., description="Tariff plan ID")
    return_url: Optional[str] = Field(default=None, description="Override return URL")


class PaymentResponse(BaseModel):
    payment_id: str
    status: str
    confirmation_url: str
    amount_rub: int
    plan: str


class PaymentStatusResponse(BaseModel):
    payment_id: str
    status: str
    paid: bool
    amount_rub: int
    plan: str


class WebhookPayload(BaseModel):
    type: str
    event: str
    object: dict
