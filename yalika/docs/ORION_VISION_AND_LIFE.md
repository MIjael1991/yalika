# ORION: visión de producto y continuidad

Actualizado: 19 de agosto de 2026.

Este documento conserva decisiones de producto que deben sobrevivir a cambios de
chat, desarrolladores y etapas. No obliga a construir todo inmediatamente. Sirve
para decidir qué pertenece al núcleo, qué corresponde a un módulo y qué debe
esperar hasta que exista una base segura.

## Forma de trabajo

ORION es un proyecto de largo plazo. Durante su desarrollo se debe:

- explicar qué se construye, por qué y qué posibilidad abre;
- recomendar mejoras relevantes aunque no hayan sido solicitadas literalmente;
- detectar riesgos de arquitectura, seguridad, privacidad y experiencia;
- distinguir entre un piloto usable y una solución lista para producción;
- reutilizar motores universales en lugar de duplicarlos por sector;
- priorizar funciones que ahorren tiempo y reduzcan errores;
- conservar un backlog claro para no programar todas las ideas a la vez;
- mantener control humano sobre acciones sensibles de la inteligencia artificial.

## Principio central

ORION no será un sistema diferente para cada giro. Tendrá un núcleo universal:

- identidad, personas, usuarios, roles y permisos;
- organizaciones, espacios y ubicaciones;
- tareas, agenda, flujos y reglas;
- formularios, documentos y evidencias;
- inventario, activos, transacciones y pagos;
- notificaciones, auditoría, offline y sincronización;
- inteligencia, conocimiento, experiencia y analítica.

Los paquetes Business, Retail, Restaurant, Education, Services, Government,
Agriculture, Transport, Hospitality y otros activarán solamente lo necesario.

## ORION Life

ORION Life será la puerta personal al ecosistema. No será una agenda separada:
usará el motor universal de espacios, tareas, documentos, notificaciones y
permisos. Una persona podrá participar en varios contextos sin que sus datos se
mezclen indebidamente.

Espacios previstos:

- personal;
- familia o pareja;
- escuela;
- negocio;
- vehículos y otros activos;
- organizaciones en las que la persona colabora.

La pantalla principal será **Mi día** y combinará solamente la información que
el usuario autorizó. Un profesor podría ver sus clases, una conversación pendiente
con un padre, su hora de comida, una compra para su negocio, el servicio de su
automóvil y una visita familiar. Empleados y organizaciones no podrán consultar
los detalles de su agenda privada.

## Agenda y reorganización inteligente

Las actividades se clasificarán como:

1. compromisos fijos;
2. necesidades esenciales como comida, descanso y traslado;
3. compromisos con otras personas;
4. actividades laborales o comerciales;
5. compras y tareas flexibles;
6. tareas que pueden pasar a otro día.

ORION deberá considerar duración, tráfico, ubicación, horario de establecimientos,
dependencias y tiempo de traslado. Cuando el usuario posponga una actividad 15,
30 o 60 minutos, ORION preparará un nuevo orden y solicitará confirmación antes de
mover compromisos importantes.

Las alarmas futuras tendrán acciones como:

- ya lo hice;
- comenzar ahora;
- posponer;
- mover a mañana;
- reorganizar mi día.

Para sonar con la aplicación cerrada serán necesarias notificaciones del dispositivo
y un servicio de recordatorios. Las tareas esenciales deberán conservarse localmente
cuando no exista Internet.

## Captura rápida y motor de contexto

La entrada principal será **Dile a ORION**. Una persona podrá escribir un mensaje
corto y, en etapas posteriores, dictarlo o fotografiar un documento. Texto, voz y
fotografía alimentarán el mismo motor; no existirán tres sistemas de tareas
separados.

ORION distinguirá entre:

- el espacio, que define propiedad y visibilidad: personal, familia, escuela,
  negocio o uno personalizado;
- la categoría, que describe el tema: compra, pago, salud, vehículo, tarea
  escolar, proveedor y otras;
- el origen de la señal: indicación explícita, contexto activo, palabras del
  mensaje o patrones confirmados anteriormente.

