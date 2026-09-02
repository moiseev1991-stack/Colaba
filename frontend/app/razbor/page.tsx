'use client';

import { useEffect, useState } from 'react';
import '@/components/landing/landing.css';
import { LandingHeader } from '@/components/landing/LandingHeader';
import { HeroBackgroundDecor } from '@/components/HeroBackgroundDecor';

// Лендинг оффера «Дмитрий» как полноценная страница сайта: сверху общая шапка
// SpinLid (LandingHeader variant="subpage" — логотип и пункты ведут на главную),
// hero в стиле главной (тёмный фон-декор + бейдж + градиентный заголовок +
// floating-карточки). Ниже — оффер на своих .razbor-стилях.
// Форма шлёт same-origin на /api/v1/inbound-leads/public (CORS не нужен).
// Счётчик Метрики грузит общий <YandexMetrika/>; на успех — цель lead_form.

// Username бота-приёмника БЕЗ @ (= PUBLIC_BOT_USERNAME из .env бэкенда).
// Не секрет. Задаётся на сборке фронта через NEXT_PUBLIC_RAZBOR_BOT;
// дефолт — реальный бот-приёмник, чтобы ссылки «в Telegram» работали без env.
const BOT_USERNAME = process.env.NEXT_PUBLIC_RAZBOR_BOT || 'bolshe_lidov_bot';
const TG_URL = `https://t.me/${BOT_USERNAME}?start=landing`;

// ID счётчика Яндекс.Метрики spinlid.ru (тот же, что в components/YandexMetrika).
const METRIKA_ID = 110073452;

// FAQ — единый источник и для видимого блока, и для JSON-LD (FAQPage).
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Сколько стоит разбор?',
    a: 'Ничего. Разбор бесплатный и ни к чему не обязывает: я показываю, где теряются клиенты, а решение остаётся за вами.',
  },
  {
    q: 'Сколько времени это займёт?',
    a: 'Около 10 минут. Я заранее смотрю отзывы вашей компании и то, как устроен приём обращений, а на разборе показываю выводы.',
  },
  {
    q: 'Что именно вы смотрите?',
    a: 'Открытые отзывы вашей компании на картах и то, как обрабатываются звонки, заявки и сообщения — где конкретно уходят обращения.',
  },
  {
    q: 'Мне нужно будет что-то купить?',
    a: 'Нет. Разбор самостоятельный и бесплатный. Если захотите — обсудим, как закрыть найденные потери, но это не обязательно.',
  },
  {
    q: 'Как быстро вы ответите на заявку?',
    a: 'Лично в течение пары часов в рабочее время. Можно сразу написать в Telegram — отвечаю там же.',
  },
];

// JSON-LD: Service (бесплатная услуга разбора, провайдер — персона «Дмитрий»,
// без единого упоминания бренда) + FAQPage из массива FAQ. Микроразметка для
// сниппетов в поиске; читается ботами прямо из SSR-HTML.
const LD_JSON = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Service',
      name: 'Бесплатный разбор потерь клиентов',
      serviceType: 'Аудит приёма обращений и записи клиентов',
      description:
        'Разбор по отзывам вашей компании: где теряются клиенты на звонках, заявках и записи, и как это закрыть. Бесплатно, за 10 минут, без обязательств.',
      areaServed: { '@type': 'Country', name: 'Россия' },
      provider: { '@type': 'Person', name: 'Дмитрий' },
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB', availability: 'https://schema.org/InStock' },
      url: 'https://spinlid.ru/razbor',
    },
    {
      '@type': 'FAQPage',
      mainEntity: FAQ.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ],
};

