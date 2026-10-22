// Cabeceras municipales de Michoacán (estado 16).
// Fuente: INEGI, Catálogo Único de Claves de Áreas Geoestadísticas (localidad 0001 = cabecera).
// Para agregar otro estado: otro arreglo igual y sumarlo a MUNICIPALITIES.

export type Municipality = {
  code: string;
  name: string;
  stateCode: string;
  stateName: string;
  lat: number;
  lng: number;
};

const MICHOACAN: [string, string, number, number][] = [
  ['16001', 'Acuitzio', 19.49625, -101.33285],
  ['16002', 'Aguililla', 18.73423, -102.78838],
  ['16003', 'Álvaro Obregón', 19.82631, -101.03848],
  ['16004', 'Angamacutiro', 20.14965, -101.70831],
  ['16005', 'Angangueo', 19.61983, -100.28551],
  ['16006', 'Apatzingán', 19.08723, -102.35526],
  ['16007', 'Aporo', 19.67084, -100.41113],
  ['16008', 'Aquila', 18.59914, -103.50475],
  ['16009', 'Ario', 19.20781, -101.70939],
  ['16010', 'Arteaga', 18.35569, -102.29006],
  ['16011', 'Briseñas', 20.27123, -102.56106],
  ['16012', 'Buenavista', 19.21174, -102.58789],
  ['16013', 'Carácuaro', 19.01731, -101.12699],
  ['16014', 'Coahuayana', 18.70247, -103.66293],
  ['16015', 'Coalcomán de Vázquez Pallares', 18.7771, -103.15955],
  ['16016', 'Coeneo', 19.82098, -101.58375],
  ['16017', 'Contepec', 19.95527, -100.16446],
  ['16018', 'Copándaro', 19.89382, -101.21531],
  ['16019', 'Cotija', 19.81029, -102.70582],
  ['16020', 'Cuitzeo', 19.96821, -101.13958],
  ['16021', 'Charapan', 19.65017, -102.25274],
  ['16022', 'Charo', 19.74749, -101.04686],
  ['16023', 'Chavinda', 20.00694, -102.45858],
  ['16024', 'Cherán', 19.68765, -101.95482],
  ['16025', 'Chilchota', 19.84921, -102.11944],
  ['16026', 'Chinicuila', 18.75817, -103.3678],
  ['16027', 'Chucándiro', 19.89997, -101.33339],
  ['16028', 'Churintzio', 20.15096, -102.06592],
  ['16029', 'Churumuco', 18.66456, -101.64655],
  ['16030', 'Ecuandureo', 20.16262, -102.19457],
  ['16031', 'Epitacio Huerta', 20.13469, -100.29372],
  ['16032', 'Erongarícuaro', 19.58825, -101.72009],
  ['16033', 'Gabriel Zamora', 19.1598, -102.05397],
  ['16034', 'Hidalgo', 19.68935, -100.55516],
  ['16035', 'La Huacana', 18.96289, -101.80887],
  ['16036', 'Huandacareo', 19.9887, -101.27585],
  ['16037', 'Huaniqueo', 19.89899, -101.50515],
  ['16038', 'Huetamo', 18.62643, -100.89973],
  ['16039', 'Huiramba', 19.54648, -101.43799],
  ['16040', 'Indaparapeo', 19.79006, -100.96849],
  ['16041', 'Irimbo', 19.69749, -100.4791],
  ['16042', 'Ixtlán', 20.16837, -102.39462],
  ['16043', 'Jacona', 19.95632, -102.30602],
  ['16044', 'Jiménez', 19.92227, -101.74929],
  ['16045', 'Jiquilpan', 19.98972, -102.71856],
  ['16046', 'Juárez', 19.31226, -100.43352],
  ['16047', 'Jungapeo', 19.45873, -100.49461],
  ['16048', 'Lagunillas', 19.56462, -101.41478],
  ['16049', 'Madero', 19.39212, -101.27762],
  ['16050', 'Maravatío', 19.89167, -100.44167],
  ['16051', 'Marcos Castellanos', 19.99024, -103.0215],
  ['16052', 'Lázaro Cárdenas', 17.96233, -102.19798],
  ['16053', 'Morelia', 19.70338, -101.19205],
  ['16054', 'Morelos', 20.00425, -101.41239],
  ['16055', 'Múgica', 19.0288, -102.08673],
  ['16056', 'Nahuatzen', 19.65407, -101.91714],
  ['16057', 'Nocupétaro', 19.0433, -101.16223],
  ['16058', 'Nuevo Parangaricutiro', 19.41664, -102.12988],
  ['16059', 'Nuevo Urecho', 19.16587, -101.86885],
  ['16060', 'Numarán', 20.2549, -101.9472],
  ['16061', 'Ocampo', 19.58385, -100.33928],
  ['16062', 'Pajacuarán', 20.11689, -102.56551],
  ['16063', 'Panindícuaro', 19.98396, -101.76146],
  ['16064', 'Parácuaro', 19.14577, -102.22005],
  ['16065', 'Paracho', 19.6473, -102.04847],
  ['16066', 'Pátzcuaro', 19.5136, -101.61012],
  ['16067', 'Penjamillo', 20.10447, -101.93367],
  ['16068', 'Peribán', 19.52073, -102.41619],
  ['16069', 'La Piedad', 20.34145, -102.02255],
  ['16070', 'Purépero', 19.90996, -102.00674],
  ['16071', 'Puruándiro', 20.08866, -101.5152],
  ['16072', 'Queréndaro', 19.80982, -100.88352],
  ['16073', 'Quiroga', 19.66379, -101.524],
  ['16074', 'Cojumatlán de Régules', 20.119, -102.85101],
  ['16075', 'Los Reyes', 19.58897, -102.47468],
  ['16076', 'Sahuayo', 20.05768, -102.7168],
  ['16077', 'San Lucas', 18.59141, -100.78475],
  ['16078', 'Santa Ana Maya', 20.00839, -101.02176],
  ['16079', 'Salvador Escalante', 19.40609, -101.6398],
  ['16080', 'Senguio', 19.73323, -100.35238],
  ['16081', 'Susupuato', 19.21515, -100.40833],
  ['16082', 'Tacámbaro', 19.23554, -101.45733],
  ['16083', 'Tancítaro', 19.3375, -102.36303],
  ['16084', 'Tangamandapio', 19.95399, -102.4328],
  ['16085', 'Tangancícuaro', 19.88823, -102.20845],
  ['16086', 'Tanhuato', 20.28381, -102.32764],
  ['16087', 'Taretan', 19.33456, -101.9179],
  ['16088', 'Tarímbaro', 19.79567, -101.17639],
  ['16089', 'Tepalcatepec', 19.19137, -102.84371],
  ['16090', 'Tingambato', 19.50189, -101.85348],
  ['16091', 'Tingüindín', 19.73914, -102.48292],
  ['16092', 'Tiquicheo de Nicolás Romero', 18.90049, -100.73645],
  ['16093', 'Tlalpujahua', 19.8053, -100.17359],
  ['16094', 'Tlazazalca', 19.97124, -102.05668],
  ['16095', 'Tocumbo', 19.70329, -102.52096],
  ['16096', 'Tumbiscatío', 18.5248, -102.37502],
  ['16097', 'Turicato', 19.05387, -101.41953],
  ['16098', 'Tuxpan', 19.56796, -100.46378],
  ['16099', 'Tuzantla', 19.20761, -100.57306],
  ['16100', 'Tzintzuntzan', 19.62544, -101.57695],
  ['16101', 'Tzitzio', 19.58551, -100.92465],
  ['16102', 'Uruapan', 19.42089, -102.0628],
  ['16103', 'Venustiano Carranza', 20.11597, -102.65236],
  ['16104', 'Villamar', 20.02086, -102.59578],
  ['16105', 'Vista Hermosa', 20.27312, -102.47365],
  ['16106', 'Yurécuaro', 20.34109, -102.28243],
  ['16107', 'Zacapu', 19.81862, -101.79286],
  ['16108', 'Zamora', 19.98358, -102.28596],
  ['16109', 'Zináparo', 20.17319, -101.99877],
  ['16110', 'Zinapécuaro', 19.86028, -100.82758],
  ['16111', 'Ziracuaretiro', 19.41699, -101.9105],
  ['16112', 'Zitácuaro', 19.43718, -100.35749],
  ['16113', 'José Sixto Verduzco', 20.30218, -101.59686],
];

export const MUNICIPALITIES: readonly Municipality[] = MICHOACAN.map(
  ([code, name, lat, lng]) => ({
    code,
    name,
    stateCode: '16',
    stateName: 'Michoacán',
    lat,
    lng,
  }),
);

const byCode = new Map(MUNICIPALITIES.map((m) => [m.code, m]));

export function findMunicipality(code?: string | null) {
  return code ? (byCode.get(code) ?? null) : null;
}

/** Distancia en línea recta entre dos puntos, en km (fórmula de Haversine). */
export function distanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
) {
  const rad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** Distancia entre las cabeceras de dos municipios; 0 si es el mismo. Null si no existen. */
export function municipalityDistanceKm(fromCode: string, toCode: string) {
  if (fromCode === toCode) return findMunicipality(fromCode) ? 0 : null;
  const from = findMunicipality(fromCode);
  const to = findMunicipality(toCode);
  return from && to ? distanceKm(from, to) : null;
}
