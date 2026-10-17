'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import styles from '../inicio/home.module.css';
const services=[
  {id:'surveys',name:'Encuestas',description:'Crea preguntas y consulta tus resultados.',href:'/encuestas',icon:'▤'},
  {id:'health',name:'Salud',description:'Tu información y atención de salud.',href:'/salud',icon:'♡'},
  {id:'pos',name:'Punto de venta',description:'Mi caja, productos e inventario.',href:'/pos',icon:'▣'},
  {id:'sites',name:'Mis páginas',description:'Tu sitio y catálogo guardados.',href:'/sites',icon:'◎'},
];
export function ServicesWorkspace({user}:{user:{id:string;name:string;modules:string[]}}){
  const [available,setAvailable]=useState<string[]>([]),[saved,setSaved]=useState<string[]>([]),[draft,setDraft]=useState<string[]>([]);
  const [ready,setReady]=useState(false),[busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[retry,setRetry]=useState(0);
  useEffect(()=>{let live=true;setReady(false);
    void fetch('/api/yalika/assistant-preference/modules',{cache:'no-store'}).then(async r=>{
      if(!r.ok)throw Error();const p=await r.json();
      if(!Array.isArray(p.availableModules)||(p.visibleModules!==null&&!Array.isArray(p.visibleModules)))throw Error();
      let chosen=p.visibleModules;
      if(chosen===null){try{const cache=JSON.parse(localStorage.getItem(`yalika.visible-services.v1:${user.id}`)||'[]');chosen=Array.isArray(cache)?cache.filter((id:unknown)=>typeof id==='string'&&['surveys','health','pos','sites','life'].includes(id)):[];}catch{chosen=[];}}
      if(live){setAvailable(p.availableModules);setSaved(chosen);setDraft(chosen);setReady(true);setNotice(p.visibleModules===null?'Elige tus servicios y guarda la selección.':'Selección recuperada de tu cuenta.');}
    }).catch(()=>{if(live)setNotice('No pudimos cargar tu selección. Reintenta; no se ha cambiado nada.');});return()=>{live=false;};
  },[user.id,retry]);
  const allowed=(id:string)=>available.includes(id)&&(user.modules.includes('all')||user.modules.includes(id));
  const changed=JSON.stringify(draft)!==JSON.stringify(saved);
  function toggle(id:string){if(!ready||busy||!allowed(id))return;setDraft(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id]);}
  async function save(){if(!ready||busy)return;setBusy(true);setNotice('Guardando selección…');const next=[...draft];
    try{const r=await fetch('/api/yalika/assistant-preference/modules',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({visibleModules:next})});const p=await r.json().catch(()=>null);
      if(!r.ok||JSON.stringify(p?.visibleModules)!==JSON.stringify(next))throw Error();setSaved(next);
      try{localStorage.setItem(`yalika.visible-services.v1:${user.id}`,JSON.stringify(next));}catch{}
      window.dispatchEvent(new Event('yalika:services-changed'));setNotice('Selección guardada en tu cuenta. Ocultar servicios no elimina datos ni cancela recordatorios.');
    }catch{setNotice('No se confirmó el guardado. Conservamos tu selección para que puedas reintentar.');}finally{setBusy(false);}}
  return <main className={styles.page}><div className={styles.wrap}><header className={styles.header}><div><p>YALIKA · A TU MEDIDA</p><h1>Mis servicios</h1><span>Elige varios y guarda una sola vez. Tu buscador y asistente siempre están disponibles.</span></div><Link href="/inicio">Volver al inicio</Link></header>
  <div className={styles.grid}>{services.map(s=><article className={styles.card} key={s.id}><span className={styles.icon} aria-hidden>{s.icon}</span><h3>{s.name}</h3><p>{s.description}</p><label className="mt-5 flex min-h-12 items-center gap-3 font-semibold"><input className="h-6 w-6" type="checkbox" checked={draft.includes(s.id)} disabled={!ready||busy||!allowed(s.id)} onChange={()=>toggle(s.id)}/>{allowed(s.id)?'Mostrar en mi inicio':'No disponible para esta cuenta'}</label>{allowed(s.id)&&<Link href={s.href} className="mt-3 min-h-12 py-3 text-blue-700 underline">Abrir servicio</Link>}</article>)}<article className={styles.card}><span className={styles.icon} aria-hidden>✎</span><h3>Estudio</h3><p>Escribe, convierte y escanea documentos. Funciona en tu dispositivo, incluso sin internet.</p><p className="mt-5 flex min-h-12 items-center font-semibold">Siempre disponible</p><Link href="/estudio" className="mt-3 min-h-12 py-3 text-blue-700 underline">Abrir servicio</Link></article></div>
  {allowed('pos')&&allowed('sites')&&!(draft.includes('pos')&&draft.includes('sites'))&&<section className={styles.today}><div><h2>¿Vendes y quieres mostrar tu catálogo?</h2><p>Punto de venta y Mis páginas pueden trabajar juntos.</p></div><button disabled={!ready||busy} className="min-h-12 rounded-xl bg-blue-700 p-3 text-white" onClick={()=>setDraft(v=>[...new Set([...v,'pos','sites'])])}>Seleccionar ambos</button></section>}
  <section className={styles.today}><div><h2>Tu selección</h2><p>{changed?'Tienes cambios pendientes de guardar.':'Ocultar un servicio conserva su información.'}</p></div><div className="flex flex-wrap gap-3"><button disabled={!ready||busy} onClick={()=>void save()} className="min-h-12 rounded-xl bg-blue-700 px-5 text-white disabled:opacity-50">{busy?'Guardando…':'Guardar selección'}</button><button disabled={busy||!changed} onClick={()=>setDraft([...saved])} className="min-h-12 rounded-xl border border-blue-400 px-5 disabled:opacity-50">Descartar cambios</button></div></section>
  <p role="status">{notice}</p>{!ready&&<button className="min-h-12 rounded-xl border border-blue-500 p-3" onClick={()=>setRetry(v=>v+1)}>Reintentar</button>}
  <details className={styles.today}><summary className="cursor-pointer font-semibold">Próximamente</summary><p>Movilidad: la pantalla de viajes aún no está integrada en esta entrega. Educación: en preparación.</p></details>
  <footer className={styles.footer}>Sin cobros de plataforma por ahora. Mostrar un servicio no otorga permisos profesionales ni acceso a datos de otras personas.</footer></div></main>;
}
