# Estado de Yaleka — 16 de octubre de 2026

Reemplaza a `ESTADO_ORION_20260910.md`. Es el documento de arranque: léelo primero.

## Dónde está cada cosa

- `apps/api`: servidor (NestJS + Prisma + una sola base PostgreSQL).
- `apps/web`: la aplicación web (Next.js). Es lo único público; el servidor va por dentro.
- `docs/`: este estado, la visión (`ORION_VISION_AND_LIFE.md`) y la última revisión (`REVISION_YALEKA.md`).
- `YALEKA_RESPALDOS\DATOS` (fuera del proyecto): datos de la página Cherry Pop Nails y respaldo de Railway del 20-sep. Es lo único que se conserva como respaldo; el código se respalda con Git.

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
- Acciones de dinero y administración de Movilidad (fases 2 a 6): solo el "operador de plataforma", definido en la variable `YALEKA_OPERATOR_USER_IDS` (IDs de usuario separados por coma). Sin la variable, nadie las puede usar.

## Pendiente, en este orden

1. Poner `YALEKA_OPERATOR_USER_IDS` en el `.env` local y en Railway.
2. Movilidad fases 2 a 6: los endpoints de usuario (billetera, viajes, contactos de confianza) todavía confían en el ID que manda el cliente; deben usar la sesión.
3. Guardar el PIN de seguridad de Movilidad cifrado (hoy se guarda en texto) y limitar intentos.
4. Que `CommerceAccessGuard` niegue por defecto en vez de tener lista de rutas permitidas.
5. Rediseño de Salud para varias mascotas o personas.
6. Probar Encuestas con el primer cliente real.

## Cómo comprobar que todo sigue bien

Desde `apps/api`: `npm.cmd run build` y `npm.cmd test` (hoy: 78 suites, 388 pruebas). Desde `apps/web`: `npm.cmd run build`.
