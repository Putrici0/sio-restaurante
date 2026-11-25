/** Aviso "llamar al camarero" creado por el cliente desde la página de su mesa. */
export interface Notificacion {
  id: string;
  cuentaId: string;
  mesaIds: string[];
  fecha: string;
  atendida: boolean;
  fechaAtendida?: string | null;
}
