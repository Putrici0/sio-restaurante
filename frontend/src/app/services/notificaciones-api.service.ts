import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, map } from 'rxjs';
import { Notificacion } from '../models/notificacion.model';

/** Avisos "llamar al camarero". */
@Injectable({ providedIn: 'root' })
export class NotificacionesApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `http://${window.location.hostname}:7070/notificaciones`;

  /** El cliente llama al camarero desde la página de su mesa. */
  llamarCamarero(cuentaId: string): Observable<Notificacion> {
    return this.http.post<Notificacion>(`${this.apiUrl}/atencion/${cuentaId}`, {});
  }

  /** ¿La mesa tiene ya una llamada pendiente? */
  hayLlamadaPendiente(cuentaId: string): Observable<boolean> {
    return this.http
      .get<{ pendiente: boolean }>(`${this.apiUrl}/atencion/${cuentaId}`)
      .pipe(map((r) => !!r.pendiente));
  }

  /** Avisos pendientes que ve el personal de sala. */
  pendientes(): Observable<Notificacion[]> {
    return this.http.get<Notificacion[]>(`${this.apiUrl}/pendientes`);
  }

  marcarAtendida(id: string): Observable<Notificacion> {
    return this.http.post<Notificacion>(`${this.apiUrl}/${id}/atendida`, {});
  }
}
