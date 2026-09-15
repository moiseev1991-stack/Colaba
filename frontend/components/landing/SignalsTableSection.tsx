'use client';

import Link from 'next/link';
import { SignalsTableDemo } from './SignalsTableDemo';

/**
 * Секция 2 главной — пример выдачи. Единственная таблица-пример на странице (PR 2.2):
 * раньше та же таблица повторялась ещё в «Примерах». Полный пример — на /demo.
 */
export function SignalsTableSection() {
  return (
    <section id="signals" className="landing-section" style={{ paddingBottom: '24px' }}>
      <div className="container" style={{ maxWidth: '1160px' }}>
        <div className="section-label reveal">Пример выдачи</div>
        <h2 className="section-title reveal" style={{ marginBottom: '12px' }}>
          Кому написать и <span style={{ color: 'var(--landing-accent)' }}>на что жалуются</span> их клиенты
        </h2>
        <p
          className="reveal"
          style={{
            fontSize: '16px',
            color: 'var(--landing-muted)',
            maxWidth: '720px',
            marginBottom: '32px',
            lineHeight: 1.6,
          }}
        >
          SpinLid читает отзывы на 2GIS и Яндекс.Картах, группирует жалобы клиентов и прикладывает
          цитату к каждой. Открываете выдачу — и сразу видно, у какой компании какая проблема.
        </p>
        <div className="reveal">
          <SignalsTableDemo />
        </div>
        <div
          className="reveal"
          style={{
            marginTop: '14px',
            fontSize: '13px',
            color: 'var(--landing-muted)',
            textAlign: 'center',
          }}
        >
          Так выглядит таблица в кабинете ·{' '}
          <Link href="/demo" style={{ color: 'var(--landing-accent)', fontWeight: 600 }}>
            Смотреть полный пример →
          </Link>
        </div>
      </div>
    </section>
  );
}
