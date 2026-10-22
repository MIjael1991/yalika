import {
  MUNICIPALITIES,
  distanceKm,
  findMunicipality,
  municipalityDistanceKm,
} from './municipios';

describe('catálogo de municipios', () => {
  it('tiene los 113 municipios de Michoacán, sin claves repetidas', () => {
    expect(MUNICIPALITIES).toHaveLength(113);
    expect(new Set(MUNICIPALITIES.map((m) => m.code)).size).toBe(113);
    expect(MUNICIPALITIES.every((m) => /^16\d{3}$/.test(m.code))).toBe(true);
    expect(findMunicipality('16053')?.name).toBe('Morelia');
    expect(findMunicipality('16102')?.name).toBe('Uruapan');
    expect(findMunicipality('99999')).toBeNull();
  });

  it('las coordenadas caen dentro de Michoacán', () => {
    for (const m of MUNICIPALITIES) {
      expect(m.lat).toBeGreaterThan(17.8);
      expect(m.lat).toBeLessThan(20.5);
      expect(m.lng).toBeGreaterThan(-103.8);
      expect(m.lng).toBeLessThan(-100);
    }
  });

  it('calcula distancias razonables entre cabeceras', () => {
    expect(municipalityDistanceKm('16053', '16053')).toBe(0);
    // Morelia–Tarímbaro: vecinos, poco más de 10 km.
    expect(municipalityDistanceKm('16053', '16088')).toBeLessThan(15);
    // Morelia–Uruapan: alrededor de 95 km en línea recta.
    const km = municipalityDistanceKm('16053', '16102')!;
    expect(km).toBeGreaterThan(85);
    expect(km).toBeLessThan(105);
    expect(municipalityDistanceKm('16053', '99999')).toBeNull();
    expect(distanceKm({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(
      111.2,
      0,
    );
  });
});
