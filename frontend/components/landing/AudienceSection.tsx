const AUDIENCE = [
  { title: 'Отделы продаж B2B', pain: 'Нужны целевые контакты', result: 'База компаний с телефонами и почтами' },
  { title: 'Агентства лидогенерации', pain: 'Масштабный сбор под клиентов', result: 'Фильтры, экспорт, кампании КП' },
  { title: 'Производители и опт', pain: 'Поиск заказчиков и дистрибьюторов', result: 'Контакты по нише и региону' },
  { title: 'Сервисные компании', pain: 'Ремонт, строительство, IT-аутсорс', result: 'Лиды и рассылка КП за минуты' },
  { title: 'Франшизы и сети', pain: 'Расширение по регионам', result: 'Сбор данных, сегментация' },
  { title: 'HR и рекрутинг', pain: 'Поиск компаний под вакансии', result: 'Контакты для cold outreach' },
  { title: 'Партнёрки и бизнес-девелопмент', pain: 'Активный поиск партнёров', result: 'База + рассылка предложений' },
  { title: 'Маркетинг и аналитика', pain: 'Контроль объёмов и результатов', result: 'История запусков, статусы, экспорт' },
];

export function AudienceSection() {
  return (
    <section id="audience" className="landing-section">
      <div className="container">
        <h2 className="text-2xl font-bold md:text-[30px]" style={{ color: 'var(--landing-text)' }}>
          Для кого
        </h2>
        <p className="mt-2 text-base" style={{ color: 'var(--landing-muted)' }}>
          Лидоген + КП особенно полезны там, где важны объём и скорость
        </p>
        <div className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {AUDIENCE.map(({ title, pain, result }) => (
            <div
              key={title}
              className="rounded-[12px] border p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md"
              style={{ backgroundColor: 'var(--landing-card)', borderColor: 'var(--landing-border)' }}
            >
              <h3 className="text-lg font-semibold" style={{ color: 'var(--landing-text)' }}>
                {title}
              </h3>
              <p className="mt-2 text-sm" style={{ color: 'var(--landing-muted)' }}>
                {pain}
              </p>
              <p className="mt-1 text-sm font-medium" style={{ color: 'var(--landing-accent)' }}>
                → {result}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
