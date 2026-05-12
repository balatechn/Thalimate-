import { NextRequest, NextResponse } from 'next/server';
import { readSession } from '@/lib/auth';

const PROTECTED = ['/admin', '/kitchen', '/delivery'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
    return NextResponse.next();
  }
  const token = req.cookies.get('tm_session')?.value;
  const session = await readSession(token);
  if (!session) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  // Role gating
  if (pathname.startsWith('/admin') && !['ADMIN', 'SUPPORT'].includes(session.role)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (pathname.startsWith('/kitchen') && !['ADMIN', 'KITCHEN'].includes(session.role)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  if (pathname.startsWith('/delivery') && !['ADMIN', 'DELIVERY'].includes(session.role)) {
    return NextResponse.redirect(new URL('/', req.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/kitchen/:path*', '/delivery/:path*'],
};
