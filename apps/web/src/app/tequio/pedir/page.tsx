import { RequestForm } from './request-form';

export const dynamic = 'force-dynamic';

type Params = {
  categoria?: string;
  oficio?: string;
  con?: string;
  de?: string;
  fecha?: string;
  texto?: string;
};

const text = (value: unknown) => (typeof value === 'string' && value ? value : undefined);

export default async function PresentePedirPage({
  searchParams,
}: {
  searchParams: Promise<Params>;
}) {
  const params = await searchParams;
  return (
    <RequestForm
      openCategory={text(params.categoria)}
      initialTrade={text(params.oficio)}
      initialText={text(params.texto)?.slice(0, 600)}
      providerId={text(params.con)}
      followUpOfId={text(params.de)}
      proposedAt={text(params.fecha)}
    />
  );
}
