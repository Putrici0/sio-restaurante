/** Estados de mesa de SIGO-RSH: libre, ocupada, pendiente de cobro y sucia. */
export type EstadoMesa = 'libre' | 'ocupada' | 'pendiente-cobro' | 'sucia';

/** Estado tal y como lo devuelve el backend en /mesas/vista. */
export type EstadoMesaApi = 'LIBRE' | 'OCUPADA' | 'PENDIENTE_COBRO' | 'SUCIA';

export const ETIQUETA_ESTADO_MESA: Record<EstadoMesa, string> = {
  libre: 'Libre',
  ocupada: 'Ocupada',
  'pendiente-cobro': 'Pendiente de cobro',
  sucia: 'Sucia',
};
export type ZonaMesa = 'interior' | 'terraza';

export interface MesaApi {
  id: string;
  capacidad: number;
  mesasUnidas?: string[];
  sucia?: boolean;
}

export interface CuentaApi {
  id: string;
  mesas: Array<{
    id: string;
    capacidad: number;
  }>;
  payed: boolean;
  fechaCreacion: string;
  fechaPago?: string | null;
  password: string;
  cobroSolicitado?: boolean;
}

export interface ImporteCuentaApi {
  cuentaId: string;
  importe: number;
}

export interface PlatoOrdenCuentaApi {
  id: string;
  nombre: string;
  categoria?: string;
}

export interface OrdenCuentaApi {
  id: string;
  precio: number;
  ordenEstado: string;
  detalles: string;
  pagada?: boolean;
  plato?: PlatoOrdenCuentaApi | null;
}

export interface Mesa {
  id: string;
  capacidad: number;
  zona: ZonaMesa;
  estado: EstadoMesa;
  cuentaActivaId: string | null;
  cuentaActiva: CuentaApi | null;
  grupoMesaIds: string[];
  mesaPrincipalId?: string;
}
