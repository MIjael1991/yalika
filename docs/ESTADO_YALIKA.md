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
| Salud (clínico) | Hecho hasta R30.4. Pendiente: varias mascotas/personas por cuenta (hoy es un perfil por usuario). |
| Movilidad | Fases 2 a 9 en código. Fase 10F (`phase10f/policy.ts`, comisión y cancelaciones) escrita pero sin conectar. |
| Expedientes, Educación, Life, Cerebro | Life y Cerebro en la app; Expedientes y Educación en diseño. |
| Veterinaria | Solo diseño. |

## Seguridad (hecho el 16-oct)

- Incidentes, flujos, experiencias y conocimiento ya separan los datos por empresa y piden sesión.
- Movilidad fase 7 (preferencias, viaje rápido, voz): cada persona solo toca lo suyo.
- Acciones de dinero y administración de Movilidad (fases 2 a 6): solo el "operador de plataforma", definido en la variable `YALIKA_OPERATOR_USER_IDS` (IDs de usuario separados por coma). Sin la variable, nadie las puede usar.

## Pendiente, en este orden

1. Poner `YALIKA_OPERATOR_USER_IDS` en el `.env` local y en Railway.
2. (Hecho 16-oct) Movilidad fases 1 a 6: cada persona solo usa su cuenta, su perfil de conductor y sus viajes (`mobility-access.service.ts`). El PIN del viaje ya no se devuelve al conductor.
3. Guardar el PIN de seguridad de Movilidad cifrado (hoy se guarda en texto en la base, aunque ya solo lo ve el pasajero).
4. (Hecho 16-oct) Red de seguridad `src/security/route-protection.spec.ts`: una prueba revisa todas las rutas y falla si alguna queda abierta sin estar declarada pública a propósito.
5. Rediseño de Salud para varias mascotas o personas.
6. Probar Encuestas con el primer cliente real.

## Base de datos

Una sola base PostgreSQL. Su esquema vive en `apps/api/prisma/schema/`, un archivo por módulo: `identidad`, `life`, `cerebro`, `clientes`, `comercio`, `web`, `encuestas`, `movilidad` y `salud` (más `base` con la conexión). Un módulo nuevo agrega su propio archivo ahí y su migración en `apps/api/prisma/migrations`. Después de cambiar el esquema: `npx.cmd prisma generate`.

Los nombres internos de la base local (`orion`, usuario `orion_user`, contenedor `orion-postgres`) se conservan: renombrarlos obliga a mover los datos.

## Variables de entorno (nombres actuales)

`YALIKA_API_URL`, `YALIKA_COMPANY_ID`, `YALIKA_AUTHORIZED_USER_ID` (web); `YALIKA_BOOTSTRAP_ORGANIZATION`, `YALIKA_BOOTSTRAP_NAME`, `YALIKA_BOOTSTRAP_EMAIL`, `YALIKA_BOOTSTRAP_PASSWORD`, `YALIKA_SESSION_HOURS`, `YALIKA_TICKET_SECRET`, `YALIKA_PUBLIC_URL`, `YALIKA_EMAIL_FROM`, `YALIKA_PUBLIC_REGISTRATION`, `YALIKA_CLINICAL_PILOT_PRICE`, `YALIKA_OPERATOR_USER_IDS` (servidor). Antes empezaban con `ORION_` o `YALEKA_`: al desplegar en Railway hay que renombrarlas allá primero.

Identificadores que se guardan en datos y por eso conservan el nombre viejo: plantillas de página `yaleka_*`, modo `yaleka_cloud` de encuestas, prefijo `YALEKA-` de las claves de recuperación, columna `yalekaFare`, insignias `*_VERIFICADO_YALEKA`. Los enlaces `/api/orion/...` se redirigen a `/api/yalika/...`.

## Cómo comprobar que todo sigue bien

Desde `apps/api`: `npm.cmd run build` y `npm.cmd test` (hoy: 78 suites, 388 pruebas). Desde `apps/web`: `npm.cmd run build`.
