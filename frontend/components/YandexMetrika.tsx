'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { isPublicPath } from '@/lib/public-paths';

// ID счётчика Яндекс.Метрики для spinlid.ru. Установлен 2026-06-23.
// Грузим ТОЛЬКО на публичных страницах (SEO-лендинги + правовые + главная).
// На /app/, /dashboard/, /auth/ — не грузим, чтобы не считать активность
// в кабинете и не светить сессии юзеров в Метрике.
const COUNTER_ID = 110073452;

export function YandexMetrika() {
  const pathname = usePathname();
  if (!isPublicPath(pathname)) {
    return null;
  }

  // Снипет из консоли Метрики 1-в-1, ssr/webvisor/clickmap/trackLinks
  // включены — как просил владелец.
  const initScript = `
    (function(m,e,t,r,i,k,a){
      m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
      m[i].l=1*new Date();
      for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
      k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)
    })(window, document,'script','https://mc.yandex.ru/metrika/tag.js?id=${COUNTER_ID}', 'ym');

    ym(${COUNTER_ID}, 'init', {
      ssr:true,
      webvisor:true,
      clickmap:true,
      ecommerce:"dataLayer",
      accurateTrackBounce:true,
      trackLinks:true
    });
  `;

  return (
    <>
      <Script
        id="yandex-metrika"
        strategy="afterInteractive"
        dangerouslySetInnerHTML={{ __html: initScript }}
      />
      {/* noscript-фолбэк рендерится прямо в DOM — Метрика так умеет */}
      <noscript>
        <div>
          <img
            src={`https://mc.yandex.ru/watch/${COUNTER_ID}`}
            style={{ position: 'absolute', left: '-9999px' }}
            alt=""
          />
        </div>
      </noscript>
    </>
  );
}