Una indicación explícita del usuario siempre tendrá prioridad. Con confianza alta
ORION preseleccionará el destino y permitirá cambiarlo. Con confianza media
solicitará una confirmación breve. Con confianza baja propondrá conservar la tarea
en un espacio privado. Nunca se compartirá silenciosamente información sensible,
en especial salud, menores, dinero o conversaciones escolares.

El primer piloto de clasificación utiliza únicamente tareas creadas por la misma
cuenta como antecedentes. Mover una propuesta al espacio correcto permite que una
tarea similar se clasifique mejor después, sin copiar los textos a otra tabla. Las
reglas permanentes y el aprendizaje avanzado deberán ser explícitos, revocables y
auditables.

## Tareas compartidas

Parejas, familias y equipos podrán trabajar sobre la misma lista. Una persona puede
marcar **Me encargo** y los demás verán el cambio para evitar pagos o compras
duplicadas. Cada tarea conservará:

- creador;
- responsable o persona que la tomó;
- persona que la terminó;
- fecha, estado y duración estimada;
- cambios y evidencias;
- permisos del espacio.

El primer piloto sincroniza periódicamente mientras está abierto. La identidad
ya se obtiene de una sesión revocable en el servidor; la versión de producción
también requerirá recuperación de cuenta, segundo factor opcional, monitoreo y
eventos en tiempo real.

## Recurrencias del piloto

El núcleo ya puede representar tareas diarias, semanales, mensuales y anuales.
Cada serie conserva su fecha original, responsable, espacio y fecha final opcional.
ORION prepara ocurrencias para los siguientes siete días y PostgreSQL impide que
dos dispositivos generen dos veces la misma actividad. Al detener una serie se
conservan la tarea actual y el historial.

Esta primera versión crea agenda, no alarmas con la aplicación cerrada. Tampoco
interpreta todavía expresiones como "el segundo martes" ni ajusta automáticamente
la hora civil en regiones con cambios estacionales. Esas reglas se incorporarán
al motor de calendario antes de abrirlo globalmente.

## Recordatorios internos del piloto

Cada tarea con fecha puede avisar a la hora indicada o con anticipación de 15
minutos, 30 minutos, una hora o un día. El recordatorio pertenece a una cuenta
autenticada: inicialmente al responsable o al creador, y se transfiere cuando
otra persona toma una tarea compartida. Completar la tarea cancela el aviso;
posponerla recalcula el horario; posponer solamente el recordatorio conserva la
fecha real de la actividad. Todas estas decisiones quedan auditadas.

El centro muestra avisos vencidos y los próximos de 24 horas mientras ORION está
abierto. No se debe afirmar todavía que son alarmas del dispositivo: para avisar
con la aplicación cerrada faltan Service Worker, suscripción push, permisos,
entrega persistente y preferencias de silencio.

## Pagos, recibos y memoria predictiva

El usuario podrá fotografiar un recibo. ORION propondrá, sujeto a confirmación:

- empresa o servicio;
- número de suscriptor o contrato;
- referencia, código de barras o QR;
- importe, periodo y fecha límite;
- siguiente fecha aproximada.

Después del pago se podrá guardar el comprobante y generar el siguiente recordatorio.
Una fecha inferida siempre se mostrará como estimación. ORION no realizará pagos ni
guardará datos bancarios sensibles sin una solución específica y autorización.

## Compras de ORION a ORION

ORION Business podrá transformar faltantes de inventario en una orden de compra y
asignarla al ORION del trabajador sin transcribir productos. Debe incluir cantidades,
presentación, proveedor, presupuesto, fecha límite, sustituciones y factura.

El trabajador podrá informar aceptada, en camino, comprando, parcial, terminada o
no disponible. El ticket se comparará con lo solicitado y la entrada a inventario
siempre requerirá revisión antes de aplicarse.

## Educación y comunicación

Un profesor podrá registrar observaciones semanales y preparar juntas. Se distinguirá:

- nota privada;
- seguimiento pendiente;
- aviso visible para tutores;
- solicitud de reunión;
- acuerdo y próxima acción.

Los tutores solamente verán información de sus hijos. La inteligencia organizará y
resumirá, pero no diagnosticará, etiquetará ni tomará decisiones disciplinarias.

