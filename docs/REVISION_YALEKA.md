# Revisión de Yaleka — 12 de octubre de 2026

Estado: correcciones preparadas y verificadas con los ZIP recibidos. No equivale a autorización de publicación ni a una revisión exhaustiva de seguridad. Este archivo es el informe de esta entrega.

## Organización

La aplicación principal sigue en `apps/api` y `apps/web`. La carpeta `.next` es salida de compilación regenerable; no es otro servicio y no se distribuye en este ajuste. El inicio local ahora obtiene la raíz desde su propia ubicación y permite cambiar el nombre de la carpeta sin una ruta ORION fija.

`orion-life` es un prototipo separado con funciones simuladas; no sustituye a `/life` en la aplicación principal. `orion-encuestas` es una implementación anterior con almacenamiento distinto. No se eliminaron porque hacerlo sin comprobar sus datos podría perder información. Control y un módulo identificable de Veterinaria no aparecen entre las fuentes recibidas. No se inventaron pantallas para ellos.

El instalador retira únicamente dos archivos duplicados de `scripts/infrastructure` cuando coinciden exactamente con sus originales canónicos en `infrastructure`. Conserva cualquier variante modificada. No crea respaldos, cuentas, instalaciones, páginas ni registros comerciales adicionales. No cambia variables de entorno, credenciales, esquema ni datos de PostgreSQL.

## Cambios

- Inicio: servicios elegidos por la persona, tarjetas legibles, Hoy con datos reales, pendientes, acciones y acceso persistente al asistente. Navegación móvil: Inicio, Mi día, Servicios y Cuenta. Estados explícitos de carga, error y falta de conexión.
- Búsqueda: sugerencias comerciales y de salud solo cuando el servicio está disponible. Los enlaces de inventario y recordatorios llevan a las pantallas correspondientes.
- Resumen y comercio: el servidor rechaza cuentas limitadas a encuestas. Mostrar u ocultar una tarjeta no concede permisos.
- Salud: las repeticiones de operaciones verifican perfil o autor antes de devolver datos; los recibos de sincronización ajenos no revelan recursos.
- Pendientes clínicos: almacenamiento local y archivos separados por cuenta y empresa, verificación de sesión antes de sincronizar, exclusión de errores de permisos/validación de la cola offline, prevención de sincronizaciones simultáneas en la misma pantalla y conservación de operaciones nuevas durante una sincronización.
- Formularios clínicos: referencia estable al formulario después de guardar, mensajes de fallo y estados de carga; etiquetas de historial en español y fechas inválidas controladas.

## PRUEBA y validación

En el entorno de revisión: 67 suites y 314 pruebas de API aprobadas; compilación de API y Web completada; comprobaciones de navegación/buscador, borradores e aislamiento de pendientes aprobadas. Las nuevas regresiones llevan el nombre PRUEBA. El instalador vuelve a ejecutar estos controles sobre la instalación de destino.

Son pruebas de código con datos simulados aislados. No se cargó otro mes ficticio, no se ejecutaron ventas ni se conectó esta revisión a la base real. La revisión inicial no incluyó navegador. La actualización móvil posterior incorpora comprobaciones visuales con Chromium y datos PRUEBA aislados (sin conexión a la base real). La compilación no demuestra apariencia, funcionamiento con los datos reales ni ausencia total de fallos.

## Pendientes antes de publicación

1. Movilidad: los controladores requieren sesión, pero hay operaciones que reciben identificadores sin vincularlos al propietario de la sesión. Falta completar y probar aislamiento por cuenta/empresa. Bloqueante para exponer esas rutas públicamente.
2. Resumen diario: confirmar zona horaria del usuario; actualmente el cálculo usa la del servidor. Clasificar explícitamente si las tareas sin espacio son compartidas en la empresa o privadas.
3. Offline: no existe un asistente completo funcionando sin red. Hay almacenamiento parcial; abrir o recargar pantallas puede requerir conexión. Los pendientes antiguos sin identidad se preservan, pero requieren recuperación verificando su propietario; no se asignaron automáticamente a quien inicie sesión.
4. Tokens: no se verificó un contador persistente de cuota/restante por día. No se muestran cifras inventadas ni se promete uso ilimitado.
5. Verificación real: probar acceso con dos cuentas, navegación móvil, notificaciones, consulta al asistente, POS, descuentos/promociones, raspaditos y datos existentes contra la base local. Revisar también dependencias y configuración de despliegue antes de publicar.
6. Veterinaria y Control: localizar sus fuentes o determinar si eran solo nombres de pantallas de otra versión antes de integrar o retirar servicios.

