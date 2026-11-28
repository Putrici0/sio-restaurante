export type CategoriaPlato = 'Bebida' | 'Entrante' | 'Principal' | 'Postre' | 'Buffet';

/** Nombre con el que se muestra cada categoría en la carta de Sakura Hanami. */
export const ETIQUETA_CATEGORIA: Record<CategoriaPlato, string> = {
  Entrante: 'Entrantes',
  Principal: 'Sushi y platos calientes',
  Postre: 'Postres',
  Bebida: 'Bebidas',
  Buffet: 'Buffet libre (por comensal)',
};

/** La comida del buffet va incluida en la tarifa por comensal; bebidas y postres se cobran aparte. */
export const esComida = (c: CategoriaPlato): boolean => c === 'Entrante' || c === 'Principal';
export const PLATOS_POR_COMENSAL_Y_RONDA = 5;

/** Orden de las categorías en la carta. */
export const CATEGORIAS_CARTA: ReadonlyArray<CategoriaPlato> = ['Entrante', 'Principal', 'Postre', 'Bebida'];

export interface PlatoPopularApi {
  plato: PlatoApi;
  vecesPedido: number;
}

export interface PlatoApi {
  id: string;
  nombre: string;
  categoria: CategoriaPlato;
  descripcion: string;
  precio: number;
  estaActivo: boolean;
  imagen: string;
  /** Alérgenos declarados; null/ausente = sin información (consultar al personal). */
  alergenos?: string[] | null;
}

/** Los alérgenos que declara la carta, con su nombre y un icono reconocible. */
export const ALERGENOS: ReadonlyArray<{ clave: string; nombre: string; icono: string }> = [
  { clave: 'gluten', nombre: 'Gluten', icono: '🌾' },
  { clave: 'crustaceos', nombre: 'Crustáceos', icono: '🦐' },
  { clave: 'pescado', nombre: 'Pescado', icono: '🐟' },
  { clave: 'moluscos', nombre: 'Moluscos', icono: '🦑' },
  { clave: 'cacahuetes', nombre: 'Cacahuetes', icono: '🥜' },
  { clave: 'soja', nombre: 'Soja', icono: '🫘' },
  { clave: 'leche', nombre: 'Lácteos', icono: '🥛' },
  { clave: 'sesamo', nombre: 'Sésamo', icono: '🥯' },
];

/** «Se sirve por unidad»: platos que se piden por pieza (el resto son para compartir). */
export const porUnidad = (p: PlatoApi): boolean => /se sirve por unidad/i.test(p.descripcion ?? '');

/** Descripción sin la marca «· se sirve por unidad» (se muestra aparte). */
export const descripcionLimpia = (p: PlatoApi): string =>
  (p.descripcion ?? '').replace(/\s*·\s*se sirve por unidad/i, '');

/** Quita tildes y pasa a minúsculas para buscar «nigiri», «atun» o «28». */
export const normalizar = (t: string): string =>
  t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

/** ¿Coincide el plato con lo que se busca (por nombre o número)? */
export const coincideBusqueda = (p: PlatoApi, texto: string): boolean => {
  const q = normalizar(texto);
  if (!q) return true;
  const nombre = normalizar(p.nombre);
  return /^\d+$/.test(q) ? nombre.startsWith(`${q}.`) : nombre.includes(q);
};

/**
 * ¿Se puede mostrar a quien evita estos alérgenos? Los platos de cocina sin información
 * se ocultan por seguridad; las bebidas sin información se muestran.
 */
export const aptoPara = (p: PlatoApi, evitar: string[]): boolean => {
  if (evitar.length === 0) return true;
  if (p.alergenos == null) return p.categoria === 'Bebida';
  return !p.alergenos.some((a) => evitar.includes(a));
};

export interface PlatoMenu extends PlatoApi {
  cantidad: number;
}
