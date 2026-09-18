import { ImageResponse } from 'next/og';

import {
  BRAND_EMERALD,
  WORDMARK_BAR,
  WORDMARK_LETTERS,
  WORDMARK_RATIO,
  WORDMARK_VIEWBOX,
} from '@/components/BrandLogo';

export const runtime = 'edge';
export const alt = 'SpinLid — лиды с диагнозом болей клиентов';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    <div
      style={{
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        // 18.09: next/og не понимает radial-gradient с размером «900px 500px at …» — картинка
        // отдавала 500/502, превью ссылок было без картинки. Тот же свет сверху — линейным градиентом.
        backgroundColor: '#0b1220',
        backgroundImage: 'linear-gradient(180deg, rgba(16,185,129,0.22) 0%, rgba(11,18,32,0) 60%)',
        color: '#fff',
        padding: '80px',
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      {/* Логотип №15 (18.09): надпись SPINLID с изумрудной чертой под «LID». */}
      <svg width={Math.round(56 * WORDMARK_RATIO)} height={56} viewBox={WORDMARK_VIEWBOX}>
        <path d={WORDMARK_LETTERS} fill="#fff" />
        <rect
          x={WORDMARK_BAR.x}
          y={WORDMARK_BAR.y}
          width={WORDMARK_BAR.width}
          height={WORDMARK_BAR.height}
          rx={WORDMARK_BAR.height / 2}
          fill={BRAND_EMERALD}
        />
      </svg>

      {/* next/og требует display:flex у блока из нескольких частей текста (иначе 500). */}
      <div
        style={{
          marginTop: '60px',
          display: 'flex',
          flexWrap: 'wrap',
          columnGap: '18px',
          fontSize: '64px',
          fontWeight: 700,
          lineHeight: 1.1,
          letterSpacing: '-0.02em',
          maxWidth: '1040px',
        }}
      >
        <span>Лиды с</span>
        <span style={{ color: '#34d399' }}>«диагнозом»</span>
        <span>болей клиентов из отзывов на картах</span>
      </div>

      <div
        style={{
          marginTop: 'auto',
          display: 'flex',
          gap: '40px',
          color: 'rgba(255,255,255,0.7)',
          fontSize: '24px',
        }}
      >
        <span>2GIS · Яндекс.Карты · DaData</span>
        <span style={{ marginLeft: 'auto' }}>spinlid.ru</span>
      </div>
    </div>,
    { ...size },
  );
}
