export interface Reserva {
  id?: string;
  fecha: string;
  hora: string;
  nombre: string;
  telefono: string;
  comensales: number; // <-- Cambiado de 'comensales' a 'capacidad'
  zona?: 'Interior' | 'Terraza' | 'Cualquiera';
  mesasIds?: string[];
  nota?: string;
  estado: 'Confirmado' | 'Cancelado' | 'Pendiente' | 'Finalizado'; // <-- Añadido 'Finalizado'
  fechaCreacion?: string; // <-- Cambiado de 'creadoEn' a 'fechaCreacion'
}
