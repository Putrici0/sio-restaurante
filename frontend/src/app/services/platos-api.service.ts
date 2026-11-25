import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { PlatoApi, PlatoPopularApi } from '../models/plato.model';

@Injectable({
  providedIn: 'root',
})
export class PlatosApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `http://${window.location.hostname}:7070`;

  obtenerPlatos(): Observable<PlatoApi[]> {
    return this.http.get<PlatoApi[]>(`${this.apiUrl}/platos/activos`);
  }

  /** Ranking de los platos más pedidos (sección "Más pedidos" de la carta). */
  obtenerMasPedidos(limite = 6): Observable<PlatoPopularApi[]> {
    return this.http.get<PlatoPopularApi[]>(`${this.apiUrl}/platos/mas-pedidos?limit=${limite}`);
  }
}
