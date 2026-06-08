/**
 * Декоративный фон для hero-секций (SEO-страницы + лендинг).
 * SSR-friendly, без JS-зависимостей. Уважает prefers-reduced-motion.
 *
 * Состав:
 * 1. 5 крупных цветных mesh-blob'ов с blur + плавающая анимация
 * 2. Тонкая dot-matrix с радиальной маской
 * 3. SVG-граф «потоков данных» — кривые с pulse-точками
 * 4. Затемнение к низу для плавного перехода к следующей секции
 *
 * Должен быть положен сразу внутрь section, которая имеет
 * position:relative и overflow:hidden, ДО основного контента.
 * Контент потом обёрнут в свой relative-div с z-index:1.
 */
export function HeroBackgroundDecor() {
  return (
    <>
      <style>{`
        @keyframes heroBlobA { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(60px,-40px,0) scale(1.15); } }
        @keyframes heroBlobB { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(-50px,30px,0) scale(1.1); } }
        @keyframes heroBlobC { 0%,100% { transform: translate3d(0,0,0) scale(1); } 50% { transform: translate3d(30px,40px,0) scale(0.9); } }
        @keyframes heroPulse { 0%,100% { opacity: 0.18; } 50% { opacity: 0.55; } }
        @keyframes heroDash { to { stroke-dashoffset: -200; } }
        @media (prefers-reduced-motion: reduce) {
          .hero-bg-blob, .hero-bg-pulse, .hero-bg-line { animation: none !important; }
        }
      `}</style>

      {/* Mesh-blobs */}
      <div aria-hidden className="hero-bg-blob" style={{ position:'absolute', top:'-15%', left:'-10%', width:720, height:720, background:'radial-gradient(circle, #06b6d4 0%, transparent 65%)', filter:'blur(80px)', opacity:0.55, pointerEvents:'none', animation:'heroBlobA 22s ease-in-out infinite', zIndex: 0 }} />
      <div aria-hidden className="hero-bg-blob" style={{ position:'absolute', top:'10%', right:'-15%', width:760, height:760, background:'radial-gradient(circle, #2dd4bf 0%, transparent 60%)', filter:'blur(90px)', opacity:0.5, pointerEvents:'none', animation:'heroBlobB 26s ease-in-out infinite', zIndex: 0 }} />
      <div aria-hidden className="hero-bg-blob" style={{ position:'absolute', bottom:'-20%', left:'20%', width:680, height:680, background:'radial-gradient(circle, #6366f1 0%, transparent 60%)', filter:'blur(90px)', opacity:0.45, pointerEvents:'none', animation:'heroBlobC 24s ease-in-out infinite', zIndex: 0 }} />
      <div aria-hidden className="hero-bg-blob" style={{ position:'absolute', top:'40%', left:'35%', width:480, height:480, background:'radial-gradient(circle, #a855f7 0%, transparent 65%)', filter:'blur(100px)', opacity:0.3, pointerEvents:'none', animation:'heroBlobA 30s ease-in-out infinite reverse', zIndex: 0 }} />
      <div aria-hidden className="hero-bg-blob" style={{ position:'absolute', bottom:'5%', right:'15%', width:420, height:420, background:'radial-gradient(circle, #ec4899 0%, transparent 65%)', filter:'blur(90px)', opacity:0.28, pointerEvents:'none', animation:'heroBlobB 28s ease-in-out infinite reverse', zIndex: 0 }} />

      {/* Dot-matrix */}
      <div aria-hidden style={{ position:'absolute', inset:0, backgroundImage:'radial-gradient(circle, rgba(148, 163, 184, 0.18) 1px, transparent 1px)', backgroundSize:'28px 28px', maskImage:'radial-gradient(ellipse 90% 70% at 50% 50%, #000 30%, transparent 95%)', WebkitMaskImage:'radial-gradient(ellipse 90% 70% at 50% 50%, #000 30%, transparent 95%)', pointerEvents:'none', zIndex: 0 }} />

      {/* SVG-граф потоков данных */}
      <svg aria-hidden viewBox="0 0 1200 600" preserveAspectRatio="xMidYMid slice" style={{ position:'absolute', inset:0, width:'100%', height:'100%', pointerEvents:'none', opacity:0.55, zIndex: 0 }}>
        <defs>
          <linearGradient id="hero-bg-line-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2dd4bf" stopOpacity="0" />
            <stop offset="50%" stopColor="#06b6d4" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#6366f1" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d="M 80 120 Q 350 60, 600 200 T 1100 140" stroke="url(#hero-bg-line-grad)" strokeWidth="1.5" fill="none" strokeDasharray="6 8" className="hero-bg-line" style={{ animation:'heroDash 8s linear infinite' }} />
        <path d="M 60 460 Q 380 540, 640 420 T 1140 480" stroke="url(#hero-bg-line-grad)" strokeWidth="1.2" fill="none" strokeDasharray="4 10" className="hero-bg-line" style={{ animation:'heroDash 12s linear infinite reverse' }} />
        {[
          { cx: 80, cy: 120, c: '#06b6d4', d: '0s' },
          { cx: 600, cy: 200, c: '#2dd4bf', d: '1.2s' },
          { cx: 1100, cy: 140, c: '#a855f7', d: '0.5s' },
          { cx: 60, cy: 460, c: '#06b6d4', d: '2s' },
          { cx: 640, cy: 420, c: '#ec4899', d: '0.8s' },
          { cx: 1140, cy: 480, c: '#2dd4bf', d: '1.5s' },
        ].map((p, i) => (
          <g key={i}>
            <circle cx={p.cx} cy={p.cy} r="14" fill={p.c} className="hero-bg-pulse" style={{ animation:`heroPulse 3s ease-in-out infinite`, animationDelay:p.d }} />
            <circle cx={p.cx} cy={p.cy} r="4" fill={p.c} opacity="0.9" />
          </g>
        ))}
      </svg>

      {/* Затемнение к низу */}
      <div aria-hidden style={{ position:'absolute', left:0, right:0, bottom:0, height:120, background:'linear-gradient(to bottom, transparent, rgba(7,11,20,0.92))', pointerEvents:'none', zIndex: 0 }} />
    </>
  );
}
