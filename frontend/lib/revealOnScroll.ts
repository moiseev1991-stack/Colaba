/**
 * Появление блоков `.reveal` при прокрутке — главная и /razbor.
 *
 * - Контент скрывается только после гидрации: на корень ставится `js-reveal`,
 *   а CSS прячет `.reveal` лишь под ним. Без JS и до загрузки скриптов всё видно.
 * - Что уже на экране в момент запуска, показывается сразу, без мигания.
 * - Вход снизу анимирует IntersectionObserver (опционально с каскадом).
 * - Страховка на scroll раскрывает блоки, которые целиком ушли выше экрана:
 *   при быстрой прокрутке observer может пропустить элемент между кадрами,
 *   и тот остался бы невидимым.
 */
export function initRevealOnScroll(
  root: Element | null,
  {
    staggerMs = 0,
    rootMargin = '0px 0px -50px 0px',
  }: { staggerMs?: number; rootMargin?: string } = {},
): () => void {
  if (!root || typeof window === 'undefined') return () => {};

  const pending = new Set(Array.from(root.querySelectorAll('.reveal:not(.visible)')));

  const show = (el: Element, delayMs = 0) => {
    pending.delete(el);
    if (delayMs > 0) window.setTimeout(() => el.classList.add('visible'), delayMs);
    else el.classList.add('visible');
  };

  pending.forEach((el) => {
    if (el.getBoundingClientRect().top < window.innerHeight) show(el);
  });
  root.classList.add('js-reveal');

  if (typeof IntersectionObserver === 'undefined') {
    pending.forEach((el) => show(el));
    return () => {};
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        observer.unobserve(entry.target);
        if (!pending.has(entry.target)) return;
        const siblings = Array.from(
          entry.target.parentElement?.querySelectorAll('.reveal:not(.visible)') ?? [],
        );
        const idx = Math.max(siblings.indexOf(entry.target), 0);
        show(entry.target, Math.min(idx, 5) * staggerMs);
      });
    },
    { threshold: 0.08, rootMargin },
  );
  pending.forEach((el) => observer.observe(el));

  let frame = 0;
  const onScroll = () => {
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      pending.forEach((el) => {
        if (el.getBoundingClientRect().bottom < 0) show(el);
      });
      if (pending.size === 0) window.removeEventListener('scroll', onScroll);
    });
  };
  window.addEventListener('scroll', onScroll, { passive: true });

  return () => {
    observer.disconnect();
    window.removeEventListener('scroll', onScroll);
    if (frame) window.cancelAnimationFrame(frame);
  };
}
