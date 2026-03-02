'use client';

import { useEffect, useRef } from 'react';

const STATS = [
  { prefix: '', value: 50000, sign: '+', label: 'Лидов\nсобрано пользователями', suffix: '' },
  { prefix: '', value: 0, sign: '', label: 'Скрытых комиссий\n(их нет)', suffix: '₽' },
  { prefix: '', value: 98, sign: '%', label: 'Успешных\nдоставок КП', suffix: '' },
  { prefix: '', value: 4, sign: '', label: 'Модуля\nв одном кабинете', suffix: '' },
];

function formatNum(n: number) {
  if (n >= 1000) return (n / 1000).toFixed(0) + 'K';
  return n.toLocaleString('ru-RU');
}

function CounterCell({ prefix, value, sign, label, suffix }: (typeof STATS)[0]) {
  const ref = useRef<HTMLDivElement>(null);
  const animatedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting && !animatedRef.current) {
          animatedRef.current = true;
          const start = performance.now();
          const duration = 1600;
          const update = (now: number) => {
            const t = Math.min((now - start) / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);
            const cur = Math.round(eased * value);
            el.textContent = formatNum(cur);
            if (t < 1) requestAnimationFrame(update);
          };
          requestAnimationFrame(update);
          observer.disconnect();
        }
      },
      { threshold: 0.3 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [value]);

  return (
    <div className="l-impact-stat reveal">
      <div style={{ lineHeight: 1 }}>
        {prefix && <span className="l-impact-stat__prefix">{prefix}</span>}
        {suffix === '₽' && <span className="l-impact-stat__prefix">{suffix}</span>}
        <span className="l-impact-stat__value" ref={ref}>0</span>
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
        <div className="section-label reveal">Платформа в цифрах</div>
        <h2 className="section-title text-center reveal" style={{ color: '#fff' }}>
          Результаты <span style={{ color: '#6ee7c5' }}>реальных клиентов</span>
        </h2>
        <div className="l-impact__grid">
          {STATS.map((s, i) => (
            <CounterCell key={i} {...s} />
          ))}
        </div>
      </div>
    </section>
  );
}
