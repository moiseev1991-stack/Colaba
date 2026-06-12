'use client';

// ТЗ КП-фокус 2026-06-12 §2.1: блок «Под вашу профессию» на главной.
// Три карточки зеркалят профессиональные пресеты внутри продукта и ведут
// на аудиторные страницы /klienty-dlya-{web-studii,seo,marketing-agentstva}.
//
// Это самый конверсионный контент — закрывает запросы вида «клиенты для
// веб-студии», «как найти клиентов на SEO», «лидген для агентства».

import Link from 'next/link';
import { ArrowRight, Globe, Search, TrendingDown } from 'lucide-react';

const PROFESSIONS = [
  {
    href: '/klienty-dlya-web-studii',
    Icon: Globe,
    iconColor: '#06b6d4',
    audience: 'Веб-студиям',
    title: 'Компании без сайта или с жалобами на запись',
    body: 'Продаёте онлайн-запись и компактные сайты под клинику или автосервис? Вот 17 клиник в Москве, где клиенты в отзывах жалуются именно на «не смог записаться» и «не дозвонился». С готовым КП.',
    cta: 'Клиенты для веб-студии',
  },
  {
    href: '/klienty-dlya-seo',
    Icon: Search,
    iconColor: '#a855f7',
    audience: 'SEO-специалистам',
    title: 'Бизнес, которого не находят на картах и в поиске',
    body: 'Рейтинг ниже среднего по нише, мало отзывов, плохая позиция на 2GIS. Это компании, которым нужен SEO — но они пока не сформулировали запрос. SpinLid делает заход с конкретным расчётом потерь.',
    cta: 'Клиенты на SEO',
  },
  {
    href: '/klienty-dlya-marketing-agentstva',
    Icon: TrendingDown,
    iconColor: '#ef4444',
    audience: 'Маркетинговым агентствам',
    title: 'Растущий негатив и отток клиентов прямо сейчас',
    body: 'Тренд негатива rising, владелец не отвечает, рейтинг падает. Это компании, которым нужен поток клиентов СЕЙЧАС — и они это знают. КП с расчётом потерь работает в разы лучше «комплексного маркетинга».',
    cta: 'Клиенты для агентства',
  },
];

export function ProfessionsSection() {
  return (
    <section id="professions" className="landing-section">
      <div className="container">
        <div className="section-label reveal">Под вашу профессию</div>
        <h2 className="section-title reveal">
          Три профессиональных <span style={{ color: 'var(--landing-accent)' }}>пресета</span>
        </h2>
        <p
          className="reveal"
          style={{
            textAlign: 'left',
            fontSize: '14px',
            color: 'var(--landing-muted)',
            maxWidth: '720px',
            marginTop: '-4px',
            marginBottom: '32px',
            lineHeight: 1.55,
          }}
        >
          Один пресет в сайдбаре кабинета выставляет нужные фильтры под вашу профессию
          и подкладывает соответствующий шаблон КП. Ниже — что искать, кому писать и почему отвечают.
        </p>

        <div
          style={{
            display: 'grid',
            gap: '20px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {PROFESSIONS.map(({ href, Icon, iconColor, audience, title, body, cta }) => (
            <Link
              key={href}
              href={href}
              className="reveal"
              style={{
                display: 'flex',
                flexDirection: 'column',
                background: 'var(--landing-card)',
                border: '1px solid var(--landing-border)',
                borderRadius: 'var(--landing-radius)',
                padding: '24px 22px',
                textDecoration: 'none',
                color: 'inherit',
                boxShadow: 'var(--landing-shadow-sm)',
                transition: 'transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.transform = 'translateY(-2px)';
                e.currentTarget.style.boxShadow = 'var(--landing-shadow-md)';
                e.currentTarget.style.borderColor = 'var(--landing-border-accent)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.transform = '';
                e.currentTarget.style.boxShadow = 'var(--landing-shadow-sm)';
                e.currentTarget.style.borderColor = 'var(--landing-border)';
              }}
            >
              <div
                style={{
                  width: '44px',
                  height: '44px',
                  borderRadius: '12px',
                  background: `${iconColor}1a`,
                  color: iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '14px',
                }}
              >
                <Icon size={22} />
              </div>
              <div
                style={{
                  fontSize: '11.5px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1.2px',
                  color: iconColor,
                  marginBottom: '6px',
                }}
              >
                {audience}
              </div>
              <h3
                style={{
                  fontSize: '17px',
                  fontWeight: 700,
                  color: 'var(--landing-text)',
                  marginBottom: '10px',
                  lineHeight: 1.3,
                }}
              >
                {title}
              </h3>
              <p
                style={{
                  fontSize: '14px',
                  color: 'var(--landing-text-body)',
                  lineHeight: 1.55,
                  marginBottom: '18px',
                  flex: 1,
                }}
              >
                {body}
              </p>
              <div
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  color: 'var(--landing-accent)',
                }}
              >
                {cta}
                <ArrowRight size={14} />
              </div>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
