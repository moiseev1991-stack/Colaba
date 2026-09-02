'use client';

import { useState } from 'react';

// Изолированный лендинг оффера «Дмитрий». Контент и тексты 1-в-1 из
// прежней статики landing/index.html. Никакой шапки/футера/меню SpinLid,
// ни одной ссылки на остальной сайт. Форма шлёт same-origin на
// /api/v1/inbound-leads/public (проксируется на backend — CORS не нужен).
// Счётчик Метрики грузит общий <YandexMetrika/> (роут в public-paths),
// на успешную отправку дёргаем цель lead_form.

// Username бота-приёмника БЕЗ @ (= PUBLIC_BOT_USERNAME из .env бэкенда).
// Не секрет. Задаётся на сборке фронта через NEXT_PUBLIC_RAZBOR_BOT;
// если не задан — плейсхолдер, ссылки «в Telegram» вести некуда.
const BOT_USERNAME = process.env.NEXT_PUBLIC_RAZBOR_BOT || '__PUBLIC_BOT_USERNAME__';
const TG_URL = `https://t.me/${BOT_USERNAME}?start=landing`;

// ID счётчика Яндекс.Метрики spinlid.ru (тот же, что в components/YandexMetrika).
const METRIKA_ID = 110073452;

const STYLES = `
.razbor{
  --accent:#1f7a5a; --accent-dark:#155c43; --ink:#1a2420; --muted:#5c6b64;
  --bg:#f6f8f6; --card:#ffffff; --line:#e2e9e5; --radius:16px; --maxw:720px;
  color:var(--ink); background:var(--bg); line-height:1.55; font-size:17px;
  min-height:100vh; -webkit-font-smoothing:antialiased;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,"Helvetica Neue",Arial,sans-serif;
}
.razbor *{box-sizing:border-box}
.razbor .wrap{max-width:var(--maxw);margin:0 auto;padding:0 20px}
.razbor h1{font-size:30px;line-height:1.2;margin:0 0 14px;font-weight:800;letter-spacing:-.01em}
.razbor h2{font-size:23px;line-height:1.25;margin:0 0 20px;font-weight:750}
.razbor p{margin:0 0 14px}
.razbor .lead{font-size:19px;color:var(--muted)}
.razbor section{padding:46px 0}
.razbor section + section{border-top:1px solid var(--line)}
.razbor .hero{padding:56px 0 48px;background:linear-gradient(180deg,#eef4f1 0%,var(--bg) 100%)}
.razbor .hero .sub{font-size:18px;color:var(--muted);margin:0 0 26px}
.razbor .cta{
  display:inline-block;background:var(--accent);color:#fff;text-decoration:none;
  font-weight:700;font-size:18px;padding:16px 26px;border-radius:12px;border:0;cursor:pointer;
  min-height:52px;line-height:1.2;transition:background .15s ease;
}
.razbor .cta:hover{background:var(--accent-dark)}
.razbor .cta:disabled{opacity:.7;cursor:default}
.razbor .hero .tg-hint{margin:14px 0 0;font-size:15px;color:var(--muted)}
.razbor .hero .tg-hint a{color:var(--accent);font-weight:600}
.razbor .cards{display:grid;grid-template-columns:1fr 1fr;gap:14px}
.razbor .card{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:18px 18px 16px}
.razbor .card b{display:block;font-size:17px;margin-bottom:6px}
.razbor .card span{color:var(--muted);font-size:15.5px}
.razbor .results{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.razbor .results li{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:16px 18px 16px 50px;position:relative;font-size:16.5px}
.razbor .results li::before{content:"\\2713";position:absolute;left:18px;top:15px;color:var(--accent);font-weight:800;font-size:19px}
.razbor .steps{counter-reset:s;list-style:none;padding:0;margin:0 0 18px;display:grid;gap:16px}
.razbor .steps li{position:relative;padding-left:52px;font-size:16.5px;min-height:36px}
.razbor .steps li::before{
  counter-increment:s;content:counter(s);position:absolute;left:0;top:-2px;
  width:36px;height:36px;border-radius:50%;background:var(--accent);color:#fff;
  display:flex;align-items:center;justify-content:center;font-weight:800;font-size:18px;
}
.razbor .note{color:var(--muted);font-size:15.5px;margin:0}
.razbor .about{display:flex;gap:18px;align-items:flex-start}
.razbor .avatar{
  flex:0 0 84px;width:84px;height:84px;border-radius:50%;
  background:#e2e9e5;border:1px dashed #b9c8c1;color:#8aa197;
  display:flex;align-items:center;justify-content:center;font-size:13px;text-align:center;
}
.razbor .about .name{font-weight:750;font-size:19px;margin:0 0 6px}
.razbor .form-sec{background:#eef4f1}
.razbor form{background:var(--card);border:1px solid var(--line);border-radius:var(--radius);padding:22px}
.razbor label{display:block;font-weight:650;font-size:15px;margin:0 0 6px}
.razbor .field{margin-bottom:16px}
.razbor input[type=text]{
  width:100%;font-size:17px;padding:14px 14px;border:1px solid #cdd8d3;border-radius:10px;
  background:#fff;color:var(--ink);min-height:50px;
}
.razbor input[type=text]:focus{outline:2px solid var(--accent);outline-offset:0;border-color:var(--accent)}
.razbor form .cta{width:100%;text-align:center}
.razbor .hp{position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden}
.razbor .consent{display:flex;gap:10px;align-items:flex-start;font-size:14.5px;color:var(--muted);margin:2px 0 18px}
.razbor .consent input{margin-top:3px;width:18px;height:18px;flex:0 0 18px}
.razbor .consent a{color:var(--accent)}
.razbor .under-form{color:var(--muted);font-size:15px;margin:14px 0 0;text-align:center}
.razbor .under-form a{color:var(--accent);font-weight:600}
.razbor .msg{margin:14px 0 0;padding:14px 16px;border-radius:10px;font-size:16px}
.razbor .msg.ok{background:#e5f4ee;color:var(--accent-dark);border:1px solid #b9e0cf}
.razbor .msg.err{background:#fdecec;color:#9a2b2b;border:1px solid #f3c9c9}
.razbor footer{padding:34px 0 46px;color:var(--muted);font-size:15px}
.razbor footer a{color:var(--accent)}
.razbor footer .row{margin-bottom:8px}
@media (max-width:520px){
  .razbor{font-size:16px}
  .razbor h1{font-size:26px}
  .razbor h2{font-size:21px}
  .razbor .cards{grid-template-columns:1fr}
  .razbor section{padding:38px 0}
  .razbor .hero{padding:44px 0 38px}
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

      <header className="hero">
        <div className="wrap">
          <h1>Ваши клиенты уходят к конкурентам, пока вы не берёте трубку</h1>
          <p className="sub">
            Разберу по отзывам вашей компании, где теряются клиенты, и покажу, как это закрыть. Бесплатно, за 10 минут, без
            обязательств.
          </p>
          <a href="#form" className="cta">
            Получить бесплатный разбор
          </a>
          <p className="tg-hint">
            или напишите в{' '}
            <a href={TG_URL} rel="noopener" target="_blank">
              Telegram
            </a>
          </p>
        </div>
      </header>

      <section>
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
          <h2>Кто я</h2>
          <div className="about">
            <div className="avatar">[фото]</div>
            <div>
              <p className="name">Дмитрий</p>
              <p>
                Занимаюсь приёмом клиентов для малого бизнеса: звонки, заявки, запись, сообщения. Помогаю не терять людей на
                этапе обращения.
              </p>
              <p className="note">Связь напрямую со мной — без менеджеров и колл-центров.</p>
            </div>
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
