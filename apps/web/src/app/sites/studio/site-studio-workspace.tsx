'use client';
import Link from 'next/link';
import {useEffect,useState,useRef} from 'react';
import {type Site,type Product,type Promotion} from '../../s/[slug]/site-view';
import {SitePreview} from './site-preview';
import {draftKey,parseDraft,sectionPayload,type SiteDraft,type DraftSection} from '../../../lib/yaleka-site-draft';
import styles from './studio.module.css';
type StudioSite=Site&{updatedAt:string};
const editableTypes=['banner','video','menu','gallery','text'];
const types=[['banner','Banner'],['video','Video'],['menu','Menú'],['gallery','Galería'],['text','Texto'],['catalog','Catálogo'],['promotions','Promociones'],['contact','Contacto']] as const;
async function api<T>(path:string,init?:RequestInit):Promise<T>{
 const response=await fetch(`/api/orion/${path}`,{...init,cache:'no-store',headers:{'Content-Type':'application/json',...init?.headers},signal:AbortSignal.timeout(20000)});
 const body=await response.json().catch(()=>null);
 if(!response.ok||!body)throw Error(typeof body?.message==='string'?body.message:'No se completó la operación.');return body;
}
export function SiteStudioWorkspace({companyId,userId}:{companyId:string;userId:string}){
 const allowExit=useRef(false);
 const [site,setSite]=useState<StudioSite|null>(null),[sections,setSections]=useState<DraftSection[]>([]),[baseVersion,setBaseVersion]=useState('');
 const [products,setProducts]=useState<Product[]>([]),[promotions,setPromotions]=useState<Promotion[]>([]),[previewReady,setPreviewReady]=useState(false);
 const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[draft,setDraft]=useState<SiteDraft|null>(null);
 const [preview,setPreview]=useState(false),[mobile,setMobile]=useState(false),[unsaved,setUnsaved]=useState(false),[retry,setRetry]=useState(0);
 useEffect(()=>{let live=true;setError('');setSite(null);setPreviewReady(false);setDraft(null);
  void api<StudioSite>(`site/company/${encodeURIComponent(companyId)}`).then(async value=>{
   if(!live)return;setSite(value);setSections(value.sections);setBaseVersion(value.updatedAt);setUnsaved(false);
   try{setDraft(parseDraft(localStorage.getItem(draftKey(userId,companyId,value.id)),value.id));}catch{setMessage('No se pudo leer el borrador local. La página del servidor sigue intacta.');}
   try{const [p,m]=await Promise.all([api<Product[]>(`catalog/product/company/${encodeURIComponent(companyId)}`),api<(Promotion & {status:string;startsAt:string;endsAt:string})[]>(`promotion/company/${encodeURIComponent(companyId)}`)]);if(live){setProducts(p.filter(v=>v.status==='active'));setPromotions(m.filter(v=>v.status==='active'&&Date.parse(v.startsAt)<=Date.now()&&Date.parse(v.endsAt)>=Date.now()));setPreviewReady(true);}}catch{if(live)setError('No se pudo cargar catálogo/promociones para la vista previa. Reintenta antes de publicar.');}
  }).catch(e=>{if(live)setError(e instanceof Error?e.message:'No se pudo cargar el sitio.');});return()=>{live=false;};
 },[companyId,userId,retry]);
 useEffect(()=>{const warn=(e:BeforeUnloadEvent)=>{if(unsaved&&!allowExit.current){e.preventDefault();e.returnValue='';}};window.addEventListener('beforeunload',warn);return()=>window.removeEventListener('beforeunload',warn);},[unsaved]);
 useEffect(()=>{const guard=(event:MouseEvent)=>{
  if(!unsaved||event.defaultPrevented||!(event.target instanceof Element))return;
  const link=event.target.closest('a');if(!link||link.target==='_blank'||link.hasAttribute('download'))return;
  if(link.href===window.location.href||link.getAttribute('href')?.startsWith('#'))return;
  if(!confirm('Hay cambios sin guardar. ¿Salir y descartarlos del editor?')){event.preventDefault();event.stopPropagation();}else{allowExit.current=true;}
 };document.addEventListener('click',guard,true);return()=>document.removeEventListener('click',guard,true);},[unsaved]);
 function update(next:DraftSection[]){allowExit.current=false;setSections(next);setUnsaved(true);setMessage('Cambios en el editor: guarda el borrador para conservarlos.');}
 function contentAt(index:number){const c=sections[index].content;return c&&typeof c==='object'&&!Array.isArray(c)?c as Record<string,unknown>:{};}
 function patch(index:number,part:Partial<DraftSection>){update(sections.map((s,i)=>i===index?{...s,...part}:s));}
 function content(index:number,key:string,value:unknown){patch(index,{content:{...contentAt(index),[key]:value}});}
 function add(type:string){if(sections.length>=30){setError('Máximo 30 secciones.');return;}update([...sections,{id:crypto.randomUUID(),type,title:types.find(t=>t[0]===type)?.[1]??type,enabled:true,sortOrder:sections.length*10,layout:'default',content:{}}]);}
 function move(index:number,delta:number){const next=[...sections];[next[index],next[index+delta]]=[next[index+delta],next[index]];update(next);}
 function saveDraft(){if(!site)return;try{const existing=parseDraft(localStorage.getItem(draftKey(userId,companyId,site.id)),site.id);if(JSON.stringify(existing)!==JSON.stringify(draft))throw Error('Otra pestaña cambió el borrador.');const value:SiteDraft={version:1,siteId:site.id,baseUpdatedAt:baseVersion,savedAt:new Date().toISOString(),sections:sections.map((s,i)=>({...s,sortOrder:i*10}))};const raw=JSON.stringify(value);parseDraft(raw,site.id);localStorage.setItem(draftKey(userId,companyId,site.id),raw);setDraft(value);setUnsaved(false);setError('');setMessage('Borrador guardado solo en este navegador. Tu página pública no cambió.');}catch{setError('No se guardó: el navegador no permitió escribir o el borrador cambió en otra pestaña. Conserva tus cambios aquí; nada se publicó.');}}
 function recover(){if(!draft||!site)return;if(unsaved&&!confirm('¿Reemplazar los cambios del editor con el borrador guardado?'))return;setSections(draft.sections);setBaseVersion(draft.baseUpdatedAt);setUnsaved(false);setMessage(draft.baseUpdatedAt!==site.updatedAt?'El sitio cambió desde este borrador. Puedes revisarlo, pero su publicación se bloqueará para evitar sobrescribir cambios.':'Borrador recuperado. Aún no se ha publicado.');}
 async function publish(){if(!site||busy||!previewReady)return;if(!confirm('¿Publicar estas secciones? Reemplazarán las secciones actuales y serán visibles a tus visitantes.'))return;setBusy(true);setError('');
  try{const updated=await api<StudioSite>(`site/${site.id}/sections`,{method:'PATCH',headers:{'x-yalika-confirm-live-update':'yes'},body:JSON.stringify({sections:sectionPayload(sections),expectedUpdatedAt:baseVersion,publish:true})});setSite(updated);setSections(updated.sections);setBaseVersion(updated.updatedAt);setUnsaved(false);setPreview(false);setMessage('Secciones publicadas correctamente.');
   try{const key=draftKey(userId,companyId,site.id);const stored=parseDraft(localStorage.getItem(key),site.id);if(stored&&JSON.stringify(sectionPayload(stored.sections))===JSON.stringify(sectionPayload(sections))){localStorage.removeItem(key);setDraft(null);}else{setDraft(stored);}}catch{setMessage('Publicado. No se pudo retirar el borrador local; no lo recuperes como si fuera nuevo.');}
  }catch(e){setError(e instanceof Error?e.message:'No se confirmó la publicación. Conservamos tus cambios.');}finally{setBusy(false);}}
 const retryLoad=()=>{if(unsaved&&!confirm('Hay cambios sin guardar. ¿Recargar desde el servidor y descartarlos del editor?'))return;setPreview(false);setRetry(v=>v+1);};
 return <main className={styles.page}><div className={styles.wrap}>
 <header className={styles.header}><div><p>YALEKA · MI PÁGINA</p><h1>Diseña y revisa antes de publicar</h1><p>{site?.name??'Editor de secciones'} · El diseño público es independiente del tema de Yaleka.</p></div><Link href="/sites">Diseño y catálogo</Link></header>
 <p role="alert">{error}</p><p role="status">{message}</p>
 {!site?<section className={styles.panel}><p>{error?'No se pudo abrir el sitio.':'Cargando…'}</p><button onClick={retryLoad}>Reintentar</button><Link href="/sites">Crear o abrir mi página</Link></section>:<>
 <section className={styles.panel}><div className={styles.actions}><strong>1. Edita → 2. Guarda borrador → 3. Revisa → 4. Publica</strong><span>{site.status==='published'?'Sitio publicado':'Sitio aún no publicado'}</span></div><p className={styles.muted}>El borrador se conserva en este navegador y cuenta. No se sincroniza a otro equipo. Publicar aplica únicamente las secciones; el diseño general se administra en “Diseño y catálogo”.</p>
 <div className={styles.actions}><button disabled={busy} onClick={saveDraft}>Guardar borrador local</button><button disabled={busy||!previewReady} onClick={()=>setPreview(v=>!v)}>{preview?'Volver a editar':'Vista previa sin publicar'}</button><button className={styles.primary} disabled={busy||!previewReady||!preview} onClick={()=>void publish()}>{busy?'Publicando…':'Publicar secciones'}</button>{site.status==='published'&&<a href={`/s/${encodeURIComponent(site.slug)}`} target="_blank" rel="noreferrer">Ver sitio publicado ↗</a>}</div>
 {draft&&<div className={styles.actions}><span>Borrador local: {new Date(draft.savedAt).toLocaleString('es-MX')}</span><button disabled={busy} onClick={recover}>Recuperar borrador</button></div>}
 <button disabled={busy} onClick={retryLoad}>Recargar versión del servidor</button></section>
 {preview?<section className={styles.panel}><div className={styles.actions}><h2>Vista previa privada · cambios del editor</h2><button onClick={()=>setMobile(v=>!v)}>{mobile?'Ver escritorio':'Ver celular'}</button></div><p>Enlaces y compras desactivados. El catálogo refleja los datos cargados al abrir el editor.</p><div className={styles.preview}><SitePreview mobile={mobile} data={{site:{...site,sections:sections.filter(s=>s.enabled).map((s,i)=>({...s,sortOrder:i*10}))},products,promotions}}/></div></section>:<div className={styles.layout}>
 <aside className={styles.panel}><h2>Agregar bloque</h2><p className={styles.muted}>Estos bloques aparecen después de la portada, antes del catálogo. Puedes ordenar los bloques adicionales entre sí.</p>{types.filter(([type])=>editableTypes.includes(type)).map(([type,label])=><button key={type} disabled={busy||sections.length>=30} onClick={()=>add(type)}>+ {label}</button>)}</aside>
 <div className={styles.list}>{sections.map((section,index)=>{const c=contentAt(index);if(!editableTypes.includes(section.type))return <article className={styles.panel} key={section.id}><h2>{types.find(t=>t[0]===section.type)?.[1]??({hero:'Portada',loyalty:'Fidelización',location:'Ubicación'} as Record<string,string>)[section.type]??section.type}</h2><p className={styles.muted}>Bloque de la estructura existente. Se conserva; sus detalles se administran en Diseño y catálogo.</p></article>;return <fieldset disabled={busy} key={section.id} className={styles.panel}><legend>{index+1}. {types.find(t=>t[0]===section.type)?.[1]??section.type}</legend>
 <label>Título<input maxLength={120} value={section.title??''} onChange={e=>patch(index,{title:e.target.value})}/></label>
 <div className={styles.actions}><button aria-label={`Subir sección ${index+1}`} disabled={index===0} onClick={()=>move(index,-1)}>↑ Subir</button><button aria-label={`Bajar sección ${index+1}`} disabled={index===sections.length-1} onClick={()=>move(index,1)}>↓ Bajar</button><button className={styles.danger} onClick={()=>{if(confirm('¿Quitar esta sección del borrador? El sitio publicado no cambiará hasta publicar.'))update(sections.filter((_,i)=>i!==index));}}>Quitar del borrador</button></div>
 {['text','banner'].includes(section.type)&&<label>Texto<textarea rows={4} maxLength={10000} spellCheck lang="es-MX" value={String(c.text??'')} onChange={e=>content(index,'text',e.target.value)}/></label>}
 {section.type==='banner'&&<><label>Texto del botón<input value={String(c.buttonText??'')} onChange={e=>content(index,'buttonText',e.target.value)}/></label><label>Enlace completo del botón<input type="url" placeholder="https://…" value={String(c.buttonUrl??'')} onChange={e=>content(index,'buttonUrl',e.target.value)}/></label></>}
 {section.type==='video'&&<><label>Enlace del video<input type="url" value={String(c.url??'')} onChange={e=>content(index,'url',e.target.value)}/></label><label>Descripción<input value={String(c.caption??'')} onChange={e=>content(index,'caption',e.target.value)}/></label><p>TikTok se muestra incrustado; otros enlaces se muestran como acceso al video.</p></>}
 {section.type==='gallery'&&<label>Direcciones de imágenes, una por línea (máximo 12)<textarea rows={4} value={(Array.isArray(c.images)?c.images:[]).join('\n')} onChange={e=>content(index,'images',e.target.value.split('\n').map(v=>v.trim()).filter(Boolean).slice(0,12))}/></label>}
 {section.type==='menu'&&<label>Menú: Nombre | Descripción | Precio (máximo 30)<textarea rows={6} value={(Array.isArray(c.items)?c.items:[]).map(item=>{const row=(item&&typeof item==='object'?item:{}) as Record<string,unknown>;return `${row.name??''} | ${row.description??''} | ${row.price??''}`;}).join('\n')} onChange={e=>content(index,'items',e.target.value.split('\n').filter(Boolean).slice(0,30).map(line=>{const [name='',description='',price='']=line.split('|').map(v=>v.trim());return {name,description,price};}))}/></label>}
 {['catalog','promotions','contact','hero','loyalty','location'].includes(section.type)&&<p className={styles.muted}>Este bloque usa la información existente del negocio. Sus detalles se administran en Diseño y catálogo.</p>}
 <label><input type="checkbox" checked={section.enabled} onChange={e=>patch(index,{enabled:e.target.checked})}/>Mostrar sección</label>
 </fieldset>})}</div></div>}
 </>}
 </div></main>;
}
