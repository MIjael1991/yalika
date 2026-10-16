import type { NextRequest } from 'next/server';

type RouteParameters = {
  params: Promise<{
    path: string[];
  }>;
};

const allowedRoots = new Set([
  'site-team',
  'reservation',
  'business-assistant',
  'clinical',
  'assistant-preference',
  'auth',
  'briefing',
  'capture',
  'catalog',
  'discount',
  'engagement',
  'health',
  'media',
  'loyalty-program',
  'order',
  'order-split',
  'payment',
  'reminder',
  'return',
  'scratch',
  'space',
  'site',
  'survey',
  'task',
  'promotion',
]);

function getTargetUrl(request: NextRequest, path: string[]) {
  if (
    path.length === 0 ||
    !allowedRoots.has(path[0]) ||
    path.some((segment) => !segment || segment === '.' || segment === '..')
  ) {
    return null;
  }

  const apiUrl = (
    process.env.YALIKA_API_URL ?? 'http://localhost:3000'
  ).replace(/\/+$/, '');
  const encodedPath = path.map(encodeURIComponent).join('/');
  const target = new URL(`${apiUrl}/${encodedPath}`);

  target.search = request.nextUrl.search;
  return target;
}

async function forward(request: NextRequest, context: RouteParameters) {
  const { path } = await context.params;
  const target = getTargetUrl(request, path);

  if (!target) {
    return Response.json(
      { message: 'Ruta de Yalika no permitida' },
      { status: 404 },
    );
  }

  const headers = new Headers();
  const cookie = request.headers.get('cookie');
  if (cookie) {
    headers.set('cookie', cookie);
  }
  const contentType = request.headers.get('content-type');

  if (contentType) {
    headers.set('content-type', contentType);
  }

  for (const name of [
    'authorization',
    'cookie',
    'user-agent',
  ]) {
    const value = request.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  }

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';

  try {
    const apiResponse = await fetch(target, {
      method: request.method,
      headers,
      body: hasBody ? await request.arrayBuffer() : undefined,
      cache: 'no-store',
    });
    const responseHeaders = new Headers();
    const apiContentType = apiResponse.headers.get('content-type');

    if (apiContentType) {
      responseHeaders.set('content-type', apiContentType);
    }

    for (const name of [

      'content-disposition',

      'cache-control',

      'pragma',

      'x-content-type-options',

    ]) {

      const value = apiResponse.headers.get(name);

      if (value) responseHeaders.set(name, value);

    }


    const setCookie = apiResponse.headers.get('set-cookie');

    if (setCookie) {
      responseHeaders.set('set-cookie', setCookie);
    }

    return new Response(await apiResponse.arrayBuffer(), {
      status: apiResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { message: 'Yalika no pudo comunicarse con el servicio local' },
      { status: 503 },
    );
  }
}

export function GET(request: NextRequest, context: RouteParameters) {
  return forward(request, context);
}

export function POST(request: NextRequest, context: RouteParameters) {
  return forward(request, context);
}

export function PATCH(request: NextRequest, context: RouteParameters) {
  return forward(request, context);
}

export function PUT(request: NextRequest, context: RouteParameters) {
  return forward(request, context);
}

export function DELETE(request: NextRequest, context: RouteParameters) {
  return forward(request, context);
}

