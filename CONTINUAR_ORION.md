# ORION - CHECKPOINT DE DESARROLLO

Fecha del checkpoint: 12/08/2026

## RUTA PRINCIPAL

C:\Users\Admin\Documents\ORION

## BACKEND

C:\Users\Admin\Documents\ORION\apps\api

Tecnologías:
- NestJS
- TypeScript
- Prisma 7
- PostgreSQL 17
- Docker

API local:
http://localhost:3000

Base de datos:
orion

Contenedor PostgreSQL:
orion-postgres

## FRONTEND

C:\Users\Admin\Documents\ORION\apps\web

Tecnologías:
- Next.js
- React
- TypeScript
- Tailwind
- App Router

Frontend local previsto:
http://localhost:3001

---

# VISIÓN DE ORION

ORION será un núcleo universal y modular.

No crear sistemas separados por giro.

El mismo ORION podrá activar módulos diferentes para:

- Papelería
- Boutique
- Tienda
- Restaurante
- Uñas
- Escuelas
- Salud
- Talleres
- Campo
- Transporte
- Gobierno
- Otros sectores

Principios:

- Fácil de usar.
- Poco trabajo de configuración para el cliente.
- Tablet, teléfono y computadora.
- PWA instalable.
- Offline-first.
- Sincronización automática al recuperar internet.
- El humano toma las decisiones.
- IA recomienda y explica.
- No duplicar motores por cada giro.
- Cada cliente solo ve los módulos que necesita.

---

# NÚCLEO YA DESARROLLADO

Existen bases o módulos para:

- Company
- User
- Role / permisos
- Customer
- LoyaltyProgram
- CustomerReward
- Visit
- Catalog
- Product
- ProductVariant
- ProductImage
- ProductCategory
- Promotion
- Site / SiteSection
- Supplier
- InventoryItem
- StockMovement
- InventoryCount
- StockReceipt
- StockReceiptLine
- ProductRecipe
- ProductRecipeComponent
- Order
- OrderItem
- Payment
- DiningTable
- OrderSplit
- OrderSplitItem
- Workflow
- Event
- Incident
- Knowledge
- Experience

---

# INVENTARIO

Debe soportar:

- piezas
- kg
- gramos
- litros
- ml
- botellas
- cajas
- paquetes
- pares
- docenas
- rollos

Tipos de control:

exact
estimated
count_only

Puede haber:

- compra a proveedor
- compra manual
- venta
- consumo por receta
- merma
- producto echado a perder
- porción extra
- cortesía
- consumo interno
- daño
- caducidad
- ajustes por conteo

IMPORTANTE:

El conteo físico conserva:

- cantidad esperada
- cantidad real
- diferencia
- motivo

No simplemente cambia el stock sin historial.

---

# RECEPCIÓN DE PROVEEDORES

Una recepción puede contener muchos productos.

Ejemplo:

- 25 kg camarón
- 12 botellas tequila
- 3 cajas refrescos
- 5 paquetes vasos

Se manejan:

purchaseUnit
purchaseConversion

Ejemplo:

Tequila:
unidad base = ml
unidad de compra = bottle
conversión = 750

12 botellas = 9000 ml.

---

# RECETAS

Las recetas son OPCIONALES.

Producto sin receta:
la venta continúa normalmente.

Producto con receta desactivada:
la venta continúa y no descuenta ingredientes.

Producto con receta activa:
descuenta componentes automáticamente.

Ejemplo restaurante:

Cantarito:
- tequila 60 ml
- refresco 1 pieza
- limón
- vaso

Ejemplo uñas:

Gelish:
- gel
- removedor
- algodón

Boutique normalmente trabaja sin receta.

---

# PEDIDOS Y VENTAS

Order maneja:

- empresa
- cliente opcional
- campaña de fidelización opcional
- productos
- variantes
- cantidad
- precio
- total
- origen
- estado
- paymentStatus

Orígenes planteados:

