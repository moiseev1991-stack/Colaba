import type { Metadata } from 'next';

// Политика для изолированного лендинга /razbor. Тексты 1-в-1 из прежней
// статики landing/privacy/index.html. Ссылка «на главную» ведёт на /razbor,
// не на сайт. Свой title (absolute — без «| SpinLid»).
export const metadata: Metadata = {
  title: { absolute: 'Политика конфиденциальности' },
  description: 'Как обрабатываются персональные данные, оставленные через форму заявки.',
  alternates: { canonical: 'https://spinlid.ru/razbor/privacy' },
  robots: { index: true, follow: true },
};

const STYLES = `
.razbor-privacy{
  --accent:#1f7a5a;--ink:#1a2420;--muted:#5c6b64;--bg:#f6f8f6;--line:#e2e9e5;
  color:var(--ink);background:var(--bg);line-height:1.6;font-size:17px;min-height:100vh;
  font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
}
.razbor-privacy *{box-sizing:border-box}
.razbor-privacy .wrap{max-width:720px;margin:0 auto;padding:40px 20px 60px}
.razbor-privacy h1{font-size:27px;margin:0 0 8px;font-weight:800}
.razbor-privacy h2{font-size:19px;margin:28px 0 10px;font-weight:700}
.razbor-privacy p,.razbor-privacy li{margin:0 0 12px}
.razbor-privacy ul{padding-left:22px}
.razbor-privacy a{color:var(--accent)}
.razbor-privacy .back{display:inline-block;margin-bottom:20px;font-weight:600}
.razbor-privacy .muted{color:var(--muted);font-size:14.5px}
.razbor-privacy .draft{background:#fff6e5;border:1px solid #f0dca5;border-radius:12px;padding:14px 16px;color:#7a5a12;font-size:14.5px;margin:0 0 24px}
`;

export default function RazborPrivacyPage() {
  return (
    <div className="razbor-privacy">
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div className="wrap">
        <a className="back" href="/razbor">
          ← На главную
        </a>
        <h1>Политика конфиденциальности</h1>
        <p className="muted">
          Обработка персональных данных в соответствии с Федеральным законом №152-ФЗ «О персональных данных».
        </p>

        <div className="draft">
          Черновик. Перед публичным запуском проверить у юриста и вставить реквизиты оператора.
        </div>

        <h2>1. Кто обрабатывает данные</h2>
        <p>
          Оператор персональных данных: [___ ФИО / ИП / реквизиты ___]. Контакт для обращений:
          dmitry@spinlid-team.ru.
        </p>

        <h2>2. Какие данные собираются</h2>
        <p>Через форму заявки на сайте собираются только те данные, которые вы указываете сами:</p>
        <ul>
          <li>имя (если указано);</li>
          <li>контакт для связи (телефон или Telegram);</li>
          <li>название или ссылка на вашу компанию.</li>
        </ul>
        <p>
          Автоматически технические данные для защиты от спама не сохраняются в профиле заявки и не передаются третьим
          лицам в маркетинговых целях.
        </p>

        <h2>3. Зачем собираются данные</h2>
        <p>
          Единственная цель — связаться с вами по вашей заявке и провести бесплатный разбор. Данные не используются для
          рассылок без вашего согласия и не продаются.
        </p>

        <h2>4. Правовое основание и согласие</h2>
        <p>
          Данные обрабатываются на основании вашего согласия, которое вы даёте, отмечая чекбокс при отправке формы.
          Согласие можно отозвать, написав на dmitry@spinlid-team.ru.
        </p>

        <h2>5. Срок и удаление</h2>
        <p>
          Данные хранятся столько, сколько нужно для обработки заявки и связи с вами. По вашему запросу на
          dmitry@spinlid-team.ru данные удаляются.
        </p>

        <h2>6. Ваши права</h2>
        <p>
          Вы вправе запросить сведения об обработке ваших данных, их уточнение, блокировку или удаление, а также отозвать
          согласие. Обращения — на dmitry@spinlid-team.ru.
        </p>

        <p className="muted">Реквизиты оператора: [___].</p>
      </div>
    </div>
  );
}
