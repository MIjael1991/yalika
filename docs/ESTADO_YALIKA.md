# Estado de Yalika — 16 de octubre de 2026

Reemplaza a `ESTADO_YALIKA_20260910.md`. Es el documento de arranque: léelo primero.

## Dónde está cada cosa

- `apps/api`: servidor (NestJS + Prisma + una sola base PostgreSQL).
- `apps/web`: la aplicación web (Next.js). Es lo único público; el servidor va por dentro.
- `docs/`: este estado, la visión (`YALIKA_VISION_AND_LIFE.md`) y la última revisión (`REVISION_YALIKA.md`).
- `YALIKA_RESPALDOS\DATOS` (fuera del proyecto): datos de la página Cherry Pop Nails y respaldo de Railway del 20-sep. Es lo único que se conserva como respaldo; el código se respalda con Git.

## Módulos y su estado

| Módulo | Estado |
| --- | --- |
| Encuestas | Hecho en código. Falta probar con un cliente real y desde datos móviles. |
| Punto de venta, Web/Mi página, Apartados | En uso. Catálogos R11B-3 aplicados, multipáginas R10B. |
| Salud (clínico) | Hecho hasta R30.4. Pendiente: varias personas por cuenta (hoy es un perfil por usuario). Las mascotas van en Veterinaria. |
| Movilidad | Fases 2 a 9 en código. Fase 10F (`phase10f/policy.ts`, comisión y cancelaciones) escrita pero sin conectar. |
| Expedientes, Educación, Life, Cerebro | Life y Cerebro en la app; Expedientes y Educación en diseño. |
| Veterinaria | Solo diseño. |

## Seguridad (hecho el 16-oct)

- Incidentes, flujos, experiencias y conocimiento ya separan los datos por empresa y piden sesión.
- Movilidad fase 7 (preferencias, viaje rápido, voz): cada persona solo toca lo suyo.
- Acciones de dinero y administración de Movilidad (fases 2 a 6): solo el "operador de plataforma", definido en la variable `YALIKA_OPERATOR_USER_IDS` (IDs de usuario separados por coma). Sin la variable, nadie las puede usar.

## Administrador y cajeros (hecho el 16-oct)

- La empresa y la persona que autoriza cada venta salen siempre de la sesión. Ya no existen las variables `YALIKA_COMPANY_ID` ni `YALIKA_AUTHORIZED_USER_ID`; se pueden borrar de `.env` y de Railway.
- Rol **Cajero**: vende, cobra, cancela ventas, atiende mesas, da de alta clientes y canjea premios. No puede cambiar productos, inventario, promociones, sitios, programas de lealtad, devoluciones, descuentos manuales ni ver reportes. La lista permitida está en `apps/api/src/core/commerce-security/cashier-policy.ts` (todo lo que no aparece ahí es solo del administrador).
- Cualquier otro rol (Administrador y cuentas anteriores) conserva todo el acceso.
- El administrador crea, desactiva y cambia la contraseña de sus cajeros en la pantalla Punto de venta → Equipo (`/pos/equipo`). Al desactivar o cambiar la contraseña se cierran las sesiones abiertas del cajero.
- Descuentos: el cajero solo puede aplicar una promoción vigente de su empresa (el servidor toma de ella el tipo y el valor). Los descuentos manuales, VIP y anulaciones son del administrador.

## Pendiente, en este orden

1. Poner `YALIKA_OPERATOR_USER_IDS` en el `.env` local y en Railway.
2. (Hecho 16-oct) Movilidad fases 1 a 6: cada persona solo usa su cuenta, su perfil de conductor y sus viajes (`mobility-access.service.ts`). El PIN del viaje ya no se devuelve al conductor.
3. (Hecho 16-oct) PIN de seguridad de Movilidad: ya no se guarda. El PIN del viaje se calcula con una clave del servidor (`mobility-pin.service.ts`) y en la base solo queda una marca; el del viaje seguro se guarda con esa clave. Iniciar el viaje, comprobar el PIN y el viaje seguro comparten el límite de 5 fallos cada 10 minutos. Al arrancar, los viajes ya iniciados o terminados pierden su PIN en texto; los que aún no inician lo conservan hasta usarse. Requiere `YALIKA_PIN_SECRET` en el servidor (si falta usa `JWT_SECRET`; en producción sin ninguna de las dos no deja crear viajes).
4. (Hecho 16-oct) Red de seguridad `src/security/route-protection.spec.ts`: una prueba revisa todas las rutas y falla si alguna queda abierta sin estar declarada pública a propósito.
5. Salud es solo para personas; las mascotas van en su propio módulo (Veterinaria), sin compartir tablas. Pendiente diseñar aparte: varias personas por cuenta en Salud (familiares o cuidador). Hoy es un perfil por usuario y tocarlo afecta unos 100 puntos del código clínico.
6. Probar Encuestas con el primer cliente real.

## Base de datos

Una sola base PostgreSQL. Su esquema vive en `apps/api/prisma/schema/`, un archivo por módulo: `identidad`, `life`, `cerebro`, `clientes`, `comercio`, `web`, `encuestas`, `movilidad` y `salud` (más `base` con la conexión). Un módulo nuevo agrega su propio archivo ahí y su migración en `apps/api/prisma/migrations`. Después de cambiar el esquema: `npx.cmd prisma generate`.

Los nombres internos de la base local (`orion`, usuario `orion_user`, contenedor `orion-postgres`) se conservan: renombrarlos obliga a mover los datos.

## Variables de entorno (nombres actuales)

`YALIKA_API_URL` (web); `YALIKA_BOOTSTRAP_ORGANIZATION`, `YALIKA_BOOTSTRAP_NAME`, `YALIKA_BOOTSTRAP_EMAIL`, `YALIKA_BOOTSTRAP_PASSWORD`, `YALIKA_SESSION_HOURS`, `YALIKA_TICKET_SECRET`, `YALIKA_PIN_SECRET`, `YALIKA_PUBLIC_URL`, `YALIKA_EMAIL_FROM`, `YALIKA_PUBLIC_REGISTRATION`, `YALIKA_CLINICAL_PILOT_PRICE`, `YALIKA_OPERATOR_USER_IDS` (servidor). Antes empezaban con `ORION_` o `YALEKA_`: al desplegar en Railway hay que renombrarlas allá primero.

Identificadores que se guardan en datos y por eso conservan el nombre viejo: plantillas de página `yaleka_*`, modo `yaleka_cloud` de encuestas, prefijo `YALEKA-` de las claves de recuperación, columna `yalekaFare`, insignias `*_VERIFICADO_YALEKA`. Los enlaces `/api/orion/...` se redirigen a `/api/yalika/...`.

## Cómo comprobar que todo sigue bien

Desde `apps/api`: `npm.cmd run build` y `npm.cmd test` (hoy: 78 suites, 388 pruebas). Desde `apps/web`: `npm.cmd run build`.