## Aplicación

Cerrar los procesos locales de Web y API. Ejecutar el archivo AJUSTAR_YALEKA.cjs indicando la raíz existente que contiene apps/api y apps/web. El instalador verifica versiones antes de escribir; si encuentra cambios distintos de los ZIP revisados, se detiene y enumera los archivos sin sobrescribirlos. Requiere las dependencias ya instaladas. No instala servicios ni ejecuta migraciones o semillas.

Si la escritura o las comprobaciones fallan, intenta restaurar en memoria los archivos que cambió y muestra el resultado. No crea una copia de respaldo persistente. Mantener los procesos cerrados durante la aplicación y reiniciarlos solo tras AJUSTE_VERIFICADO. Los directorios de compilación pueden regenerarse durante las comprobaciones.


## Actualización: inicio móvil y navegación contextual

- Tarjetas con cuatro ilustraciones vectoriales propias; no requieren descargar imágenes externas. El inicio mantiene los servicios seleccionados y el tema claro/oscuro.
- Apariencia se configura desde Cuenta; ya no ocupa la cabecera de todas las pantallas.
- Teléfono: cuatro accesos constantes abajo, regreso a Inicio y menú Opciones dentro de cada módulo. Escritorio: el lateral muestra el módulo actual y el acceso para cambiar de servicio.
- POS reutiliza la navegación común; se elimina el componente antiguo de pestañas duplicadas. No se elimina ninguna función de caja, inventario, ventas o devoluciones.
- Buscador: sinónimos definidos, tolerancia acotada a errores de escritura y transposiciones, interpretación de escasez de inventario. Etiqueta coincidencias, relaciones y aproximaciones; no inventa resultados cuando faltan indicios.
- Se conserva la búsqueda de funciones/pantallas. Todavía no hay un índice universal de documentos, pacientes, ventas y archivos: buscar su contenido requiere integraciones con autorización por recurso. No se anuncia como implementado ni se envía ese contenido a una IA.
- El iniciador acepta comillas simples y dobles para reconocer Salud; corrige el falso bloqueo observado después del ajuste anterior.
- La actualización no modifica API, esquema, base de datos, cuentas ni páginas públicas. Sus pruebas de búsqueda y rutas corren dentro del comando de navegación existente.


## Corrección de asistencia y agenda tras capturas del usuario

- Respuestas de inventario: nombre, unidades disponibles, alerta y acceso al inventario. Se omiten IDs y claves internas. Se pueden desplegar todos los artículos devueltos, en vez de truncar silenciosamente a ocho.
- Captura de actividad: explicación junto al campo si no hay agenda editable o no se pudo cargar. Acción explícita para preparar la agenda personal, reutilizando un espacio editable si ya existe; no crea cuentas ni sitios.
- Interpretación de horarios: acepta «9 de la mañana» sin exigir «a las». Limpia fecha/hora del título y conserva el horario en el campo correspondiente. Mantiene revisión para fechas ambiguas o pasadas.
- Confirmación: la actividad se guarda únicamente después de revisar y confirmar. Al guardar una actividad con fecha se abre la agenda en esa fecha y se actualiza el listado. Si no hay fecha, informa que está en pendientes.
- Fallos de captura: aparecen junto a la instrucción y el texto se conserva. No dependen del aviso general situado fuera de la vista.
- Verificado: Web compila; regresiones temporales con la frase exacta del usuario y horas distintas de la predeterminada. Recorrido Chromium con API simulada: ausencia inicial de espacios, preparación, interpretación, confirmación única, evento visible, error de interpretación visible y doce artículos legibles sin IDs. No se insertaron datos en la base del usuario; queda comprobar el recorrido contra su API local.
