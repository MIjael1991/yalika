# Presente P1: registro, verificación y Presente/Ausente

Fecha: 2026-10-18. Diseño completo del módulo: documento "Yalika Presente: diseño del módulo de servicios".

## Qué hace

- Quien quiere trabajar llena sus datos (nombre, oficios, zona, horario) y su CURP.
- La CURP se revisa (forma, dígito verificador, fecha) y debe ser de mayor de edad. Se guarda cifrada, con una huella para que no se registre dos veces, y solo se muestran los últimos 4.
- Da permiso expreso para usar su foto y sube INE de frente, INE por detrás y selfie.
- Las fotos se cifran antes de guardarse en el almacenamiento privado (R2, sin dirección pública).
- Manda su registro a revisión. El operador (`YALIKA_OPERATOR_USER_IDS`) ve los datos y las fotos en `/presente/operador`, y aprueba o rechaza con motivo.
- Al decidir, **las fotos se borran**; solo queda el resultado. Retirar el permiso borra la selfie. Darse de baja borra datos y fotos.
- Ya verificado, el trabajador usa el botón grande Presente/Ausente. Si no da señales en 30 minutos, cuenta como Ausente.
- Todo queda en bitácora (`presente_audit_events`), sin CURP ni fotos.

## Archivos

- API: `prisma/schema/presente.prisma`, migración `20261019010000_presente_p1`, carpeta `src/presente/` (4 archivos de pruebas, 36 pruebas).
- Web: `src/app/presente/` (`/presente`, `/presente/trabajo`, `/presente/operador`), `src/lib/yalika-presente.ts`, `tests/yalika-presente.cjs`.
- Compartidos (una línea cada uno): `apps/api/src/app.module.ts` (registra `PresenteModule`) y `apps/web/src/app/api/yalika/[...path]/route.ts` (permite `presente`). Ojo: estos dos archivos también tienen cambios pendientes de Veterinaria.

## Variables

