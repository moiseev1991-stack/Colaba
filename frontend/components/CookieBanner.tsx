'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

const STORAGE_KEY = 'spinlid-cookies-accepted';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) !== '1') {
        setVisible(true);
      }
    } catch {
      // localStorage недоступен (private mode) — баннер не показываем,
      // юзера не блокируем.
    }
  }, []);

  const accept = () => {
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // no-op
    }
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Уведомление об использовании cookies"
      style={{
        position: 'fixed',
        right: '16px',
        bottom: '16px',
        zIndex: 9999,
        maxWidth: '380px',
        background: 'rgba(15, 23, 42, 0.96)',
        color: 'rgba(255,255,255,0.9)',
        borderRadius: '12px',
        border: '1px solid rgba(255,255,255,0.1)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.4)',
        padding: '16px 18px',
        fontFamily: 'var(--font-body), system-ui, sans-serif',
        fontSize: '13px',
        lineHeight: 1.5,
      }}
    >
      <p style={{ margin: 0, marginBottom: '12px' }}>
        Мы используем cookies для работы сайта и аналитики. Подробнее —{' '}
        <Link
          href="/policy"
          style={{ color: '#5eead4', textDecoration: 'underline' }}
        >
          в Политике
        </Link>
        .
      </p>
      <button
        onClick={accept}
        style={{
          background: 'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
          color: '#0f172a',
          border: 'none',
          borderRadius: '8px',
          padding: '8px 16px',
          fontWeight: 600,
          fontSize: '13px',
          cursor: 'pointer',
        }}
      >
        Принимаю
      </button>
    </div>
  );
}
