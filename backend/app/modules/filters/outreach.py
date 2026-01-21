"""
Outreach text generation based on SEO issues.
"""

from typing import List, Dict, Any, Optional


def generate_outreach_text(
    domain: str,
    seo_issues: List[str],
    seo_score: Optional[int] = None,
) -> Dict[str, str]:
    """
    Generate outreach text and subject based on SEO issues.
    
    Args:
        domain: Domain name
        seo_issues: List of SEO issues found
        seo_score: SEO score (0-100)
    
    Returns:
        Dict with 'subject' and 'text'
    """
    # Map issues to Russian descriptions
    issue_descriptions = {
        "no_robots_txt": "отсутствует файл robots.txt",
        "robots_disallow_all": "все страницы запрещены к индексации",
        "no_sitemap_in_robots": "нет ссылки на sitemap в robots.txt",
        "empty_meta_title": "пустые meta title",
        "empty_meta_description": "пустые meta description",
        "no_h1": "отсутствуют заголовки H1",
        "multiple_h1": "несколько заголовков H1 на странице",
    }
    
    # Build issues list
    issues_list = []
    for issue in seo_issues[:3]:  # Top 3 issues
        desc = issue_descriptions.get(issue, issue)
        issues_list.append(desc)
    
    issues_text = ", ".join(issues_list)
    if len(seo_issues) > 3:
        issues_text += f" и еще {len(seo_issues) - 3} проблем"
    
    # Generate subject
    if seo_score is not None and seo_score < 50:
        subject = f"Критические SEO проблемы на {domain}"
    elif seo_score is not None and seo_score < 70:
        subject = f"SEO проблемы на {domain} - можно улучшить"
    else:
        subject = f"Рекомендации по SEO для {domain}"
    
    # Generate text
    text = f"""Здравствуйте!

Я проанализировал ваш сайт {domain} и обнаружил несколько SEO проблем, которые могут негативно влиять на позиции в поисковых системах.

Основные проблемы:
- {issues_text}

Эти проблемы могут снижать видимость вашего сайта в поисковых системах и уменьшать органический трафик.

Я могу помочь исправить эти проблемы и улучшить SEO вашего сайта. Готов обсудить детали и предложить конкретные решения.

С уважением,
SEO специалист"""
    
    return {
        "subject": subject,
        "text": text,
    }
