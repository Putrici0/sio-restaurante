import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, firstValueFrom, switchMap, timer } from 'rxjs';
import { EstadoReserva, Reserva } from '../models/reserva.model';

/** Reservas a través de la API (persistidas en el JSON de datos del backend). */
@Injectable({
  providedIn: 'root',
})
export class ReservasApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `http://${window.location.hostname}:7070/reservas`;
  private readonly refrescoMs = 10000;

  /** Lista de reservas, refrescada periódicamente para la pantalla del personal. */
  obtenerReservas(): Observable<Reserva[]> {
    return timer(0, this.refrescoMs).pipe(switchMap(() => this.http.get<Reserva[]>(this.apiUrl)));
  }

  obtenerReservasPorFecha(fecha: string): Observable<Reserva[]> {
    const params = new HttpParams().set('fecha', fecha);
    return timer(0, this.refrescoMs).pipe(switchMap(() => this.http.get<Reserva[]>(this.apiUrl, { params })));
  }

  async crearReserva(reserva: Omit<Reserva, 'id'>): Promise<string> {
    const creada = await firstValueFrom(this.http.post<Reserva>(this.apiUrl, reserva));
    return creada.id ?? '';
  }

  async actualizarEstado(id: string, estado: EstadoReserva): Promise<void> {
    await firstValueFrom(this.http.post(`${this.apiUrl}/${id}/estado`, { estado }));
  }

  async actualizarReserva(id: string, cambios: Partial<Reserva>): Promise<void> {
    const actual = await firstValueFrom(this.http.get<Reserva>(`${this.apiUrl}/${id}`));
    await firstValueFrom(this.http.put(`${this.apiUrl}/${id}`, { ...actual, ...cambios }));
  }

  async borrarReserva(id: string): Promise<void> {
    await firstValueFrom(this.http.delete(`${this.apiUrl}/${id}`));
  }
}