- `YALIKA_PRESENTE_ENABLED=true`: en producción el módulo está apagado sin ella.
- `YALIKA_PRESENTE_KEY`: clave de 32 bytes (64 caracteres hex). Obligatoria en producción. Si se pierde, no se pueden leer las CURP guardadas.
- Usa las mismas variables de R2 que el resto: `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `ENDPOINT`, `BUCKET`, `REGION`.

## Mis servicios y menú (2026-10-18)

- `/servicios` rehecho: ordenado en "Para ti" (Mi día, Salud, Veterinaria, Estudio), "Ayuda cerca de ti" (Presente) y "Tu negocio" (Punto de venta, Mis páginas, Encuestas). Estilos propios (`servicios.module.css`); ya no se salen las letras.
- Veterinaria y Presente se pueden mostrar u ocultar (API `assistant-preference`: lista válida y disponibilidad con su interruptor).
- Presente y Veterinaria en el menú lateral, en el inicio (con dibujo) y en el buscador.
- Archivos compartidos tocados: `assistant-preference.service.ts`, su DTO y prueba; `yalika-sidebar.tsx`, `module-navigation.ts`, `yalika-navigation.ts`, `home-workspace.tsx`, `service-art.tsx`, `servicios/*` y una línea de `tests/yalika-veterinaria-pantallas.cjs`.

## Pendiente para el chat de verificación

- Registro de módulos activos por cuenta (encender o apagar un servicio de verdad, no solo ocultarlo).

## Siguiente entrega (P2)

Pedir ayuda con foto o voz, aviso a trabajadores Presentes cercanos, presupuestos y elegir.

# Presente P2: pedir ayuda y presupuestos (2026-10-18)

- **Municipios:** catálogo de los 113 municipios de Michoacán con la ubicación de su cabecera (INEGI, Catálogo Único de Claves Geoestadísticas) en `src/presente/geo/municipios.ts`. Para otro estado se agrega otro arreglo igual.
- **Trabajador:** elige municipio y rango (5, 10, 20, 30, 50 o 100 km). La colonia ahora es opcional.
- **Rango:** un pedido le llega a quien está verificado, Presente, con ese oficio y cuya cabecera está dentro de su rango de la cabecera del pedido (mismo municipio = 0 km).
- **Cliente (`/presente/pedir`):** elige oficio, describe con texto o dictado por voz, foto opcional, municipio, colonia o referencia (solo la ve el trabajador elegido) y urgencia (ahora 6 h, hoy 24 h, esta semana 7 días). Máximo 3 pedidos abiertos.
- **Pedido (`/presente/pedido/[id]`):** muestra cuántos trabajadores Presentes cerca lo ven, los presupuestos (precio, en cuánto llega, nota) y "Elegir". Al elegir, los demás quedan rechazados. Se actualiza solo cada 15 s.
- **Trabajador (`/presente/trabajo`):** "Pedidos cerca de ti" (cada 30 s) para mandar o cambiar su presupuesto, y "Te eligieron" con la referencia del domicilio.
- Migración `20261019040000_presente_p2` (aditiva). 6 archivos de pruebas en `src/presente`.

Siguiente (P3): llegada con selfie y PIN, compartir en vivo, botón de ayuda, antes y después, calificaciones y "Repetir con".

# Presente: oficios, días y horario (2026-10-18)

- 41 oficios en 7 categorías (emergencias de casa y auto, arreglos en casa, agua/fletes/mandados, tecnología, cuidados y mascotas, belleza/clases/eventos, salud y profesionales). Los de salud y profesionales (médico, enfermería, veterinario, traslado en ambulancia, abogado, contador) se muestran como "pronto": piden cédula o permiso.
- Hasta 8 oficios por trabajador. Ya verificado puede cambiar oficios, municipio, rango y horario cuando quiera; nombre y CURP quedan fijos.
- Días (lunes a domingo) y horario (desde/hasta o 24 horas; acepta turno de noche). Migración `20261019050000_presente_horario` (cambia la nota libre por un horario estructurado).
- Inicio de Presente con botón "Pedir ayuda", aviso "¿Peligra una vida? Llamar al 911" y categorías.

# Presente: descripción y decisiones (2026-10-18)

- El trabajador escribe una descripción de quién es y su experiencia (hasta 500 letras); la ve quien pide ayuda junto con su horario. Migración `20261019060000_presente_bio`.
- Ingeniería (eléctrica, industrial, civil) se agrega a los oficios que piden cédula.
- Propuestas pendientes de confirmar con el dueño: comisión 0 % en el piloto; fotos de trabajos y del negocio; cédula verificada por el operador y consultable por el cliente en la página de la SEP; no pedir acta de nacimiento (CURP + INE + selfie ya identifican); estrellas de ambos lados al terminar el trabajo; chat y recorrido guardados 30 días (más si hay un reporte abierto).

# Presente P3: el trabajo completo (2026-10-19)

**Quien pide ayuda**
- `/presente/mis-datos`: nombre, su casa en el mapa (opcional), referencia y foto de la fachada (opcional). Sin estos datos no se puede pedir.
- `/presente/pedir`: hasta 3 oficios en la misma visita, texto o voz, foto, **punto exacto en el mapa** (toca el mapa o "Usar mi ubicación"; el municipio se sugiere solo), referencia y para cuándo.
- `/presente/pedido/[id]`: presupuestos con estrellas, cuánto tarda el trabajo y si el trabajador está terminando otro ("queda libre aprox. a las…"); "Ver perfil y fotos". Al elegir: etapas (Elegido, En camino, Llegó, Trabajando, Terminado), PIN de 4 números, mapa con el trabajador acercándose, mensajes y, al final, estrellas.

**Trabajador**
- Al cotizar: precio, en cuánto llega y cuánto tarda el trabajo. Si está en otro trabajo, se le recuerda sumar ese tiempo.
- Trabajo activo: abrir la ruta en Google Maps o Waze, foto de la fachada, "Voy en camino" (comparte su ubicación mientras la pantalla está abierta), "Me voy a retrasar", "Llegué" con el PIN del cliente y a menos de 300 m, "Empezar" (cuánto tardará) y "Terminé". Mensajes y estrellas al cliente.
- Fotos de su trabajo, su negocio o sus cursos (hasta 9), visibles en su perfil.

**Reglas**
- Cancela el cliente: gratis si nadie ha salido, en los primeros 2 minutos o si el trabajador va más de 20 min tarde. En camino: $15 por km avanzado hacia la casa (línea recta, del primer al último punto del recorrido), mínimo $40, tope 25% del precio y máximo $250; ya en la puerta, el tope. Se avisa al elegir el presupuesto y en la burbuja ("Si cancelas ahora: $X", con botón Cancelar).
- Adeudo (`presente_cancel_debts`): se suma al siguiente pedido del cliente y lo cobra quien lo atienda; al cerrar ese trabajo se descuenta de su saldo y se abona al del trabajador que fue (si es el mismo, solo se marca pagado). Si el cliente paga directo, el trabajador lo marca en «Te deben». El asistente se lo recuerda al cliente en Mi día al día siguiente y cada 3 días.
- Cancela el trabajador: falta y el pedido se reabre para elegir a otro. Más de 5 faltas en 30 días = baja temporal de 30 días.
- PIN de llegada calculado (no se guarda); 5 intentos fallidos = 10 minutos de espera.
- Mensajes y recorrido se borran solos a los 30 días.
- Mapa: Leaflet servido desde `public/vendor/leaflet` (licencia BSD-2) y mapas de OpenStreetMap. Para mucho uso habrá que contratar un proveedor de mapas.

**Pendiente:** llamadas dentro de la app (sin teléfonos), cédula profesional, verificar la identidad del cliente con INE, pagos.

Migración `20261019070000_presente_p3` (los pedidos de prueba conservan su oficio en la nueva lista).

# Presente: confianza, salud y página web (2026-10-19)

Otra sesión agregó esta mañana: "Mis de confianza" (favoritos), pedido directo a un trabajador (aunque esté Ausente, respetando su horario), visitas agendadas, seguimientos ("siguiente visita"), avisos de "pídelo siempre por Presente" para cliente y trabajador, aviso si alguien escribe un teléfono en el chat, y enlaces a Salud o Veterinaria en trabajos de salud. Migración `20261019080000_presente_favoritos`.

Esta sesión completó:
- **Salud a domicilio:** médico, enfermería y veterinario ya se pueden ofrecer y pedir. El trabajador debe tener su cédula **verificada en Salud** (Soy profesional) y una profesión que corresponda; se revisa al guardar oficios y otra vez al cotizar. Abogado, contador, ingeniería y traslado en ambulancia siguen "pronto".
- **Cédula visible** en el perfil del trabajador de salud, con liga a la consulta de cédulas de la SEP (https://cedulaprofesional.sep.gob.mx/).
- **Página web:** el trabajador elige una de sus páginas publicadas (Mis páginas) y se muestra en su perfil ("Ver su página"). Migración `20261019090000_presente_sitio`.
- Lo clínico (alerta de antibióticos recientes, horarios y "¿ya la tomaste?") se pidió a los chats de Salud y Veterinaria en `MENSAJES_PARA_MODULOS.md` del proyecto.

## Saldo del trabajador (19-oct)
- Tabla `presente_wallet_entries` (migración `20261019100000_presente_saldo`): cada movimiento es un renglón; el saldo es la suma. `dedupeKey` única evita cobrar o acreditar dos veces.
- Regalo de bienvenida (`PRESENTE_WELCOME_CREDIT_MXN`, 100 por defecto) al aprobar, una vez por CURP; si vuelve a registrarse con la misma CURP, su saldo anterior pasa al nuevo registro.
- Comisión (`PRESENTE_COMMISSION_PCT`, 7 por defecto) al confirmar la llegada con PIN, sobre el precio aceptado.
- Sin saldo (cero o en contra) no se puede cotizar.
- Recarga manual: el trabajador transfiere con su código `YP…` en el concepto; el operador acredita en `/presente/operador` con la clave de rastreo (`PRESENTE_TOPUP_CLABE`, `PRESENTE_TOPUP_BANK`, `PRESENTE_TOPUP_NAME` muestran la cuenta).
- Rutas: `GET presente/me/wallet`, `GET presente/operator/wallet/:code`, `POST presente/operator/wallet/topup`.
- Código: `apps/api/src/presente/presente-wallet.service.ts`, `apps/web/src/app/presente/trabajo/wallet-card.tsx`, `apps/web/src/app/presente/operador/wallet-topup.tsx`.

## Cierre confirmado, obras, negocios y buscador (19-oct)
- Migración `20261019110000_presente_cierre_negocios` (solo agrega columnas).
- La comisión ya no se cobra al llegar: el trabajador marca "Terminé" con el precio real (y en obras la mano de obra); el cliente confirma "Sí, quedó bien" o "Algo quedó mal". Si no contesta en 48 h se cierra solo (revisión cada hora). Con reporte, el operador lo cierra en `/presente/operador` con o sin comisión.
- Comisión: 7 % del precio final; en obras (`ALBANILERIA`, `PINTURA`, `HERRERIA`, `CARPINTERIA`, `IMPERMEABILIZACION`) sobre la mano de obra, con tope `PRESENTE_CONSTRUCTION_CAP_MXN` (1,500 por defecto). Mandados y tiendas: sobre el total.
- Presupuestos en minutos, horas o días (hasta 120 días).
- Perfil: "Soy negocio" con nombre comercial, "Llevo a domicilio" y "También enseño".
- Buscador del inicio: al elegir un oficio muestra personas y negocios verificados que llegan a tu municipio, con filtros (personas, negocios, a domicilio, disponible ahora, también enseña) y orden; "Pedir a todos" o "Pedirle directo".
- Rutas nuevas: `GET presente/search`, `POST presente/requests/:id/confirm`, `POST presente/requests/:id/problem`, `GET presente/operator/problems`, `POST presente/operator/requests/:id/close`.

## Solo servicios exprés (19-oct, tarde)
- Se quitaron obras y trabajos de varios días: migración `20261019120000_presente_solo_expres` borra `durationDays`, `laborMxn` y `finalLaborMxn` (sin uso). Albañilería queda como "arreglos y resanes".
- Presupuesto y precio final desde $100 (`MIN_PRICE_MXN`); trabajo del mismo día, máximo 12 h (`MAX_JOB_MINUTES`).
- Comisión: 7 % del precio final, sin topes ni casos especiales. Tabulador en el registro y en "Mi saldo"; al cotizar se ve cuánto le queda al trabajador.
- `INICIAR_YALIKA.cmd` aplica migraciones y prepara Prisma antes de prender la API.
- Prueba de punta a punta (Postgres de prueba + API real): 84 revisiones sin fallas.

## Fundadores, 5 % y recomendar (19-oct, noche)
- Comisión por defecto 5 % (`PRESENTE_COMMISSION_PCT`; después 10). Precio mínimo $300 (`MIN_PRICE_MXN`).
- Fundadores: $70 (`PRESENTE_WELCOME_CREDIT_MXN`) a los primeros 200 aprobados (`PRESENTE_WELCOME_LIMIT`), no vence. `GET presente/program` da comisión, mínimo y lugares que quedan.
- Recomendar: migración `20261019130000_presente_recomendar` (`referredByProviderId`). Código = el mismo `YP…` del trabajador. Premio: un servicio sin comisión hasta $50 (`FREE_SERVICE` / `FREE_USED` en el saldo) cuando el recomendado está aprobado y hace su primera recarga; se acumulan; no cuenta si su CURP ya había estado registrada ni si quien recomienda no está verificado.
- Web: aviso de fundadores (inicio y registro), código de recomendación en el registro, "Recomienda y gana" con WhatsApp en "Mi saldo", sugerencia de cobrar más de noche o con lluvia al cotizar.
- Prueba de punta a punta: 106 revisiones sin fallas.

## Ronda 22-oct
- Comisión: fundadores (primeros 500) $100 de regalo y 10 % mientras les dura; después 7 %. Sin promoción, 7 % (`PRESENTE_COMMISSION_PCT`, `PRESENTE_PROMO_COMMISSION_PCT`).
- Apagado también ve los trabajos y puede mandar precio con confirmación; avisos al celular (Web Push, `tequio-sw.js`, scope `/tequio/`) solo a quien está prendido para trabajos nuevos.
- Llegada: hora de llegada con cuenta regresiva, distancia y minutos por GPS (línea recta, 30 km/h), botones de retraso (+5/+10/+20, máximo 2 avisos, `MAX_DELAY_NOTICES`) y mensajes rápidos.
- Factura: el profesional marca «Doy factura»; el cliente marca «Necesito factura» con sus datos fiscales (RFC, nombre, régimen, CP, uso); el presupuesto se muestra + IVA 16 %; al terminar queda en «Pendientes de facturar», el profesional sube PDF y XML timbrado (se revisa que sea para el RFC del cliente) y el cliente lo descarga en su pedido. Tablas: `presente_invoices`; columnas nuevas en clientes, pedidos y trabajadores (migración `20261024090000_presente_factura_llegada`).
- Calificación y factura: si el cliente pidió factura, califica cuando llega; si no llega en 3 días (`INVOICE_DAYS`), ya puede calificar y la reseña sale con la etiqueta «No entregó factura» (`presente_reviews.invoiceMissing`). El trabajador la ve en «Pendientes de facturar» con su fecha límite y como recordatorio en «Mi día» (se cierra al subirla). Sin factura, se califica al terminar como antes.
- Llamadas por Tequio sin números: voz por internet (WebRTC) entre cliente y trabajador elegido, del trabajo asignado hasta 48 h después de terminar. Timbra 45 s, dura máximo 30 min, aviso al celular «X te está llamando», y en el chat queda «Llamada de N min» o «Llamada perdida». La voz va directo entre los teléfonos y no se graba; el servidor solo pasa los datos de conexión (tabla `presente_calls`, migración `20261025090000_presente_llamadas_factura`). Rutas: `GET presente/calls/config`, `POST presente/requests/:id/calls`, `GET presente/requests/:id/calls/current`, `GET presente/calls/:id`, `POST presente/calls/:id/answer`, `POST presente/calls/:id/end`.
- Redes difíciles (algunos datos móviles): para que siempre conecte, configurar un servidor TURN con `PRESENTE_TURN_URLS` (separadas por coma), `PRESENTE_TURN_USERNAME` y `PRESENTE_TURN_CREDENTIAL`. Sin TURN funciona en la mayoría de redes con STUN público; si no conecta, la pantalla sugiere seguir por mensajes.
- Comprobante de la SEP (otro candado para profesionistas): además del número, la foto de la cédula y la selfie, se pide la Constancia de Situación Profesional (PDF gratuito con QR en gob.mx/cedulaprofesional) o una captura de la consulta en cedulaprofesional.sep.gob.mx. La foto y la selfie se borran al revisar; el comprobante se queda y, ya revisado, los clientes lo abren desde el perfil con instrucciones para comprobarlo (QR o consulta con el número). Quien ya tenía su cédula aprobada lo sube desde «Mi cédula profesional» y el operador revisa solo el comprobante. Columnas `sepProof*` en `presente_credentials` (migración `20261026090000_presente_comprobante_sep`). Rutas: `POST presente/me/credentials/:trade/sep-proof`, `GET presente/providers/:id/credentials/:trade/sep-proof`; el operador ve el comprobante con `.../photos/sep`.
- Recargas con Mercado Pago (Checkout Pro): en «Mi saldo», «Recargar ahora» con $100, $200, $500 o $1,000; se paga en la página de Mercado Pago (tarjeta, OXXO o transferencia) y el saldo se suma solo. Yalika no ve ni guarda tarjetas. El aviso automático (`POST presente/webhooks/mercadopago`, ruta pública) no se cree: con el número de pago se le pregunta a Mercado Pago con la clave propia y solo se acredita un pago aprobado, en pesos y por el monto completo, una sola vez (`topup:mercadopago:<pago>`). Al regresar, la página revisa el pago (`POST presente/me/wallet/mercadopago/:id/check`), así funciona aunque el aviso no llegue (por ejemplo en la computadora). Cuenta para el premio de quien recomendó (primera recarga). Tabla `presente_topups` (migración `20261027090000_presente_recargas_mercadopago`).
- Para activarla: `MERCADOPAGO_ACCESS_TOKEN` (Access Token de producción de la aplicación en Mercado Pago Developers → Tus integraciones) y `YALIKA_PUBLIC_URL` (https). Sin la clave, solo se ve la recarga por transferencia. La comisión de Mercado Pago la absorbe Yalika (el trabajador recibe el monto completo).
- Citas estilo chat: al «Pedirle directo» y «Elegir día y hora», el asistente muestra los horarios libres del profesional (cada hora dentro de su horario, 7 días, sin chocar con sus citas aceptadas; si atiende 24 h, de 7:00 a 21:00) — `GET presente/providers/:id/slots`. Al profesional le llega «Te piden cita para…» y responde «Sí, puedo» o «Propongo otra hora» (dentro de su horario) con su precio (`proposedFor` en el presupuesto). El cliente ve «Acepta tu cita» o «Te propone: …» y toca «Confirmar cita»; la cita queda a esa hora y el recordatorio de Mi día también.
- Grabar llamadas con aviso: en la llamada, «🔴 Grabar»; al otro le sale en rojo «X está grabando esta llamada» y queda escrito en el chat. Al colgar o detener, la grabación (audio webm/opus a 16 kbps, máx. 4.2 MB) aparece en el chat para que los dos la escuchen o descarguen. Rutas: `POST presente/calls/:id/recording/start`, `POST presente/calls/:id/recording`, `GET presente/requests/:id/recordings/:recordingId`.
- Sábana de seguridad: «Ver mi registro de seguridad» en el chat abre `/tequio/registro/:id` con quién, dónde, precio, horas (pedido, elección, salida, llegada con PIN, inicio, fin), llamadas, grabaciones y mensajes; sin teléfonos. Se imprime o guarda como PDF. Los dos la ven mientras el trabajo sigue y 30 días después de terminar; luego queda sellada (el chat se ve vacío). Yalika guarda la copia sellada `PRESENTE_SAFETY_KEEP_DAYS` días (365 por defecto; lo debe confirmar el abogado) y después se borra todo (mensajes, recorrido, llamadas y grabaciones). Solo el operador la abre en «Registro para una autoridad» con el número de pedido (8 caracteres) y el número de oficio; queda en la bitácora (`SAFETY_RECORD_OPENED`, `SAFETY_RECORDING_OPENED`). Tabla `presente_call_recordings` (migración `20261028090000_presente_citas_grabaciones`).
- Avisos para no salirse de Tequio: al escribir un teléfono se pregunta antes de mandarlo («fuera de aquí no queda registro, no hay PIN ni grabación…»); aviso fijo arriba del chat; el aviso automático del chat y «En Yalika te cuidamos» son más firmes. Todo lo que dicen es cierto: no se bloquea a nadie.
- Pendiente legal: actualizar el aviso de privacidad (grabación de llamadas con aviso, plazo de resguardo y entrega a autoridades) con el abogado.
