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
