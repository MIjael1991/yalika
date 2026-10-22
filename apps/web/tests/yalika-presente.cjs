const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const test=require('node:test');
const ts=require('typescript');
const source=path.join(__dirname,'../src/lib/yalika-presente.ts');
const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const sandbox={exports:{},fetch:undefined,Response:undefined};
vm.runInNewContext(compiled,sandbox);
const {tradeCategories,tradeKeys,isPendingTrade,needsLicense,availabilityLabel,tradeLabel,documentOptions,missingLabel,statusLabel,curpHint,normalizeCurp,PresenteApiError,radiusOptions,urgencyOptions,urgencyLabel,requestStatusLabel,etaLabel,searchTrades}=sandbox.exports;

test('los oficios coinciden con los que acepta el API',()=>{
  const api=fs.readFileSync(path.join(__dirname,'../../api/src/presente/presente.constants.ts'),'utf8');
  const block=api.slice(api.indexOf('PRESENTE_TRADES'),api.indexOf('] as const',api.indexOf('PRESENTE_TRADES')));
  const apiTrades=[...block.matchAll(/'([A-Z_]+)'/g)].map(m=>m[1]);
  assert.deepEqual(Array.from(tradeKeys),apiTrades);
  const listOf=(name)=>{const part=api.slice(api.indexOf(name));return [...part.slice(0,part.indexOf('];')).matchAll(/'([A-Z_]+)'/g)].map(m=>m[1]);};
  assert.deepEqual(Array.from(tradeKeys).filter(isPendingTrade),listOf('PENDING_TRADES'));
  assert.deepEqual(Array.from(tradeKeys).filter(sandbox.exports.needsTitle),listOf('TITLE_TRADES'));
  assert.deepEqual(Array.from(tradeKeys).filter(needsLicense),listOf('CLINICAL_TRADES'));
  assert.equal(new Set(tradeCategories.map(c=>c.key)).size,tradeCategories.length);
  assert.equal(tradeLabel('LLANTAS'),'Llantas y vulcanizadora');
  assert.equal(tradeLabel('NO_EXISTE'),'NO_EXISTE');
});

test('las fotos pedidas son las mismas que exige el API',()=>{
  assert.deepEqual(Array.from(documentOptions,o=>o[0]),['INE_FRONT','INE_BACK','SELFIE']);
  assert.equal(documentOptions.find(o=>o[0]==='SELFIE')[2],'user');
});

test('todo lo que puede faltar tiene texto en español',()=>{
  for(const code of ['NAME','TRADES','MUNICIPALITY','SCHEDULE','CURP','CONSENT','INE_FRONT','INE_BACK','SELFIE']){
    assert.notEqual(missingLabel(code),code,code);
  }
  assert.equal(statusLabel('VERIFIED'),'Verificado');
  assert.equal(statusLabel('RARO'),'Sin estado');
});

test('aviso de CURP con la misma regla que el API',()=>{
  assert.equal(normalizeCurp(' hegg560427mvzrrl04 '),'HEGG560427MVZRRL04');
  assert.equal(curpHint('HEGG560427MVZRRL04'),'');
  assert.equal(curpHint(''),'');
  assert.match(curpHint('HEGG5604'),/18 caracteres/);
  assert.match(curpHint('HEGG560427MVZRRL05'),/último número/);
  assert.match(curpHint('HEGG560427MXXRRL04'),/formato/);
});

test('el error del API conserva lo que falta',()=>{
  const err=new PresenteApiError('x',400,['SELFIE']);
  assert.equal(err.status,400);
  assert.deepEqual(Array.from(err.missing),['SELFIE']);
});

test('rangos de km y urgencias iguales a los del API',()=>{
  const api=fs.readFileSync(path.join(__dirname,'../../api/src/presente/presente.constants.ts'),'utf8');
  const radius=api.match(/RADIUS_OPTIONS = \[([^\]]+)\]/)[1].split(',').map(v=>Number(v.trim()));
  assert.deepEqual(Array.from(radiusOptions),radius);
  const urg=api.match(/REQUEST_URGENCIES = \[([^\]]+)\]/)[1].match(/'([A-Z_]+)'/g).map(v=>v.slice(1,-1));
  assert.deepEqual(Array.from(urgencyOptions,o=>o[0]),urg);
  assert.equal(urgencyLabel('NOW'),'Ahora mismo');
});

