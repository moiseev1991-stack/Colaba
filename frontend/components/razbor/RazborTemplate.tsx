'use client';

import { useEffect, useState } from 'react';
import { HeroBackgroundDecor } from '@/components/HeroBackgroundDecor';
import type { RazborConfig } from './config';

// Единый шаблон лендинга «разбора». Все группы болей рендерятся этим
// компонентом; различается только текст из RazborConfig (hero, pains[4],
// solutions[4]). Общие блоки (цитаты, «Как проходит разбор», форма, FAQ,
// футер) одинаковы для всех страниц.
//
// ВАЖНО: страница изолирована от сайта SpinLid — нет глобальной шапки/футера,
// ссылок на продукт, регистрации. Своя минимальная шапка: меню-переходы между
// страницами разбора (Главная/Звонки/Очереди/Заказы) + кнопка Telegram.
//
// URL-параметры: ?c=<company_id> — id сматченной компании из письма/выгрузки;
// ?utm_source=email|tg — источник перехода. Если c пришёл — прокидываем его
// в форму (скрытым полем company_id) и в deep-link кнопки «Написать в Telegram».

// Username бота-приёмника БЕЗ @. Не секрет; переопределяется NEXT_PUBLIC_RAZBOR_BOT.
const BOT_USERNAME = process.env.NEXT_PUBLIC_RAZBOR_BOT || 'bolshe_lidov_bot';

// ID счётчика Яндекс.Метрики spinlid.ru (тот же, что в components/YandexMetrika).
const METRIKA_ID = 110073452;

// Меню-переходы между страницами разбора (по группам болей). slug '' — общий /razbor.
const PAGES: { href: string; label: string; slug: string }[] = [
  { href: '/razbor', label: 'Главная', slug: '' },
  { href: '/razbor/zvonki', label: 'Звонки', slug: 'zvonki' },
  { href: '/razbor/ocheredi', label: 'Очереди', slug: 'ocheredi' },
  { href: '/razbor/zakazy', label: 'Заказы', slug: 'zakazy' },
];

// Обезличенные цитаты из реальных отзывов на картах (тексты согласованы).
// Один общий блок-доказательство для всех групп.
const QUOTES: string[] = [
  'Записала ребёнка на 10:00, приняли в 11:20. Больше часа ждали в коридоре.',
  'Оставила заявку три дня назад — ни звонка, ни SMS. Как будто её и не было.',
  'Не могу дозвониться неделю, каждый раз занято. В итоге позвонила конкурентам.',
];

// FAQ — единый источник и для видимого блока, и для JSON-LD (FAQPage).
// Добавлены вопросы-возражения (снятие страха от холодного письма).
const FAQ: { q: string; a: string }[] = [
  {
    q: 'Это бесплатно? В чём подвох?',
    a: 'Подвоха нет. Разбор бесплатный, потому что это моя визитка: вы видите, как я работаю, и сами решаете, продолжать ли. Ничего не продаю на разборе.',
  },
  {
    q: 'Сколько времени это займёт?',
    a: 'Около 10 минут. Я заранее смотрю отзывы вашей компании и то, как устроен приём обращений, а на разборе показываю выводы.',
  },
  {
    q: 'Вы будете мне звонить и продавать?',
    a: 'Нет. На разборе я ничего не продаю — просто показываю, где уходят клиенты. Если захотите закрыть найденные потери, обсудим отдельно, но это не обязательно.',
  },
  {
    q: 'Откуда вы взяли мои отзывы?',
    a: 'Это открытые отзывы вашей компании на Яндекс.Картах и 2ГИС — их видит любой клиент. Я просто читаю их внимательнее и собираю в одну картину.',
  },
  {
    q: 'Что именно вы смотрите?',
    a: 'Открытые отзывы вашей компании на картах и то, как обрабатываются звонки, заявки и сообщения — где конкретно уходят обращения.',
  },
  {
    q: 'Как быстро вы ответите на заявку?',
    a: 'Лично в течение пары часов в рабочее время. Можно сразу написать в Telegram — отвечаю там же.',
  },
];

