import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const COOKIE_CLEAR = 'Path=/; HttpOnly; SameSite=Lax; Max-Age=0';

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.headers.append('Set-Cookie', `access_token=; ${COOKIE_CLEAR}`);
  res.headers.append('Set-Cookie', `refresh_token=; ${COOKIE_CLEAR}`);
  return res;
}
