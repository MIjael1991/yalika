import type { NextRequest } from 'next/server';

type RouteParameters = {
  params: Promise<{
    path: string[];
  }>;
};

const allowedRoots = new Set([
  'catalog',
  'discount',
  'health',
  'order',
  'order-split',
  'payment',
  'return',
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
    process.env.ORION_API_URL ?? 'http://localhost:3000'
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
      { message: 'Ruta de ORION no permitida' },
      { status: 404 },
    );
  }

  const headers = new Headers();
  const contentType = request.headers.get('content-type');

  if (contentType) {
    headers.set('content-type', contentType);
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

    return new Response(await apiResponse.arrayBuffer(), {
      status: apiResponse.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json(
      { message: 'ORION API no está disponible' },
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
