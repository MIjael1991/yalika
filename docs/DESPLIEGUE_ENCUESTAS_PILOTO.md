# Despliegue piloto de Encuestas

Esta configuración ejecuta la API NestJS y la web Next.js dentro de un solo
servicio para reducir el consumo del plan gratuito. PostgreSQL debe permanecer
en un proveedor externo compatible, como Supabase.

## Antes de publicar

1. Guardar el proyecto en un repositorio privado.
2. Crear un proyecto PostgreSQL y copiar su cadena de conexión con SSL.
3. Crear el servicio desde `render.yaml`.
4. Configurar `DATABASE_URL` como secreto.
5. Completar `ORION_BOOTSTRAP_ORGANIZATION`, `ORION_BOOTSTRAP_NAME`,
   `ORION_BOOTSTRAP_EMAIL` y `ORION_BOOTSTRAP_PASSWORD`. La contraseña debe
   tener al menos diez caracteres, letras y números.
6. Conservar `SURVEY_PII_KEY`: cambiarla vuelve ilegibles los datos personales
   cifrados anteriormente.
7. Cuando el primer despliegue termine, entrar con esa cuenta y retirar
   `ORION_BOOTSTRAP_PASSWORD` del servicio. La cuenta no se eliminará.

También se puede crear otra organización manualmente desde `apps/api` con
`npm run auth:create-survey-owner`.

## Límites del piloto gratuito

- Puede tardar cerca de un minuto en despertar después de un periodo sin uso.
- No ofrece garantía de disponibilidad.
- La base gratuita debe respaldarse manualmente.
- No se deben captar expedientes médicos ni información clínica sensible en
  esta etapa.

## Prueba mínima antes de entregar acceso

1. Iniciar sesión con la cuenta `Encuestas`.
2. Confirmar que solo se muestre Encuestas.
3. Intentar abrir `/pos` y verificar el regreso a `/surveys`.
4. Crear, publicar y abrir el enlace desde datos móviles.
5. Responder, finalizar y revisar el contador de resultados.
6. Cerrar sesión y confirmar que no se puede regresar sin contraseña.
