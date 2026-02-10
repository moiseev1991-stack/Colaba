import { NextResponse, type NextRequest } from 'next/server';

const ACCESS_TOKEN_COOKIE = 'access_token';

const PUBLIC_PATHS = new Set<string>(['/auth/login', '/auth/register']);

function isPublicPath(pathname: string): boolean {
  return PUBLIC_PATHS.has(pathname);
}

function isBypassPath(pathname: string): boolean {
  // Next internals and common static assets
  if (pathname.startsWith('/_next/')) return true;
  if (pathname.startsWith('/favicon.ico')) return true;
  if (pathname.startsWith('/robots.txt')) return true;
  if (pathname.startsWith('/sitemap.xml')) return true;
  // API routes (Next route handlers / proxy)
  if (pathname.startsWith('/api/')) return true;

  // Any file with an extension (e.g. .png, .css, .js)
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

  // If already authenticated, keep auth pages out of reach
  if (isAuthed && pathname.startsWith('/auth/')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    url.search = '';
    return NextResponse.redirect(url);
  }

  // Authenticated: redirect / to dashboard
  if (isAuthed && pathname === '/') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Redirect legacy /app to /dashboard
  if (isAuthed && pathname === '/app') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Allow public: auth pages + landing (/)
  if (isPublicPath(pathname)) return NextResponse.next();
  if (!isAuthed && pathname === '/') return NextResponse.next();

  // Everything else requires auth
  if (!isAuthed) {
    const url = request.nextUrl.clone();
    url.pathname = '/auth/login';
    url.searchParams.set('next', safeNextPath(pathname, search));
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

