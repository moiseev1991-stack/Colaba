"""Обход капчи: конфиг, solver (image + reCAPTCHA)."""

from app.modules.captcha import service
from app.modules.captcha.solver import solve_image_captcha, solve_recaptcha

__all__ = ["service", "solve_image_captcha", "solve_recaptcha"]