test('textos de pedidos y tiempos',()=>{
  assert.equal(requestStatusLabel('OPEN'),'Esperando presupuestos');
  assert.equal(requestStatusLabel('EXPIRED'),'Vencido');
  assert.equal(etaLabel(25),'25 min');
  assert.equal(etaLabel(120),'2 h');
  assert.equal(etaLabel(90),'1 h 30 min');
  assert.equal(etaLabel(1440),'1 día');
  assert.equal(etaLabel(4320),'3 días');
});

test('horario en palabras',()=>{
  assert.equal(availabilityLabel({days:[1,2,3,4,5],allDay:false,from:'08:00',to:'20:00'}),'Lunes a viernes, 8:00 a 20:00');
  assert.equal(availabilityLabel({days:[1,2,3,4,5,6,7],allDay:true,from:null,to:null}),'Todos los días, 24 horas');
  assert.equal(availabilityLabel({days:[1,3,5],allDay:false,from:'09:00',to:'14:00'}),'Lun, Mié y Vie, 9:00 a 14:00');
  assert.equal(availabilityLabel({days:[6],allDay:false,from:'22:00',to:'06:00'}),'Sábado, 22:00 a 6:00');
  assert.equal(availabilityLabel(null),'Sin horario');
});

test('trabajo en curso: etapas, fotos y oficios por pedido iguales al API',()=>{
  const {jobSteps,photoKindOptions,MAX_TRADES_PER_REQUEST}=sandbox.exports;
  const api=fs.readFileSync(path.join(__dirname,'../../api/src/presente/presente.constants.ts'),'utf8');
  const list=(name)=>api.match(new RegExp(name+" = \\[([^\\]]+)\\]"))[1].match(/'([A-Z_]+)'/g).map(v=>v.slice(1,-1));
  assert.deepEqual(Array.from(jobSteps,s=>s[0]),list('JOB_STATUSES'));
  assert.deepEqual(Array.from(photoKindOptions,s=>s[0]),list('PHOTO_KINDS'));
  assert.equal(MAX_TRADES_PER_REQUEST,Number(api.match(/MAX_TRADES_PER_REQUEST = (\d+)/)[1]));
});

test('estrellas, mapas y municipio más cercano',()=>{
  const {ratingLabel,mapsLinks,nearestMunicipality}=sandbox.exports;
  assert.equal(ratingLabel({average:null,count:0}),'Nuevo, sin calificaciones');
  assert.equal(ratingLabel({average:4.5,count:12}),'4.5 ★ (12)');
  const links=mapsLinks(19.7033,-101.192);
  assert.match(links.google,/google\.com\/maps\/dir\/\?api=1&destination=19\.703300,-101\.192000/);
  assert.match(links.waze,/waze\.com\/ul\?ll=19\.703300,-101\.192000&navigate=yes/);
  const list=[{code:'16053',lat:19.70338,lng:-101.19205},{code:'16088',lat:19.79567,lng:-101.17639},{code:'16102',lat:19.42089,lng:-102.0628}];
  assert.equal(nearestMunicipality(list,{lat:19.71,lng:-101.2}).code,'16053');
  assert.equal(nearestMunicipality(list,{lat:19.43,lng:-102.05}).code,'16102');
  assert.equal(nearestMunicipality([],{lat:0,lng:0}),null);
});

test('horario igual que el API, fecha legible y enlaces de salud',()=>{
  const {isWithinAvailability,dateTimeLabel,careLinks}=sandbox.exports;
  const weekdays={days:[1,2,3,4,5],allDay:false,from:'08:00',to:'20:00'};
  assert.equal(isWithinAvailability(weekdays,new Date('2026-10-19T16:00:00Z')),true);  // lunes 10:00 México
  assert.equal(isWithinAvailability(weekdays,new Date('2026-10-20T03:00:00Z')),false); // lunes 21:00
  assert.equal(isWithinAvailability(weekdays,new Date('2026-10-25T16:00:00Z')),false); // domingo
  const nights={days:[5],allDay:false,from:'22:00',to:'06:00'};
  assert.equal(isWithinAvailability(nights,new Date('2026-10-24T09:00:00Z')),true);    // sábado 03:00
  assert.equal(isWithinAvailability(null,new Date()),false);
  assert.match(dateTimeLabel('2026-10-20T16:00:00Z'),/martes.*20.*octubre/);
  assert.equal(careLinks.HEALTH.client.href,'/salud/qr');
  assert.equal(careLinks.VET.worker.href,'/veterinaria/pro');
  for(const href of ['salud/qr','salud/profesional','veterinaria','veterinaria/pro']){
    assert.ok(fs.existsSync(path.join(__dirname,'../src/app',href,'page.tsx')),href);
  }
});

