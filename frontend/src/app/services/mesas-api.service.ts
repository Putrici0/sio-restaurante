import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { catchError, forkJoin, map, Observable } from 'rxjs';
import {
  CuentaApi,
  ImporteCuentaApi,
  Mesa,
  MesaApi,
  OrdenCuentaApi,
} from '../models/mesa.model';
import { MESAS_LAYOUT } from '../data/mesas-layout';

interface MesaVistaApi {
  id: string;
  capacidad: number;
  grupoMesaIds?: string[];
  cuentaActivaId?: string | null;
  cuentaActiva?: CuentaApi | null;
}

@Injectable({
  providedIn: 'root',
})
export class MesasApiService {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `http://${window.location.hostname}:7070`;
  private readonly defaultPageLimit = 100;

  private unwrapPagedResponse<T>(response: T[] | { items: T[] }): T[] {
    if (Array.isArray(response)) {
      return response;
    }
    return Array.isArray(response.items) ? response.items : [];
  }

  obtenerMesas(): Observable<MesaApi[]> {
    return this.http
      .get<MesaApi[] | { items: MesaApi[] }>(`${this.apiUrl}/mesas?limit=${this.defaultPageLimit}`)
      .pipe(map((response) => this.unwrapPagedResponse(response)));
  }

  obtenerCuentas(): Observable<CuentaApi[]> {
    return this.http.get<CuentaApi[]>(`${this.apiUrl}/cuentas/activas`);
  }

  obtenerMesasVista(): Observable<MesaVistaApi[]> {
    return this.http.get<MesaVistaApi[]>(`${this.apiUrl}/mesas/vista`);
  }

  obtenerTotalCuenta(cuentaId: string): Observable<ImporteCuentaApi> {
    return this.http.get<ImporteCuentaApi>(`${this.apiUrl}/cuentas/${cuentaId}/total`);
  }

  obtenerOrdenesCuenta(cuentaId: string): Observable<OrdenCuentaApi[]> {
    return this.http.get<OrdenCuentaApi[]>(`${this.apiUrl}/cuentas/${cuentaId}/ordenes`);
  }

  pagarCuentaCompleta(cuentaId: string, metodoPago: 'EFECTIVO' | 'TARJETA'): Observable<CuentaApi> {
    return this.http.post<CuentaApi>(`${this.apiUrl}/cuentas/${cuentaId}/pagar-total`, {
      metodoPago,
    });
  }

  pagarCuentaParcial(
    cuentaId: string,
    ordenIds: string[],
    metodoPago: 'EFECTIVO' | 'TARJETA',
  ): Observable<CuentaApi> {
    return this.http.post<CuentaApi>(`${this.apiUrl}/cuentas/${cuentaId}/pagar-parcial`, {
      ordenIds,
      metodoPago,
    });
  }

  ocuparMesa(id: string): Observable<CuentaApi> {
    return this.http.post<CuentaApi>(`${this.apiUrl}/mesas/${id}/ocupar`, {});
  }

  liberarMesa(id: string): Observable<CuentaApi> {
    return this.http.post<CuentaApi>(`${this.apiUrl}/mesas/${id}/liberar`, {});
  }

  unirMesas(mesaIdOrigen: string, mesaIdDestino: string): Observable<MesaApi[]> {
    return this.http.post<MesaApi[]>(`${this.apiUrl}/mesas/unir`, {
      mesaIdOrigen,
      mesaIdDestino,
    });
  }

  separarMesa(id: string): Observable<MesaApi[]> {
    return this.http.post<MesaApi[]>(`${this.apiUrl}/mesas/${id}/separar`, {});
  }

  validarAccesoMesa(
    mesaId: string,
    password: string,
  ): Observable<{ mesaId: string; cuentaId: string; accesoValido: boolean }> {
    return this.http.post<{ mesaId: string; cuentaId: string; accesoValido: boolean }>(
      `${this.apiUrl}/mesas/${mesaId}/validar-acceso`,
      { password },
    );
  }

  cargarMesasParaVista(): Observable<Mesa[]> {
    return this.obtenerMesasVista().pipe(
      map((mesasVista) => {
        const layoutMap = new Map(MESAS_LAYOUT.map((mesa) => [mesa.id, mesa]));

        return mesasVista
          .map((mesaDb) => {
            const layout = layoutMap.get(mesaDb.id);
            const cuentaActiva = mesaDb.cuentaActiva ?? null;
            const grupoMesaIds = this.normalizarGrupoMesaIds(
              mesaDb.id,
              mesaDb.grupoMesaIds ?? [mesaDb.id],
            );

            return {
              id: mesaDb.id,
              capacidad: mesaDb.capacidad,
              zona: layout?.zona ?? 'interior',
              estado: cuentaActiva ? 'ocupada' : 'libre',
              cuentaActivaId: mesaDb.cuentaActivaId ?? null,
              cuentaActiva,
              grupoMesaIds,
            } as Mesa;
          })
          .sort((a, b) => Number(a.id) - Number(b.id));
      }),
      catchError(() =>
        forkJoin({
          mesas: this.obtenerMesas(),
          cuentas: this.obtenerCuentas(),
        }).pipe(
          map(({ mesas, cuentas }) => {
            const layoutMap = new Map(MESAS_LAYOUT.map((mesa) => [mesa.id, mesa]));

            return mesas
              .map((mesaDb) => {
                const layout = layoutMap.get(mesaDb.id);
                const cuentaActiva =
                  cuentas.find(
                    (cuenta) => !cuenta.payed && cuenta.mesas?.some((m) => m.id === mesaDb.id),
                  ) ?? null;

                let grupoMesaIds: string[] = [];
                if (cuentaActiva && cuentaActiva.mesas) {
                  grupoMesaIds = cuentaActiva.mesas.map((m) => m.id);
                } else {
                  grupoMesaIds = mesaDb.mesasUnidas || [mesaDb.id];
                }

                grupoMesaIds = this.normalizarGrupoMesaIds(mesaDb.id, grupoMesaIds);

                return {
                  id: mesaDb.id,
                  capacidad: mesaDb.capacidad,
                  zona: layout?.zona ?? 'interior',
                  estado: cuentaActiva ? 'ocupada' : 'libre',
                  cuentaActivaId: cuentaActiva?.id ?? null,
                  cuentaActiva,
                  grupoMesaIds,
                } as Mesa;
              })
              .sort((a, b) => Number(a.id) - Number(b.id));
          }),
        ),
      ),
    );
  }

  private normalizarGrupoMesaIds(id: string, grupoMesaIds?: string[]): string[] {
    return Array.from(new Set([id, ...(grupoMesaIds ?? [])]))
      .filter((value) => value != null && `${value}`.trim() !== '')
      .map((value) => `${value}`.trim())
      .sort((a, b) => Number(a) - Number(b));
  }
}
