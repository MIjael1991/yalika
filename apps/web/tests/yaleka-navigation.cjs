const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const ts=require('typescript');
const source=path.join(__dirname,'../src/lib/yaleka-navigation.ts');
const compiled=ts.transpileModule(fs.readFileSync(source,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020}}).outputText;
const sandbox={exports:{}};vm.runInNewContext(compiled,sandbox);
const {searchDestinations:search,normalizeSearch,destinations}=sandbox.exports;
assert.equal(normalizeSearch('¿DÓNDE está mi catálogo?'),'donde esta mi catalogo');
assert.equal(search('donde cambio los precios',['pos'])[0].href,'/pos/productos');
assert.equal(search('mis recetas',['health'])[0].href,'/salud');
assert.equal(search('mi catálogo',['sites'])[0].href,'/sites');
assert.equal(search('recetas',[]).length,0);
assert.equal(search('precios',[]).length,0);
assert.equal(search('archivos',[])[0].href,'/estudio?tab=archivos');
assert.equal(search('movilidad',[])[0].href,'/servicios');
assert.equal(search('la de mi',[]).length,0);
assert(search('ventas productos salud archivos',['pos','health']).length<=3);
for(const item of destinations){
 const route=item.href.split('?')[0];
 assert(fs.existsSync(path.join(__dirname,'../src/app',route,'page.tsx')),'Ruta inexistente: '+route);
}
console.log('BUSCADOR_OK: acentos, intención, límites, permisos de módulos y destinos existentes.');

assert.equal(search('encuetsas',['surveys'])[0].id,'surveys');
assert.equal(search('encuetsas',['surveys'])[0].matchKind,'similar');
assert.equal(search('sondeo',['surveys'])[0].id,'surveys');
assert.equal(search('pastillas',['health'])[0].id,'health');
assert.equal(search('raspaditos',['sites'])[0].id,'sites');
assert.equal(search('descuentos',['sites'])[0].id,'sites');
assert.equal(search('me quedan pocos productos',['pos'])[0].id,'stock');
assert.equal(search('receta de pastel',['health']).length,0);
assert.equal(search('quiero comprar un submarino',['pos','health','sites','surveys']).length,0);
assert.equal(search('pastillas',[]).length,0);
assert.equal(search('encuetsas',[]).length,0);
assert(search('x'.repeat(100000),[]).length===0);
const moduleSource=fs.readFileSync(path.join(__dirname,'../src/lib/module-navigation.ts'),'utf8');
const moduleSandbox={exports:{}};
vm.runInNewContext(ts.transpileModule(moduleSource,{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,moduleSandbox);
assert.equal(moduleSandbox.exports.moduleForPath('/pos/ventas').id,'pos');
assert.equal(moduleSandbox.exports.moduleForPath('/positivo'),undefined);
for(const m of moduleSandbox.exports.moduleNavigation)for(const item of m.items){
 assert(fs.existsSync(path.join(__dirname,'../src/app',item.href.split('?')[0],'page.tsx')),'Opción sin pantalla: '+item.href);
}
console.log('PRUEBA OK: sinónimos, errores de escritura, intención de inventario, límites y menús por módulo.');
