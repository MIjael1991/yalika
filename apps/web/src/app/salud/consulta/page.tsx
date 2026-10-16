import { Suspense } from 'react';
import ConsultationAccessWorkspace from './consultation-access-workspace';

export const dynamic = 'force-dynamic';

export default function ConsultationAccessPage() {
  return (
    <Suspense fallback={null}>
      <ConsultationAccessWorkspace />
    </Suspense>
  );
}
