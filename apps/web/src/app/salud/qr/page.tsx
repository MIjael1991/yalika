import { Suspense } from 'react';
import HealthQrViewer from './qr-viewer';
export const dynamic = 'force-dynamic';
export default function HealthQrPage(){return <Suspense fallback={null}><HealthQrViewer/></Suspense>}
