'use client';

// Секция 4 главной «Для кого» (PR 2.2): три профессии с конкретным сценарием и ссылкой
// на страницу /klienty-dlya-*, ниже — кому ещё подходит (раньше отдельный блок AudienceSection).

import Link from 'next/link';
import { ArrowRight, Globe, Search, TrendingDown } from 'lucide-react';

const PROFESSIONS = [
  {
    href: '/klienty-dlya-web-studii',
    Icon: Globe,
    audience: 'Веб-студиям',
    title: 'Компании, где клиенты не могут записаться',
    body: 'Продаёте сайты и онлайн-запись? Найдите клиники и автосервисы, где в отзывах пишут «не смог записаться» и «не дозвонился», — и напишите с этим поводом.',
    cta: 'Клиенты для веб-студии',
  },
  {
    href: '/klienty-dlya-seo',
    Icon: Search,
    audience: 'SEO-специалистам',
    title: 'Бизнес, который не находят на картах',
    body: 'Низкий рейтинг, мало отзывов, слабые позиции в 2GIS и на Яндекс.Картах. Таким компаниям нужно продвижение, хотя сами они запрос ещё не сформулировали.',
    cta: 'Клиенты на SEO',
  },
  {
    href: '/klienty-dlya-marketing-agentstva',
    Icon: TrendingDown,
    audience: 'Маркетинговым агентствам',
    title: 'Компании, где растёт недовольство клиентов',
    body: 'Жалоб в отзывах всё больше, владелец не отвечает, рейтинг падает. Письмо с цифрами из их же отзывов убеждает лучше, чем «комплексный маркетинг».',
    cta: 'Клиенты для агентства',
  },
];

const ALSO = ['Фрилансерам и консультантам', 'Разработчикам чат-ботов и AI-сервисов', 'Всем, кто продаёт услуги малому бизнесу'];

export function ProfessionsSection() {
  return (
    <section id="audience" className="landing-section">
      <div className="container">
        <div className="section-label reveal">Для кого</div>
        <h2 className="section-title reveal" style={{ marginBottom: '32px' }}>
          Для тех, кто продаёт услуги <span style={{ color: 'var(--landing-accent)' }}>малому бизнесу</span>
        </h2>

        <div
          style={{
            display: 'grid',
            gap: '20px',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          }}
        >
          {PROFESSIONS.map(({ href, Icon, audience, title, body, cta }) => (
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
                  background: 'var(--landing-accent-light)',
                  color: 'var(--landing-accent)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '14px',
                }}
              >
                <Icon size={22} aria-hidden />
              </div>
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1.2px',
                  color: 'var(--landing-accent)',
                  marginBottom: '6px',
                }}
              >
                {audience}
              </div>
              <h3 style={{ fontSize: '17px', fontWeight: 700, color: 'var(--landing-text)', marginBottom: '10px', lineHeight: 1.3 }}>
                {title}
              </h3>
              <p style={{ fontSize: '14px', color: 'var(--landing-text-body)', lineHeight: 1.55, marginBottom: '18px', flex: 1 }}>
                {body}
              </p>
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--landing-accent)' }}>
                {cta}
                <ArrowRight size={14} aria-hidden />
              </div>
            </Link>
          ))}
        </div>

        <div className="reveal" style={{ marginTop: '28px' }}>
          <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--landing-muted)', marginBottom: '12px' }}>
            Также подходит:
          </p>
          <div className="l-tools__grid">
            {ALSO.map((label) => (
              <div className="l-tool-chip" key={label}>
                <span className="l-tool-chip__dot l-tool-chip__dot--green" />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
