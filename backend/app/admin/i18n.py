"""
Internationalization (i18n) support for SQLAdmin.
Uses gettext/babel for translations with Russian as default language.
"""

import logging
import os
from functools import lru_cache
from gettext import GNUTranslations, NullTranslations, translation
from typing import Optional

logger = logging.getLogger(__name__)

# Default language
DEFAULT_LANGUAGE = "ru"

# Supported languages
SUPPORTED_LANGUAGES = ["ru", "en"]

# Locales directory (relative to this file)
LOCALES_DIR = os.path.join(os.path.dirname(__file__), "locales")


@lru_cache()
def get_translations(language: str) -> GNUTranslations | NullTranslations:
    """
    Get translations for the specified language.
    
    Args:
        language: Language code (e.g., "ru", "en")
    
    Returns:
        Translation object
    """
    if language not in SUPPORTED_LANGUAGES:
        language = DEFAULT_LANGUAGE
    
    try:
        return translation(
            "admin",
            localedir=LOCALES_DIR,
            languages=[language],
            fallback=True,
        )
    except Exception as e:
        logger.warning("Failed to load translations for language=%s: %s", language, e)
        return NullTranslations()


def set_language(language: str) -> None:
    """
    Set the current language for translations.
    
    Args:
        language: Language code (e.g., "ru", "en")
    """
    global _current_language
    _current_language = language if language in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE


# Thread-local storage for current language
_current_language = DEFAULT_LANGUAGE


def get_current_language() -> str:
    """Get the current language code."""
    return _current_language


def _(message: str, language: Optional[str] = None) -> str:
    """
    Translate a message to the current language.
    
    Args:
        message: Message to translate
        language: Optional language override
    
    Returns:
        Translated message
    """
    lang = language or _current_language
    translations = get_translations(lang)
    return translations.gettext(message)


def n_(singular: str, plural: str, n: int, language: Optional[str] = None) -> str:
    """
    Translate a message with plural forms.
    
    Args:
        singular: Singular form
        plural: Plural form
        n: Count
        language: Optional language override
    
    Returns:
        Translated message
    """
    lang = language or _current_language
    translations = get_translations(lang)
    return translations.ngettext(singular, plural, n)


class TranslationContext:
    """Context manager for temporary language change."""
    
    def __init__(self, language: str):
        self.language = language
        self.previous_language = None
    
    def __enter__(self):
        self.previous_language = _current_language
        set_language(self.language)
        return self
    
    def __exit__(self, exc_type, exc_val, exc_tb):
        set_language(self.previous_language)
        return False


# Convenience function for Jinja2 templates
def get_translator(language: str = None):
    """
    Get a translator function for use in templates.
    
    Args:
        language: Language code (uses current if not specified)
    
    Returns:
        Translation function
    """
    lang = language or _current_language
    
    def translate(message: str) -> str:
        return _(message, lang)
    
    return translate
