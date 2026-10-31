export const PRODUCT_SIZES = [
  'Mini',
  'Pequeño',
  'Personal',
  'Litro',
  'Litro y medio',
  'Dos litros',
] as const;

export const PRODUCT_PACKAGES = ['Botella', 'Vidrio', 'Lata', 'Caja'] as const;

export type ProductSize = (typeof PRODUCT_SIZES)[number];
export type ProductPackage = (typeof PRODUCT_PACKAGES)[number];

export interface VariantProduct {
  id: string;
  nombre: string;
  tamano?: string;
  envase?: string;
}

/** Primer nombre del producto: “Amper Blanco Pequeño” → “amper”. */
export function productFamilyKey(nombre: string) {
  return nombre.trim().split(/\s+/)[0]?.toLowerCase() ?? '';
}

export function productFamilyLabel(nombre: string) {
  return nombre.trim().split(/\s+/)[0] || nombre;
}

function normalize(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '');
}

export function resolveProductSize(product: VariantProduct): ProductSize | '' {
  const explicit = product.tamano?.trim();
  if (explicit && (PRODUCT_SIZES as readonly string[]).includes(explicit)) {
    return explicit as ProductSize;
  }

  const n = normalize(product.nombre);
  if (/\b(litro\s*y\s*medio|1[.,]5\s*l)/.test(n)) return 'Litro y medio';
  if (/\b(dos\s*litros|2\s*l(?:itros)?)\b/.test(n)) return 'Dos litros';
  if (/\bmini\b/.test(n)) return 'Mini';
  if (/\bpequeno\b/.test(n)) return 'Pequeño';
  if (/\bpersonal\b/.test(n)) return 'Personal';
  if (/\b(litro|1\s*l(?:itro)?)\b/.test(n)) return 'Litro';
  return 'Personal';
}

export function resolveProductPackage(product: VariantProduct): ProductPackage | '' {
  const explicit = product.envase?.trim();
  if (explicit && (PRODUCT_PACKAGES as readonly string[]).includes(explicit)) {
    return explicit as ProductPackage;
  }

  const n = normalize(product.nombre);
  if (/\bvidrio\b/.test(n)) return 'Vidrio';
  if (/\blata\b/.test(n)) return 'Lata';
  if (/\bcaja\b/.test(n)) return 'Caja';
  if (/\bbotella\b/.test(n)) return 'Botella';
  return '';
}

export function pickVariantProduct<T extends VariantProduct>(
  family: T[],
  size: ProductSize | '',
  pack: ProductPackage | '',
  preferId?: string,
): T | undefined {
  if (family.length === 0) return undefined;

  const scored = family
    .map((product) => {
      const productSize = resolveProductSize(product);
      const productPack = resolveProductPackage(product);
      let score = 0;
      if (size && productSize === size) score += 4;
      if (pack && productPack === pack) score += 3;
      if (!pack && !productPack) score += 1;
      if (preferId && product.id === preferId) score += 0.5;
      return { product, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0];
  if (!best) return undefined;
  if (size && resolveProductSize(best.product) !== size) {
    return family.find((product) => resolveProductSize(product) === size) ?? best.product;
  }
  return best.product;
}
