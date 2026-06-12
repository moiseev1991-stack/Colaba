'use client';

// ТЗ КП-фокус 2026-06-12 §1.3: сегментация сведена к ОДНОЙ аудитории —
// «те, кто продаёт услуги малому бизнесу» (веб-студии, SEO, маркетинговые
// агентства, фрилансеры, разработчики AI-сервисов). Убраны франшизы,
// колл-центры, «локальные сервисы», «B2B-сервисы» как отдельные сегменты
// — они не исчезают как клиенты, но на промо мы с ними не говорим.

import { Sparkles } from 'lucide-react';

const SECONDARY_AUDIENCE = [
  { dot: 'green',  label: 'Веб-студии и разработчики сайтов' },
  { dot: 'blue',   label: 'SEO-специалисты' },
  { dot: 'purple', label: 'Маркетинговые агентства' },
  { dot: 'orange', label: 'Фрилансеры и консультанты' },
  { dot: 'cyan',   label: 'Разработчики AI-сервисов и чат-ботов' },
];

const SOURCES = [
  { dot: 'green',  label: '2GIS — основной (отзывы → боли)' },
  { dot: 'blue',   label: 'Яндекс.Карты — компании, рейтинги' },
  { dot: 'orange', label: 'DaData — оборот, возраст, ИНН' },
  { dot: 'purple', label: 'AI (OpenAI / Anthropic) — диагноз и письма' },
  { dot: 'cyan',   label: 'Email-кампании с отслеживанием' },
  { dot: 'red',    label: 'Blacklist доменов и компаний' },
  { dot: 'green',  label: 'История запусков и пресеты' },
  { dot: 'yellow', label: 'Webhook / API (скоро)' },
];

export function AudienceSection() {
  return (
    <section id="audience" className="landing-section l-tools">
      <div className="container">
        <div className="section-label reveal">Для кого и источники</div>
        <h2 className="section-title reveal">
          Под кого мы заточены <span style={{ color: 'var(--landing-accent)' }}>в первую очередь</span>
        </h2>

        {/* Главный ICP-блок — маркетологи и агентства */}
        <div
          className="reveal"
          style={{
            background: 'var(--landing-card)',
            border: '1px solid var(--landing-border-accent)',
            borderRadius: 'var(--landing-radius)',
            padding: '28px 32px',
            marginBottom: '36px',
            boxShadow: 'var(--landing-shadow-md)',
            display: 'grid',
            gap: '24px',
            gridTemplateColumns: 'auto minmax(0, 1fr)',
            alignItems: 'flex-start',
          }}
        >
          <div
            style={{
              flexShrink: 0,
              width: '56px',
              height: '56px',
              borderRadius: '14px',
              background: 'var(--landing-grad-accent)',
              color: '#fff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: 'var(--landing-shadow-accent)',
            }}
          >
            <Sparkles size={28} />
          </div>

          <div>
            <div
              style={{
                fontSize: '12px',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '1.5px',
                color: 'var(--landing-accent)',
                marginBottom: '8px',
              }}
            >
              Главный сегмент
            </div>
            <h3
              style={{
                fontSize: 'clamp(20px, 2.2vw, 26px)',
                fontWeight: 800,
                color: 'var(--landing-text)',
                marginBottom: '10px',
                letterSpacing: '-0.3px',
                lineHeight: 1.25,
              }}
            >
              Вы продаёте услуги малому бизнесу
            </h3>
            <p
              style={{
                fontSize: '15px',
                color: 'var(--landing-text-body)',
                lineHeight: 1.6,
                marginBottom: '14px',
              }}
            >
              Веб-студия, SEO-специалист, маркетинговое агентство, фрилансер или
              разработчик AI-сервиса? SpinLid даёт вам не «список из 1000 компаний»,
              а <strong>23 компании, где клиенты жалуются на проблему, которую решаете именно вы</strong> —
              и КП с цитатой из их же отзывов вместо шаблонного «Здравствуйте».
            </p>

            {/* Микро-кейс */}
            <div
              style={{
                background: 'var(--landing-bg)',
                border: '1px solid var(--landing-border)',
                borderRadius: '10px',
                padding: '12px 14px',
                fontSize: '13.5px',
                color: 'var(--landing-text)',
                lineHeight: 1.5,
              }}
            >
              <strong style={{ color: 'var(--landing-accent)' }}>Пример:</strong>{' '}
              продаёте онлайн-запись стоматологиям. Открываете нишу «стоматология / Москва»,
              фильтр «рейтинг 3.5–4.2, есть негатив». На выходе — карточки с pain-тегами
              «долгое ожидание», «грубят на ресепшене», «не перезванивают». КП:
              «Вижу в отзывах три жалобы про запись и дозвон — покажу, как онлайн-запись их закрывает».
            </div>
          </div>
        </div>

        {/* Кому ещё подходит */}
        <div style={{ marginBottom: '48px' }}>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: 'var(--landing-muted)',
              marginBottom: '14px',
            }}
          >
            Кому ещё подходит
          </p>
          <div className="l-tools__grid reveal">
            {SECONDARY_AUDIENCE.map(({ dot, label }) => (
              <div className="l-tool-chip" key={label}>
                <span className={`l-tool-chip__dot l-tool-chip__dot--${dot}`} />
                {label}
              </div>
            ))}
          </div>
        </div>

        {/* Источники и интеграции */}
        <div>
          <p
            style={{
              fontSize: '13px',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '1.5px',
              color: 'var(--landing-muted)',
              marginBottom: '14px',
            }}
          >
            Источники и интеграции
          </p>
          <div className="l-tools__grid reveal">
            {SOURCES.map(({ dot, label }) => (
              <div className="l-tool-chip" key={label}>
                <span className={`l-tool-chip__dot l-tool-chip__dot--${dot}`} />
                {label}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
