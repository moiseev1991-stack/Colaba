import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'SpinLid — лиды с диагнозом болей клиентов';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default async function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background:
            'radial-gradient(900px 500px at 50% 0%, rgba(45,212,191,0.25), transparent), #0b1220',
          color: '#fff',
          padding: '80px',
          fontFamily: 'system-ui, sans-serif',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '96px',
              height: '96px',
              borderRadius: '22px',
              background:
                'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
              boxShadow: '0 0 36px rgba(45, 212, 191, 0.5)',
            }}
          >
            <svg width="64" height="64" viewBox="0 0 32 32" fill="none">
              <path
                d="M16,6 C21.5,6 26,10.5 26,16 C26,18.5 25,20.8 23.2,22.3 C21.5,23.8 19.2,24.5 17,24 C14.5,23.4 12.5,21.5 12,19 C11.7,17.5 12,16 13,15.2 C14,15.5 15,16 15,17 C15,18 15.5,19 16.5,19.5 C17.5,20 19,19.8 20,19 C21,18.2 21.5,17 21.5,16 C21.5,13.2 19,11 16,11 C13,11 10.5,13.2 10.5,16 C10.5,17.5 11,19 12,20 C13,21 14.5,21.5 16,21.5"
                stroke="#0b1220"
                strokeWidth="2.4"
                strokeLinecap="round"
                fill="none"
              />
            </svg>
          </div>
          <div style={{ fontSize: '52px', fontWeight: 800, letterSpacing: '-0.02em' }}>
            SpinLid
          </div>
        </div>

        <div
          style={{
            marginTop: '60px',
            fontSize: '64px',
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: '-0.02em',
            maxWidth: '900px',
          }}
        >
          Лиды с{' '}
          <span
            style={{
              backgroundImage:
                'linear-gradient(135deg, #2dd4bf 0%, #06b6d4 100%)',
              backgroundClip: 'text',
              color: 'transparent',
            }}
          >
            «диагнозом»
          </span>{' '}
          болей клиентов из отзывов на картах
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
      </div>
    ),
    { ...size },
  );
}