const STYLES = `
.razbor{
  --accent:#059669; --accent-strong:#047857;
  --grad:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);
  --ink:#0f1e17; --muted:#566b62; --bg:#f4f8f6; --card:#ffffff; --line:#e4ede9;
  --radius:16px; --radius-lg:22px; --maxw:880px;
  --shadow:0 4px 16px rgba(15,23,42,.07); --shadow-hover:0 14px 34px rgba(16,185,129,.16);
  color:var(--ink); background:var(--bg); line-height:1.55; font-size:17px; min-height:100vh;
  -webkit-font-smoothing:antialiased;
  font-family:var(--font-body),'Manrope',system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
}
.razbor *{box-sizing:border-box}
.razbor .wrap{max-width:var(--maxw);margin:0 auto;padding:0 22px}
.razbor h1,.razbor h2,.razbor h3{font-family:var(--font-display),'Unbounded',system-ui,sans-serif;letter-spacing:-.01em}
.razbor h1{font-size:38px;line-height:1.12;margin:0 0 16px;font-weight:800}
.razbor h2{font-size:26px;line-height:1.2;margin:0 0 22px;font-weight:700}
.razbor p{margin:0 0 14px}
.razbor .lead{font-size:19px;color:var(--muted)}
.razbor section{padding:52px 0}
.razbor section + section{border-top:1px solid var(--line)}

/* HERO — визуал в стиле главной (класс .l-hero под .landing-light).
   .razbor-обёртка остаётся, поэтому trust-список подкрашиваем под тёмный фон. */
.razbor .l-hero{padding:0}
.razbor .l-hero .trust{margin-top:34px}
.razbor .l-hero .trust li{color:rgba(255,255,255,.82)}
.razbor .l-hero .trust li::before{background:rgba(16,185,129,.22);color:#79f0c7}
.razbor .cta{
  display:inline-flex;align-items:center;justify-content:center;gap:10px;
  background:var(--grad);color:#fff;text-decoration:none;font-weight:750;font-size:18px;
  padding:17px 30px;border-radius:14px;border:0;cursor:pointer;min-height:56px;line-height:1.1;
  box-shadow:0 8px 22px rgba(16,185,129,.28);transition:transform .18s ease,box-shadow .18s ease;
  font-family:var(--font-body),'Manrope',sans-serif;
}
.razbor .cta:hover{transform:translateY(-2px);box-shadow:0 14px 32px rgba(16,185,129,.36)}
.razbor .cta:active{transform:translateY(0)}
.razbor .cta:disabled{opacity:.65;cursor:default;transform:none;box-shadow:0 8px 22px rgba(16,185,129,.2)}
.razbor .trust{display:flex;flex-wrap:wrap;gap:10px 22px;margin:30px 0 0;padding:0;list-style:none}
.razbor .trust li{position:relative;padding-left:26px;font-size:15px;color:var(--muted);font-weight:600}
.razbor .trust li::before{
  content:"\\2713";position:absolute;left:0;top:-1px;width:20px;height:20px;border-radius:50%;
  background:#d1fae5;color:#047857;font-size:12px;font-weight:800;
  display:flex;align-items:center;justify-content:center;
}

/* PAIN CARDS */
.razbor .cards{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.razbor .card{
  position:relative;background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  padding:22px 20px 20px;box-shadow:var(--shadow);transition:transform .18s ease,box-shadow .18s ease;
  overflow:hidden;
}
.razbor .card::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--grad)}
.razbor .card:hover{transform:translateY(-3px);box-shadow:var(--shadow-hover)}
.razbor .card b{display:block;font-size:17.5px;margin-bottom:7px;font-weight:750}
.razbor .card span{color:var(--muted);font-size:15.5px;line-height:1.5}

/* RESULTS */
.razbor .results{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.razbor .results li{
  background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  padding:18px 20px 18px 56px;position:relative;font-size:16.5px;box-shadow:var(--shadow);
}
.razbor .results li::before{
  content:"\\2713";position:absolute;left:18px;top:50%;transform:translateY(-50%);
  width:26px;height:26px;border-radius:50%;background:var(--grad);color:#fff;font-weight:800;font-size:14px;
  display:flex;align-items:center;justify-content:center;
}

/* STEPS */
.razbor .steps{counter-reset:s;list-style:none;padding:0;margin:0 0 18px;display:grid;gap:18px}
.razbor .steps li{position:relative;padding-left:60px;font-size:16.5px;min-height:40px;padding-top:6px}
.razbor .steps li::before{
  counter-increment:s;content:counter(s);position:absolute;left:0;top:0;
  width:42px;height:42px;border-radius:14px;background:var(--grad);color:#fff;
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:19px;
  box-shadow:0 6px 16px rgba(16,185,129,.28);font-family:var(--font-display),sans-serif;
}
.razbor .note{color:var(--muted);font-size:15.5px;margin:0}

/* FAQ */
.razbor .faq{display:grid;gap:12px}
.razbor .faq details{
  background:var(--card);border:1px solid var(--line);border-radius:var(--radius);
  padding:0;box-shadow:var(--shadow);overflow:hidden;
}
.razbor .faq summary{
  cursor:pointer;list-style:none;padding:18px 48px 18px 20px;font-weight:700;font-size:17px;
  position:relative;
}
.razbor .faq summary::-webkit-details-marker{display:none}
.razbor .faq summary::after{
  content:"+";position:absolute;right:20px;top:50%;transform:translateY(-50%);
  color:var(--accent);font-size:24px;font-weight:700;line-height:1;transition:transform .2s ease;
}
.razbor .faq details[open] summary::after{content:"\\2212"}
.razbor .faq .fa{padding:0 20px 18px;color:var(--muted);font-size:16px;line-height:1.55}

/* FORM */
.razbor .form-sec{background:linear-gradient(180deg,#eef6f2,#e8f2ee)}
.razbor form{
  background:var(--card);border:1px solid var(--line);border-radius:var(--radius-lg);
  padding:26px;box-shadow:0 10px 30px rgba(15,23,42,.08);
}
.razbor label{display:block;font-weight:700;font-size:15px;margin:0 0 7px}
.razbor .field{margin-bottom:18px}
.razbor input[type=text]{
  width:100%;font-size:17px;padding:15px 15px;border:1px solid #cdddd5;border-radius:12px;
  background:#fff;color:var(--ink);min-height:52px;transition:border-color .15s ease,box-shadow .15s ease;
  font-family:var(--font-body),'Manrope',sans-serif;
}
.razbor input[type=text]:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(16,185,129,.16)}
.razbor form .cta{width:100%}
.razbor .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.razbor .consent{display:flex;gap:11px;align-items:flex-start;font-size:14.5px;color:var(--muted);margin:2px 0 20px}
.razbor .consent input{margin-top:3px;width:19px;height:19px;flex:0 0 19px;accent-color:var(--accent)}
.razbor .consent a{color:var(--accent);font-weight:600}
.razbor .under-form{color:var(--muted);font-size:15px;margin:16px 0 0;text-align:center}
.razbor .under-form a{color:var(--accent);font-weight:700}
.razbor .msg{margin:16px 0 0;padding:15px 17px;border-radius:12px;font-size:16px}
.razbor .msg.ok{background:#e5f4ee;color:#047857;border:1px solid #b9e0cf}
.razbor .msg.err{background:#fdecec;color:#9a2b2b;border:1px solid #f3c9c9}

/* CTA STRIP */
.razbor .cta-strip{text-align:center}
.razbor .cta-strip h2{margin-bottom:12px}
.razbor .cta-strip p{color:var(--muted);margin:0 0 24px}

/* FOOTER */
.razbor footer{padding:38px 0 52px;color:var(--muted);font-size:15px}
.razbor footer a{color:var(--accent);font-weight:600}
.razbor footer .row{margin-bottom:8px}

@media (max-width:640px){
  .razbor{font-size:16px}
  .razbor h1{font-size:29px}
  .razbor h2{font-size:22px}
  .razbor .cards{grid-template-columns:1fr}
  .razbor section{padding:42px 0}
}
`;