function ldJson(config: RazborConfig) {
  const url = `https://spinlid.ru/razbor${config.slug ? '/' + config.slug : ''}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Service',
        name: 'Бесплатный разбор потерь клиентов',
        serviceType: 'Аудит приёма обращений и записи клиентов',
        description: config.hero.sub,
        areaServed: { '@type': 'Country', name: 'Россия' },
        provider: { '@type': 'Person', name: 'Дмитрий' },
        offers: { '@type': 'Offer', price: '0', priceCurrency: 'RUB', availability: 'https://schema.org/InStock' },
        url,
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
}

// Иконки болей по индексу карточки (0..3). Тексты болей разные в каждой
// группе, но порядок близкий: дозвон/заявка → запись/ожидание → хаос.
const PAIN_ICONS = [
  // phone-off
  <path key="p" d="M10.68 13.31a16 16 0 003.41 2.6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.42 19.42 0 01-3.33-2.67M5 5a2 2 0 00-.94.31A19.79 19.79 0 002 3.11M2 2l20 20M4.11 6.11A2 2 0 014.11 4h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 11.91" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  // message-x
  <path key="m" d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5zM9.5 9.5l5 5m0-5l-5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  // calendar-x
  <path key="c" d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2zM10 14l4 4m0-4l-4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
  // shuffle / chaos
  <path key="s" d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" fill="none" />,
];

const STYLES = `
.razbor{
  --accent:#10b981; --accent2:#06b6d4;
  --grad:linear-gradient(135deg,#10b981 0%,#06b6d4 100%);
  --ink:#eef6f3; --body:#a3b6c4; --muted:#7d90a1;
  --bg:#070b14;
  --card:rgba(255,255,255,.045); --card-brd:rgba(255,255,255,.09);
  --line:rgba(255,255,255,.08);
  --pain:#fb7185; --pain-soft:rgba(251,113,133,.13);
  --radius:16px; --radius-lg:22px; --maxw:1120px; --maxw-narrow:820px;
  position:relative; overflow-x:clip; min-height:100vh; color:var(--body);
  line-height:1.6; font-size:17px; -webkit-font-smoothing:antialiased;
  font-family:var(--font-body),'Manrope',system-ui,-apple-system,Segoe UI,Roboto,Arial,sans-serif;
  background:
    radial-gradient(900px 620px at 14% -4%, rgba(6,182,212,.16), transparent 60%),
    radial-gradient(820px 720px at 100% 6%, rgba(16,185,129,.14), transparent 55%),
    radial-gradient(760px 720px at 50% 38%, rgba(99,102,241,.08), transparent 60%),
    radial-gradient(760px 640px at 2% 82%, rgba(16,185,129,.07), transparent 60%),
    var(--bg);
}
.razbor *{box-sizing:border-box}
.razbor .wrap{max-width:var(--maxw);margin:0 auto;padding:0 24px}
.razbor .wrap--narrow{max-width:var(--maxw-narrow)}
.razbor h1,.razbor h2,.razbor h3{font-family:var(--font-display),'Unbounded',system-ui,sans-serif;color:var(--ink);letter-spacing:-.02em}
.razbor p{margin:0 0 14px}
.razbor a{color:var(--accent2)}
.razbor section{padding:64px 0;position:relative;scroll-margin-top:70px}
.grad-text{background:var(--grad);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;color:transparent}

/* REVEAL ON SCROLL */
.razbor .reveal{opacity:0;transform:translateY(18px);transition:opacity .6s ease,transform .6s ease}
.razbor .reveal.visible{opacity:1;transform:none}

/* HEADER */
.rz-head{position:sticky;top:0;z-index:40;backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);background:rgba(7,11,20,.72);border-bottom:1px solid var(--line)}
.rz-head__in{max-width:var(--maxw);margin:0 auto;padding:11px 24px;display:flex;align-items:center;justify-content:space-between;gap:16px}
.rz-brand{display:flex;align-items:center;text-decoration:none}
.rz-brand__name{font-family:var(--font-display),sans-serif;font-weight:800;color:var(--ink);font-size:18px;line-height:1.1;letter-spacing:-.01em}
.rz-head__tg{display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 17px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid var(--card-brd);color:var(--ink);text-decoration:none;font-weight:650;font-size:15px;transition:background .18s,border-color .18s}
.rz-head__tg:hover{background:rgba(45,212,191,.12);border-color:rgba(45,212,191,.45);color:var(--ink)}
.rz-head__tg svg{color:#5eead4}
.rz-nav{display:flex;align-items:center;gap:22px;margin:0 auto 0 20px}
.razbor .rz-nav a{color:var(--body);text-decoration:none;font-size:15px;font-weight:600;white-space:nowrap;transition:color .15s}
.razbor .rz-nav a:hover{color:var(--ink)}
.razbor .rz-nav a.rz-nav__active{color:#5eead4}
.rz-head__right{display:flex;align-items:center;gap:10px}
.rz-burger{display:none;width:42px;height:42px;border-radius:11px;background:rgba(255,255,255,.05);border:1px solid var(--card-brd);color:var(--ink);cursor:pointer;align-items:center;justify-content:center}
.rz-menu{display:flex;flex-direction:column;padding:4px 16px 16px}
.razbor .rz-menu a{color:var(--ink);text-decoration:none;padding:13px 4px;font-size:16px;font-weight:600;border-bottom:1px solid var(--line)}
.razbor .rz-menu a.rz-nav__active{color:#5eead4}
.razbor .rz-menu .rz-head__tg{margin-top:14px;justify-content:center;border-bottom:none;padding:0 17px}

/* BUTTONS */
.rz-btn{display:inline-flex;align-items:center;justify-content:center;gap:9px;height:56px;padding:0 26px;border-radius:14px;font-weight:700;font-size:17px;text-decoration:none;cursor:pointer;border:1px solid transparent;transition:transform .18s ease,box-shadow .18s ease,background .18s ease;font-family:var(--font-body),'Manrope',sans-serif;white-space:nowrap}
.rz-btn--primary{background:var(--grad);color:#04120c;box-shadow:0 10px 28px rgba(16,185,129,.32)}
.rz-btn--primary:hover{transform:translateY(-2px);box-shadow:0 16px 38px rgba(16,185,129,.44)}
.rz-btn--primary:active{transform:translateY(0)}
.rz-btn--ghost{background:rgba(255,255,255,.045);color:var(--ink);border-color:var(--card-brd)}
.rz-btn--ghost:hover{transform:translateY(-2px);background:rgba(255,255,255,.09);border-color:rgba(45,212,191,.45)}
.rz-btn:disabled{opacity:.6;cursor:default;transform:none;box-shadow:none}
/* ссылки-кнопки: перебиваем .razbor a (cyan), иначе текст primary сливается с градиентом */
.razbor a.rz-btn--primary{color:#04120c}
.razbor a.rz-btn--ghost{color:var(--ink)}
.razbor a.rz-head__tg{color:var(--ink)}

/* HERO */
.rz-hero{position:relative;overflow:hidden;min-height:85vh;display:flex;align-items:center;padding:56px 0 72px}
.rz-hero__in{position:relative;z-index:1;max-width:var(--maxw);margin:0 auto;padding:0 24px;width:100%;display:grid;grid-template-columns:minmax(0,1.08fr) minmax(0,.92fr);gap:48px;align-items:center}
.rz-badge{display:inline-flex;align-items:center;gap:9px;padding:8px 15px;border-radius:999px;background:rgba(16,185,129,.1);border:1px solid rgba(16,185,129,.3);color:#c9f7e6;font-weight:650;font-size:14px;margin-bottom:22px}
.rz-badge__dot{width:8px;height:8px;border-radius:50%;background:#34d399;box-shadow:0 0 0 4px rgba(52,211,153,.22)}
.rz-h1{font-size:clamp(2.2rem,4.5vw,4rem);line-height:1.05;margin:0 0 20px;font-weight:800}
.rz-sub{font-size:clamp(1.02rem,1.35vw,1.2rem);color:var(--body);max-width:600px;margin:0 0 28px;line-height:1.55}
.rz-actions{display:flex;flex-wrap:wrap;gap:14px}
.rz-trust{display:flex;flex-wrap:wrap;gap:11px;margin:26px 0 0;padding:0;list-style:none}
.rz-pill{display:inline-flex;align-items:center;gap:8px;padding:9px 15px;border-radius:999px;background:rgba(16,185,129,.09);border:1px solid rgba(16,185,129,.26);color:#c9f7e6;font-weight:650;font-size:14px}
.rz-pill svg{color:#5eead4;flex:0 0 16px}

/* HERO FLOAT CARDS */
.rz-cards{display:grid;gap:13px}
.rz-fcard{display:flex;align-items:center;gap:14px;padding:16px 18px;border-radius:16px;background:var(--card);border:1px solid var(--card-brd);backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);box-shadow:0 10px 30px rgba(0,0,0,.28)}
.rz-fcard__ic{width:44px;height:44px;border-radius:12px;flex:0 0 44px;display:flex;align-items:center;justify-content:center;background:rgba(16,185,129,.16);color:#5eead4}
.rz-fcard__ic--cyan{background:rgba(6,182,212,.16);color:#67e8f9}
.rz-fcard__ic--violet{background:rgba(129,140,248,.16);color:#a5b4fc}
.rz-fcard__ic--amber{background:rgba(251,191,36,.15);color:#fcd34d}
.rz-fcard__v{font-weight:750;color:var(--ink);font-size:16.5px;line-height:1.15}
.rz-fcard__l{color:var(--muted);font-size:13.5px;margin-top:2px}
.rz-cards .reveal:nth-child(1){transition-delay:.05s}
.rz-cards .reveal:nth-child(2){transition-delay:.17s}
.rz-cards .reveal:nth-child(3){transition-delay:.29s}
.rz-cards .reveal:nth-child(4){transition-delay:.41s}
@keyframes rzPulse{0%,100%{box-shadow:0 10px 30px rgba(0,0,0,.28)}50%{box-shadow:0 10px 30px rgba(0,0,0,.28),0 0 0 3px rgba(45,212,191,.2)}}
.rz-fcard--pulse{animation:rzPulse 2.8s ease-in-out infinite}

/* SCROLL HINT */
.rz-scroll{position:absolute;left:50%;bottom:18px;transform:translateX(-50%);color:var(--muted);z-index:1;display:flex;animation:rzBob 2s ease-in-out infinite}
@keyframes rzBob{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(6px)}}

/* SECTION HEADINGS */
.rz-h2{font-size:clamp(1.55rem,3vw,2.3rem);line-height:1.15;margin:0 0 10px;font-weight:750}
.rz-sub2{color:var(--muted);font-size:16.5px;margin:0 0 32px;max-width:640px}
.rz-center{text-align:center}
.rz-center .rz-sub2{margin-left:auto;margin-right:auto}

/* QUOTES */
.rz-qgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
.rz-quote{position:relative;background:var(--card);border:1px solid var(--card-brd);border-left:3px solid var(--pain);border-radius:16px;padding:40px 22px 20px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.rz-quote__mark{position:absolute;top:10px;left:20px;font-size:52px;line-height:1;color:rgba(251,113,133,.32);font-family:Georgia,serif}
.rz-quote p{font-style:italic;color:#e7eef2;font-size:16px;line-height:1.55;margin:0}
.rz-quote__src{display:flex;align-items:center;gap:7px;margin-top:16px;color:var(--muted);font-size:13px;font-style:normal}
.rz-quote__src i{width:7px;height:7px;border-radius:50%;background:var(--pain);flex:0 0 7px}
.rz-qnote{margin:26px 0 0;color:var(--muted);font-size:15px;text-align:center}

/* PAIN CARDS */
.rz-paingrid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.rz-pain{position:relative;background:var(--card);border:1px solid var(--card-brd);border-radius:16px;padding:22px 20px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.rz-pain:hover{transform:translateY(-4px);border-color:rgba(251,113,133,.4);box-shadow:0 16px 40px rgba(251,113,133,.14)}
.rz-pain__ic{width:46px;height:46px;border-radius:13px;background:var(--pain-soft);color:#fda4af;display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.rz-pain b{display:block;color:var(--ink);font-size:17.5px;margin-bottom:6px;font-weight:700}
.rz-pain span{color:var(--body);font-size:15px;line-height:1.5}
.rz-paingrid .reveal:nth-child(2){transition-delay:.08s}
.rz-paingrid .reveal:nth-child(3){transition-delay:.16s}
.rz-paingrid .reveal:nth-child(4){transition-delay:.24s}

/* SOLUTIONS */
.rz-solgrid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px}
.rz-sol{display:flex;gap:14px;align-items:flex-start;background:var(--card);border:1px solid var(--card-brd);border-radius:16px;padding:20px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px);transition:transform .2s ease,box-shadow .2s ease,border-color .2s ease}
.rz-sol:hover{transform:translateY(-4px);border-color:rgba(16,185,129,.4);box-shadow:0 16px 40px rgba(16,185,129,.14)}
.rz-sol__ic{width:42px;height:42px;border-radius:12px;flex:0 0 42px;background:rgba(16,185,129,.16);color:#5eead4;display:flex;align-items:center;justify-content:center}
.rz-sol p{margin:0;color:var(--ink);font-size:15.5px;font-weight:600;line-height:1.5}
.rz-solgrid .reveal:nth-child(2){transition-delay:.08s}
.rz-solgrid .reveal:nth-child(3){transition-delay:.16s}
.rz-solgrid .reveal:nth-child(4){transition-delay:.24s}

/* STEPS */
.rz-steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;position:relative}
.rz-step{position:relative;background:var(--card);border:1px solid var(--card-brd);border-radius:16px;padding:24px 22px;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.rz-step__n{width:46px;height:46px;border-radius:14px;background:var(--grad);color:#04120c;font-weight:800;font-size:20px;display:flex;align-items:center;justify-content:center;margin-bottom:14px;font-family:var(--font-display),sans-serif;box-shadow:0 8px 20px rgba(16,185,129,.3)}
.rz-step p{margin:0;color:var(--body);font-size:15.5px;line-height:1.5}
.rz-step:not(:last-child)::after{content:"";position:absolute;right:-16px;top:46px;width:12px;height:12px;border-top:2px solid rgba(45,212,191,.55);border-right:2px solid rgba(45,212,191,.55);transform:rotate(45deg)}
.rz-note{color:var(--muted);font-size:15px;margin:22px 0 0;text-align:center}

/* FAQ */
.rz-faq{display:grid;gap:12px;max-width:var(--maxw-narrow);margin:0 auto}
.rz-faq details{background:var(--card);border:1px solid var(--card-brd);border-radius:14px;overflow:hidden;backdrop-filter:blur(8px);-webkit-backdrop-filter:blur(8px)}
.rz-faq summary{cursor:pointer;list-style:none;padding:18px 50px 18px 20px;font-weight:650;font-size:16.5px;color:var(--ink);position:relative}
.rz-faq summary::-webkit-details-marker{display:none}
.rz-faq summary::after{content:"+";position:absolute;right:20px;top:50%;transform:translateY(-50%);color:var(--accent);font-size:24px;font-weight:700;line-height:1;transition:transform .2s ease}
.rz-faq details[open] summary::after{content:"−"}
.rz-faq .fa{padding:0 20px 18px;color:var(--body);font-size:15.5px;line-height:1.55}

/* FORM */
.rz-form-sec{position:relative}
.rz-form-wrap{max-width:640px;margin:0 auto}
.rz-form{background:var(--card);border:1px solid var(--card-brd);border-radius:22px;padding:28px;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 20px 55px rgba(0,0,0,.35)}
.rz-form label{display:block;font-weight:650;font-size:14.5px;color:var(--ink);margin:0 0 8px}
.rz-field{margin-bottom:18px}
.razbor .rz-input{width:100%;font-size:17px;padding:15px 16px;border:1px solid var(--card-brd);border-radius:12px;background:rgba(255,255,255,.04);color:var(--ink);min-height:54px;transition:border-color .15s ease,box-shadow .15s ease;font-family:var(--font-body),'Manrope',sans-serif}
.razbor .rz-input::placeholder{color:#66788a}
.razbor .rz-input:focus{outline:none;border-color:var(--accent);box-shadow:0 0 0 3px rgba(16,185,129,.18)}
.rz-form .rz-btn{width:100%}
.rz-hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.rz-consent{display:flex;gap:11px;align-items:flex-start;font-size:14px;color:var(--muted);margin:2px 0 20px}
.rz-consent input{margin-top:3px;width:19px;height:19px;flex:0 0 19px;accent-color:var(--accent)}
.rz-consent a{color:var(--accent2);font-weight:600}
.rz-msg{margin:16px 0 0;padding:14px 16px;border-radius:12px;font-size:15.5px}
.rz-msg.err{background:rgba(251,113,133,.12);color:#fecdd3;border:1px solid rgba(251,113,133,.32)}
.rz-underform{color:var(--muted);font-size:15px;margin:18px 0 0;text-align:center}
.rz-underform a{color:var(--accent2);font-weight:650}

/* SUCCESS */
.rz-success{background:var(--card);border:1px solid rgba(16,185,129,.32);border-radius:22px;padding:40px 28px;text-align:center;backdrop-filter:blur(10px);-webkit-backdrop-filter:blur(10px);box-shadow:0 20px 55px rgba(0,0,0,.35)}
.rz-success__ic{width:64px;height:64px;border-radius:50%;background:var(--grad);color:#04120c;display:flex;align-items:center;justify-content:center;margin:0 auto 18px;box-shadow:0 10px 28px rgba(16,185,129,.4)}
.rz-success h3{font-size:23px;color:var(--ink);margin:0 0 10px}
.rz-success p{color:var(--body);font-size:16px;margin:0 auto 22px;max-width:420px}

/* FOOTER */
.rz-foot{padding:36px 0 52px;color:var(--muted);font-size:15px;border-top:1px solid var(--line)}
.rz-foot a{color:var(--accent2);font-weight:600}
.rz-foot .row{margin-bottom:8px}

@media (max-width:900px){
  .rz-hero__in{grid-template-columns:1fr;gap:34px}
  .rz-hero{min-height:auto;padding:44px 0 56px}
  .rz-cards{max-width:460px}
}
@media (max-width:760px){
  .rz-step:not(:last-child)::after{display:none}
  .rz-steps{grid-template-columns:1fr;gap:14px}
  .rz-qgrid{grid-template-columns:1fr}
  .rz-nav{display:none}
  .rz-head__in .rz-head__tg{display:none}
  .rz-burger{display:inline-flex}
}
@media (max-width:640px){
  .razbor{font-size:16px}
  .razbor section{padding:48px 0}
  .razbor .wrap{padding:0 16px}
  .rz-head__in{padding:10px 16px}
  .rz-paingrid,.rz-solgrid{grid-template-columns:1fr}
  .rz-actions .rz-btn{width:100%}
  .rz-hero__in{gap:28px}
  .rz-form{padding:22px 18px}
}
@media (prefers-reduced-motion: reduce){
  .razbor .reveal{opacity:1;transform:none;transition:none}
  .rz-fcard--pulse,.rz-scroll{animation:none}
}
`;

export function RazborTemplate({ config }: { config: RazborConfig }) {
  const [company, setCompany] = useState('');
  const [contact, setContact] = useState('');
  const [consent, setConsent] = useState(false);
  const [hp, setHp] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  // company_id (?c=) и utm_source (?utm_source=) из URL — читаем на клиенте.
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [utmSource, setUtmSource] = useState('');

  useEffect(() => {
    try {
      const p = new URLSearchParams(window.location.search);
      const raw = p.get('c');
      const id = raw ? parseInt(raw, 10) : NaN;
      if (Number.isFinite(id) && id > 0) setCompanyId(id);
      setUtmSource((p.get('utm_source') || '').slice(0, 40));
    } catch {
      /* no-op */
    }
  }, []);

  // Reveal-on-scroll (классы .reveal стартуют opacity:0).
  useEffect(() => {
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (!e.isIntersecting) return;
          e.target.classList.add('visible');
          obs.unobserve(e.target);
        });
      },
      { threshold: 0.08, rootMargin: '0px 0px -40px 0px' }
    );
    document.querySelectorAll('.razbor .reveal').forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  // Группа для deep-link и source_tag формы. Пустой slug (общий /razbor) → 'landing'.
  const group = config.slug || 'landing';
  const startPayload = companyId ? `${group}_${companyId}` : group;
  const tgUrl = `https://t.me/${BOT_USERNAME}?start=${startPayload}`;

  async function onSubmit(ev: React.FormEvent) {
    ev.preventDefault();
    if (submitting) return;

    const c = company.trim();
    const k = contact.trim();
    if (!c && !k) {
      setErr('Напишите название компании или контакт — по одному из полей я вас найду.');
      return;
    }
    if (!consent) {
      setErr('Отметьте согласие на обработку данных, чтобы я мог с вами связаться.');
      return;
    }

    setSubmitting(true);
    setErr(null);
    try {
      const r = await fetch('/api/v1/inbound-leads/public', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          company_text: c,
          contact_text: k,
          source_tag: config.slug || utmSource || 'landing',
          company_id: companyId,
          consent,
          hp,
        }),
      });
      if (!r.ok) throw new Error('http ' + r.status);
      await r.json();
      setDone(true);
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
      setErr('Не получилось отправить. Попробуйте ещё раз или напишите мне в Telegram — ссылка ниже.');
    } finally {
      setSubmitting(false);
    }
  }

  const TgIcon = (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );

  return (
    <div className="razbor">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ldJson(config)) }} />

      {/* §0 — своя минимальная шапка: меню-переходы между страницами разбора + Telegram (без бренда SpinLid) */}
      <header className="rz-head">
        <div className="rz-head__in">
          <a href="/razbor" className="rz-brand" aria-label="Разбор потерь клиентов" onClick={() => setMenuOpen(false)}>
            <span className="rz-brand__name">Разбор</span>
          </a>
          <nav className="rz-nav" aria-label="Страницы разбора">
            {PAGES.map((p) => (
              <a
                key={p.href}
                href={p.href}
                className={p.slug === config.slug ? 'rz-nav__active' : undefined}
                aria-current={p.slug === config.slug ? 'page' : undefined}
              >
                {p.label}
              </a>
            ))}
          </nav>
          <div className="rz-head__right">
            <a className="rz-head__tg" href={tgUrl} rel="noopener" target="_blank">
              {TgIcon}
              Написать в Telegram
            </a>
            <button
              type="button"
              className="rz-burger"
              aria-label="Меню страниц"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((o) => !o)}
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                {menuOpen ? (
                  <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                ) : (
                  <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                )}
              </svg>
            </button>
          </div>
        </div>
        {menuOpen && (
          <nav className="rz-menu" aria-label="Страницы разбора">
            {PAGES.map((p) => (
              <a
                key={p.href}
                href={p.href}
                className={p.slug === config.slug ? 'rz-nav__active' : undefined}
                aria-current={p.slug === config.slug ? 'page' : undefined}
                onClick={() => setMenuOpen(false)}
              >
                {p.label}
              </a>
            ))}
            <a className="rz-head__tg" href={tgUrl} rel="noopener" target="_blank" onClick={() => setMenuOpen(false)}>
              {TgIcon}
              Написать в Telegram
            </a>
          </nav>
        )}
      </header>

      {/* §1 — HERO */}
      <section className="rz-hero" id="top">
        <HeroBackgroundDecor />
        <div className="rz-hero__in">
          <div>
            <div className="rz-badge reveal">
              <span className="rz-badge__dot" />
              Бесплатно · 10 минут · без обязательств
            </div>

            <h1 className="rz-h1 reveal">
              {config.hero.titleTop}
              <br />
              <span className="grad-text">{config.hero.titleAccent}</span>
            </h1>

            <p className="rz-sub reveal">{config.hero.sub}</p>

            <div className="rz-actions reveal">
              <a className="rz-btn rz-btn--primary" href="#form">
                <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Получить бесплатный разбор
              </a>
              <a className="rz-btn rz-btn--ghost" href={tgUrl} rel="noopener" target="_blank">
                {TgIcon}
                Написать в Telegram
              </a>
            </div>

            <ul className="rz-trust reveal">
              {['По вашим реальным отзывам', 'Разбираю лично, не вебинар', 'Ничего не продаю на разборе'].map((t) => (
                <li className="rz-pill" key={t}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t}
                </li>
              ))}
            </ul>
          </div>

          <div className="rz-cards">
            <div className="rz-fcard rz-fcard--pulse reveal">
              <div className="rz-fcard__ic">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.13.96.36 1.9.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.9.34 1.85.57 2.81.7A2 2 0 0122 16.92z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="rz-fcard__v">Звонок</div>
                <div className="rz-fcard__l">не пропущен</div>
              </div>
            </div>

            <div className="rz-fcard reveal">
              <div className="rz-fcard__ic rz-fcard__ic--cyan">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div>
                <div className="rz-fcard__v">Заявка</div>
                <div className="rz-fcard__l">ответ за минуту</div>
              </div>
            </div>

            <div className="rz-fcard reveal">
              <div className="rz-fcard__ic rz-fcard__ic--violet">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="rz-fcard__v">Запись</div>
                <div className="rz-fcard__l">клиент сам, 24/7</div>
              </div>
            </div>

            <div className="rz-fcard reveal">
              <div className="rz-fcard__ic rz-fcard__ic--amber">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 2l2.9 6.26L22 9.27l-5 4.87L18.18 22 12 18.56 5.82 22 7 14.14l-5-4.87 7.1-1.01L12 2z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div>
                <div className="rz-fcard__v">Отзывы</div>
                <div className="rz-fcard__l">жалоб меньше</div>
              </div>
            </div>
          </div>
        </div>

        <a href="#quotes" className="rz-scroll" aria-label="Листайте вниз">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
            <path d="M12 5v14M5 12l7 7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </a>
      </section>

      {/* §3 — ЦИТАТЫ ИЗ ОТЗЫВОВ */}
      <section id="quotes">
        <div className="wrap">
          <div className="rz-center">
            <h2 className="rz-h2 reveal">Так пишут клиенты. Про кого-то — прямо сейчас</h2>
            <p className="rz-sub2 reveal">Реальные отзывы с карт. По вашей компании я смотрю такие же.</p>
          </div>
          <div className="rz-qgrid">
            {QUOTES.map((q) => (
              <blockquote className="rz-quote reveal" key={q}>
                <span className="rz-quote__mark" aria-hidden>“</span>
                <p>{q}</p>
                <span className="rz-quote__src">
                  <i />
                  отзыв на картах
                </span>
              </blockquote>
            ))}
          </div>
          <p className="rz-qnote reveal">
            Названия компаний я убрал. На разборе показываю такие же строки — но уже по вашей точке.
          </p>
        </div>
      </section>

      {/* §4 — УЗНАЁТЕ СЕБЯ */}
      <section id="uznaete">
        <div className="wrap">
          <h2 className="rz-h2 reveal">{config.painsTitle}</h2>
          <p className="rz-sub2 reveal">Хотя бы одно — уже тихо уводит ваших клиентов к конкурентам.</p>
          <div className="rz-paingrid">
            {config.pains.map((p, i) => (
              <div className="rz-pain reveal" key={p.title}>
                <div className="rz-pain__ic">
                  <svg width="24" height="24" viewBox="0 0 24 24">{PAIN_ICONS[i % PAIN_ICONS.length]}</svg>
                </div>
                <b>{p.title}</b>
                <span>{p.text}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* §5 — ЧТО Я ДЕЛАЮ */}
      <section id="solutions">
        <div className="wrap">
          <h2 className="rz-h2 reveal">Что я делаю</h2>
          <p className="rz-sub2 reveal">Показываю, чем закрыть найденные потери — по шагам и по-простому.</p>
          <div className="rz-solgrid">
            {config.solutions.map((s) => (
              <div className="rz-sol reveal" key={s}>
                <div className="rz-sol__ic">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <p>{s}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* §6 — КАК ПРОХОДИТ РАЗБОР */}
      <section id="how">
        <div className="wrap">
          <h2 className="rz-h2 reveal">Как проходит разбор</h2>
          <div className="rz-steps">
            <div className="rz-step reveal">
              <div className="rz-step__n">1</div>
              <p>Вы оставляете заявку — я смотрю отзывы и то, как работает ваша компания.</p>
            </div>
            <div className="rz-step reveal">
              <div className="rz-step__n">2</div>
              <p>За 10 минут показываю: где конкретно теряются клиенты и сколько это стоит в месяц.</p>
            </div>
            <div className="rz-step reveal">
              <div className="rz-step__n">3</div>
              <p>Дальше решаете сами. Разбор бесплатный, ничего покупать не обязательно.</p>
            </div>
          </div>
          <p className="rz-note">Разбор делаю лично, по конкретно вашей компании — не презентация и не вебинар.</p>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq">
        <div className="wrap wrap--narrow">
          <h2 className="rz-h2 reveal rz-center">Частые вопросы</h2>
          <div className="rz-faq">
            {FAQ.map((f) => (
              <details key={f.q}>
                <summary>{f.q}</summary>
                <div className="fa">{f.a}</div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* §8 — ФОРМА */}
      <section className="rz-form-sec" id="form">
        <div className="wrap">
          <h2 className="rz-h2 reveal rz-center">Получить бесплатный разбор</h2>
          <div className="rz-form-wrap">
            {done ? (
              <div className="rz-success" role="status">
                <div className="rz-success__ic">
                  <svg width="30" height="30" viewBox="0 0 24 24" fill="none">
                    <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
                <h3>Принял! Заявка у меня</h3>
                <p>Напишу вам лично в течение пары часов в рабочее время. Если удобнее — можно сразу написать мне в Telegram.</p>
                <a className="rz-btn rz-btn--primary" href={tgUrl} rel="noopener" target="_blank" style={{ display: 'inline-flex' }}>
                  {TgIcon}
                  Написать в Telegram
                </a>
              </div>
            ) : (
              <>
                <form className="rz-form" onSubmit={onSubmit} noValidate>
                  <div className="rz-field">
                    <label htmlFor="company">Название или ссылка на вашу точку в 2ГИС / Яндекс.Картах</label>
                    <input
                      type="text"
                      id="company"
                      name="company"
                      className="rz-input"
                      autoComplete="organization"
                      placeholder="Например: Кофейня «Утро» или ссылка на карточку"
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    />
                  </div>
                  <div className="rz-field">
                    <label htmlFor="contact">Телефон или Telegram для связи</label>
                    <input
                      type="text"
                      id="contact"
                      name="contact"
                      className="rz-input"
                      autoComplete="tel"
                      placeholder="+7 900 000-00-00 или @username"
                      value={contact}
                      onChange={(e) => setContact(e.target.value)}
                    />
                  </div>
                  <div className="rz-hp" aria-hidden="true">
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
                  <label className="rz-consent">
                    <input type="checkbox" id="consent" name="consent" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                    <span>
                      Согласен на обработку персональных данных согласно{' '}
                      <a href="/razbor/privacy" target="_blank" rel="noopener">
                        политике конфиденциальности
                      </a>
                      .
                    </span>
                  </label>
                  <button type="submit" className="rz-btn rz-btn--primary" disabled={submitting}>
                    {submitting ? 'Отправляю…' : 'Получить бесплатный разбор'}
                  </button>
                  {err && (
                    <div className="rz-msg err" role="status">
                      {err}
                    </div>
                  )}
                </form>
                <p className="rz-underform">
                  Отвечаю лично, обычно в течение пары часов в рабочее время. Можно сразу написать в{' '}
                  <a href={tgUrl} rel="noopener" target="_blank">
                    Telegram
                  </a>
                  .
                </p>
              </>
            )}
          </div>
        </div>
      </section>

      <footer className="rz-foot">
        <div className="wrap">
          <div className="row">
            Telegram:{' '}
            <a href={tgUrl} rel="noopener" target="_blank">
              написать
            </a>
          </div>
          <div className="row">
            E-mail: <a href="mailto:dmitry@spinlid-team.ru">dmitry@spinlid-team.ru</a>
          </div>
          <div className="row">
            <a href="/razbor/privacy">Политика конфиденциальности</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
