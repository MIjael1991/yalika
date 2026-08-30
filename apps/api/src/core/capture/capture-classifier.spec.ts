import { classifyCapture } from './capture-classifier';

const spaces = [
  {
    id: 'personal-1',
    name: 'Mi vida',
    type: 'personal',
  },
  {
    id: 'family-1',
    name: 'Familia Bernabé',
    type: 'family',
  },
  {
    id: 'business-1',
    name: 'Mi tienda',
    type: 'business',
  },
  {
    id: 'school-1',
    name: 'Escuela Primaria',
    type: 'school',
  },
];

describe('ORION capture classifier', () => {
  it('routes a supplier purchase to the business space', () => {
    const result = classifyCapture({
      message: 'Pedir diez cajas de refresco al proveedor',
      spaces,
      activeSpaceId: 'personal-1',
    });

    expect(result.suggestedSpace.id).toBe('business-1');
    expect(result.category).toBe('purchase');
    expect(result.confidence).not.toBe('low');
  });

  it('classifies an inventory review as business rather than a purchase', () => {
    const result = classifyCapture({
      message: 'Revisar el inventario de la papelería mañana',
      spaces,
      activeSpaceId: 'business-1',
    });

    expect(result.suggestedSpace.id).toBe('business-1');
    expect(result.category).toBe('business');
  });

  it('keeps an actual inventory purchase in the purchase category', () => {
    const result = classifyCapture({
      message: 'Comprar inventario mañana',
      spaces,
      activeSpaceId: 'business-1',
    });

    expect(result.suggestedSpace.id).toBe('business-1');
    expect(result.category).toBe('purchase');
  });

  it('honors an explicit custom space name', () => {
    const result = classifyCapture({
      message: 'Ponlo en Familia Bernabé: comprar leche para el domingo',
      spaces,
      activeSpaceId: 'business-1',
    });

    expect(result.suggestedSpace.id).toBe('family-1');
    expect(result.confidence).toBe('high');
    expect(result.title).toBe('Comprar leche para el domingo');
  });

  it('learns from similar tasks previously confirmed by the user', () => {
    const result = classifyCapture({
      message: 'Comprar leche y pan',
      spaces,
      activeSpaceId: 'personal-1',
      history: [
        {
          title: 'Comprar leche para la casa',
          category: 'purchase',
          spaceId: 'family-1',
        },
        {
          title: 'Comprar pan y leche',
          category: 'purchase',
          spaceId: 'family-1',
        },
      ],
    });

    expect(result.suggestedSpace.id).toBe('family-1');
    expect(result.confidence).toBe('medium');
    expect(result.reasons.join(' ')).toContain('anteriormente');
  });

  it('warns before exposing sensitive school information', () => {
    const result = classifyCapture({
      message: 'Hablar con el padre de familia del alumno Juan',
      spaces,
      activeSpaceId: 'school-1',
    });

    expect(result.suggestedSpace.id).toBe('school-1');
    expect(result.sensitive).toBe(true);
    expect(result.needsSpaceConfirmation).toBe(true);
    expect(result.privacyWarning).toContain('información sensible');
  });

  it('uses a private space as the safe fallback for an ambiguous message', () => {
    const result = classifyCapture({
      message: 'Llamar el viernes',
      spaces,
      activeSpaceId: 'business-1',
    });

    expect(result.suggestedSpace.id).toBe('personal-1');
    expect(result.confidence).toBe('low');
    expect(result.needsSpaceConfirmation).toBe(true);
  });

  it('keeps an explicit business task private when no business space exists', () => {
    const result = classifyCapture({
      message: 'Revisar el inventario del negocio mañana a las 10 de la mañana',
      spaces: spaces.filter((space) => space.type !== 'business'),
      activeSpaceId: 'family-1',
      history: [
        {
          title: 'Revisar el inventario anterior',
          category: 'purchase',
          spaceId: 'family-1',
        },
      ],
    });

    expect(result.suggestedSpace.id).toBe('personal-1');
    expect(result.requestedSpaceType).toBe('business');
    expect(result.category).toBe('business');
    expect(result.destinationWarning).toContain('seguirá privada');
    expect(result.needsSpaceConfirmation).toBe(true);
    expect(result.reasons.join(' ')).not.toContain('anteriormente');
  });

  it('lets an explicit business destination override family history', () => {
    const result = classifyCapture({
      message: 'Revisar el inventario del negocio mañana',
      spaces,
      activeSpaceId: 'family-1',
      history: [
        {
          title: 'Revisar el inventario del negocio',
          category: 'purchase',
          spaceId: 'family-1',
        },
      ],
    });

    expect(result.suggestedSpace.id).toBe('business-1');
    expect(result.requestedSpaceType).toBe('business');
    expect(result.category).toBe('business');
    expect(result.confidence).toBe('high');
  });
});
