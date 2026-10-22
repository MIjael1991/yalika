import { redirect } from 'next/navigation';

/** Presente ahora se llama Tequio: las direcciones viejas llevan a la nueva. */
export default async function PresenteRedirect({
  params,
  searchParams,
}: {
  params: Promise<{ rest?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { rest = [] } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    for (const item of Array.isArray(value) ? value : value ? [value] : []) query.append(key, item);
  }
  const path = ['/tequio', ...rest.map(encodeURIComponent)].join('/');
  redirect(query.size ? `${path}?${query}` : path);
}
