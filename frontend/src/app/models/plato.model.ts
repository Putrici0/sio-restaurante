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
}

export interface PlatoMenu extends PlatoApi {
  cantidad: number;
}