ORION podrá comunicar internamente primero y después, con consentimiento, mediante
notificaciones del dispositivo, correo, WhatsApp o SMS. No enviará mensajes en nombre
del usuario sin autorización explícita.

## Activos y mantenimiento

Además de inventario consumible, ORION deberá representar vehículos, computadoras,
herramientas, maquinaria, mobiliario y equipos. Conservará compra, ubicación,
responsable, garantía, fallas, mantenimientos, vida útil y documentos relacionados.

Ejemplos personales incluyen servicio del automóvil, antigüedad de llantas y
renovación de pólizas. Las recomendaciones se basarán en datos registrados y se
identificarán como aproximadas cuando corresponda.

## Inteligencia ORION

La inteligencia será avanzada para analizar y prudente para actuar:

1. detectar;
2. explicar;
3. predecir;
4. simular;
5. preparar una acción para revisión humana.

Las respuestas breves mostrarán problema, recomendación, confianza y acciones. El
usuario podrá abrir por qué, cálculo y simulación. ORION distinguirá hechos,
predicciones, posibles explicaciones y recomendaciones.

El ciclo futuro será observar, entender, proponer, permitir que el humano decida,
actuar, medir, aprender y recordar.

## Privacidad y límites

- Una organización nunca obtiene automáticamente la vida completa de una persona.
- La información personal, familiar, escolar y comercial permanece separada.
- Los permisos deben validarse en el servidor y quedar auditados.
- No habrá vigilancia secreta, acusaciones automáticas ni perfilamiento injusto.
- Las notificaciones respetarán horarios, frecuencia, consentimiento y silencio.
- Antes de datos escolares o personales reales deben completarse recuperación de
  cuenta, políticas administrativas, segundo factor opcional y auditoría operativa.

## Funciones futuras que deben permanecer en el backlog

- ORION Studio para configurar módulos, menús, permisos, formularios y reglas;
- motor universal de formularios y campos personalizados;
- documentos, fotografías, PDFs, garantías y evidencias;
- motor de reglas y automatizaciones propuestas por IA y aprobadas por humanos;
- notificaciones del dispositivo y funcionamiento offline-first;
- tráfico, rutas y horarios verificados de establecimientos;
- recurrencias avanzadas, cumpleaños calculados y mantenimiento por uso o kilometraje;
- lectura inteligente de recibos y tickets;
- asignación de compras e inventario entre cuentas ORION;
- resumen de la mañana y cierre del día;
- medición de tiempo recuperado;
- salud de la organización en lugar de dashboards saturados;
- preguntas naturales sustentadas en datos reales;
- ORION Local Hub para redes internas, cuando la escala lo justifique;
- importación CSV y Excel e interoperabilidad mediante estándares adecuados.

## Criterio para decidir nuevas funciones

Antes de programar una idea se debe preguntar:

- ¿pertenece al núcleo o a un paquete?
- ¿se puede generalizar sin volver difícil la experiencia?
- ¿ahorra tiempo, reduce errores o mejora decisiones?
- ¿funcionará en teléfono, tableta y computadora?
- ¿puede recuperarse de falta de Internet o energía?
- ¿afecta privacidad, seguridad o rendimiento?
- ¿es necesaria para el piloto actual?

## Estado del primer piloto de ORION Life

El primer checkpoint inició la base de espacios y tareas compartidas. El segundo
bloque agregó contraseña cifrada con scrypt, bloqueo temporal por intentos fallidos,
sesiones opacas y revocables en PostgreSQL, cookie HttpOnly, identidad derivada en
el servidor, cierre de sesión y protección de espacios y tareas. Los espacios
personales ya no admiten integrantes. El bloque actual agrega series recurrentes
con generación anticipada y protección contra duplicados, además del primer
centro de recordatorios internos con destinatario, posposición y auditoría.

