import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Subscription, of, timer } from 'rxjs';
import { catchError, filter, switchMap, take } from 'rxjs/operators';
import { Notificacion } from '../../../models/notificacion.model';
import { CamareroAuthService } from '../../../services/camarero-auth.service';
import { NotificacionesPollingService } from '../../../services/notificaciones-polling.service';
import { OrdenCocinaResponse, OrdenesApiService } from '../../../services/ordenes-api.service';
import { PedidoCard } from '../../../shared/pedido-card/pedido-card';
import { CamareroHeader } from '../camarero-header/camarero-header';

@Component({
  selector: 'app-camarero-bebidas',
  standalone: true,
  imports: [CommonModule, CamareroHeader, PedidoCard],
  templateUrl: './bebidas.html',
  styleUrl: './bebidas.css',
})
export class BebidasCamarero implements OnInit, OnDestroy {
  private readonly ordenesApi = inject(OrdenesApiService);
  private readonly notificacionesPolling = inject(NotificacionesPollingService);
  private readonly camareroAuth = inject(CamareroAuthService);
  private pollingSub?: Subscription;
  private notificacionesSub?: Subscription;

  readonly ordenes = signal<OrdenCocinaResponse[]>([]);
  readonly notificaciones = signal<Notificacion[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly procesandoOrdenId = signal<string | null>(null);
  readonly ahora = signal(Date.now());
  readonly camareroUidActual = signal<string | null>(null);

  readonly pendientesCount = computed(() =>
    this.ordenes().filter((o) => o.ordenEstado === 'Pendiente' || o.ordenEstado === 'Preparación' || o.ordenEstado === 'Listo').length,
  );

  readonly ordenesVisuales = computed(() => {
    this.ahora();
    this.notificaciones();

    return [...this.ordenes()]
      .sort((a, b) => {
        const grupoA = this.grupoOrden(a.ordenEstado);
        const grupoB = this.grupoOrden(b.ordenEstado);
        if (grupoA !== grupoB) return grupoA - grupoB;
        return new Date(a.fecha).getTime() - new Date(b.fecha).getTime();
      })
      .map((o) => ({
        original: o,
        id: o.id,
        nombre: o.plato.nombre,
        mesa: o.pedido?.cuenta?.mesas?.map((m) => m.id).join(', ') || '?',
        estado: o.ordenEstado,
        etiqueta: this.procesandoOrdenId() === o.id ? '...' : o.ordenEstado.toUpperCase(),
        tiempo: this.calcularTiempo(o.fecha),
        esListo: o.ordenEstado === 'Listo',
        esPendiente: o.ordenEstado === 'Pendiente',
        esPreparacion: o.ordenEstado === 'Preparación',
        esEntregado: o.ordenEstado === 'Entregado',
        procesando: this.procesandoOrdenId() === o.id,
        camareroAsignado: this.obtenerCamareroAsignado(o.id),
      }));
  });

  ngOnInit() {
    this.cargarPerfilCamareroActual();
    this.notificacionesSub = this.notificacionesPolling.pendientes$.subscribe((pendientes) => {
      this.notificaciones.set(pendientes);
    });
    this.iniciarPolling();
  }

  ngOnDestroy() {
    this.pollingSub?.unsubscribe();
    this.notificacionesSub?.unsubscribe();
  }

  iniciarPolling() {
    this.pollingSub = timer(0, 8000)
      .pipe(
        filter(() => !this.procesandoOrdenId()),
        switchMap(() =>
          this.ordenesApi.obtenerBebidasActivasBarra().pipe(
            catchError(() => {
              this.error.set('Error de conexion');
              this.cargando.set(false);
              return of(null);
            }),
          ),
        ),
      )
      .subscribe((data) => {
        if (data) {
          this.ordenes.set(data);
          this.cargando.set(false);
          this.error.set(null);
        }
      });
  }

  avanzarEstado(orden: OrdenCocinaResponse) {
    if (this.procesandoOrdenId()) return;

    this.procesandoOrdenId.set(orden.id);
    this.error.set(null);

    let peticion;

    if (orden.ordenEstado === 'Pendiente') {
      peticion = this.ordenesApi.marcarEnPreparacion(orden.id);
    } else if (orden.ordenEstado === 'Preparación') {
      peticion = this.ordenesApi.marcarLista(orden.id);
    } else if (orden.ordenEstado === 'Listo') {
      if (!this.puedeEntregarOrden(orden.id)) {
        this.procesandoOrdenId.set(null);
        this.error.set('Debes coger la notificacion de recoger para poder entregar.');
        return;
      }
      peticion = this.ordenesApi.marcarEntregada(orden.id);
    } else {
      this.procesandoOrdenId.set(null);
      return;
    }

    peticion.pipe(take(1)).subscribe({
      next: (ordenActualizada) => {
        this.ordenes.update((list) => list.map((o) => (o.id === ordenActualizada.id ? ordenActualizada : o)));
        this.procesandoOrdenId.set(null);
      },
      error: () => {
        this.procesandoOrdenId.set(null);
        this.error.set('Error al actualizar');
      },
    });
  }

  retrocederEstado(orden: OrdenCocinaResponse) {
    if (this.procesandoOrdenId()) return;

    this.procesandoOrdenId.set(orden.id);
    this.error.set(null);

    const peticion = orden.ordenEstado === 'Entregado' ? this.ordenesApi.marcarLista(orden.id) : this.ordenesApi.marcarPendiente(orden.id);

    peticion.pipe(take(1)).subscribe({
      next: (ordenActualizada) => {
        this.ordenes.update((list) => list.map((o) => (o.id === ordenActualizada.id ? ordenActualizada : o)));
        this.procesandoOrdenId.set(null);
      },
      error: () => {
        this.procesandoOrdenId.set(null);
        this.error.set('Error al retroceder');
      },
    });
  }

  puedeEntregarOrden(ordenId: string): boolean {
    const uidActual = this.camareroUidActual();
    if (!uidActual) return false;

    return this.notificaciones().some(
      (n) =>
        n.tipo === 'Recoger' &&
        n.ordenId === ordenId &&
        !n.leida &&
        !!n.enCurso &&
        n.camareroUid === uidActual,
    );
  }

  private calcularTiempo(fecha: string) {
    const min = Math.floor((Date.now() - new Date(fecha).getTime()) / 60000);
    return min < 1 ? '< 1m' : `${min}m`;
  }

  private grupoOrden(estado: string): number {
    if (estado === 'Listo') return 0;
    if (estado === 'Preparación') return 1;
    if (estado === 'Pendiente') return 2;
    if (estado === 'Entregado') return 3;
    return 4;
  }

  private obtenerCamareroAsignado(ordenId: string): string | null {
    const notificacion = this.notificaciones().find(
      (n) => n.tipo === 'Recoger' && n.ordenId === ordenId && !n.leida && !!n.enCurso,
    );
    return notificacion?.camareroNombre?.trim() || null;
  }

  private async cargarPerfilCamareroActual(): Promise<void> {
    try {
      const perfil = await this.camareroAuth.obtenerPerfilCamareroActual();
      this.camareroUidActual.set(perfil.uid);
    } catch {
      this.camareroUidActual.set(null);
    }
  }
}
