'use client';

// Обратный отсчёт до запуска SpinLid (цель: 2026-07-27 00:00 МСК,
// = 2026-06-12 + 45 дней). Висит внутри hero на главной — четыре
// квадратные glassy-плитки в одной строке (стилистически парные к
// floating-cards «Боли / Цитаты / Письмо»).
//
// SSR-safe: первый рендер на сервере показывает «—», после хидрейта
// useEffect стартует setInterval и обновляет каждую секунду.

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
    <div className="reveal" style={{ marginTop: '24px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: '#2dd4bf',
          marginBottom: '10px',
        }}
      >
        {parts?.done ? 'SpinLid запущен' : 'До запуска SpinLid'}
      </div>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(4, minmax(64px, 92px))',
          gap: '10px',
        }}
      >
        <TimerTile value={parts?.days} label="дни" />
        <TimerTile value={parts?.hours} label="часы" pad={2} />
        <TimerTile value={parts?.minutes} label="минуты" pad={2} />
        <TimerTile value={parts?.seconds} label="секунды" pad={2} />
      </div>
    </div>
  );
}

function TimerTile({
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
        aspectRatio: '1 / 1',
        position: 'relative',
        background:
          'linear-gradient(135deg, rgba(15,23,42,0.85) 0%, rgba(30,41,59,0.65) 100%)',
        border: '1px solid rgba(45, 212, 191, 0.30)',
        borderRadius: '14px',
        boxShadow:
          '0 12px 28px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.06)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '8px 4px',
      }}
    >
      <span
        style={{
          fontFamily: 'var(--font-display), system-ui, sans-serif',
          fontSize: 'clamp(22px, 3.4vw, 34px)',
          fontWeight: 800,
          lineHeight: 1,
          color: '#fff',
          letterSpacing: '-0.02em',
          fontVariantNumeric: 'tabular-nums',
          background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          backgroundClip: 'text',
        }}
      >
        {text}
      </span>
      <span
        style={{
          marginTop: '6px',
          fontSize: '9.5px',
          fontWeight: 600,
          color: 'rgba(255,255,255,0.55)',
          textTransform: 'uppercase',
          letterSpacing: '0.10em',
        }}
      >
        {label}
      </span>
    </div>
  );
}
