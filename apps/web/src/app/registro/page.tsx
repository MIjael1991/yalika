import type { Metadata } from 'next';

import { RegistrationWorkspace } from './registration-workspace';


export const dynamic = 'force-dynamic';
export const metadata: Metadata = {
  title: 'Crear cuenta Â· Yaleka',
  description: 'Crea una sola cuenta Yalika para acceder a tus módulos y servicios.',
};

export default function RegisterPage() {
  return <RegistrationWorkspace />;
}

