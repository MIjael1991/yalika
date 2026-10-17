# Yalika: una sola app, módulos por persona y asistente

Fecha: 2026-10-16. Documento de diseño. No cambia código por sí solo. Cada punto se implementa en el chat del módulo que le toca.

## Idea

- Yalika es **una sola app**. No son varias apps separadas.
- Cada persona o negocio tiene **solo los módulos que usa**. Con eso, la misma app se convierte en "su" app: el menú, el asistente y la app instalada muestran solo lo suyo.
- El **asistente** es la capa que va encima de los módulos. Aprende de la persona, pone recordatorios, alarmas y tareas repetidas, se vincula con calendarios y sugiere. Responde con lo que la persona tenga activado.

Ejemplos de lo que debe poder contestar:
- Con tienda: "¿cuánto vendí ayer?"
- Con Salud: "te quedan 3 días de tu medicina" o "tienes una consulta mañana".
- Con Veterinaria: "a tu perro le toca vacuna el jueves".
- Sin tienda, el asistente no pregunta ni muestra nada de ventas.

## Cómo está hoy (verificado el 2026-10-16)

- La app es instalable (PWA: `manifest.ts`, `sw.js`, `yalika-pwa.tsx`). Tiene un solo nombre y abre en `/life`.
- Cada persona guarda qué módulos quiere **ver** (`AssistantPreference.visibleModules`). Es solo una preferencia de pantalla.
- **No existe todavía** un registro de qué módulos **tiene activados** una persona o negocio. `modulesForRole` da `['all']` a toda cuenta normal y `['surveys']` solo al rol "encuestas".
- Existen Life (tareas, repeticiones, recordatorios), resumen del día, asistente del negocio (ventas e inventario) y reconocimiento de frases como "recuérdame…".
- No encontré: alarmas reales, vínculo con calendarios externos, aprendizaje de gustos o enfermedades, ni lectura de Salud, Veterinaria o Movilidad por parte del asistente.

## Diseño propuesto

1. **Módulos activos por cuenta/empresa.**
   Un registro simple: qué módulos tiene activados esa cuenta o empresa. Lo lee el login y viaja en la sesión (`modules`), igual que hoy.
   - El menú, las rutas y el API respetan ese registro. Un módulo no activado ni aparece ni responde.
   - "Ver" (preferencia) se queda como un filtro **dentro** de lo activado.
   - Los roles (administrador, cajero) siguen dentro de cada módulo.
2. **Una puerta por módulo hacia el asistente.**
   Cada módulo expone un resumen corto y sin datos innecesarios (por ejemplo "ventas de ayer: $X", "medicina para 3 días", "vacuna el jueves"). El asistente nunca lee las tablas de otro módulo directamente.
3. **Permiso por módulo, y más estricto para Salud.**
   El asistente solo usa un módulo si está activado. Para Salud, además, solo con permiso expreso de la persona, y con registro de cuándo se usó.
4. **La app instalada se adapta.**
   El nombre y el icono siguen siendo Yalika. Al abrir, la pantalla de inicio y el menú salen de los módulos activos de esa persona. Si no tiene tienda, no hay POS.
5. **El asistente aprende de la persona.**
   Con permiso: horarios, recordatorios que usa, módulos que usa más. Se puede ver y borrar.

## Una cuenta, varios negocios (invitación por correo)

Idea del usuario: todas las personas descargan la misma app Yalika. Un administrador da permisos de su boutique o tienda a otra persona usando su correo, y esa persona ya puede ser cajero. Así todo queda conectado en un solo servicio.

**Cómo está hoy**
- Cada cuenta pertenece a **una sola empresa** y tiene **un solo rol** (`User.companyId`, `User.roleId`).
- Los cajeros de hoy son cuentas que el administrador crea con contraseña dentro de su empresa (`/team`). Funciona, pero esa persona no puede usar la misma cuenta para sus cosas personales.
- Invitar por correo (`SiteMember`) solo funciona con cuentas de la **misma** empresa.