test('el buscador encuentra por nombre o palabras parecidas, sin acentos',()=>{
  const keys=(q,o)=>searchTrades(q,o).map(([k])=>k);
  assert.equal(keys('clases de guitarra')[0],'CLASES_MUSICA');
  assert.ok(keys('pan dulce').includes('PAN'));
  assert.equal(keys('pan').join(),'PAN');
  assert.ok(keys('plomer').includes('PLOMERIA'));
  assert.ok(keys('PLOMERÍA').includes('PLOMERIA'));
  assert.ok(keys('fuga de agua').includes('PLOMERIA'));
  assert.ok(keys('tamales').includes('COMIDA_CASERA'));
  assert.equal(keys('de la').length,0);
  assert.equal(keys('ambulancia',{hidePending:true}).length,0);
  assert.equal(keys('abogado',{hidePending:true})[0],'ABOGADO');
  assert.ok(!keys('otro').includes('OTRO'));
});

test('secciones separadas: profesionales, casa, carro, tecnología y familia no se revuelven',()=>{
  const {tradeGroups}=sandbox.exports;
  const group=(key)=>tradeCategories.find(c=>c.trades.some(([k])=>k===key)).group;
  assert.equal(group('LLANTAS'),'carro');
  assert.equal(group('CERRAJERIA'),'casa');
  assert.equal(group('PLOMERIA'),'casa');
  assert.equal(group('MEDICO'),'profesional');
  assert.equal(group('ABOGADO'),'profesional');
  assert.equal(group('PROGRAMACION'),'tecnologia');
  assert.equal(group('INGENIERIA_CIVIL'),'profesional');
  assert.deepEqual(Array.from(tradeGroups,g=>g.key),['profesional','casa','carro','tecnologia','otros','personal']);
  assert.equal(group('CLASES_MANEJO'),'personal');
  for(const c of tradeCategories) assert.ok(tradeGroups.some(g=>g.key===c.group),c.key);
});

test('encuentra programación de sistemas, páginas web y clases de manejo',()=>{
  const keys=(q)=>Array.from(searchTrades(q),t=>t[0]);
  assert.deepEqual(keys('ingenieros').sort(),['INGENIERIA_CIVIL','INGENIERIA_ELECTRICA','INGENIERIA_INDUSTRIAL','INGENIERIA_MECANICA']);
  assert.deepEqual(keys('ingeniero industrial'),['INGENIERIA_INDUSTRIAL']);
  assert.deepEqual(keys('ingeniería'),keys('ingenieros'));
  assert.equal(keys('panadero')[0],'PAN');
  assert.equal(keys('postres')[0],'PAN');
  assert.equal(keys('contadora')[0],'CONTADOR');
  assert.equal(keys('arquitectos')[0],'ARQUITECTURA');
  assert.equal(searchTrades('programación de sistemas')[0][0],'PROGRAMACION');
  assert.equal(searchTrades('pagina web')[0][0],'PROGRAMACION');
  assert.equal(searchTrades('clases de manejo')[0][0],'CLASES_MANEJO');
  assert.equal(searchTrades('vidrio de ventana')[0][0],'VIDRIOS_ALUMINIO');
  assert.equal(searchTrades('vulcanizadora')[0][0],'LLANTAS');
});

test('dado de baja tiene su texto y hay nombres rápidos para lugares',()=>{
  const {PLACE_LABELS,MAX_REQUEST_PHOTOS}=sandbox.exports;
  assert.match(statusLabel('WITHDRAWN'),/guardado/);
  assert.deepEqual(Array.from(PLACE_LABELS),['Casa','Casa de mamá','Oficina']);
  const api=fs.readFileSync(path.join(__dirname,'../../api/src/presente/presente.constants.ts'),'utf8');
  assert.match(api,new RegExp(`MAX_REQUEST_PHOTOS = ${MAX_REQUEST_PHOTOS};`));
});

