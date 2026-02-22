// Middleware temporarily disabled for debugging HTML generation issue
import { NextResponse } from 'next/server';

export function middleware() {
  return NextResponse.next();
}

export const config = {
  matcher: [],
};