**Cómo debería ser**
1. **Cuenta personal única.** Cada persona tiene su cuenta Yalika, con sus módulos personales (Mi día, Salud, Estudio…).
2. **Membresías.** Una persona puede pertenecer a varios negocios con un rol distinto en cada uno (administrador de su tienda, cajero en la boutique de otra persona).
3. **Invitación por correo.** El administrador escribe el correo y elige el rol (cajero) y a qué boutique o tienda tiene acceso.
   - Si la persona ya tiene cuenta, ve la invitación al entrar y la **acepta**. Nunca se une sola.
   - Si no tiene cuenta, el correo la lleva a crearla y luego acepta.
   - La invitación caduca. El administrador puede cancelarla o retirar el acceso. La persona puede salirse.
4. **Negocio activo.** La sesión trabaja con un solo negocio a la vez. Al entrar o cambiar de negocio, el menú, los permisos y el API usan el rol de ese negocio (el cajero sigue limitado por `cashier-policy.ts`).
5. **Privacidad.** El administrador de un negocio nunca ve los módulos personales de la persona invitada (Salud, Mi día, memoria del asistente). Solo ve lo que ella hace en su negocio (ventas, cobros).
6. **Boutique o tienda concreta.** El permiso puede limitarse a un sitio o tienda de la empresa, no solo a toda la empresa. Por revisar: que las ventas y los reportes se puedan filtrar por tienda.
7. **Lo que hoy funciona se conserva.** Los cajeros creados con contraseña siguen valiendo, para quien no tenga correo o cuenta propia. Los datos actuales se convierten en la primera membresía de cada persona, sin perder nada.

**Lo que hay que tocar (chat de verificación, porque es identidad y sesión)**
- Tabla de membresías e invitaciones; la sesión guarda el negocio activo.
- `AuthContext`: de dónde sale `companyId` y el rol (hoy de la cuenta; mañana de la membresía activa).
- Pantalla para invitar, aceptar y cambiar de negocio.
- Pruebas: una persona no puede entrar a un negocio sin aceptar; un cajero no ve datos de otro negocio ni los personales del administrador.

**Orden sugerido:** primero el registro de módulos activos, después las membresías y las invitaciones.

## Memoria propia del asistente

1. Una memoria **por persona**, no por módulo.
2. Dos tipos de datos: lo que la persona **confirma** (se guarda directo) y lo que el asistente **deduce** (queda como sugerencia hasta que la persona la acepte).
3. Siempre visible, editable y borrable: pantalla "Lo que sé de ti".
4. Con permiso por módulo; Salud aparte, con permiso expreso y registro de uso.
5. Nunca guarda sin que se pida: datos de pago, contraseñas ni detalles de salud no autorizados.
6. Se usa para sugerir y para no preguntar lo mismo dos veces.
7. Ya existe una base: `BusinessAssistantMemory` (clave y valor por persona y empresa, con origen y estado) y `AssistantPreference`. Falta lo que se aprende del uso.
8. Por decidir: cada persona solo ve la suya y el administrador no ve la de sus cajeros (propuesta); cuánto tiempo se guarda lo deducido.

## Quién hace qué

- **Chat de Cerebro/Asistente:** el asistente, los recordatorios, las alarmas, los calendarios y el aprendizaje.
- **Chat de cada módulo:** su puerta hacia el asistente (el resumen corto) y su activación.
- **Chat de verificación:** el registro de módulos activos, la sesión y que todo esté conectado. Se hace cuando el usuario lo apruebe.
- Ningún cambio de producción sin autorización del usuario.

## Orden sugerido

1. Registro de módulos activos y su efecto en menú y API.
2. Una puerta de ejemplo (POS: ventas de ayer) y que el asistente la use.
3. Resto de puertas: Salud (con permiso), Veterinaria, Movilidad.
4. Alarmas y vínculo con calendarios.
5. Aprendizaje de gustos.


## Permisos finos por persona (devoluciones, cambios y reembolsos)

Hoy los permisos son por nombre de rol: el cajero vende y cobra; devoluciones, cambios y reembolsos son solo del administrador y no se pueden dar a un cajero en particular.

Propuesta:
1. El administrador activa, **por persona y por tienda**, permisos sueltos: vender y cobrar, aplicar promociones, descuentos manuales, devoluciones, cambios, reembolsos, ver reportes, productos e inventario.
2. Reembolsos con **monto máximo** por persona; por encima de ese monto necesita aprobación del administrador.
3. "Cajero" y "Administrador" quedan como plantillas de estos permisos (el cajero actual conserva exactamente lo que tiene hoy).
4. **Bitácora**: cada devolución, cambio, reembolso o cambio de permisos queda con quién, cuándo y por qué.
5. El servidor valida contra el negocio activo y la membresía, nunca contra lo que mande la pantalla.
6. El POS adapta sus pantallas en su chat; el chat de verificación pone la base (membresías, negocio activo, permisos).

