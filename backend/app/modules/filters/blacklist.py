"""
Blacklist domain checking utilities.
"""

from typing import List


def normalize_domain(domain: str) -> str:
    """Normalize domain (lowercase, remove www)."""
    domain = domain.lower().strip()
    if domain.startswith("www."):
        domain = domain[4:]
    return domain


def is_blacklisted(domain: str, blacklist: List[str]) -> bool:
    """
    Check if domain is in blacklist.
    
    Supports exact match and subdomain matching.
    """
    normalized_domain = normalize_domain(domain)
    
    for blacklisted in blacklist:
        blacklisted_normalized = normalize_domain(blacklisted)
        
        # Exact match
        if normalized_domain == blacklisted_normalized:
            return True
        
        # Subdomain check: domain ends with .blacklisted
        if normalized_domain.endswith(f".{blacklisted_normalized}"):
            return True
        
        # Subdomain check: blacklisted ends with .domain
        if blacklisted_normalized.endswith(f".{normalized_domain}"):
            return True
    
    return False


# Pre-seeded blacklist domains: соцсети, маркетплейсы, поисковики, агрегаторы и т.п.
# Поисковики и агрегаторы — чтобы в результатах оставались только конечные сайты.
SEED_BLACKLIST = [
    "mail.ru", "dzen.ru", "wikipedia.org", "ozon.ru", "ya.ru",
    "youtube.com", "avito.ru", "wildberries.ru", "telegram.org",
    "pornhub.com", "twitch.tv", "porno365.bike", "whatsapp.com",
    "gosuslugi.ru", "vkvideo.ru", "dns-shop.ru", "rbc.ru",
    "msn.com", "ria.ru", "sportbox.ru", "mangalib.me",
    "google.com", "drive2.ru", "lenta.ru", "ficbook.net", "hh.ru",
    "pornhub.org", "sex-studentki.pub", "amedia.lol", "piterest.com",
    "interest.com", "instagram.com", "aliexpress.ru", "knigavuhe.org",
    "drom.ru", "duckduckgo.com", "rambler.ru", "mos.ru",
    "yandex.com", "tiktok.com", "2gis.ru", "tbank.ru",
    "anilib.me", "sports.ru", "kp.ru", "zagonkomv.gb.net",
    "championat.com", "russianfood.com", "author.today",
    "mangalib.ru", "weather.com", "vseinstrumenti.ru",
    "yummy-anime.ru", "chatgpt.com", "mts.ru", "deepseek.com",
    "ixbt.com", "nspk.ru", "reddit.com", "remanga.org",
    "xvideos.com", "yaplakal.com", "consultant.ru",
    "muzofond.fm", "ukdevilz.com", "rustore.ru",
    "habr.com", "github.com", "e1.ru", "microsoft.com",
    "livejournal.com", "ivi.ru", "doramalive.news",
    "sberbank.ru", "gazeta.ru",
    "porn365.com", "sex-studentki.pub", "porn365.bike",
    # Поисковики (доп. к уже имеющимся)
    "yandex.ru", "google.ru", "bing.com", "baidu.com",
    "ecosia.org", "qwant.com", "ask.com", "yahoo.com",
    # Агрегаторы и каталоги
    "otzovik.com", "irecommend.ru", "zoon.ru", "flamp.ru",
    "spravkaru.net", "all.biz", "prodoctorov.ru", "docdoc.ru",
    "napopravku.ru", "gderu.ru", "b2b-center.ru", "tiu.ru",
    "satom.ru", "deal.by", "yell.com", "hotline.ua",
]