test('cómo va el pedido, en pocas palabras',()=>{
  const {trackingText,minutesLeftLabel,isTrackable}=sandbox.exports;
  const now=new Date('2026-10-21T15:00:00Z');
  const base={id:'r',trades:['LLANTAS'],direct:false,scheduledFor:null,quotesCount:0,placeLabel:null,createdAt:now.toISOString(),providerName:'Vulcanizadora El Rayo',arriveBy:null,arrivedAt:null,endAt:null,finishedAt:null,clientConfirmedAt:null};
  assert.equal(minutesLeftLabel(new Date('2026-10-21T15:10:00Z'),now),'10 min');
  assert.equal(minutesLeftLabel(new Date('2026-10-21T16:05:00Z'),now),'1 h 5 min');
  assert.equal(minutesLeftLabel(new Date('2026-10-21T14:58:00Z'),now),'unos momentos');
  assert.equal(trackingText({...base,status:'OPEN'},now).title,'Esperando presupuestos');
  assert.equal(trackingText({...base,status:'OPEN',quotesCount:2},now).title,'2 presupuestos');
  assert.equal(trackingText({...base,status:'EN_ROUTE',arriveBy:'2026-10-21T15:10:00Z'},now).title,'Llega aprox. en 10 min');
  assert.match(trackingText({...base,status:'ARRIVED'},now).detail,/PIN/);
  assert.ok(isTrackable({status:'EN_ROUTE',clientConfirmedAt:null}));
  assert.ok(isTrackable({status:'COMPLETED',clientConfirmedAt:null}));
  assert.ok(!isTrackable({status:'COMPLETED',clientConfirmedAt:now.toISOString()}));
  assert.ok(!isTrackable({status:'CANCELLED',clientConfirmedAt:null}));
});

test('la cuota por cancelar se avisa con las mismas reglas del API',()=>{
  const api=fs.readFileSync(path.join(__dirname,'../../api/src/presente/presente.constants.ts'),'utf8');
  const num=(name)=>Number(api.match(new RegExp(`${name} = (\\d+)`))[1]);
  const {CANCEL_RULES,cancelFeeCap,cancelRuleText,cancelQuestion}=sandbox.exports;
  assert.equal(CANCEL_RULES.perKmMxn,num('CANCEL_FEE_PER_KM_MXN'));
  assert.equal(CANCEL_RULES.minMxn,num('CANCEL_FEE_MIN_MXN'));
  assert.equal(CANCEL_RULES.maxPct,num('CANCEL_FEE_MAX_PCT'));
  assert.equal(CANCEL_RULES.maxMxn,num('CANCEL_FEE_MAX_MXN'));
  assert.equal(CANCEL_RULES.freeMinutes,num('FREE_CANCEL_MINUTES'));
  assert.equal(CANCEL_RULES.lateFreeMinutes,num('LATE_FREE_MINUTES'));
  assert.equal(cancelFeeCap(600),150);
  assert.equal(cancelFeeCap(5000),250);
  assert.match(cancelRuleText(600),/\$15 por km/);
  assert.match(cancelQuestion(90,'ON_THE_WAY','Juan'),/pagas \$90 a Juan/);
  assert.match(cancelQuestion(0,null),/gratis/);
});

test('factura y avisos de retraso con las mismas reglas del API',()=>{
  const api=fs.readFileSync(path.join(__dirname,'../../api/src/presente/presente.constants.ts'),'utf8');
  const dom=fs.readFileSync(path.join(__dirname,'../../api/src/presente/presente-invoice.domain.ts'),'utf8');
  const {MAX_DELAY_NOTICES,IVA_PCT,ivaFor,gpsEta,FISCAL_REGIMES,CFDI_USES}=sandbox.exports;
  assert.equal(MAX_DELAY_NOTICES,Number(api.match(/MAX_DELAY_NOTICES = (\d+)/)[1]));
  assert.equal(IVA_PCT,Number(dom.match(/IVA_PCT = (\d+)/)[1]));
  assert.equal(ivaFor(500),80);
  for(const [code] of FISCAL_REGIMES) assert.ok(dom.includes(`'${code}'`),code);
  for(const [code] of CFDI_USES) assert.ok(dom.includes(`'${code}'`),code);
  const eta=gpsEta({lat:19.70,lng:-101.19},{lat:19.70+5/111.2,lng:-101.19});
  assert.equal(eta.km,5);
  assert.equal(eta.minutes,10);
});
