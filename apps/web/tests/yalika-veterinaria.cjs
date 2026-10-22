const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript');
const source=path.join(__dirname,'../src/lib/yalika-veterinaria.ts');
const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const sandbox={exports:{},fetch:undefined,Response:undefined};
vm.runInNewContext(compiled,sandbox);
const {formatAge,speciesLabel,sexLabel,modeLabel,statusLabel,reasonLabel,prescribableStatuses,speciesOptions,VetApiError}=sandbox.exports;

const now=new Date('2026-10-16T12:00:00Z');
assert.equal(formatAge(null,false,now),'Edad no registrada');
assert.equal(formatAge('no-es-fecha',false,now),'Edad no registrada');
assert.equal(formatAge('2027-01-01',false,now),'Edad no registrada');
assert.equal(formatAge('2026-10-01',false,now),'Menos de 1 mes');
assert.equal(formatAge('2026-09-10',false,now),'1 mes');
assert.equal(formatAge('2026-04-10',false,now),'6 meses');
assert.equal(formatAge('2020-10-16',false,now),'6 años');
assert.equal(formatAge('2020-10-17',false,now),'5 años');
assert.equal(formatAge('2020-10-16',true,now),'Aprox. 6 años');

assert.equal(speciesLabel('DOG'),'Perro');
assert.equal(speciesLabel('XYZ'),'Animal');
assert.equal(sexLabel('FEMALE'),'Hembra');
assert.equal(sexLabel(null),'');
assert.equal(modeLabel('home'),'A domicilio');
assert.equal(statusLabel('scheduled'),'Programada');
assert.equal(statusLabel('rara'),'Sin estado');

// Las especies del formulario deben coincidir con las que acepta el API.
assert.deepEqual(Array.from(speciesOptions,o=>o[0]),['DOG','CAT','BIRD','RABBIT','REPTILE','LIVESTOCK','OTHER']);
assert.deepEqual(Array.from(prescribableStatuses),['scheduled','active','completed']);

// Todo motivo de denegación conocido del API tiene texto en español propio.
for(const code of ['PROFESSION_NOT_VETERINARY','NO_PROFESSIONAL_PROFILE','NO_ESTABLISHMENT_MEMBERSHIP','MEMBERSHIP_DATE_INVALID','MEMBERSHIP_NOT_ACTIVE','MEMBERSHIP_OUTSIDE_VALIDITY','ESTABLISHMENT_INACTIVE','ESTABLISHMENT_NOT_VERIFIED','PROFESSIONAL_INACTIVE','PROFESSIONAL_NOT_VERIFIED','PRESCRIPTION_PERMISSION_NOT_GRANTED']){
  assert.notEqual(reasonLabel(code),'Falta un requisito de habilitación.',code);
}
assert.equal(reasonLabel('OTRO'),'Falta un requisito de habilitación.');

const err=new VetApiError('x',403,['A']);
assert.equal(err.status,403);assert.deepEqual(Array.from(err.reasons),['A']);

// El proxy debe dejar pasar la raíz veterinaria, y el menú debe apuntar a pantallas reales.
const proxy=fs.readFileSync(path.join(__dirname,'../src/app/api/yalika/[...path]/route.ts'),'utf8');
assert(/'veterinaria'/.test(proxy),'El proxy no permite /api/yalika/veterinaria');
for(const route of ['veterinaria','veterinaria/pro','veterinaria/mascotas/[id]']){
  assert(fs.existsSync(path.join(__dirname,'../src/app',route,'page.tsx')),'Falta pantalla: '+route);
}
console.log('VETERINARIA_WEB_OK: edad, etiquetas, motivos de denegación, proxy y pantallas.');
