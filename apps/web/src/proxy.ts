import { NextRequest, NextResponse } from 'next/server';

type SessionResponse = {
  user?: {
    modules?: string[];
  };
};

function surveyOnly(modules: string[] | undefined) {
  return Boolean(modules?.includes('surveys') && !modules.includes('all'));
}

function allowedSurveyPath(pathname: string) {
  return (
    pathname === '/encuestas' ||
    pathname.startsWith('/encuestas/') ||
    pathname === '/surveys' ||
    pathname.startsWith('/surveys/') ||
    pathname === '/login' ||
    pathname === '/registro' ||
    pathname === '/recuperar' ||
    pathname.startsWith('/e/') ||
    pathname.startsWith('/s/') ||
    pathname.startsWith('/r/')
  );
}

function allowedSurveyApi(pathname: string) {
  return (
    pathname.startsWith('/api/orion/auth') ||
    pathname.startsWith('/api/orion/survey')
  );
}

export async function proxy(request: NextRequest) {
  const sessionToken = request.cookies.get('orion_session')?.value;

  if (!sessionToken) {
    return NextResponse.next();
  }

  const apiUrl = (
    process.env.ORION_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');

  let session: SessionResponse | null = null;
  try {
    const response = await fetch(`${apiUrl}/auth/me`, {
      headers: {
        cookie: request.headers.get('cookie') ?? '',
      },
      cache: 'no-store',
    });

    if (response.ok) {
      session = (await response.json()) as SessionResponse;
    }
  } catch {
    return NextResponse.next();
  }

  if (!surveyOnly(session?.user?.modules)) {
    return NextResponse.next();
  }

  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/orion/')) {
    return allowedSurveyApi(pathname)
      ? NextResponse.next()
      : NextResponse.json(
          { message: 'Esta cuenta tiene acceso exclusivo a Encuestas' },
          { status: 403 },
        );
  }

  if (allowedSurveyPath(pathname)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL('/encuestas', request.url));
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
