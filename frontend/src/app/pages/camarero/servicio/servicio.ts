import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Observable, Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { OrdenCocinaResponse, OrdenesApiService } from '../../../services/ordenes-api.service';
import { CamareroHeader } from '../camarero-header/camarero-header';

type TipoServicio = 'platos' | 'bebidas';

interface GrupoMesa {
  mesa: string;
  ordenes: OrdenCocinaResponse[];
}

/**
 * Servicio en sala desde el móvil del camarero.
 * - Platos: los que cocina ha marcado como "Listo para servir" se llevan a la mesa.
 * - Bebidas: las sirve directamente el personal de sala.
 */
@Component({
  selector: 'app-servicio-sala',
  standalone: true,
  imports: [CommonModule, CamareroHeader],
  templateUrl: './servicio.html',
  styleUrl: './servicio.css',
})
export class ServicioSala implements OnInit, OnDestroy {
  private readonly ordenesApi = inject(OrdenesApiService);
  private readonly tipo: TipoServicio = inject(ActivatedRoute).snapshot.data['tipo'] ?? 'platos';
  private sub?: Subscription;

  readonly titulo = this.tipo === 'platos' ? 'Platos para servir' : 'Bebidas para servir';
  readonly subtitulo = this.tipo === 'platos'
    ? 'Platos que cocina ha dejado listos. Márcalos al llevarlos a la mesa.'
    : 'Bebidas pedidas por las mesas. Márcalas al servirlas.';
  readonly ordenes = signal<OrdenCocinaResponse[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly actualizandoId = signal<string | null>(null);

  readonly porServir = computed<GrupoMesa[]>(() => {
    const pendientes = this.ordenes().filter((o) =>
      this.tipo === 'platos' ? o.ordenEstado === 'Listo' : o.ordenEstado !== 'Entregado',
    );
    const grupos = new Map<string, OrdenCocinaResponse[]>();
    for (const o of [...pendientes].sort((a, b) => a.fecha.localeCompare(b.fecha))) {
      const mesa = this.mesaDe(o);
      grupos.set(mesa, [...(grupos.get(mesa) ?? []), o]);
    }
    return [...grupos.entries()].map(([mesa, ordenes]) => ({ mesa, ordenes }));
  });

  readonly servidas = computed(() =>
    this.ordenes()
      .filter((o) => o.ordenEstado === 'Entregado')
      .sort((a, b) => b.fecha.localeCompare(a.fecha))
      .slice(0, 8),
  );

  ngOnInit(): void {
    this.sub = timer(0, 4000)
      .pipe(switchMap(() => this.cargar$()))
      .subscribe((ordenes) => {
        if (ordenes) this.ordenes.set(ordenes);
        this.cargando.set(false);
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  servir(o: OrdenCocinaResponse): void {
    this.cambiar(o, this.ordenesApi.marcarEntregada(o.id), 'Entregado');
  }

  /** Marca como servidos todos los platos de la mesa (cuando se lleva la ronda entera). */
  servirTodo(ordenes: OrdenCocinaResponse[]): void {
    for (const o of ordenes) this.servir(o);
  }

  deshacer(o: OrdenCocinaResponse): void {
    const peticion = this.tipo === 'platos'
      ? this.ordenesApi.deshacerEntregaPlato(o.id)
      : this.ordenesApi.marcarPendiente(o.id);
    this.cambiar(o, peticion, this.tipo === 'platos' ? 'Listo' : 'Pendiente');
  }

  mesaDe(o: OrdenCocinaResponse): string {
    const mesas = o.pedido?.cuenta?.mesas ?? [];
    return mesas.length ? mesas.map((m) => m.id).join(' + ') : '?';
  }

  hora(o: OrdenCocinaResponse): string {
    return new Date(o.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  private cargar$(): Observable<OrdenCocinaResponse[] | null> {
    const peticion = this.tipo === 'platos'
      ? this.ordenesApi.obtenerPlatosSala()
      : this.ordenesApi.obtenerBebidasActivasBarra();
    return peticion.pipe(
      catchError(() => {
        this.error.set('No se ha podido actualizar la lista.');
        return of(null);
      }),
    );
  }

  private cambiar(o: OrdenCocinaResponse, peticion: Observable<unknown>, nuevoEstado: OrdenCocinaResponse['ordenEstado']): void {
    this.actualizandoId.set(o.id);
    peticion.subscribe({
      next: () => {
        this.ordenes.update((lista) => lista.map((x) => (x.id === o.id ? { ...x, ordenEstado: nuevoEstado } : x)));
        this.actualizandoId.set(null);
        this.error.set(null);
      },
      error: () => {
        this.actualizandoId.set(null);
        this.error.set('No se ha podido guardar el cambio.');
      },
    });
  }
}
