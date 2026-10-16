'use client';

import Link from 'next/link';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { trustApi } from './trust-api';
import styles from './profesional.module.css';

type View = 'home' | 'register' | 'location' | 'documents' | 'team' | 'professional';

const TYPES = [
  ['PHARMACY', 'Farmacia', 'Venta y dispensación de medicamentos'],
  ['PHARMACY_WITH_OFFICE', 'Farmacia + consultorio', 'Farmacia con servicio de consulta'],
  ['DOCTOR_OFFICE', 'Consultorio', 'Consultorio médico independiente'],
  ['CLINIC', 'Clínica', 'Unidad con uno o varios profesionales'],
  ['LABORATORY', 'Laboratorio', 'Estudios y resultados'],
] as const;

const EVIDENCE_LABELS: Record<string,string> = {
  FRONT_PHOTO: 'Foto de fachada',
  INTERIOR_PHOTO: 'Foto del interior',
  CONSULTING_ROOM_PHOTO: 'Foto del consultorio',
  SANITARY_NOTICE: 'Aviso sanitario / funcionamiento',
  HEALTH_LICENSE: 'Licencia o autorización sanitaria',
  RESPONSIBLE_SANITARY: 'Documento de responsable sanitario',
  TAX_OR_IDENTITY: 'Documento fiscal / identidad',
  OTHER: 'Otro documento',
  SANITARY_NOTICE_OR_HEALTH_LICENSE: 'Aviso o licencia sanitaria',
  NAME: 'Nombre del establecimiento', ADDRESS: 'Dirección', MUNICIPALITY: 'Municipio', STATE: 'Estado', RESPONSIBLE: 'Responsable', LOCATION: 'Ubicación del dispositivo',
};

function statusLabel(value?: string) {
  return ({ PENDING:'Por completar', UNDER_REVIEW:'En revisión', VERIFIED:'Verificado', REJECTED:'Requiere corrección', SUSPENDED:'Suspendido', INVITED:'Invitación enviada', ACCEPTED:'Aceptada', ACTIVE:'Activo', ACCEPTED_PENDING_VERIFICATION:'Pendiente de verificación' } as Record<string,string>)[value ?? ''] ?? value ?? 'Pendiente';
}

