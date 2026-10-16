'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';

import { clinicalApi } from '../clinical-api';
import { careApi } from '../cuidado/care-api';
import styles from '../cuidado/cuidado.module.css';

export default function HealthQrViewer(){
  const params=useSearchParams();
  const token=params.get('token')??'';
  const [status,setStatus]=useState('Preparando acceso…');
  const [summary,setSummary]=useState<any>(null);
  const [error,setError]=useState('');

  async function tryGrant(requestId:string){
    const resolved:any=await careApi.grantForRequest(requestId);
    const grant=resolved?.grant;
    if(!grant){setStatus('Solicitud enviada. El paciente debe autorizar el acceso desde Salud.');return false;}
    const session:any=await clinicalApi.createSession(grant.id);
    const sessionId=session?.id??session?.session?.id;
    if(!sessionId) throw new Error('No fue posible crear la sesión temporal');
    setSummary(await careApi.sharedSummary(sessionId));
    setStatus('Acceso temporal autorizado.');
    return true;
  }

  useEffect(()=>{
    if(!token){setError('Falta el token del QR Salud.');return;}
    let timer:any;
    (async()=>{
      try{
        const request:any=await clinicalApi.requestAccess(token);
        setStatus(request.status==='APPROVED'?'Acceso aprobado.':'Solicitud enviada. Esperando autorización del paciente…');
        if(await tryGrant(request.id)) return;
        timer=setInterval(()=>void tryGrant(request.id).catch(()=>null),5000);
      }catch(e){setError(e instanceof Error?e.message:'No fue posible solicitar acceso');}
    })();
    return()=>timer&&clearInterval(timer);
  },[token]);

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.hero}><div><span className={styles.eyebrow}>YALEKA · QR SALUD</span><h1>Acceso clínico temporal</h1><p>El QR no contiene el expediente. El paciente decide qué categorías comparte y el acceso queda auditado.</p></div><Link href="/" className={styles.secondary}>Inicio</Link></header>
    {error&&<div className={styles.error}>{error}</div>}
    {!error&&<div className={styles.offline}>{status}</div>}
    {summary&&<section className={`${styles.card} ${styles.cardFull}`}><span className={styles.kicker}>INFORMACIÓN AUTORIZADA</span><p className={styles.note}>Válido hasta {new Date(summary.expiresAt).toLocaleString('es-MX')}</p>
      {summary.allergies&&<div><h2>Alergias</h2><div className={styles.list}>{summary.allergies.map((a:any)=><div className={styles.item} key={a.id}><strong>{a.substance}</strong><p>{a.reaction||'Sin reacción especificada'} · {a.severity}</p></div>)}</div></div>}
      {summary.restrictions&&<div><h2>Restricciones</h2><div className={styles.list}>{summary.restrictions.map((r:any)=><div className={styles.item} key={r.id}><strong>{r.itemName}</strong><p>{r.restrictionType}</p></div>)}</div></div>}
      {summary.currentMedications&&<div><h2>Medicamentos actuales</h2><div className={styles.list}>{summary.currentMedications.map((m:any)=><div className={styles.item} key={m.id}><strong>{m.medication?.medicationName||'Medicamento'}</strong><p>{m.regimen?.instructions}</p></div>)}</div></div>}
      {summary.prescriptions&&<div><h2>Recetas</h2><div className={styles.list}>{summary.prescriptions.map((r:any)=><div className={styles.item} key={r.id}><strong>{new Date(r.issuedAt).toLocaleDateString('es-MX')}</strong><p>{r.items?.map((i:any)=>i.medicationName).join(', ')}</p></div>)}</div></div>}
      {summary.studies&&<div><h2>Estudios</h2><div className={styles.list}>{summary.studies.map((d:any)=><div className={styles.item} key={d.id}><strong>{d.title}</strong><p>{d.clinicalDate?new Date(d.clinicalDate).toLocaleDateString('es-MX'):'Sin fecha clínica'}</p></div>)}</div></div>}
      {summary.consultations&&<div><h2>Consultas recientes</h2><div className={styles.list}>{summary.consultations.map((c:any)=><div className={styles.item} key={c.id}><strong>{c.title}</strong><p>{new Date(c.occurredAt).toLocaleString('es-MX')}</p></div>)}</div></div>}
      {summary.procedures&&<div><h2>Procedimientos</h2><div className={styles.list}>{summary.procedures.map((p:any)=><div className={styles.item} key={p.id}><strong>{p.procedureName}</strong><p>{new Date(p.occurredAt).toLocaleDateString('es-MX')}</p></div>)}</div></div>}
    </section>}
  </div></main>;
}