Riesgo a vigilar: casi todo el código de comercio usa hoy el `companyId` único de la sesión; el cambio debe mantenerlo como "negocio activo" para no abrir fugas entre negocios.

## Memoria propia del asistente (acordado 2026-10-17)

Ya existe una base: `BusinessAssistantMemory` (clave y valor por persona y empresa, con origen y estado) y `AssistantPreference` (nombre, voz, módulos visibles). Falta que aprenda de lo que la persona hace.

1. Una memoria por persona, no por módulo: lo que hace seguido y lo que prefiere.
2. Dos tipos de datos: los que la persona confirma se guardan directo; los que el asistente deduce se guardan como sugerencia y la persona los acepta o descarta.
3. Siempre visible, editable y borrable: pantalla "Lo que sé de ti".
4. Permiso por módulo: solo aprende de módulos activados y permitidos. Salud va aparte, con permiso expreso y registro de cuándo se usó.
5. Nunca guarda sin que se pida: datos de pago, contraseñas ni detalles de salud no autorizados.
6. Se usa para sugerir y para no preguntar dos veces lo mismo.
7. Pendientes: cada persona ve solo su memoria (el administrador no ve la de sus cajeros) y cuánto tiempo se guarda lo que el asistente deduce.

## Negocios, equipos y aprobaciones (propuesta 2026-10-17)

Idea del dueño: todas las personas descargan Yalika. El administrador da permisos de su boutique o tienda a otras personas, usando su correo. Quien recibe el permiso puede ser cajero con los permisos que el administrador le dé: ventas, devoluciones, cambios, reembolsos. Un reembolso llega como aviso al administrador, que lo aprueba. Si un cajero sin permiso tiene un imprevisto, puede pedir la aprobación en el momento.

Cómo está hoy (verificado):
- Una persona pertenece a **un solo negocio** (`User.companyId`).
- El administrador **crea** la cuenta del cajero con una contraseña; no hay invitación por correo a alguien que ya tiene Yalika.
- Hay **un solo rol Cajero** para todo el negocio. Devoluciones, cambios y reembolsos son solo del administrador.
- Existe `SiteMember` (acceso por sitio: boutique o tienda, con rol y estado) y hay un patrón de invitaciones en Salud (`ClinicalProfessionalInvitation`) que se puede reutilizar.
- **No hay** flujo de aprobación ni avisos dentro del comercio. Sí hay envío de correo (Resend) y una bandeja de avisos en Movilidad que sirve de modelo.

Diseño propuesto:
1. **Invitación por correo.** El administrador escribe el correo; la persona acepta desde su Yalika y queda como miembro del negocio y de las boutiques o tiendas que el administrador elija. Si no tiene cuenta, se invita a crearla.
2. **Una persona, varios negocios.** Tabla de membresías (persona, negocio, sitios, permisos, estado) y selector de negocio al entrar. Es un cambio de base de datos y de sesión: lo hace el chat de verificación.
3. **Permisos sueltos, con plantillas.** En lugar de un rol fijo: vender, aplicar promociones, devoluciones, cambios, reembolsos, ver reportes. "Cajero" es una plantilla y el administrador activa o quita permisos por persona y por sitio.
4. **Solicitud de aprobación.** Sin permiso, el cajero pulsa "Pedir aprobación" (venta, motivo, monto). Queda pendiente, el administrador recibe el aviso y aprueba o rechaza. Al aprobar, se ejecuta o se autoriza una sola vez, con vencimiento corto. Todo queda en bitácora (quién pidió, quién aprobó, cuándo, monto).
5. **Avisos.** Primero dentro de la app y por correo; avisos al teléfono cuando exista la versión de tienda. El administrador puede definir un monto bajo el cual no necesita aprobar.
6. **Dinero:** el reembolso real (devolver dinero) solo se ejecuta tras la aprobación o con permiso explícito; nunca por el cajero sin ninguna de las dos.

Orden sugerido: (a) membresías y permisos sueltos, (b) invitación por correo, (c) solicitud de aprobación y bitácora, (d) avisos. Se hace en el chat de verificación para la sesión y los permisos, y en el chat de POS para las pantallas de caja.