export default function TrustWorkspace() {
  const [data,setData]=useState<any>(null);
  const [view,setView]=useState<View>('home');
  const [selectedType,setSelectedType]=useState('PHARMACY_WITH_OFFICE');
  const [selectedOrgId,setSelectedOrgId]=useState<string>('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');

  async function refresh(){ const next=await trustApi.networkMe(); setData(next); if(!selectedOrgId && next.organizations?.[0]?.id) setSelectedOrgId(next.organizations[0].id); }
  useEffect(()=>{ void refresh().catch(e=>setError(e instanceof Error?e.message:'No fue posible cargar Red de Salud')); },[]);

  const organizations=data?.organizations??[];
  const org=useMemo(()=>organizations.find((x:any)=>x.id===selectedOrgId)??organizations[0]??null,[organizations,selectedOrgId]);
  const pendingInvitation=data?.pendingInvitations?.[0];
  const professional=data?.professional;
  const docsReady=org?.readiness?.ready===true;

  async function run(task:()=>Promise<any>, message?:string){ setBusy(true);setError('');setNotice('');try{await task();if(message)setNotice(message);await refresh();}catch(e){setError(e instanceof Error?e.message:'Ocurrió un error');}finally{setBusy(false);} }

  async function createOrganization(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await run(async()=>{const created=await trustApi.createOrganization({organizationType:selectedType,displayName:String(f.get('displayName')||''),legalName:String(f.get('legalName')||'')||undefined,rfc:String(f.get('rfc')||'')||undefined,phone:String(f.get('phone')||'')||undefined,email:String(f.get('email')||'')||undefined,addressLine1:String(f.get('addressLine1')||''),neighborhood:String(f.get('neighborhood')||'')||undefined,municipality:String(f.get('municipality')||''),state:String(f.get('state')||''),postalCode:String(f.get('postalCode')||'')||undefined,sanitaryNoticeNumber:String(f.get('sanitaryNoticeNumber')||'')||undefined,healthAuthorizationNumber:String(f.get('healthAuthorizationNumber')||'')||undefined,responsibleName:String(f.get('responsibleName')||''),responsibleRole:String(f.get('responsibleRole')||'')||undefined,responsibleProfessionalLicense:String(f.get('responsibleProfessionalLicense')||'')||undefined});setSelectedOrgId(created.id);setView('location');},'Establecimiento registrado. Ahora confirma ubicación y documentos.');}

  function captureLocation(){ if(!org)return; if(!navigator.geolocation){setError('Este dispositivo no permite obtener ubicación.');return;} setBusy(true);setError('');navigator.geolocation.getCurrentPosition(pos=>{void run(()=>trustApi.saveLocation(org.id,{latitude:pos.coords.latitude,longitude:pos.coords.longitude,accuracyMeters:pos.coords.accuracy,source:'DEVICE'}),'Ubicación guardada.');},()=>{setBusy(false);setError('No se pudo obtener la ubicación. Revisa el permiso del navegador.');},{enableHighAccuracy:true,timeout:15000}); }

  async function uploadEvidence(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!org)return;const form=new FormData(e.currentTarget);await run(()=>trustApi.uploadEvidence(org.id,form),'Documento guardado para revisión.');e.currentTarget.reset();}
  async function invite(e:FormEvent<HTMLFormElement>){e.preventDefault();if(!org)return;const f=new FormData(e.currentTarget);await run(()=>trustApi.inviteProfessional(org.id,{professionalEmail:String(f.get('email')||''),relationshipType:String(f.get('relationshipType')||'AGREEMENT'),startsAt:String(f.get('startsAt')||'')||undefined,endsAt:String(f.get('endsAt')||'')||undefined}),'Invitación registrada. El profesional completará su cédula desde su cuenta.');e.currentTarget.reset();}
  async function saveProfessional(e:FormEvent<HTMLFormElement>){e.preventDefault();const f=new FormData(e.currentTarget);await run(()=>trustApi.saveProfessional({displayName:String(f.get('displayName')||''),professionalLicenseNumber:String(f.get('license')||''),profession:String(f.get('profession')||''),specialty:String(f.get('specialty')||'')||undefined,specialistLicenseNumber:String(f.get('specialistLicense')||'')||undefined}),'Perfil profesional guardado. Falta la verificación oficial antes de habilitar funciones clínicas.');}

  return <main className={styles.page}><div className={styles.shell}>
    <header className={styles.hero}><div><span className={styles.eyebrow}>YALEKA SALUD · RED DE SALUD</span><h1>Primero registramos el lugar. Después, a sus profesionales.</h1><p>Farmacia, consultorio, clínica o laboratorio. Yaleka separa establecimiento, permisos, ubicación y cédulas para no habilitar funciones clínicas sin una base verificable.</p></div><div className={styles.heroActions}><Link href="/salud" className={styles.secondary}>Salud</Link><Link href="/salud/cuidado" className={styles.secondary}>Mi cuidado</Link></div></header>
    {error&&<div className={styles.error}>{error}</div>}{notice&&<div className={styles.success}>{notice}</div>}

    {pendingInvitation && <section className={styles.inviteBanner}><div><span>TE INVITARON A COLABORAR</span><strong>{pendingInvitation.organization?.displayName}</strong><p>Para aceptar, primero completa tu cédula y perfil profesional. La invitación no te habilita automáticamente.</p></div><button onClick={()=>setView('professional')}>Continuar</button></section>}

    {!organizations.length && !pendingInvitation && <section className={styles.start}><span className={styles.stepLabel}>PASO 1</span><h2>Registra tu servicio de salud</h2><p>Elige sólo qué tipo de establecimiento vas a registrar.</p><div className={styles.typeGrid}>{TYPES.map(([value,label,description])=><button key={value} className={selectedType===value?styles.typeActive:styles.typeCard} onClick={()=>{setSelectedType(value);setView('register')}}><strong>{label}</strong><small>{description}</small></button>)}</div><p className={styles.note}>No exigimos antigüedad mínima de 30 días. La revisión se basa en datos y documentos del establecimiento.</p></section>}

    {organizations.length>0 && <><section className={styles.orgHeader}><div><span className={styles.stepLabel}>TU ESTABLECIMIENTO</span><h2>{org?.displayName}</h2><p>{org?.typeLabel} · {org?.municipality}, {org?.state}</p></div><div className={styles.status}><strong>{statusLabel(org?.verificationStatus)}</strong><span>{docsReady?'Datos completos para revisión':'Aún faltan datos'}</span></div></section>
    <section className={styles.steps}>
      <button onClick={()=>setView('home')} className={styles.stepDone}><b>1</b><span><strong>Establecimiento</strong><small>Registrado</small></span></button>
      <button onClick={()=>setView('location')} className={org?.location?styles.stepDone:styles.step}><b>2</b><span><strong>Ubicación</strong><small>{org?.location?'Guardada':'Pendiente'}</small></span></button>
      <button onClick={()=>setView('documents')} className={docsReady?styles.stepDone:styles.step}><b>3</b><span><strong>Fotos y permisos</strong><small>{org?.evidence?.length?`${org.evidence.length} archivo(s)`:'Pendiente'}</small></span></button>
      <button onClick={()=>setView('team')} className={styles.step}><b>4</b><span><strong>Profesionales</strong><small>{org?.memberships?.length||org?.invitations?.length?'Equipo iniciado':'Después del establecimiento'}</small></span></button>
    </section></>}

    {view==='register' && <section className={styles.panel}><div className={styles.panelTitle}><div><span className={styles.stepLabel}>DATOS BÁSICOS</span><h2>{TYPES.find(x=>x[0]===selectedType)?.[1]}</h2></div><button className={styles.close} onClick={()=>setView('home')}>×</button></div><form className={styles.form} onSubmit={createOrganization}><div className={styles.two}><label>Nombre comercial<input name="displayName" required placeholder="Ej. Farmacia Salud Centro"/></label><label>Teléfono<input name="phone"/></label></div><div className={styles.two}><label>Razón social / propietario<input name="legalName"/></label><label>RFC<input name="rfc"/></label></div><label>Dirección<input name="addressLine1" required placeholder="Calle, número"/></label><div className={styles.three}><label>Colonia<input name="neighborhood"/></label><label>Municipio<input name="municipality" required/></label><label>Estado<input name="state" required/></label></div><div className={styles.two}><label>Código postal<input name="postalCode"/></label><label>Correo<input name="email" type="email"/></label></div><hr/><div className={styles.two}><label>Responsable del establecimiento<input name="responsibleName" required/></label><label>Cargo<input name="responsibleRole" placeholder="Propietario / responsable sanitario"/></label></div><details><summary>Datos sanitarios que ya tengas</summary><div className={styles.two}><label>Aviso / folio sanitario<input name="sanitaryNoticeNumber"/></label><label>Licencia / autorización<input name="healthAuthorizationNumber"/></label></div><label>Cédula del responsable, si corresponde<input name="responsibleProfessionalLicense"/></label></details><button disabled={busy}>Guardar establecimiento</button></form></section>}

    {organizations.length>0 && (view==='home'||view==='location') && <section className={styles.panel}><span className={styles.stepLabel}>PASO 2 · UBICACIÓN</span><h2>Confirma que el establecimiento está donde dices</h2><p className={styles.note}>La dirección escrita y la ubicación del dispositivo se guardan por separado. Una no sustituye a la otra.</p><div className={styles.bigAction}><div><strong>{org?.location?'Ubicación capturada':'Falta confirmar ubicación'}</strong><small>{org?.location?`${org.location.latitude.toFixed(5)}, ${org.location.longitude.toFixed(5)}`:'Usa el teléfono o computadora dentro del establecimiento.'}</small></div><button disabled={busy} onClick={captureLocation}>{org?.location?'Actualizar ubicación':'Usar mi ubicación'}</button></div>{org?.location&&<button className={styles.next} onClick={()=>setView('documents')}>Continuar con fotos y permisos →</button>}</section>}

    {organizations.length>0 && view==='documents' && <section className={styles.panel}><span className={styles.stepLabel}>PASO 3 · FOTOS Y DOCUMENTOS</span><h2>Sube sólo lo necesario para comprobar el establecimiento</h2><div className={styles.requirements}>{(org?.requirements??[]).map((r:string)=><span key={r} className={(org?.readiness?.missing??[]).includes(r)?styles.missing:styles.complete}>{(org?.readiness?.missing??[]).includes(r)?'○':'✓'} {EVIDENCE_LABELS[r]??r}</span>)}</div><form className={styles.upload} onSubmit={uploadEvidence}><select name="kind" defaultValue="FRONT_PHOTO"><option value="FRONT_PHOTO">Foto de fachada</option><option value="INTERIOR_PHOTO">Foto interior</option><option value="CONSULTING_ROOM_PHOTO">Foto del consultorio</option><option value="SANITARY_NOTICE">Aviso sanitario / funcionamiento</option><option value="HEALTH_LICENSE">Licencia / autorización sanitaria</option><option value="RESPONSIBLE_SANITARY">Responsable sanitario</option><option value="TAX_OR_IDENTITY">Documento fiscal / identidad</option><option value="OTHER">Otro</option></select><input name="file" type="file" accept="image/*,.pdf" required/><button disabled={busy}>Subir</button></form><div className={styles.fileList}>{org?.evidence?.map((e:any)=><div key={e.id}><span><strong>{EVIDENCE_LABELS[e.kind]??e.kind}</strong><small>{e.originalName}</small></span><button onClick={()=>void run(()=>trustApi.removeEvidence(org.id,e.id),'Archivo retirado.')}>Quitar</button></div>)}</div>{org?.readiness?.missing?.length>0&&<div className={styles.missingBox}><strong>Falta:</strong> {org.readiness.missing.map((m:string)=>EVIDENCE_LABELS[m]??m).join(' · ')}</div>}<button className={styles.submitReview} disabled={busy||!org?.readiness?.ready||org?.verificationStatus==='UNDER_REVIEW'||org?.verificationStatus==='VERIFIED'} onClick={()=>void run(()=>trustApi.submitOrganization(org.id),'Establecimiento enviado a revisión.')}>{org?.verificationStatus==='UNDER_REVIEW'?'Ya está en revisión':org?.verificationStatus==='VERIFIED'?'Establecimiento verificado':'Enviar a revisión'}</button></section>}

    {organizations.length>0 && view==='team' && <section className={styles.panel}><span className={styles.stepLabel}>PASO 4 · PROFESIONALES</span><h2>Los médicos entran desde el establecimiento</h2><p className={styles.note}>Invitar a alguien no verifica su cédula. El profesional completa sus datos desde su propia cuenta Yaleka y queda pendiente hasta la revisión.</p><form className={styles.form} onSubmit={invite}><div className={styles.two}><label>Correo del profesional<input name="email" type="email" required/></label><label>Relación<select name="relationshipType"><option value="AGREEMENT">Convenio</option><option value="STAFF">Personal</option><option value="CONTRACTOR">Prestador externo</option></select></label></div><div className={styles.two}><label>Inicio<input name="startsAt" type="datetime-local"/></label><label>Fin, si aplica<input name="endsAt" type="datetime-local"/></label></div><button disabled={busy}>Invitar profesional</button></form><div className={styles.teamList}>{org?.memberships?.map((m:any)=><div key={m.id}><span><strong>{m.professional?.displayName}</strong><small>{m.professional?.profession} · cédula {m.professional?.professionalLicenseNumber}</small></span><em>{statusLabel(m.status)}</em></div>)}{org?.invitations?.filter((i:any)=>i.status==='INVITED').map((i:any)=><div key={i.id}><span><strong>{i.invitedEmail}</strong><small>Invitación pendiente</small></span><em>Esperando</em></div>)}</div>{!professional&&<button className={styles.secondary} onClick={()=>setView('professional')}>También soy profesional de este establecimiento</button>}</section>}

    {view==='professional' && <section className={styles.panel}><span className={styles.stepLabel}>PERFIL PROFESIONAL</span><h2>Registra tu cédula sólo dentro de una Red de Salud</h2><p className={styles.note}>{pendingInvitation?`Invitación de ${pendingInvitation.organization?.displayName}.`:'Tienes un establecimiento registrado, por eso puedes completar tu perfil profesional.'} La cédula queda pendiente hasta verificación.</p><form className={styles.form} onSubmit={saveProfessional}><label>Nombre completo<input name="displayName" defaultValue={professional?.displayName??''} required/></label><div className={styles.two}><label>Cédula profesional<input name="license" defaultValue={professional?.professionalLicenseNumber??''} required/></label><label>Profesión<input name="profession" defaultValue={professional?.profession??''} required placeholder="Medicina"/></label></div><div className={styles.two}><label>Especialidad<input name="specialty" defaultValue={professional?.specialty??''}/></label><label>Cédula de especialidad<input name="specialistLicense" defaultValue={professional?.specialistLicenseNumber??''}/></label></div><button disabled={busy}>Guardar perfil profesional</button></form>{professional&&pendingInvitation&&<button className={styles.submitReview} disabled={busy} onClick={()=>void run(()=>trustApi.acceptInvitation(pendingInvitation.id),'Vinculación aceptada. Queda pendiente de las verificaciones correspondientes.')}>Aceptar vinculación con {pendingInvitation.organization?.displayName}</button>}</section>}

    <footer className={styles.safety}>La receta digital y la consulta en línea siguen deshabilitadas. Esta fase sólo construye identidad, ubicación, documentación y vinculación profesional.</footer>
  </div></main>;
}
