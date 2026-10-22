// Agrupa los productos del punto de venta: Negocio (catálogo) → Categoría → Productos.
// Función pura (sin React) para poder probarla.

export type GroupableOption = {
  key: string;
  catalogId?: string | null;
  categoryId?: string | null;
  categoryName: string;
  trackInventory: boolean;
  stock: number;
};

export type CatalogRef = { id: string; name: string; isDefault?: boolean };

export type CategoryGroup<T extends GroupableOption> = {
  id: string; // categoryId o 'none'
  name: string;
  items: T[];
};

export type CatalogGroup<T extends GroupableOption> = {
  id: string; // catalogId o 'none'
  name: string;
  count: number;
  soldOut: number;
  categories: CategoryGroup<T>[];
};

export const NO_CATALOG_ID = 'none';
export const NO_CATALOG_NAME = 'Sin negocio asignado';
export const NO_CATEGORY_ID = 'none';

const collator = new Intl.Collator('es', { sensitivity: 'base' });

export function isSoldOut(option: GroupableOption) {
  return option.trackInventory && option.stock <= 0;
}

export function groupByCatalog<T extends GroupableOption>(
  options: T[],
  catalogs: CatalogRef[],
): CatalogGroup<T>[] {
  const names = new Map(namedCatalogs(catalogs).map((catalog) => [catalog.id, catalog.name]));
  const byCatalog = new Map<string, Map<string, CategoryGroup<T>>>();

  for (const option of options) {
    const catalogId =
      option.catalogId && names.has(option.catalogId)
        ? option.catalogId
        : NO_CATALOG_ID;
    const categoryId = option.categoryId || NO_CATEGORY_ID;

    let categories = byCatalog.get(catalogId);
    if (!categories) {
      categories = new Map();
      byCatalog.set(catalogId, categories);
    }

    let category = categories.get(categoryId);
    if (!category) {
      category = { id: categoryId, name: option.categoryName, items: [] };
      categories.set(categoryId, category);
    }
    category.items.push(option);
  }

  const groups: CatalogGroup<T>[] = [];

  for (const [catalogId, categories] of byCatalog) {
    const list = Array.from(categories.values()).sort((a, b) => {
      // "Sin categoría" siempre al final
      if (a.id === NO_CATEGORY_ID) return 1;
      if (b.id === NO_CATEGORY_ID) return -1;
      return collator.compare(a.name, b.name);
    });
    const all = list.flatMap((category) => category.items);

    groups.push({
      id: catalogId,
      name:
        catalogId === NO_CATALOG_ID
          ? NO_CATALOG_NAME
          : (names.get(catalogId) as string),
      count: all.length,
      soldOut: all.filter(isSoldOut).length,
      categories: list,
    });
  }

  // Negocios por nombre; "Sin negocio asignado" siempre al final.
  return groups.sort((a, b) => {
    if (a.id === NO_CATALOG_ID) return 1;
    if (b.id === NO_CATALOG_ID) return -1;
    return collator.compare(a.name, b.name);
  });
}

// Nombre del negocio de un producto (para el carrito y los recibos internos).
export function catalogNameOf(
  catalogId: string | null | undefined,
  catalogs: CatalogRef[],
) {
  if (!catalogId) return NO_CATALOG_NAME;
  return namedCatalogs(catalogs).find((catalog) => catalog.id === catalogId)?.name ?? NO_CATALOG_NAME;
}

// El catálogo automático "General" nunca se muestra con ese nombre: confunde.
// Sus productos se ven como "Sin negocio asignado" hasta que se les elija una página.
export function namedCatalogs<T extends CatalogRef>(catalogs: T[]) {
  return catalogs.filter((catalog) => !catalog.isDefault);
}

// Opciones para desplegables y pestañas: sólo negocios con nombre propio, por orden alfabético.
export function catalogChoices<T extends CatalogRef>(catalogs: T[]) {
  return namedCatalogs(catalogs).sort((a, b) => collator.compare(a.name, b.name));
}
