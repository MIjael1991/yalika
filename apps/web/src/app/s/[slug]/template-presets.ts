// Catálogo de plantillas Yalika. Para agregar una nueva (por ejemplo otra temporada)
// basta con sumar un objeto a PRESETS y su id a la lista de plantillas permitidas de la API.

export type PresetItem = {
  n: string;
  kind: string;
  a?: string;
  b?: string;
  bg: string;
  meta?: string;
  house?: 'casa' | 'depa' | 'local' | 'terreno';
  hv?: number;
};

export type Preset = {
  id: string;
  label: string;
  group: 'negocio' | 'temporada';
  font: 'serif' | 'sans' | 'round';
  c: { bg: string; fg: string; mut: string; accent: string; accent2: string; soft: string; card: string; deep: string; onAccent: string };
  hero: string;
  eyebrow: string;
  title: string;
  lead: string;
  cta: string;
  ctaMessage: string;
  itemsNav: string;
  itemsTitle: string;
  itemsLead: string;
  itemCta: string;
  items: PresetItem[];
  highlights: Array<[string, string]>;
  stepsTitle: string;
  steps: Array<[string, string]>;
  contactTitle: string;
  contactLead: string;
};

const P = (p: Preset) => p;

export const PRESETS: Preset[] = [
  P({
    id: 'yk_inmobiliaria', label: 'Inmobiliaria', group: 'negocio', font: 'sans',
    c: { bg: '#f2f6f7', fg: '#12303d', mut: '#4f6a74', accent: '#0e6f8a', accent2: '#f2a900', soft: '#dcebef', card: '#ffffff', deep: '#12303d', onAccent: '#ffffff' },
    hero: 'inmobiliaria', eyebrow: 'Asesoría inmobiliaria',
    title: 'Encuentra el lugar donde quieres vivir o invertir.',
    lead: 'Compra, venta y renta de casas, departamentos, locales y terrenos, con acompañamiento de principio a fin.',
    cta: 'Agendar visita', ctaMessage: 'Hola, quiero agendar una visita. Me interesa:',
    itemsNav: 'Propiedades', itemsTitle: 'Propiedades disponibles', itemsLead: 'Cada ficha lleva fotos, medidas y ubicación. Pregunta por precio y visitas.',
    itemCta: 'Me interesa',
    items: [
      { n: 'Casa de tres recámaras', kind: 'house', house: 'casa', hv: 0, bg: '#dcebef', meta: '3 rec · 2 baños' },
      { n: 'Departamento de dos recámaras', kind: 'house', house: 'depa', hv: 2, bg: '#dcebef', meta: '2 rec · 1 baño' },
      { n: 'Terreno', kind: 'house', house: 'terreno', hv: 1, bg: '#dcebef', meta: 'Uso habitacional' },
      { n: 'Local comercial', kind: 'house', house: 'local', hv: 2, bg: '#dcebef', meta: 'Frente a calle principal' },
      { n: 'Casa con jardín', kind: 'house', house: 'casa', hv: 1, bg: '#dcebef', meta: '4 rec · 3 baños' },
      { n: 'Departamento amueblado', kind: 'house', house: 'depa', hv: 0, bg: '#dcebef', meta: '1 rec · 1 baño' },
    ],
    highlights: [['Venta', 'casas y terrenos'], ['Renta', 'deptos y locales'], ['Asesoría', 'trámites y avalúo'], ['Acompañamiento', 'hasta la entrega']],
    stepsTitle: 'Así trabajamos',
    steps: [['Cuéntame qué buscas', 'Zona, presupuesto y tiempos.'], ['Visitamos propiedades', 'Agendamos citas con las que sí te convienen.'], ['Cerramos acompañado', 'Revisión de documentos y firma.']],
    contactTitle: 'Cuéntame qué buscas', contactLead: 'Escríbeme por WhatsApp y te respondo con opciones.',
  }),
  P({
    id: 'yk_unas', label: 'Uñas y estética', group: 'negocio', font: 'round',
    c: { bg: '#fff1f4', fg: '#3a0f1f', mut: '#7d4458', accent: '#d81b5c', accent2: '#ff8fb1', soft: '#ffd3df', card: '#ffffff', deep: '#3a0f1f', onAccent: '#ffffff' },
    hero: 'unas', eyebrow: 'Atención con cita',
    title: 'Uñas con personalidad, listas para lucirse.',
    lead: 'Manicure, acrílico y diseños a mano. Elige tu estilo y agenda por WhatsApp.',
    cta: 'Agendar cita', ctaMessage: 'Hola, quiero agendar una cita para:',
    itemsNav: 'Servicios', itemsTitle: 'Servicios y diseños', itemsLead: 'Elige el que más te guste y te proponemos día y hora.',
    itemCta: 'Agendar',
    items: [
      { n: 'Manicure en gel', kind: 'ombre', a: '#ff8fb1', b: '#d81b5c', bg: '#ffe3ea' },
      { n: 'Uñas acrílicas', kind: 'french', a: '#fff3f6', b: '#d81b5c', bg: '#ffd3df' },
      { n: 'Diseño de cerezas', kind: 'cherry', a: '#fff1f4', b: '#d81b5c', bg: '#ffc9d8' },
      { n: 'Corazones y brillos', kind: 'hearts', a: '#ffb3c9', b: '#ffffff', bg: '#fde0ea' },
      { n: 'Efecto chrome', kind: 'chrome', a: '#f4d3ff', b: '#9fd7ee', bg: '#e9e3f6' },
      { n: 'Glitter fino', kind: 'glitter', a: '#d81b5c', b: '#ffe08a', bg: '#ffe3ea' },
    ],
    highlights: [['Con cita', 'sin esperas'], ['Diseños a mano', 'a tu gusto'], ['Material cuidado', 'higiene primero'], ['Confirmación', 'por WhatsApp']],
    stepsTitle: 'Reserva en tres pasos',
    steps: [['Elige servicio y diseño', 'Agrégalo a tu cita.'], ['Envía tu solicitud', 'Te proponemos día y hora.'], ['Confirma y llega puntual', 'Si no puedes, avísanos con tiempo.']],
    contactTitle: 'Escríbenos', contactLead: 'Cuéntanos qué diseño quieres y te damos fecha.',
  }),
  P({
    id: 'yk_boutique', label: 'Boutique moderna', group: 'negocio', font: 'serif',
    c: { bg: '#fbf3f6', fg: '#2a1830', mut: '#6e5575', accent: '#8b3a62', accent2: '#d9a441', soft: '#f1dbe5', card: '#ffffff', deep: '#2a1830', onAccent: '#ffffff' },
    hero: 'boutique', eyebrow: 'Moda que se siente tuya',
    title: 'Looks para cada día, con luz de luna.',
    lead: 'Vestidos, blusas, pantalones y accesorios. Aparta tu talla y recoge en tienda.',
    cta: 'Pedir por WhatsApp', ctaMessage: 'Hola, quiero pedir:',
    itemsNav: 'Colección', itemsTitle: 'Nuestra colección', itemsLead: 'Prendas y accesorios seleccionados. Pregunta por tallas y existencia.',
    itemCta: 'Lo quiero',
    items: [
      { n: 'Vestido largo', kind: 'vestido', a: '#8b3a62', bg: '#f1dbe5', meta: 'Tallas CH · M · G' },
      { n: 'Blusa satinada', kind: 'blusa', a: '#c76d96', bg: '#f9e3ec', meta: 'Tallas CH · M · G' },
      { n: 'Pantalón de vestir', kind: 'pantalon', a: '#4a3b5c', bg: '#e8e1ee', meta: 'Tallas 26 a 34' },
      { n: 'Bolsa de mano', kind: 'bolsa', a: '#b5734a', bg: '#f6e8da' },
      { n: 'Aretes dorados', kind: 'aretes', a: '#d9a441', bg: '#f3e9f4' },
      { n: 'Sandalia de tacón', kind: 'zapato', a: '#c76d96', bg: '#f9e3ec', meta: 'Del 22 al 27' },
    ],
    highlights: [['Novedades', 'cada semana'], ['Apartado', 'con anticipo'], ['Recoge en tienda', 'o acordamos envío'], ['Cambios', 'según política']],
    stepsTitle: 'Cómo comprar',
    steps: [['Elige tus piezas', 'Y mándanos el nombre o la foto.'], ['Confirmamos talla y existencia', 'Te decimos el total.'], ['Aparta y recoge', 'Tu pieza queda guardada hasta la fecha acordada.']],
    contactTitle: 'Escríbenos', contactLead: 'Te ayudamos a armar tu look.',
  }),
  P({
    id: 'yk_papeleria', label: 'Papelería moderna', group: 'negocio', font: 'round',
    c: { bg: '#f3f8ff', fg: '#0b2559', mut: '#4a5f8f', accent: '#1f5fe0', accent2: '#ffd60a', soft: '#dbe8ff', card: '#ffffff', deep: '#0b2559', onAccent: '#ffffff' },
    hero: 'papeleria', eyebrow: 'Escolar · Oficina · Creatividad',
    title: 'Todo para tus ideas, en un solo lugar.',
    lead: 'Lapiceros, cuadernos, mochilas y material de arte. Cotiza por WhatsApp y pregunta por mayoreo.',
    cta: 'Cotizar', ctaMessage: 'Hola, quiero cotizar:',
    itemsNav: 'Productos', itemsTitle: 'Productos destacados', itemsLead: 'Escritura, escolar, oficina y arte.',
    itemCta: 'Cotizar',
    items: [
      { n: 'Lapicero gel', kind: 'lapicero', a: '#1f5fe0', bg: '#dbe8ff' },
      { n: 'Lapiceros de colores', kind: 'lapiceros', bg: '#fff3b0' },
      { n: 'Cuaderno profesional', kind: 'cuaderno', a: '#1f5fe0', bg: '#fff3b0' },
      { n: 'Marcadores fluorescentes', kind: 'marcadores', bg: '#e0f3fb' },
      { n: 'Mochila escolar', kind: 'mochila', a: '#2b3a67', bg: '#dbe8ff' },
      { n: 'Kit de arte', kind: 'arte', bg: '#fde0ea' },
    ],
    highlights: [['Escritura', 'lapiceros y marcadores'], ['Escolar', 'cuadernos y mochilas'], ['Oficina', 'hojas y archivo'], ['Arte', 'pintura y manualidades']],
    stepsTitle: 'Cotiza fácil',
    steps: [['Manda tu lista', 'Por WhatsApp, con foto si quieres.'], ['Te respondemos con el total', 'Y los productos disponibles.'], ['Recoge o acuerda entrega', 'Pregunta por mayoreo y escuelas.']],
    contactTitle: 'Pide tu cotización', contactLead: 'Escríbenos tu lista y te respondemos.',
  }),
  P({
    id: 'yk_dia_muertos', label: 'Día de Muertos', group: 'temporada', font: 'serif',
    c: { bg: '#1d0b2e', fg: '#fff3e0', mut: '#d8c0e8', accent: '#ff9f1c', accent2: '#e63e8a', soft: '#3a1a52', card: '#2c1442', deep: '#12061e', onAccent: '#1d0b2e' },
    hero: 'muertos', eyebrow: 'Temporada · Día de Muertos',
    title: 'Honra, recuerda y celebra con lo mejor de la temporada.',
    lead: 'Pan, flores, velas y detalles para tu ofrenda. Haz tu pedido con tiempo.',
    cta: 'Hacer mi pedido', ctaMessage: 'Hola, quiero hacer un pedido de temporada:',
    itemsNav: 'Temporada', itemsTitle: 'Especiales de temporada', itemsLead: 'Disponibles por tiempo limitado.',
    itemCta: 'Pedir',
    items: [
      { n: 'Pan de muerto', kind: 'pan', a: '#ff9f1c', b: '#c2410c', bg: '#3a1a52' },
      { n: 'Cempasúchil', kind: 'flor', a: '#ff9f1c', b: '#c2410c', bg: '#3a1a52' },
      { n: 'Velas para ofrenda', kind: 'vela', a: '#f6e9d0', bg: '#3a1a52' },
      { n: 'Papel picado', kind: 'papel', a: '#ff9f1c', b: '#e63e8a', bg: '#3a1a52' },
      { n: 'Arreglo de ofrenda', kind: 'flor', a: '#ffb703', b: '#e63e8a', bg: '#3a1a52' },
      { n: 'Paquete familiar', kind: 'regalo', a: '#e63e8a', b: '#ff9f1c', bg: '#3a1a52' },
    ],
    highlights: [['Pedidos', 'con anticipación'], ['Hecho con cariño', 'a la tradición'], ['Entrega', 'o recoges'], ['Edición limitada', 'solo en temporada']],
    stepsTitle: 'Cómo pedir',
    steps: [['Elige tus favoritos', 'Pan, flores, velas o paquetes.'], ['Envíanos tu pedido', 'Confirmamos disponibilidad y total.'], ['Recoge o recibe', 'Acordamos día y hora.']],
    contactTitle: 'Haz tu pedido', contactLead: 'Escríbenos y reserva tu temporada.',
  }),
  P({
    id: 'yk_navidad', label: 'Navidad', group: 'temporada', font: 'serif',
    c: { bg: '#0f3b2e', fg: '#fff7f0', mut: '#bfe3d3', accent: '#e8433f', accent2: '#f5c451', soft: '#17503f', card: '#146048', deep: '#0a2a20', onAccent: '#ffffff' },
    hero: 'navidad', eyebrow: 'Temporada · Navidad',
    title: 'Regalos y detalles para compartir en Navidad.',
    lead: 'Encuentra el regalo perfecto o arma un paquete especial. Pide por WhatsApp.',
    cta: 'Pedir regalo', ctaMessage: 'Hola, quiero pedir para Navidad:',
    itemsNav: 'Regalos', itemsTitle: 'Ideas para regalar', itemsLead: 'Hay para todos los presupuestos.',
    itemCta: 'Lo quiero',
    items: [
      { n: 'Árbol decorado', kind: 'arbol', a: '#2a9d6c', bg: '#17503f' },
      { n: 'Regalo sorpresa', kind: 'regalo', a: '#e8433f', b: '#f5c451', bg: '#17503f' },
      { n: 'Esferas navideñas', kind: 'esfera', a: '#e8433f', b: '#f5c451', bg: '#17503f' },
      { n: 'Paquete familiar', kind: 'regalo', a: '#f5c451', b: '#e8433f', bg: '#17503f' },
      { n: 'Detalle de intercambio', kind: 'regalo', a: '#ffffff', b: '#e8433f', bg: '#17503f' },
      { n: 'Estrella de cortesía', kind: 'estrella', a: '#f5c451', b: '#fff7f0', bg: '#17503f' },
    ],
    highlights: [['Regalos', 'para todos'], ['Paquetes', 'a tu medida'], ['Envuelto', 'listo para regalar'], ['Pide a tiempo', 'antes de que se agote']],
    stepsTitle: 'Así de fácil',
    steps: [['Elige tu regalo', 'O dinos para quién es.'], ['Confirma por WhatsApp', 'Te decimos disponibilidad y total.'], ['Recoge o recibe', 'Con moño y todo.']],
    contactTitle: 'Pide tu regalo', contactLead: 'Escríbenos y lo preparamos.',
  }),
  P({
    id: 'yk_amor', label: 'Amor y amistad', group: 'temporada', font: 'serif',
    c: { bg: '#fff0f3', fg: '#4a0d25', mut: '#8a4560', accent: '#e0245e', accent2: '#ff9bb5', soft: '#ffd6e0', card: '#ffffff', deep: '#4a0d25', onAccent: '#ffffff' },
    hero: 'amor', eyebrow: 'Temporada · Amor y amistad',
    title: 'Detalles que dicen lo que sientes.',
    lead: 'Regalos para tu pareja, tus amigos o para ti. Pide por WhatsApp y lo preparamos.',
    cta: 'Pedir detalle', ctaMessage: 'Hola, quiero pedir un detalle de Amor y Amistad:',
    itemsNav: 'Detalles', itemsTitle: 'Detalles para regalar', itemsLead: 'Para parejas, amigos y familia.',
    itemCta: 'Lo quiero',
    items: [
      { n: 'Corazón de regalo', kind: 'corazon', a: '#e0245e', b: '#ff9bb5', bg: '#ffd6e0' },
      { n: 'Caja sorpresa', kind: 'regalo', a: '#4a0d25', b: '#ff9bb5', bg: '#ffe3ea' },
      { n: 'Paquete para dos', kind: 'regalo', a: '#e0245e', b: '#ffffff', bg: '#ffd6e0' },
      { n: 'Detalle para amigos', kind: 'corazon', a: '#ff9bb5', b: '#e0245e', bg: '#ffe3ea' },
      { n: 'Tarjeta y detalle', kind: 'corazon', a: '#4a0d25', b: '#e0245e', bg: '#ffd6e0' },
      { n: 'Edición especial', kind: 'estrella', a: '#e0245e', b: '#ffd6e0', bg: '#ffe3ea' },
    ],
    highlights: [['Personalizado', 'con tu mensaje'], ['Listo para regalar', 'con empaque'], ['Entrega', 'o recoges'], ['Pide con tiempo', 'las fechas vuelan']],
    stepsTitle: 'Pide en tres pasos',
    steps: [['Elige tu detalle', 'O cuéntanos qué buscas.'], ['Agrega tu mensaje', 'Lo incluimos en tu regalo.'], ['Recoge o recibe', 'Acordamos día y hora.']],
    contactTitle: 'Cuéntanos tu idea', contactLead: 'Te ayudamos a elegir.',
  }),
  P({
    id: 'yk_gran_venta', label: 'Gran venta', group: 'temporada', font: 'sans',
    c: { bg: '#fffbea', fg: '#1a1a1a', mut: '#5b5640', accent: '#e11d2e', accent2: '#ffd400', soft: '#ffe9a0', card: '#ffffff', deep: '#1a1a1a', onAccent: '#ffffff' },
    hero: 'venta', eyebrow: 'Ofertas por tiempo limitado',
    title: 'Gran venta: precios que no vas a querer perderte.',
    lead: 'Descuentos en productos seleccionados. Pregunta por existencia y aparta el tuyo.',
    cta: 'Aprovechar oferta', ctaMessage: 'Hola, quiero aprovechar la oferta de:',
    itemsNav: 'Ofertas', itemsTitle: 'Ofertas de la semana', itemsLead: 'Hasta agotar existencias.',
    itemCta: 'Apartar',
    items: [
      { n: 'Oferta del día', kind: 'etiqueta', a: '#e11d2e', bg: '#ffe9a0' },
      { n: 'Paquete ahorro', kind: 'bolsaCompra', a: '#1a1a1a', b: '#e11d2e', bg: '#ffe9a0' },
      { n: 'Liquidación', kind: 'etiqueta', a: '#1a1a1a', bg: '#fff3c4' },
      { n: 'Dos por uno', kind: 'estrella', a: '#e11d2e', b: '#ffd400', bg: '#fff3c4' },
      { n: 'Regalo con tu compra', kind: 'regalo', a: '#e11d2e', b: '#ffd400', bg: '#ffe9a0' },
      { n: 'Última pieza', kind: 'bolsaCompra', a: '#e11d2e', b: '#1a1a1a', bg: '#fff3c4' },
    ],
    highlights: [['Descuentos', 'en selección'], ['Aparta', 'con anticipo'], ['Existencia limitada', 'hasta agotar'], ['Atención', 'directa por WhatsApp']],
    stepsTitle: 'Cómo aprovechar',
    steps: [['Elige tu oferta', 'Mira lo que tenemos.'], ['Apártala por WhatsApp', 'Confirmamos existencia.'], ['Recoge y paga', 'Antes de que se acabe.']],
    contactTitle: 'Aparta la tuya', contactLead: 'Escríbenos antes de que se agote.',
  }),
  P({
    id: 'yk_madres', label: 'Día de las Madres', group: 'temporada', font: 'serif',
    c: { bg: '#fff5f7', fg: '#4a1230', mut: '#8a5470', accent: '#c2185b', accent2: '#ffc2d4', soft: '#ffe0ea', card: '#ffffff', deep: '#4a1230', onAccent: '#ffffff' },
    hero: 'madres', eyebrow: 'Temporada · 10 de mayo',
    title: 'Un detalle para mamá, hecho con cariño.',
    lead: 'Flores, regalos y paquetes listos para sorprenderla. Pide por WhatsApp y lo preparamos.',
    cta: 'Pedir para mamá', ctaMessage: 'Hola, quiero pedir un detalle para el Día de las Madres:',
    itemsNav: 'Regalos', itemsTitle: 'Regalos para mamá', itemsLead: 'Para consentirla en su día.',
    itemCta: 'Lo quiero',
    items: [
      { n: 'Ramo de flores', kind: 'ramo', a: '#c2185b', b: '#ffd166', bg: '#ffe0ea' },
      { n: 'Caja de regalo', kind: 'regalo', a: '#c2185b', b: '#ffc2d4', bg: '#fff0f4' },
      { n: 'Pastel para compartir', kind: 'pastel', a: '#c2185b', b: '#ffc2d4', bg: '#ffe0ea' },
      { n: 'Aretes y detalle', kind: 'aretes', a: '#c2185b', bg: '#fff0f4' },
      { n: 'Bolsa de regalo', kind: 'bolsa', a: '#8a3a66', bg: '#ffe0ea' },
      { n: 'Con todo mi amor', kind: 'corazon', a: '#c2185b', b: '#ff9bb5', bg: '#fff0f4' },
    ],
    highlights: [['Personalizado', 'con tu mensaje'], ['Listo para regalar', 'con empaque'], ['Entrega', 'o recoges'], ['Pide con tiempo', 'el 10 se llena']],
    stepsTitle: 'Pide en tres pasos',
    steps: [['Elige el regalo', 'O cuéntanos qué le gusta.'], ['Agrega tu mensaje', 'Lo incluimos en la tarjeta.'], ['Recoge o recibe', 'Acordamos día y hora.']],
    contactTitle: 'Cuéntanos qué buscas', contactLead: 'Te ayudamos a elegir el detalle ideal.',
  }),
  P({
    id: 'yk_clases', label: 'Regreso a clases', group: 'temporada', font: 'round',
    c: { bg: '#f0f7ff', fg: '#12285c', mut: '#4a5f8a', accent: '#1f5fe0', accent2: '#ffd60a', soft: '#d9e8ff', card: '#ffffff', deep: '#12285c', onAccent: '#ffffff' },
    hero: 'clases', eyebrow: 'Temporada · Regreso a clases',
    title: 'Todo lo de la lista escolar en un solo lugar.',
    lead: 'Cuadernos, mochilas, colores y más. Manda tu lista por WhatsApp y te la preparamos.',
    cta: 'Mandar mi lista', ctaMessage: 'Hola, quiero cotizar mi lista escolar:',
    itemsNav: 'Útiles', itemsTitle: 'Útiles y mochilas', itemsLead: 'Lo básico para empezar bien el ciclo.',
    itemCta: 'Lo quiero',
    items: [
      { n: 'Mochilas', kind: 'mochila', a: '#e8433f', bg: '#d9e8ff' },
      { n: 'Cuadernos', kind: 'cuaderno', a: '#1f5fe0', bg: '#fff3b0' },
      { n: 'Lápices y colores', kind: 'lapices', bg: '#d9e8ff' },
      { n: 'Marcadores', kind: 'marcadores', bg: '#fff3b0' },
      { n: 'Hojas y papelería', kind: 'hojas', bg: '#d9e8ff' },
      { n: 'Material de arte', kind: 'arte', bg: '#fff3b0' },
    ],
    highlights: [['Tu lista completa', 'la armamos por ti'], ['Precios claros', 'sin sorpresas'], ['Paquetes escolares', 'por grado'], ['Recoge o recibe', 'tú eliges']],
    stepsTitle: 'Así de fácil',
    steps: [['Manda tu lista', 'Foto o texto por WhatsApp.'], ['Te cotizamos', 'Con existencia y precio.'], ['Recoge o recibe', 'Listo antes de la primera clase.']],
    contactTitle: 'Manda tu lista', contactLead: 'Te respondemos con tu cotización.',
  }),
  P({
    id: 'yk_restaurante', label: 'Restaurante y cafetería', group: 'negocio', font: 'serif',
    c: { bg: '#fff8ef', fg: '#3b1f0f', mut: '#7a5a45', accent: '#d9480f', accent2: '#2f9e44', soft: '#ffe6c7', card: '#ffffff', deep: '#3b1f0f', onAccent: '#ffffff' },
    hero: 'restaurante', eyebrow: 'Comida casera',
    title: 'Hecho al momento, con sabor de casa.',
    lead: 'Mira el menú, haz tu pedido por WhatsApp y pasa por él o te lo llevamos.',
    cta: 'Hacer pedido', ctaMessage: 'Hola, quiero hacer un pedido:',
    itemsNav: 'Menú', itemsTitle: 'Nuestro menú', itemsLead: 'Platillos, bebidas y postres del día.',
    itemCta: 'Pedir',
    items: [
      { n: 'Platillo del día', kind: 'plato', a: '#d9480f', b: '#f59f00', bg: '#ffe6c7' },
      { n: 'Comida corrida', kind: 'plato', a: '#2f9e44', b: '#d9480f', bg: '#fff1dc' },
      { n: 'Café y bebidas', kind: 'taza', a: '#7a4a2a', b: '#b08968', bg: '#ffe6c7' },
      { n: 'Postre del día', kind: 'pastel', a: '#d9480f', b: '#ffc078', bg: '#fff1dc' },
      { n: 'Desayunos', kind: 'taza', a: '#d9480f', b: '#f59f00', bg: '#fff1dc' },
      { n: 'Paquete para llevar', kind: 'bolsaCompra', a: '#d9480f', b: '#2f9e44', bg: '#ffe6c7' },
    ],
    highlights: [['Pedido por WhatsApp', 'sin filas'], ['Para llevar', 'o a domicilio'], ['Hecho al momento', 'ingredientes frescos'], ['Pedidos grandes', 'pregunta por paquetes']],
    stepsTitle: 'Pide en tres pasos',
    steps: [['Elige del menú', 'O pregunta qué hay hoy.'], ['Confirma tu pedido', 'Te decimos tiempo y total.'], ['Recoge o recibe', 'Calientito y a tiempo.']],
    contactTitle: 'Haz tu pedido', contactLead: 'Escríbenos y te atendemos de inmediato.',
  }),
  P({
    id: 'yk_taller', label: 'Taller y servicios', group: 'negocio', font: 'sans',
    c: { bg: '#f1f4f8', fg: '#17233a', mut: '#53627d', accent: '#e8590c', accent2: '#2b3a67', soft: '#dbe4ee', card: '#ffffff', deep: '#17233a', onAccent: '#ffffff' },
    hero: 'taller', eyebrow: 'Taller y servicios',
    title: 'Reparación y mantenimiento con garantía.',
    lead: 'Cuéntanos qué falla, te damos presupuesto claro y trabajamos con fecha de entrega.',
    cta: 'Pedir presupuesto', ctaMessage: 'Hola, necesito un presupuesto para:',
    itemsNav: 'Servicios', itemsTitle: 'Servicios que ofrecemos', itemsLead: 'Pregunta por tu caso; cada trabajo se cotiza antes de empezar.',
    itemCta: 'Cotizar',
    items: [
      { n: 'Diagnóstico', kind: 'engrane', a: '#2b3a67', b: '#dbe4ee', bg: '#dbe4ee' },
      { n: 'Mantenimiento', kind: 'llave', a: '#e8590c', bg: '#ffe8d6' },
      { n: 'Reparación', kind: 'llave', a: '#2b3a67', bg: '#dbe4ee' },
      { n: 'Instalación', kind: 'engrane', a: '#e8590c', b: '#ffe8d6', bg: '#ffe8d6' },
      { n: 'Servicio a domicilio', kind: 'bolsaCompra', a: '#2b3a67', b: '#e8590c', bg: '#dbe4ee' },
      { n: 'Garantía por escrito', kind: 'estrella', a: '#e8590c', b: '#ffe8d6', bg: '#ffe8d6' },
    ],
    highlights: [['Presupuesto claro', 'antes de empezar'], ['Garantía', 'en cada trabajo'], ['Fecha de entrega', 'acordada'], ['Seguimiento', 'por WhatsApp']],
    stepsTitle: 'Cómo trabajamos',
    steps: [['Cuéntanos el problema', 'Con fotos si puedes.'], ['Te damos presupuesto', 'Precio y fecha de entrega.'], ['Trabajamos y avisamos', 'Recoges con garantía.']],
    contactTitle: 'Pide tu presupuesto', contactLead: 'Escríbenos y te respondemos hoy.',
  }),
];

export const PRESET_BY_ID: Record<string, Preset> = Object.fromEntries(PRESETS.map((p) => [p.id, p]));
export const PRESET_IDS = PRESETS.map((p) => p.id);

/** Plantilla de temporada sugerida según la fecha (para destacarla en el selector). */
export function suggestedSeason(d: Date = new Date()): string | null {
  const m = d.getMonth();
  if (m === 9 || (m === 10 && d.getDate() <= 3)) return 'yk_dia_muertos';
  if (m === 10) return 'yk_gran_venta';
  if (m === 11) return 'yk_navidad';
  if (m === 0 || (m === 1 && d.getDate() <= 14)) return 'yk_amor';
  if ((m === 3 && d.getDate() >= 20) || (m === 4 && d.getDate() <= 10)) return 'yk_madres';
  if (m === 7 || (m === 8 && d.getDate() <= 7)) return 'yk_clases';
  return null;
}