function sourceTag(): string {
  try {
    const p = new URLSearchParams(window.location.search);
    return (p.get('utm_source') || p.get('start') || 'landing').slice(0, 120);
  } catch {
    return 'landing';
  }
}

export default function RazborPage() {
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  // Reveal-on-scroll для hero (классы .reveal стартуют opacity:0 в landing.css —
  // без этого наблюдателя контент останется невидимым).
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -50px 0px' }
    );
    document.querySelectorAll('.razbor .reveal').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;

    const c = company.trim();
    const k = contact.trim();
    if (!c && !k) {
      setMsg({ kind: 'err', text: 'Напишите название компании или контакт — по одному из полей я вас найду.' });
      return;
    }
    if (!consent) {
      setMsg({ kind: 'err', text: 'Отметьте согласие на обработку данных, чтобы я мог с вами связаться.' });
      return;
    }

    setSubmitting(true);
    setMsg(null);
    try {
      const r = await fetch('/api/v1/inbound-leads/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_text: c,
          contact_text: k,
          source_tag: sourceTag(),
          consent,
          hp,
        }),
      });
      if (!r.ok) throw new Error('http ' + r.status);
      await r.json();
      setMsg({ kind: 'ok', text: 'Готово! Заявку получил — напишу вам лично в течение пары часов в рабочее время.' });
      setCompany('');
      setContact('');
      setConsent(false);
      const ym = (window as unknown as { ym?: (...a: unknown[]) => void }).ym;
      if (ym) {
        try {
          ym(METRIKA_ID, 'reachGoal', 'lead_form');
        } catch {
          /* no-op */
        }
      }
    } catch {
      setMsg({ kind: 'err', text: 'Не получилось отправить. Попробуйте ещё раз или напишите мне в Telegram — ссылка ниже.' });
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="razbor">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(LD_JSON) }} />

      <LandingHeader variant="subpage" />

      <div className="landing-light">
        <section className="l-hero" id="top">
          <div className="l-hero__bg">
            <div className="l-hero__overlay" />
          </div>
          <HeroBackgroundDecor />

          <div className="l-hero__inner">
            <div>
              <div className="l-hero__badge reveal">
                <span className="l-hero__badge-dot" />
                Бесплатно · 10 минут · без обязательств
              </div>

              <h1 className="l-hero__title reveal">
                Ваши клиенты уходят к конкурентам,<br />
                <span className="grad-text">пока вы не берёте трубку</span>
              </h1>

              <p className="l-hero__sub reveal">
                Разберу по отзывам вашей компании, где теряются клиенты, и покажу,
                как это закрыть. Бесплатно, за 10 минут, без обязательств.
              </p>

              <div className="l-hero__actions reveal">
                <a className="l-btn l-btn--primary" href="#form">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Получить бесплатный разбор
                </a>
                <a className="l-btn l-btn--ghost" href={TG_URL} rel="noopener" target="_blank">
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                    <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  Написать в Telegram
                </a>
              </div>

              <ul className="trust reveal">
                <li>По вашим реальным отзывам</li>
                <li>Разбираю лично, не вебинар</li>
                <li>Ничего не продаю на разборе</li>
              </ul>
            </div>

            <div className="l-hero__float-cards">
              <div className="l-hero__float-card l-hero__float-card--1 reveal">
                <div className="l-hfc__icon l-hfc__icon--green">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="l-hfc__val">Звонок</div>
                  <div className="l-hfc__label">не пропущен</div>
                </div>
              </div>

              <div className="l-hero__float-card l-hero__float-card--2 reveal">
                <div className="l-hfc__icon">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <div className="l-hfc__val">Заявка</div>
                  <div className="l-hfc__label">ответ за минуту</div>
                </div>
              </div>

              <div className="l-hero__float-card l-hero__float-card--3 reveal">
                <div className="l-hfc__icon l-hfc__icon--purple">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <div>
                  <div className="l-hfc__val">Запись</div>
                  <div className="l-hfc__label">клиент сам, 24/7</div>
                </div>
              </div>
            </div>
          </div>

          <a href="#uznaete" className="l-hero__scroll-hint" aria-label="Листайте вниз">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </section>
      </div>

      <section id="uznaete">
        <div className="wrap">
          <h2>Узнаёте себя?</h2>
          <div className="cards">
            <div className="card">
              <b>Не дозвониться</b>
              <span>Телефон занят или никто не берёт — и клиент звонит конкуренту.</span>
            </div>
            <div className="card">
              <b>Заявки теряются</b>
              <span>Человек написал или оставил заявку, а ему никто не ответил.</span>
            </div>
            <div className="card">
              <b>Сложно записаться</b>
              <span>Запись только по телефону и только в рабочие часы.</span>
            </div>
            <div className="card">
              <b>Хаос в клиентах</b>
              <span>Кто звонил, кому перезвонить, что обещали — всё на бумажках.</span>
            </div>
          </div>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>Что я делаю</h2>
          <ul className="results">
            <li>Клиент записывается сам за 30 секунд — даже ночью, даже когда линия занята.</li>
            <li>Ни одна заявка не пропадает — на каждую приходит ответ в течение минуты.</li>
            <li>Пропущенный звонок догоняется автоматически — клиент получает сообщение, пока не остыл.</li>
            <li>Все клиенты и договорённости в одном месте — ничего не забывается.</li>
          </ul>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>Как проходит разбор</h2>
          <ol className="steps">
            <li>Вы оставляете заявку — я смотрю отзывы и работу вашей компании.</li>
            <li>За 10 минут показываю: где конкретно теряются клиенты и сколько это стоит в месяц.</li>
            <li>Дальше решаете сами. Разбор бесплатный, ничего покупать не обязательно.</li>
          </ol>
          <p className="note">Разбор делаю лично, по конкретно вашей компании — не презентация и не вебинар.</p>
        </div>
      </section>

      <section>
        <div className="wrap">
          <h2>Частые вопросы</h2>
          <div className="faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <div className="fa">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="form-sec" id="form">
        <div className="wrap">
          <h2>Получить бесплатный разбор</h2>
          <form onSubmit={onSubmit} noValidate>
            <div className="field">
              <label htmlFor="company">Название или ссылка на вашу точку в 2ГИС / Яндекс.Картах</label>
              <input
                type="text"
                id="company"
                name="company"
                autoComplete="organization"
                placeholder="Например: Кофейня «Утро» или ссылка на карточку"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="contact">Телефон или Telegram</label>
              <input
                type="text"
                id="contact"
                name="contact"
                autoComplete="tel"
                placeholder="+7 900 000-00-00 или @username"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
              />
            </div>
            <div className="hp" aria-hidden="true">
              <label htmlFor="company_url">Не заполняйте это поле</label>
              <input
                type="text"
                id="company_url"
                name="company_url"
                tabIndex={-1}
                autoComplete="off"
                value={hp}
                onChange={(e) => setHp(e.target.value)}
              />
            </div>
            <label className="consent">
              <input type="checkbox" id="consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              <span>
                Согласен на обработку персональных данных согласно{' '}
                <a href="/razbor/privacy" target="_blank" rel="noopener">
                  политике конфиденциальности
                </a>
                .
              </span>
            </label>
            <button type="submit" className="cta" disabled={submitting}>
              {submitting ? 'Отправляю…' : 'Получить бесплатный разбор'}
            </button>
            {msg && (
              <div className={`msg ${msg.kind}`} role="status">
                {msg.text}
              </div>
            )}
          </form>
          <p className="under-form">
            Отвечаю лично в течение пары часов в рабочее время. Можно сразу написать в{' '}
            <a href={TG_URL} rel="noopener" target="_blank">
              Telegram
            </a>
            .
          </p>
        </div>
      </section>

      <footer>
        <div className="wrap">
          <div className="row">
            Telegram:{' '}
            <a href={TG_URL} rel="noopener" target="_blank">
              написать
            </a>
          </div>
          <div className="row">
            E-mail: <a href="mailto:dmitry@spinlid-team.ru">dmitry@spinlid-team.ru</a>
          </div>
          <div className="row">
            <a href="/razbor/privacy">Политика конфиденциальности</a>
          </div>
          <div className="row">Реквизиты: [___]</div>
        </div>
      </footer>
    </div>
  );
}
