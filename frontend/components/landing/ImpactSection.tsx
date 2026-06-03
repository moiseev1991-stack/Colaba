'use client';

// ТЗ лендинг-рефакта 2026-06-03 §3: убраны выдуманные «50K+ лидов / 98% доставок /
// реальные клиенты». Вместо претензии на несуществующих клиентов — продуктовый
// блок «Что вы получите», который не врёт. Реальные продуктовые факты.

const POINTS = [
  {
    val: '23',
    sign: '',
    suffix: '',
    label: 'компании с\nдиагнозом за минуту',
  },
  {
    val: '5',
    sign: '',
    suffix: '',
    label: 'болей клиентов\nна каждую карточку',
  },
  {
    val: '1',
    sign: '',
    suffix: '',
    label: 'черновик письма\nпод конкретную боль',
  },
  {
    val: '0',
    sign: '',
    suffix: '₽',
    label: 'скрытых комиссий\nза экспорт',
  },
];

function PointCell({ val, sign, suffix, label }: (typeof POINTS)[0]) {
  return (
    <div className="l-impact-stat reveal">
      <div style={{ lineHeight: 1 }}>
        {suffix === '₽' && <span className="l-impact-stat__prefix">{suffix}</span>}
        <span className="l-impact-stat__value">{val}</span>
        {sign && <span className="l-impact-stat__sign">{sign}</span>}
      </div>
      <div
        className="l-impact-stat__label"
        style={{ whiteSpace: 'pre-line' }}
      >
        {label}
      </div>
    </div>
  );
}

export function ImpactSection() {
  return (
    <section className="l-impact" id="stats">
      <div className="container">
        <div className="section-label reveal">Что вы получите</div>
        <h2 className="section-title text-center reveal" style={{ color: '#fff' }}>
          Не контакты — <span style={{ color: '#6ee7c5' }}>повод зайти</span>
        </h2>
        <div className="l-impact__grid">
          {POINTS.map((s, i) => (
            <PointCell key={i} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}
