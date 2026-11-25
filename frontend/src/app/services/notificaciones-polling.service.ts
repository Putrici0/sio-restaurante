import { Injectable, inject } from '@angular/core';
import { Observable, Subject, merge, of, timer } from 'rxjs';
import { catchError, map, shareReplay, switchMap } from 'rxjs/operators';
import { Notificacion } from '../models/notificacion.model';
import { NotificacionesApiService } from './notificaciones-api.service';

@Injectable({
  providedIn: 'root',
})
export class NotificacionesPollingService {
  private readonly notificacionesApi = inject(NotificacionesApiService);
  private readonly pollingMs = 4000;
  private readonly refrescoManual$ = new Subject<void>();

  readonly pendientes$: Observable<Notificacion[]> = merge(
    timer(0, this.pollingMs).pipe(map(() => undefined)),
    this.refrescoManual$.pipe(map(() => undefined)),
  ).pipe(
    switchMap(() =>
      this.notificacionesApi.obtenerPendientes().pipe(
        map((items) => items.filter((n) => !n.leida)),
        catchError(() => of([] as Notificacion[])),
      ),
    ),
    shareReplay({ bufferSize: 1, refCount: true }),
  );

  refrescar(): void {
    this.refrescoManual$.next();
  }
}