counter
qr
web
whatsapp
didi
uber
manual

Confirmar pedido:

- descuenta inventario una sola vez
- consume receta si está activa
- registra movimientos
- puede sumar una visita de fidelización
- puede crear recompensa

IMPORTANTE:

Dividir posteriormente la cuenta NO vuelve a descontar inventario.

---

# PAGOS

Payment soporta:

- cash
- card
- transfer
- other

Puede existir pago parcial.

Ejemplo:

Cuenta $500

Tarjeta $300
Efectivo $200

paymentStatus:
partial -> paid

Propina todavía debe implementarse por separado.

La propina NO debe mezclarse con ventas.

---

# RESTAURANTE

Diseño previsto:

DiningTable
Order
OrderSplit
OrderSplitItem
Payment
Tip
OrderDiscount

La cuenta debe poder:

- cobrarse completa
- dividirse por partes iguales
- dividirse por monto
- dividirse por productos
- pagarse con varios métodos

Pero la interfaz debe ser rápida.

Dividir cuenta será OPCIONAL, no una pantalla obligatoria.

---

# PROMOCIONES Y DESCUENTOS

Falta integrar completamente promociones al Checkout.

Debe soportar:

- promoción por fecha
- promoción del día
- porcentaje
- monto fijo
- precio especial
- descuento a un producto
- descuento a toda la cuenta
- descuento VIP
- descuento especial solo para una mesa/pedido
- descuento manual autorizado

Debe conservar:

- motivo
- cantidad
- quién autorizó
- promoción relacionada
- fecha

---

# PROPINA

PENDIENTE.

Debe estar separada de ventas.

Ejemplo:

Venta: $900
Propina: $100
Total cobrado físicamente: $1000

Reportes deben distinguir:

Ventas $900
Propinas $100

Puede ser:

- efectivo
- tarjeta
- transferencia
- mesero
- equipo
- fondo común

---

# DEVOLUCIONES

PENDIENTE Y PRIORITARIO.

Diseño:

Return
ReturnItem
Refund

Debe soportar:

- devolución total
- devolución parcial
- cambio
- reembolso
- diferencia a cobrar

IMPORTANTE:

En papelería/boutique:

Producto vendible:
puede regresar a inventario.

Producto dañado:
NO vuelve al stock vendible.

En restaurante:

Un platillo reembolsado NO devuelve automáticamente los ingredientes porque ya fueron preparados/consumidos.

La venta original nunca se borra.

---

# PAPELERÍA

Hay un posible cliente pequeño de papelería.

Puede ser un buen primer piloto porque requiere menos complejidad que restaurante.

ORION Papelería necesita principalmente:

- POS / Caja
- productos
- inventario
- código de barras
- proveedores
- entradas de mercancía
- ventas
- clientes
- promociones
- devoluciones
- reportes
- offline

No necesita:

- mesas
- recetas
- propinas
- división de cuenta

Agregar barcode separado de sku.

---

# BOUTIQUE / UÑAS

Boutique:

- productos
- fotos
- temporada
- tallas
- colores
- variantes
- promociones
- inventario
- clientes
- fidelización
- devoluciones

Uñas:

- servicios
- galería
- tendencias
- clientes
- fidelización
- citas posteriormente
- inventario de materiales
- recetas/consumo opcionales

---

# OFFLINE / MULTIDISPOSITIVO

REQUISITO CENTRAL.

ORION debe funcionar en:

- teléfono
- tablet
- computadora

No pedirle al cliente instalar:

- Node
- Docker
- PostgreSQL
- XAMPP
- configuraciones técnicas

Visión:

PWA instalable.

Local:
IndexedDB

Cola:
Outbox

Servidor:
NestJS + PostgreSQL

Sin internet:
ORION sigue trabajando.

Cuando regresa internet:
sincroniza automáticamente.

Se necesita posteriormente:

- Device
- Sync Engine
- Outbox
- idempotency
- conflictos
- versiones
- estado de sincronización
- almacenamiento persistente

