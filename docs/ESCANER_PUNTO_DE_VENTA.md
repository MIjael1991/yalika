# Escáner en el punto de venta

## Lector USB o Bluetooth

Un lector configurado como teclado HID no necesita integración especial:

1. Conectar el lector por USB o emparejarlo por Bluetooth.
2. Configurarlo para enviar `Enter` después del código (sufijo CR o CR/LF).
3. Abrir Punto de venta. Yalika mantiene activo el campo “Buscar producto o
   escanear código”.
4. Escanear un producto conocido: se agrega una unidad. Si vuelve a escanearse,
   aumenta la cantidad sin rebasar la existencia disponible.
5. Escanear un código desconocido: un usuario autorizado puede elegir
   “Registrar producto”; el código queda precargado y solo completa nombre,
   precio y existencia.

La prueba correcta es abrir el Bloc de notas y escanear. Debe aparecer el número
del código y bajar a la línea siguiente. Si no baja, hay que activar el sufijo
`Enter` usando el manual del lector.

## Carga del inventario inicial

- Catálogo pequeño: escanear, registrar el producto y escribir su existencia.
- Catálogo grande: importar primero Excel/CSV y usar el lector para verificar
  códigos y contar existencias. Esto evita capturar uno por uno.
- Un código debe pertenecer a un solo producto o variante dentro de la empresa.

## Cámara del teléfono

Será una opción adicional para quien no tenga lector. La cámara debe pedir
permiso, leer EAN-8, EAN-13, UPC-A, UPC-E y Code 128, emitir vibración/sonido y
bloquear lecturas repetidas durante un instante. No sustituye al lector en una
caja con muchas ventas, pero sirve para inventario y negocios pequeños.

## Reglas para evitar errores

- No descontar inventario al escanear; se descuenta únicamente al confirmar el
  cobro.
- Una venta cancelada antes de cobrar no llega al historial ni mueve stock.
- Una venta pagada solo se anula con autorización, motivo y devolución física
  confirmada.
- Mostrar una advertencia clara cuando no hay existencia.