La captura rápida ya acepta texto y dictado temporal del navegador. Ambos caminos
usan el mismo motor explicable: proponen un espacio, muestran las señales utilizadas,
advierten sobre información sensible y exigen confirmación humana antes de crear la
tarea. También interpreta expresiones frecuentes como “mañana a las 6”, “cada
martes” o “30 minutos antes”. Cuando falta la hora propone las 9:00, pero obliga a
revisarla. La fotografía seguirá reutilizando este contrato cuando se agregue OCR.

La protección de calidad del piloto compara tareas solamente dentro del espacio de
destino. Una coincidencia exacta se bloquea y una coincidencia parecida permite
abrir la existente, agregarle un dato o confirmar una nueva. La base de datos evita
la carrera entre dos ventanas. Las creaciones recientes pueden deshacerse sin borrar
historial y las tareas canceladas pueden restaurarse.

La captura universal distingue entre crear una tarea y dar una orden sobre una
tarea existente. “Cancelar”, “eliminar”, “terminar” o “buscar” nunca deben producir
otra tarea con esas palabras en el título. ORION busca solamente dentro de los
espacios visibles y editables de la sesión, muestra las coincidencias y exige elegir
la tarea exacta antes de actuar. “Eliminar” se interpreta como cancelación
recuperable; el borrado definitivo no forma parte de la captura rápida.

Este patrón se aplicará a todo ORION: identificar la intención, buscar el elemento
correcto, mostrar el efecto, confirmar cuando exista ambigüedad, ejecutar y ofrecer
deshacer cuando la operación sea recuperable. Ventas, inventario, clientes,
documentos y espacios compartidos no deben interpretar una orden destructiva como
una alta nueva.

El sector de una tarea y su visibilidad son decisiones distintas. Detectar
“Negocio” o “Inventario” no autoriza compartirla. Si existe un solo espacio de
negocio accesible, ORION puede proponerlo; si existen varios, debe preguntar cuál;
si no existe ninguno, conservará la tarea en un espacio personal y explicará que
seguirá privada. Una instrucción explícita como “del negocio” prevalece sobre el
aprendizaje histórico. Los espacios con nombres repetidos se diferencian y nunca se
fusionan automáticamente.

Cada usuario tendrá como máximo un espacio personal activo. La interfaz reutiliza el
existente, la API resuelve de forma segura dos solicitudes simultáneas y PostgreSQL
mantiene una restricción parcial como última protección. Los espacios familiares,
escolares y de negocio siguen siendo independientes y pueden existir varias veces
cuando representen grupos u organizaciones diferentes.

El espacio determina quién puede ver la tarea; la categoría describe qué clase de
actividad es. Por ejemplo, revisar inventario pertenece a Negocio, mientras comprar o
surtir mercancía pertenece a Compra aunque ambas tareas vivan en el mismo negocio.

Cuando la tarea pertenece a una serie, la confirmación separa “solo esta ocasión”
de “toda la repetición”. Cancelar la ocasión actual conserva por defecto las
siguientes. Las expresiones “hoy y mañana” representan una serie limitada a dos
ocasiones. Una hora ambigua como “a las 4” puede proponerse como 4:00 p. m., pero la
interfaz debe declarar la suposición y pedir confirmación hasta contar con una
preferencia horaria suficientemente confiable.

El motor recurrente rechaza años fuera del intervalo razonable, detiene series
antiguas dañadas y mantiene como máximo una ocurrencia activa por serie. “Leer mi
día” se activa de forma explícita y pronuncia solamente títulos y horarios del
espacio seleccionado; no lee descripciones privadas ni escucha en segundo plano.

Antes de ampliar módulos, la experiencia base deberá funcionar con controles
claros y adaptables en teléfono, tableta y computadora. Las series limitadas se
describirán como “2 ocasiones” o “última ocasión”, sin exponer estados internos que
puedan confundirse con la terminación de la tarea.

Todavía no incluye alta pública de cuentas, recuperación de contraseña, segundo
factor, invitaciones externas, WebSockets, alarmas del dispositivo, palabra de
activación en segundo plano, OCR, rutas ni IA de reorganización. El dictado y la
lectura dependen de las capacidades del navegador; no sustituyen una experiencia
manos libres certificada para conducir. Esos componentes deben construirse sobre
esta base y no simularse como si ya fueran funciones de producción.
