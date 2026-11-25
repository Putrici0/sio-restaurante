export type EstadoReserva = 'Pendiente' | 'Confirmado' | 'Cancelado' | 'Finalizado';

/**
 * Reserva online de Sakura Hanami. El cliente indica fecha, hora, comensales
 * y datos de contacto; el personal la confirma y la gestiona manualmente
 * (no se asigna ninguna mesa automáticamente).
 */
export interface Reserva {
  id?: string;
  fecha: string; // yyyy-MM-dd
  hora: string; // HH:mm
  nombre: string;
  telefono: string;
  email?: string;
  comensales: number;
  nota?: string;
  estado: EstadoReserva;
  /** 'web' si la hizo el cliente desde la página pública, 'personal' si la creó el restaurante. */
  origen?: 'web' | 'personal';
  fechaCreacion?: string;
}
