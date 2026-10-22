# Veterinaria R1: entrega

Fecha: 2026-10-17. Módulo propio, separado de Salud. Las mascotas no usan el perfil clínico de las personas.

## Qué incluye R1

- Cada mascota tiene su propia ficha (`VetPet`) y sus tutores (`VetPetGuardian`): un tutor principal y, en la tabla, cotutores.
- Consultas de la mascota, con veterinario asignado por correo (opcional).
- Recetas emitidas solo por el veterinario asignado, con habilitación verificada (R30).
- Bitácora de lo que se hace (`VetAuditEvent`).
- Pantallas en la web para el tutor y para el veterinario.

No incluye todavía: búsqueda de veterinarios, urgencias, clínicas, QR, pagos, Life ni la "puerta" del asistente.

## Reglas de seguridad

- Cada ruta del API pide sesión. La identidad sale de la sesión, nunca de lo que mande la pantalla.
- Solo ve o toca una mascota quien es su tutor vigente. Si no, el API responde "no encontrada" (no revela si existe).
- Solo el tutor principal edita los datos. Un cotutor ve.
- Receta: veterinario asignado a esa consulta, consulta en estado válido, profesión veterinaria, perfil verificado y activo, con permiso de recetar, y establecimiento y pertenencia vigentes. Cada denegación queda en la bitácora con sus motivos.
- Una clave repetida al emitir receta devuelve la misma receta, no crea otra.
- Los datos que llegan se validan y no aceptan campos de más (no se puede mandar dueño, estado ni veterinario por id).
- Encendido: en producción el módulo responde "no habilitado" hasta poner `YALIKA_VETERINARIA_ENABLED=true`. Solo responde a cuentas con módulo `all` o `veterinaria`.

## Dónde está

API (`apps/api`):
- `prisma/schema/veterinaria.prisma` (6 modelos) y migración `20261016180000_veterinaria_r1` (solo crea tablas `vet_*`).
- `src/veterinaria/` (dominio, servicio, controlador, DTO, guard, módulo y pruebas).
- `src/app.module.ts`: registra `VeterinariaModule`.

Web (`apps/web`):
- `src/app/veterinaria/` (lista de mascotas, ficha `mascotas/[id]`, panel `pro`, estilos y aviso de error de carga).
- `src/lib/yalika-veterinaria.ts` (conexión con el API y textos).
- Cambios mínimos en archivos compartidos: `api/yalika/[...path]/route.ts` (permite la raíz `veterinaria`), `lib/module-navigation.ts` (menú del módulo) y `servicios/services-workspace.tsx` (tarjeta, solo si el API la ofrece).

Rutas del API (todas bajo `/veterinaria`): `POST/GET pets`, `GET/PATCH pets/:petId`, `POST/GET pets/:petId/consultations`, `GET pets/:petId/prescriptions`, `GET vet/consultations`, `POST vet/consultations/:id/prescriptions`.

Pantallas: `/veterinaria`, `/veterinaria/mascotas/[id]`, `/veterinaria/pro`.

## Qué se comprobó (17-oct)

- API: 62 pruebas en 6 archivos (validación de datos, esquema contra migración, rutas y guards, servicio, dominio, guard de encendido). Corridas en un entorno aislado con un ejecutor mínimo; las 24 del servicio y del dominio corrieron además con Jest real en la PC. **Falta confirmar las 62 con Jest real**: `.\node_modules\.bin\jest.cmd --runInBand --no-coverage --testPathPatterns=src/veterinaria/` en `apps/api`.
- Web: pruebas `yalika-veterinaria.cjs` y `yalika-veterinaria-pantallas.cjs` pasan; `next build` compila; `tsc` y ESLint limpios en lo de Veterinaria.
- Las pruebas se validaron provocándoles fallos a propósito (14 casos), y cada uno fue detectado.
- Revisión en el navegador con el API y la web corriendo, con una cuenta: alta, edición, consulta, errores y 9 casos de seguridad. Todo respondió como se diseñó.
- Migración aplicada solo en la base local `orion`.

## Pendiente

1. Probar con una segunda cuenta: que no vea la mascota de otra, y todo el flujo del veterinario (verlo en su panel, denegación con motivos, receta permitida con perfil verificado en Salud).
2. Chat del Asistente: ofrecer `'veterinaria'` en `availableModules` y en `valid` de `assistant-preference.service.ts`, solo si `YALIKA_VETERINARIA_ENABLED` está activo. Sin eso la tarjeta no sale en "Mis servicios". Después, la entrada en el menú lateral general (`yalika-sidebar.tsx`).
3. Chat de Salud: que `issueConsultationPrescription` aplique R30 (hoy no lo hace) y que las consultas `PET` y `LIVESTOCK` de Salud remitan a Veterinaria.
4. Invitar cotutores (la tabla ya lo permite, falta el flujo).
5. Registro de módulos activos: cuando exista, sumar `veterinaria` a la lista de la sesión.
6. Puerta del asistente (por ejemplo "vacuna próxima"): cuando la pidan.
7. Producción (Railway): aplicar la migración con `prisma migrate deploy` y poner `YALIKA_VETERINARIA_ENABLED=true`, solo con autorización del dueño.
8. Subir a git solo lo de Veterinaria; en los archivos compartidos usar `git add -p`.
9. R2 en adelante: búsqueda de veterinarios, urgencias, clínicas, QR, Life.

## Decisión de diseño

Se eligieron tablas veterinarias separadas, en vez de colgar a la mascota del perfil clínico humano. `ClinicalProfile` es único por usuario y todo lo clínico cuelga de él: reutilizarlo habría mezclado recetas y eventos de animales con los de la persona. Salud humana no se tocó.
