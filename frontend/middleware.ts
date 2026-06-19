import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_TOKEN_COOKIE = 'access_token';

const PUBLIC_PATHS = new Set<string>([
  '/auth/login',
  '/auth/register',
  '/demo',
  // Правовые/служебные (ТЗ 2026-06-05) — должны открываться без логина,
  // в т.ч. для индексации поисковиками.
  '/terms',
  '/policy',
  '/consent',
  '/offer',
  '/data-sources',
  // SEO-лендинги под коммерческие ключи (ТЗ 2026-06-05) — публичные,
  // индексируемые.
  '/parsing-otzyvov',
  '/parser-2gis',
  '/parser-yandex-maps',
  '/baza-klientov',
  '/sbor-kontaktov',
  '/holodnaya-rassylka',
  // 2026-06-20: три ниш-лендинга, попавшие в sitemap, но забытые здесь.
  // Без них бот без cookies получал редирект на /auth/login и страница
  // выпадала из индекса.
  '/klienty-dlya-web-studii',
  '/klienty-dlya-seo',
  '/klienty-dlya-marketing-agentstva',
]);

/** Публичные страницы, которые поисковикам можно индексировать.
 *  Для всех остальных middleware выставляет X-Robots-Tag: noindex —
 *  дополнительная защита поверх robots.txt (на случай если бот его
 *  проигнорировал или попал на страницу по прямой ссылке). */
const INDEXABLE_PATHS = new Set<string>([
  '/',
  '/terms',
  '/policy',
  '/consent',
  '/offer',
  '/data-sources',
  '/parsing-otzyvov',
  '/parser-2gis',
  '/parser-yandex-maps',
  '/baza-klientov',
  '/sbor-kontaktov',
  '/holodnaya-rassylka',
  '/klienty-dlya-web-studii',
  '/klienty-dlya-seo',
  '/klienty-dlya-marketing-agentstva',
]);

function isIndexable(pathname: string): boolean {
  return INDEXABLE_PATHS.has(pathname);
}

function withNoindexHeader(response: NextResponse): NextResponse {
  response.headers.set('X-Robots-Tag', 'noindex, nofollow');
  return response;
}

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

function isBypassPath(pathname: string): boolean {
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/favicon.ico')) return true;
  if (pathname.startsWith('/robots.txt')) return true;
  if (pathname.startsWith('/sitemap.xml')) return true;
  if (pathname.startsWith('/api/')) return true;
  if (/\.[a-zA-Z0-9]+$/.test(pathname)) return true;
  return false;
}

function safeNextPath(pathname: string, search: string): string {
  const next = `${pathname}${search || ''}`;
  return next.startsWith('/') ? next : '/';
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  if (isBypassPath(pathname)) return NextResponse.next();

  const token = request.cookies.get(ACCESS_TOKEN_COOKIE)?.value;
  const isAuthed = Boolean(token);

  if (isAuthed && pathname.startsWith('/auth/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  if (isAuthed && pathname === '/app') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // На непубличных страницах (кабинет, dashboard, settings, etc.) добавляем
  // X-Robots-Tag: noindex — это страховка поверх robots.txt. Поисковику
  // достаточно одного из двух сигналов, но оба — надёжнее.
  const response =
    isPublicPath(pathname) || (!isAuthed && pathname === '/')
      ? NextResponse.next()
      : !isAuthed
        ? (() => {
            const url = request.nextUrl.clone();
            url.pathname = '/auth/login';
            url.searchParams.set('next', safeNextPath(pathname, search));
            return NextResponse.redirect(url);
          })()
        : NextResponse.next();

  if (!isIndexable(pathname)) {
    return withNoindexHeader(response);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
