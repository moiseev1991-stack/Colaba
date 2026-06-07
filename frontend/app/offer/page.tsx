import type { Metadata } from 'next';
import Link from 'next/link';
import { LegalPageShell } from '@/components/legal/LegalPageShell';

export const metadata: Metadata = {
  title: 'Публичная оферта',
  description:
    'Условия оплаты тарифов сервиса SpinLid, момент акцепта, порядок возврата.',
  alternates: { canonical: 'https://spinlid.ru/offer' },
  robots: { index: true, follow: true },
};

const UPDATED_AT = '7 июня 2026';

export default function OfferPage() {
  return (
    <LegalPageShell title="Публичная оферта" updatedAt={UPDATED_AT}>
      <p>
        Настоящий документ является публичной офертой (предложением заключить
        договор) на использование платных тарифов сервиса SpinLid (далее —
        «Сервис»).
      </p>

      <p className="text-sm italic" style={{ color: 'hsl(var(--muted))' }}>
        Документ — каркас. Будет наполнен реквизитами Исполнителя и
        конкретными условиями тарифов перед запуском биллинга и проверен
        юристом.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">1. Стороны</h2>
      <p>
        <strong>Исполнитель</strong>: <code>[___]</code>, реквизиты:{' '}
        <code>[___]</code>.
        <br />
        <strong>Заказчик</strong>: любое физическое или юридическое лицо,
        акцептовавшее настоящую оферту.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">2. Предмет оферты</h2>
      <p>
        Исполнитель предоставляет Заказчику доступ к платным функциям Сервиса в
        объёме выбранного тарифа, а Заказчик обязуется оплатить услуги в
        соответствии с условиями выбранного тарифа.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">3. Тарифы и порядок оплаты</h2>
      <ul className="list-disc pl-6 space-y-1">
        <li>Тариф «Starter» — <code>[___]</code> руб./мес.</li>
        <li>Тариф «Pro» — <code>[___]</code> руб./мес.</li>
        <li>Тариф «Team» — <code>[___]</code> руб./мес.</li>
      </ul>
      <p>
        Актуальные параметры тарифов опубликованы на главной странице Сервиса.
        Оплата принимается в безналичной форме через подключённого платёжного
        провайдера.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">4. Момент акцепта</h2>
      <p>
        Акцептом настоящей оферты является оплата выбранного тарифа Заказчиком.
        С момента поступления оплаты на расчётный счёт Исполнителя договор
        считается заключённым на условиях настоящей оферты.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">
        5. Срок действия услуг
      </h2>
      <p>
        Услуги по выбранному тарифу предоставляются в течение оплаченного
        периода. Продление осуществляется автоматически при наличии
        соответствующей настройки и подтверждённого способа оплаты.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">
        6. Возвраты и отказ от услуги
      </h2>
      <p>
        Заказчик вправе отказаться от услуг в любой момент. При отказе в течение
        14 календарных дней с момента оплаты — возврат осуществляется
        пропорционально неиспользованному периоду. По истечении 14 дней —
        возврат не производится, услуги считаются оказанными в полном объёме.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">
        7. Ответственность сторон
      </h2>
      <p>
        Ответственность сторон ограничена условиями{' '}
        <Link href="/terms" className="underline">
          Пользовательского соглашения
        </Link>
        . Совокупная ответственность Исполнителя ограничена суммой, фактически
        уплаченной Заказчиком по тарифу за месяц, в котором возникли
        соответствующие требования.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">
        8. Применимое право и порядок споров
      </h2>
      <p>
        К отношениям сторон применяется законодательство Российской Федерации.
        Все споры разрешаются в порядке, предусмотренном Пользовательским
        соглашением.
      </p>

      <h2 className="text-xl font-display font-semibold pt-4">9. Реквизиты Исполнителя</h2>
      <p>
        <code>[___]</code>
        <br />
        ИНН / ОГРНИП: <code>[___]</code>
        <br />
        Расчётный счёт: <code>[___]</code>
        <br />
        Email:{' '}
        <a href="mailto:support@spinlid.ru" className="underline">
          support@spinlid.ru
        </a>
      </p>
    </LegalPageShell>
  );
}