No depender solo de Background Sync.

Prueba futura obligatoria:

1. instalar ORION
2. quitar internet
3. realizar venta
4. cobrar
5. cerrar ORION
6. abrir sin internet
7. comprobar que sigue la venta
8. activar internet
9. sincronizar
10. abrir otra computadora
11. comprobar que aparece la venta

---

# RENDIMIENTO

ORION no debe hacer esperar al cajero.

Checkout ideal:

seleccionar productos
-> total
-> cuánto pagó
-> forma de pago
-> propina opcional
-> COBRAR

Una sola acción del empleado.

Aunque internamente se creen:

- Order
- Payment
- Tip
- Discount
- InventoryMovement
- Visit
- Reward

el frontend debe esconder esa complejidad.

Más adelante crear un Checkout Engine / endpoint para procesar toda la venta.

Offline:
guardar local inmediatamente y sincronizar en segundo plano.

No cargar todo el historial ni todas las fotos en cada pantalla.

Usar paginación y caché local.

---

# ORION EDUCATION

NO desarrollar todavía.

Primero terminar Business y tener clientes reales.

Posteriormente Education reutilizará:

- personas
- usuarios
- roles
- horarios
- pagos
- inventario
- notificaciones
- documentos
- workflows
- incidentes
- analytics

Módulos educativos previstos:

- alumnos
- tutores
- maestros
- grupos
- asistencia
- calificaciones
- tareas
- exámenes
- horarios
- biblioteca
- pagos
- becas
- transporte
- comunicación
- orientación
- estadísticas

IA debe ayudar a aprender, no hacer automáticamente el trabajo del alumno.

---

# ORION UNIVERSAL CORE

Dirección futura:

Identity
People
Permissions
Locations
Workflow
Forms
Documents
Tasks
Schedule
Inventory
Assets
Transactions
Payments
Notifications
Audit
Offline
Sync
AI
Analytics

Después paquetes:

Business
Restaurant
Education
Health
Government
Agriculture
Transport
etc.

---

# RECOMENDACIÓN DE PRODUCTO

NO agregar muchos motores nuevos antes de tener algo utilizable.

Prioridad actual:

1. cerrar devolución/cambio/reembolso
2. descuento
3. propina
4. Checkout rápido
5. barcode
6. pantalla POS
7. productos/inventario frontend
8. reportes básicos
9. PWA
10. offline/sync
11. piloto real

La papelería puede ser el primer piloto si boutique/restaurante no se concretan.

---

# DEUDA TÉCNICA IMPORTANTE

Antes de producción:

1. Revisar dinero almacenado como Float.
   Preferir Decimal o centavos enteros.

2. Evitar dos fuentes independientes de stock:
   Product/ProductVariant.stock
   vs
   InventoryItem.quantity.

Debe definirse InventoryItem como fuente física principal o crear una relación clara.

3. create InventoryItem con initialQuantity actualmente debe revisarse:
   la existencia inicial idealmente debe generar movimiento de auditoría.

4. Revisar concurrencia de inventario.

5. Seguridad y permisos de endpoints.

6. Validación y auditoría.

7. Respaldos.

---

# PRÓXIMO BLOQUE DE CÓDIGO

NO continuar agregando funciones de restaurante sin cerrar antes el circuito comercial.

Siguiente prioridad recomendada:

RETURN ENGINE

Crear:

Return
ReturnItem
Refund

Después:

OrderDiscount
Tip
Checkout Engine
Barcode
POS Frontend

---

# FORMA DE TRABAJO

Siempre indicar:

- ruta completa del archivo
- si se reemplaza TODO o solo una parte
- dónde insertar código
- código completo cuando se crea archivo
- comando exacto
- resultado esperado

No dejar archivos vacíos.

No asumir que un módulo está creado o registrado sin comprobarlo.

Después de cada bloque importante:

- prisma validate cuando corresponda
- npm run build
- prueba de endpoint
- git commit