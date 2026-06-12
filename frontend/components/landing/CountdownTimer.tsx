'use client';

// Обратный отсчёт до запуска SpinLid (2026-06-12 + 45 дней = 2026-07-27 00:00 МСК).
// Висит сверху главной страницы между LandingHeader и HeroSection.
// SSR-safe: первый рендер на сервере показывает «—» во всех слотах, чтобы
// не было гидрационного mismatch'а между сервером и клиентом (на сервере
// new Date() даёт время сервера, на клиенте — пользователя).

import { useEffect, useState } from 'react';

const LAUNCH_AT = new Date('2026-07-27T00:00:00+03:00').getTime();

interface Parts {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  done: boolean;
}

function computeParts(now: number): Parts {
  const delta = Math.max(0, LAUNCH_AT - now);
  if (delta === 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, done: true };
  }
  const sec = Math.floor(delta / 1000);
  return {
    days: Math.floor(sec / 86_400),
    hours: Math.floor((sec % 86_400) / 3_600),
    minutes: Math.floor((sec % 3_600) / 60),
    seconds: sec % 60,
    done: false,
  };
}

export function CountdownTimer() {
  const [parts, setParts] = useState<Parts | null>(null);

  useEffect(() => {
    setParts(computeParts(Date.now()));
    const id = setInterval(() => {
      setParts(computeParts(Date.now()));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <section
      aria-label="Обратный отсчёт до запуска"
      style={{
        background: 'linear-gradient(90deg, #0b1220 0%, #1e293b 60%, #0b1220 100%)',
        borderBottom: '1px solid rgba(45, 212, 191, 0.30)',
        color: '#fff',
        padding: '14px 16px',
      }}
    >
      <div
        style={{
          maxWidth: '1100px',
          margin: '0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '24px',
          flexWrap: 'wrap',
        }}
      >
        <div
          style={{
            fontSize: '13px',
            fontWeight: 600,
            color: '#2dd4bf',
            letterSpacing: '0.04em',
            textTransform: 'uppercase',
          }}
        >
          {parts?.done ? 'SpinLid запущен' : 'До запуска SpinLid'}
        </div>
        <div
          style={{
            display: 'flex',
            gap: '8px',
            fontVariantNumeric: 'tabular-nums',
            alignItems: 'baseline',
          }}
        >
          <TimerCell value={parts?.days} label="дни" />
          <Sep />
          <TimerCell value={parts?.hours} label="часы" pad={2} />
          <Sep />
          <TimerCell value={parts?.minutes} label="минуты" pad={2} />
          <Sep />
          <TimerCell value={parts?.seconds} label="секунды" pad={2} />
        </div>
      </div>
    </section>
  );
}

function TimerCell({
  value,
  label,
  pad = 0,
}: {
  value: number | undefined;
  label: string;
  pad?: number;
}) {
  const text =
    value == null
      ? '—'
      : pad > 0
        ? String(value).padStart(pad, '0')
        : String(value);
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        minWidth: '52px',
      }}
    >
      <span
        style={{
          fontSize: '24px',
          fontWeight: 700,
          color: '#fff',
          lineHeight: 1.1,
        }}
      >
        {text}
      </span>
      <span
        style={{
          fontSize: '10px',
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase',
          letterSpacing: '0.08em',
          marginTop: '2px',
        }}
      >
        {label}
      </span>
    </div>
  );
}

function Sep() {
  return (
    <span
      style={{
        fontSize: '22px',
        color: 'rgba(45, 212, 191, 0.50)',
        fontWeight: 600,
      }}
    >
      :
    </span>
  );
}
