const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.join(__dirname,'..');
const appDir=path.join(root,'src/app/veterinaria');
const read=(p)=>fs.readFileSync(p,'utf8').replace(/\r/g,'');

function walk(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(dir,e.name)):[path.join(dir,e.name)]);}
const files=walk(appDir);
const tsx=files.filter(f=>f.endsWith('.tsx'));
const cssFile=files.find(f=>f.endsWith('veterinaria.module.css'));
const lib=path.join(root,'src/lib/yalika-veterinaria.ts');
assert(tsx.length>=5,'Faltan pantallas de Veterinaria');
assert(cssFile,'Falta veterinaria.module.css');

// 1) Cada clase usada con styles.X existe en el CSS (si no, la pantalla se ve rota sin avisar).
const css=read(cssFile);
const defined=new Set([...css.matchAll(/\.([A-Za-z][\w]*)/g)].map(m=>m[1]));
for(const f of tsx){
  for(const m of read(f).matchAll(/styles\.(\w+)/g)){
    assert(defined.has(m[1]),`${path.relative(root,f)}: clase inexistente styles.${m[1]}`);
  }
}

// 2) Todo <button> declara type (evita envíos de formulario por accidente).
function openTags(source,tag){
  const tags=[];let i=0;
  while((i=source.indexOf('<'+tag,i))!==-1){
    const next=source[i+tag.length+1];
    if(next&&/[A-Za-z0-9]/.test(next)){i+=1;continue;}
    let depth=0,j=i;
    for(;j<source.length;j++){
      const c=source[j];
      if(c==='{')depth++;else if(c==='}')depth--;
      else if(c==='>'&&depth===0&&source[j-1]!=='=')break;
    }
    tags.push(source.slice(i,j+1));i=j+1;
  }
  return tags;
}
let buttons=0;
for(const f of tsx){
  for(const tag of openTags(read(f),'button')){
    buttons++;
    assert(/\btype=/.test(tag),`${path.relative(root,f)}: <button> sin type: ${tag.slice(0,60)}`);
  }
}
assert(buttons>=10,'Se esperaban al menos 10 botones');

// 3) Sin any, sin silenciar errores de tipos, sin console.log.
for(const f of [...tsx,lib]){
  const src=read(f);
  assert(!/:\s*any\b|<any>|\bas any\b/.test(src),`${path.relative(root,f)} usa any`);
  assert(!/@ts-(ignore|nocheck|expect-error)/.test(src),`${path.relative(root,f)} silencia tipos`);
  assert(!/console\.log/.test(src),`${path.relative(root,f)} deja console.log`);
}

// 4) Páginas: dinámicas, y la ficha espera sus params (Promise en esta versión de Next).
const pages=tsx.filter(f=>path.basename(f)==='page.tsx');
assert.equal(pages.length,3);
for(const f of pages)assert(/export const dynamic = 'force-dynamic'/.test(read(f)),`${path.relative(root,f)} sin force-dynamic`);
const petPage=read(path.join(appDir,'mascotas/[id]/page.tsx'));
assert(/params: Promise<\{ id: string \}>/.test(petPage)&&/await params/.test(petPage),'La ficha debe esperar params');

// 5) Todos los enlaces internos llevan a una pantalla que existe.
const exists=(route)=>fs.existsSync(path.join(root,'src/app',route,'page.tsx'));
for(const f of tsx){
  const src=read(f);
  for(const m of src.matchAll(/href="(\/[^"?#]*)"/g))assert(exists(m[1].slice(1)),`${path.relative(root,f)}: enlace roto ${m[1]}`);
  for(const m of src.matchAll(/href=\{`(\/[^`$]*)\$\{[^}]*\}`\}/g)){
    assert(m[1]==='/veterinaria/mascotas/'&&exists('veterinaria/mascotas/[id]'),`${path.relative(root,f)}: enlace dinámico desconocido ${m[1]}`);
  }
}

// 6) La web habla con el API exactamente por las rutas que el API expone.
const controllerPath=path.join(root,'../api/src/veterinaria/veterinaria.controller.ts');
if(fs.existsSync(controllerPath)){
  const norm=(m,p)=>`${m} ${('/'+p).replace(/\/+/g,'/').replace(/\/:\w+/g,'/:p').replace(/\$\{[^}]*\}/g,':p').replace(/\/\/+/g,'/')}`;
  const apiRoutes=[...read(controllerPath).matchAll(/@(Get|Post|Patch)\('([^']*)'\)/g)].map(m=>norm(m[1].toUpperCase(),m[2]));
  const libSrc=read(lib);
  const webRoutes=[];
  const parts=libSrc.split(/request</).slice(1);
  for(const part of parts){
    const url=part.match(/>\(\s*([`'])([^`']*)\1/);
    if(!url)continue;
    const method=part.slice(0,part.search(/\n\s*(\w+):|\n\};?$/)>0?undefined:undefined).match(/method:\s*'(\w+)'/);
    webRoutes.push(norm(method?method[1]:'GET',url[2].replace(/\$\{[^}]*\}/g,':p')));
  }
  assert.deepEqual([...new Set(webRoutes)].sort(),[...new Set(apiRoutes)].sort(),'La web y el API no coinciden en rutas');
}

// 7) Mis servicios solo muestra Veterinaria si el API la ofrece; el menú del módulo existe.
const services=read(path.join(root,'src/app/servicios/services-workspace.tsx'));
assert(/id: 'veterinaria'/.test(services)&&/s\.always \|\| available\.includes\(s\.id\)/.test(services),'Mis servicios debe condicionar Veterinaria (y cada servicio) a available');
assert(/id: "veterinaria"/.test(read(path.join(root,'src/lib/module-navigation.ts'))),'Falta el menú de Veterinaria');

console.log(`VETERINARIA_PANTALLAS_OK: ${tsx.length} pantallas, ${buttons} botones con type, clases de estilo, enlaces, tipos y rutas web↔API.`);
