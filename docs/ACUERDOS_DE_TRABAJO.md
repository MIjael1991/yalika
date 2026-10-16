# Yalika: acuerdos de trabajo entre chats

Última verificación completa: 2026-10-16.

## Regla principal

- **Cada módulo se edita en su propio chat.** Si algo de un módulo hay que cambiarlo, se cambia ahí.
- **El chat de verificación (este) solo comprueba que todo esté conectado y funcionando.** Revisa, reporta y deja listas las piezas compartidas (sesión, roles, rutas, variables, documentación). No rediseña módulos.
- Si el chat de verificación encuentra un problema dentro de un módulo, lo anota aquí y avisa al usuario para que se lo pase al chat de ese módulo.
- Nadie toca Railway ni producción sin autorización explícita del usuario. `sistema-control` no se toca.
- Cada chat sube a git solo sus propios archivos.

## Piezas compartidas (las cuida el chat de verificación)

- Sesión y roles: cookie `yalika_session`, `SessionAuthGuard`, `tenant-policy.ts`.
- Administrador y cajeros del comercio: `cashier-policy.ts`, `commerce-access.guard.ts`, API `/team`, pantalla `/pos/equipo`.
- PIN de Movilidad: `mobility-pin.service.ts` y variable `YALIKA_PIN_SECRET`.
- Variables de entorno y `docs/ESTADO_YALIKA.md`.
- Nombres: el producto es **Yalika**. Los identificadores ya guardados en datos (`yaleka_*`, `YALEKA-`, `yalekaFare`, claves de localStorage `yaleka.*`) se quedan como están a propósito, para no romper datos existentes.

## Notas para cada módulo

**POS / Web / Apartados (comercio)**
- Usa la sesión (empresa y usuario salen de la cuenta, no de variables).
- Hay administrador y cajeros. El cajero vende, cobra y aplica promociones; todo lo demás es del administrador.
- Si agregan una ruta nueva en estas raíces, hay que decidir si el cajero puede usarla y anotarlo en `cashier-policy.ts`. Si no se agrega, queda bloqueada para el cajero (es lo seguro).
- Sitios (`/sites/*`) y Estudio: sus ediciones se hacen en su chat. Ojo: Estudio agregó dependencias (`docx`, `jspdf`) a `apps/web/package.json`; hay que correr `npm install` en `apps/web`.

**Movilidad**
- El PIN del viaje ya no se guarda; se calcula. Límite de 5 intentos fallidos cada 10 minutos.
- Pendiente de su chat: conectar `phase10f/policy.ts` (comisión y cancelaciones).

**Salud**
- Salud es para personas; las mascotas van en Veterinaria (aún solo diseño).
- Enlace roto: `salud/profesional/trust-workspace.tsx` apunta a `/salud/cuidado`, pero esa ruta no tiene página (la pantalla de cuidado vive en `/salud`). Corregir el enlace a `/salud` en el chat de Salud.
- Diseño pendiente: varias personas (familia o cuidador).

**Veterinaria**
- Solo diseño. Su chat decide el diseño; no comparte tablas con Salud sin acordarlo.

**Encuestas, Expedientes, Educación, Life, Cerebro/Asistente**
- Sin cambios en esta ronda. Todas las ediciones, en su chat.
- Encuestas: el enlace público sale de `YALIKA_PUBLIC_URL`, ya no está escrito en el código.

## Qué debe correr el usuario en su computadora

1. `apps\api`: `npx.cmd prisma generate`, `npm.cmd run build`, `npm.cmd test`.
2. `apps\web`: `npm.cmd install`, `npm.cmd run build`.
3. Dar su ID de usuario para `YALIKA_OPERATOR_USER_IDS`.
4. Probar: crear un cajero en `/pos/equipo` y hacer una venta con una promoción.

## Pendiente con autorización (Railway)

Renombrar las variables `YALIKA_BOOTSTRAP_*`, `YALIKA_SESSION_HOURS`, `YALIKA_TICKET_SECRET`, `YALIKA_PUBLIC_URL`, `YALIKA_EMAIL_FROM`, `YALIKA_PUBLIC_REGISTRATION`, `YALIKA_CLINICAL_PILOT_PRICE`; crear `YALIKA_PIN_SECRET`; confirmar `YALIKA_PUBLIC_URL`. Solo cuando el usuario lo autorice.

## Deuda conocida

- Avisos de lint antiguos: API ~1974 en 119 archivos; web en `app/salud/*`, `module-menu.tsx`, `yalika-theme.tsx`. No bloquean la compilación ni las pruebas.
