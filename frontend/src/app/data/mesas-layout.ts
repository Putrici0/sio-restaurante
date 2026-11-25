export type ZonaMesa = 'interior' | 'terraza';

export interface MesaLayout {
  id: string;
  capacidad: number;
  zona: ZonaMesa;
}

/**
 * Comedor del Restaurante Sakura Hanami: 15 mesas en una única sala
 * (aprox. 56 comensales). Se dibujan en una cuadrícula de 3 columnas.
 */
export const MESAS_LAYOUT: MesaLayout[] = [
  { id: '1', capacidad: 2, zona: 'interior' },
  { id: '2', capacidad: 4, zona: 'interior' },
  { id: '3', capacidad: 2, zona: 'interior' },
  { id: '4', capacidad: 4, zona: 'interior' },
  { id: '5', capacidad: 4, zona: 'interior' },
  { id: '6', capacidad: 4, zona: 'interior' },
  { id: '7', capacidad: 2, zona: 'interior' },
  { id: '8', capacidad: 4, zona: 'interior' },
  { id: '9', capacidad: 2, zona: 'interior' },
  { id: '10', capacidad: 4, zona: 'interior' },
  { id: '11', capacidad: 4, zona: 'interior' },
  { id: '12', capacidad: 4, zona: 'interior' },
  { id: '13', capacidad: 4, zona: 'interior' },
  { id: '14', capacidad: 6, zona: 'interior' },
  { id: '15', capacidad: 6, zona: 'interior' },
];
