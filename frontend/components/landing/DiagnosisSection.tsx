'use client';

// ТЗ лендинг-рефакта 2026-06-03 §4: НОВАЯ секция «Как работает диагноз».
// Главный отличающий блок, размещаем сразу после Hero. Не «контакты в столбик»,
// а карточка с pain-тегами, цитатой клиента и кнопкой «Письмо» — визуальная
// демонстрация того, что конкуренты (Snov / Apollo / Контур.Компас) не дают.

import { MessageSquareQuote, Activity, Mail, Phone, Sparkles } from 'lucide-react';

const PAINS = [
  {
    label: 'Долгое ожидание',
    count: 12,
    quote: 'Записала ребёнка на 10:00, приняли в 11:20. С ребёнком 4 лет полтора часа ждать в коридоре — это перебор.',
  },
  {
    label: 'Дорого / непрозрачные цены',
    count: 7,
    quote: 'На сайте от 1500 ₽, по факту чек 4800. На ресепшене сказали „доп. процедуры включаются по необходимости".',
  },
  {
    label: 'Не перезванивают',
    count: 5,
    quote: 'Оставила заявку через сайт три дня назад — ни звонка, ни SMS. Записалась в другую клинику.',
  },
];

export function DiagnosisSection() {
  return (
    <section id="diagnosis" className="landing-section">
      <div className="container" style={{ maxWidth: '1160px' }}>
        <div className="section-label reveal">Главная фишка</div>
        <h2
          className="section-title reveal"
          style={{ marginBottom: '12px' }}
        >
          Не контакты, а <span style={{ color: 'var(--landing-accent)' }}>диагноз</span>
        </h2>
        <p
          className="reveal"
          style={{
            fontSize: '16px',
            color: 'var(--landing-muted)',
            maxWidth: '720px',
            marginBottom: '40px',
            lineHeight: 1.6,
          }}
        >
          Конкуренты дают <strong style={{ color: 'var(--landing-text)' }}>контакт</strong>.
          SpinLid даёт <strong style={{ color: 'var(--landing-accent)' }}>повод зайти</strong> —
          конкретную боль клиентов и готовый текст под неё.
        </p>

        <div
          className="reveal"
          style={{
            display: 'grid',
            gap: '28px',
            gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.1fr)',
            alignItems: 'start',
          }}
        >
          {/* Левая колонка: 3 буллета процесса */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <DiagnosisStep
              num="1"
              title="Скачиваем отзывы с карт"
              desc="2GIS и Яндекс — реальные люди о реальном бизнесе. На каждую компанию — десятки или сотни отзывов с рейтингами и датами."
            />
            <DiagnosisStep
              num="2"
              title="AI ставит диагноз"
              desc="Кластеризация по болям: «долгое ожидание», «грязно», «непрозрачные цены». Не «3.8★» — а конкретный список жалоб с количеством упоминаний."
            />
            <DiagnosisStep
              num="3"
              title="Готовит письмо под боль"
              desc="Один клик — черновик: «вижу в отзывах жалобу на X, могу показать решение». Без копипасты, с упоминанием конкретной цитаты клиента."
            />
            <div
              style={{
                marginTop: '8px',
                padding: '16px 18px',
                borderRadius: '12px',
                background: 'linear-gradient(135deg, rgba(14,169,122,0.08), rgba(79,70,229,0.06))',
                border: '1px solid var(--landing-border-accent)',
              }}
            >
              <div
                style={{
                  fontSize: '12px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1.5px',
                  color: 'var(--landing-accent)',
                  marginBottom: '6px',
                }}
              >
                Формула
              </div>
              <p style={{ fontSize: '14px', color: 'var(--landing-text)', lineHeight: 1.55 }}>
                Apollo показывает, <strong>кому писать</strong>.<br />
                SpinLid — <strong style={{ color: 'var(--landing-accent)' }}>что написать</strong> и почему откликнутся.
              </p>
            </div>
          </div>

          {/* Правая колонка: стилизованная карточка компании */}
          <div>
            <div
              style={{
                position: 'relative',
                backgroundColor: 'var(--landing-card)',
                border: '1px solid var(--landing-border)',
                borderRadius: 'var(--landing-radius-sm)',
                padding: '20px 22px',
                boxShadow: 'var(--landing-shadow-md)',
              }}
            >
              {/* Шапка карточки */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px', marginBottom: '14px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--landing-text)' }}>
                    Стоматология «Улыбка+»
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--landing-muted)', marginTop: '2px' }}>
                    Москва, ул. Ленина 12 · ★ 3.8 · 142 отзыва
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 700,
                    padding: '4px 8px',
                    borderRadius: '6px',
                    background: 'rgba(239,68,68,0.12)',
                    color: '#dc2626',
                    whiteSpace: 'nowrap',
                  }}
                >
                  31 негатив
                </span>
              </div>

              {/* Контакты строкой */}
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', fontSize: '12px', color: 'var(--landing-muted)', marginBottom: '14px' }}>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Phone size={12} style={{ color: 'var(--landing-accent)' }} />
                  +7 (495) 123-45-67
                </span>
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                  <Mail size={12} style={{ color: 'var(--landing-accent)' }} />
                  info@ulybka-plus.ru
                </span>
              </div>

              {/* Заголовок диагноза */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  fontSize: '11px',
                  fontWeight: 700,
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  color: '#d97706',
                  marginBottom: '10px',
                }}
              >
                <Activity size={12} />
                Диагноз по отзывам
              </div>

              {/* Pain-теги с цитатами */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {PAINS.map((p) => (
                  <div
                    key={p.label}
                    style={{
                      borderRadius: '8px',
                      padding: '10px 12px',
                      background: 'rgba(245, 158, 11, 0.08)',
                      border: '1px solid rgba(245, 158, 11, 0.25)',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span
                        style={{
                          fontSize: '12px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '999px',
                          background: 'rgba(245, 158, 11, 0.25)',
                          color: '#92400e',
                        }}
                      >
                        {p.label}
                      </span>
                      <span style={{ fontSize: '11px', color: '#b45309' }}>× {p.count}</span>
                    </div>
                    <div
                      style={{
                        display: 'flex',
                        gap: '6px',
                        alignItems: 'flex-start',
                        fontSize: '12px',
                        color: 'var(--landing-text-body)',
                        fontStyle: 'italic',
                        lineHeight: 1.5,
                      }}
                    >
                      <MessageSquareQuote size={11} style={{ color: '#d97706', flexShrink: 0, marginTop: '3px' }} />
                      <span>«{p.quote}»</span>
                    </div>
                  </div>
                ))}
              </div>

              {/* CTA — «Письмо» */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '16px' }}>
                <button
                  type="button"
                  style={{
                    flex: 1,
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '6px',
                    padding: '9px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: '#fff',
                    background: 'var(--landing-grad-accent)',
                    border: 'none',
                    cursor: 'default',
                  }}
                >
                  <Sparkles size={14} />
                  Сгенерировать черновик
                </button>
                <button
                  type="button"
                  style={{
                    padding: '9px 14px',
                    borderRadius: '8px',
                    fontSize: '13px',
                    fontWeight: 600,
                    color: 'var(--landing-text)',
                    background: 'transparent',
                    border: '1px solid var(--landing-border)',
                    cursor: 'default',
                  }}
                >
                  В список
                </button>
              </div>

              {/* Footer-плашка «Пример» */}
              <div
                style={{
                  marginTop: '14px',
                  paddingTop: '12px',
                  borderTop: '1px dashed var(--landing-border)',
                  fontSize: '11px',
                  color: 'var(--landing-muted)',
                  textAlign: 'center',
                }}
              >
                ПРИМЕР · так выглядит карточка компании в кабинете
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function DiagnosisStep({ num, title, desc }: { num: string; title: string; desc: string }) {
  return (
    <div style={{ display: 'flex', gap: '14px', alignItems: 'flex-start' }}>
      <div
        style={{
          flexShrink: 0,
          width: '34px',
          height: '34px',
          borderRadius: '10px',
          background: 'var(--landing-grad-accent)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: 'JetBrains Mono, monospace',
          fontWeight: 700,
          fontSize: '14px',
          boxShadow: 'var(--landing-shadow-accent)',
        }}
      >
        {num}
      </div>
      <div>
        <div style={{ fontSize: '15px', fontWeight: 700, color: 'var(--landing-text)', marginBottom: '4px' }}>
          {title}
        </div>
        <p style={{ fontSize: '13.5px', color: 'var(--landing-muted)', lineHeight: 1.55 }}>
          {desc}
        </p>
      </div>
    </div>
  );
}
