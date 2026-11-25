import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Observable, Subscription, catchError, forkJoin, of, switchMap, timer } from 'rxjs';
import { CocinaTableroResponse, OrdenCocinaResponse, OrdenesApiService } from '../../services/ordenes-api.service';

type Columna = 'espera' | 'preparacion' | 'listo';

interface LineaComanda {
  clave: string;
  nombre: string;
  cantidad: number;
  ids: string[];
  detalles: string;
}

interface Comanda {
  id: string;
  mesa: string;
  hora: string;
  minutos: number;
  eta: number | null;
  lineas: LineaComanda[];
  total: number;
}

/**
 * Pantalla de cocina: comandas agrupadas por pedido (ronda de una mesa), en orden de llegada.
 * Cada línea agrupa las unidades iguales ("3× Nigiri") y se puede avanzar por separado.
 */
@Component({
  selector: 'app-tablero-pedidos',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './tablero-pedidos.component.html',
  styleUrls: ['./tablero-pedidos.component.css'],
})
export class TableroPedidos implements OnDestroy {
  private readonly api = inject(OrdenesApiService);
  private readonly sub: Subscription;

  readonly tablero = signal<CocinaTableroResponse | null>(null);
  readonly ahora = signal(Date.now());
  readonly error = signal(false);
  readonly ocupado = signal(false);

  readonly espera = computed(() => this.agrupar(this.tablero()?.pendientes ?? []));
  readonly preparacion = computed(() => this.agrupar(this.tablero()?.enPreparacion ?? []));
  readonly listo = computed(() => this.agrupar(this.tablero()?.listas ?? []));
  readonly platosEnCola = computed(
    () => (this.tablero()?.pendientes.length ?? 0) + (this.tablero()?.enPreparacion.length ?? 0),
  );

  constructor() {
    this.sub = timer(0, 4000)
      .pipe(switchMap(() => this.api.obtenerTableroCocina().pipe(catchError(() => of(null)))))
      .subscribe((t) => {
        this.error.set(!t);
        if (t) this.tablero.set(t);
        this.ahora.set(Date.now());
      });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  horaActual(): string {
    return new Date(this.ahora()).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }

  /** Avanza una línea (todas sus unidades) al siguiente estado. */
  avanzar(linea: LineaComanda, desde: Columna): void {
    this.ejecutar(linea.ids, desde);
  }

  /** Avanza la comanda entera. */
  avanzarComanda(c: Comanda, desde: Columna): void {
    this.ejecutar(c.lineas.flatMap((l) => l.ids), desde);
  }

  devolver(linea: LineaComanda): void {
    this.lanzar(linea.ids.map((id) => this.api.marcarEnPreparacion(id)));
  }

  private ejecutar(ids: string[], desde: Columna): void {
    const peticion = (id: string) => (desde === 'espera' ? this.api.marcarEnPreparacion(id) : this.api.marcarLista(id));
    this.lanzar(ids.map(peticion));
  }

  private lanzar(peticiones: Observable<unknown>[]): void {
    if (this.ocupado() || peticiones.length === 0) return;
    this.ocupado.set(true);
    forkJoin(peticiones)
      .pipe(switchMap(() => this.api.obtenerTableroCocina()))
      .subscribe({
        next: (t) => {
          this.tablero.set(t);
          this.ocupado.set(false);
        },
        error: () => this.ocupado.set(false),
      });
  }

  private agrupar(ordenes: OrdenCocinaResponse[]): Comanda[] {
    const comandas = new Map<string, Comanda>();
    for (const o of ordenes) {
      const id = o.pedido?.id ?? o.id;
      const mesas = o.pedido?.cuenta?.mesas ?? [];
      const fecha = o.pedido?.fechaPedido ?? o.fecha;
      if (!comandas.has(id)) {
        comandas.set(id, {
          id,
          mesa: mesas.map((m) => m.id).join(' + ') || '?',
          hora: new Date(fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
          minutos: Math.max(0, Math.floor((this.ahora() - new Date(fecha).getTime()) / 60000)),
          eta: null,
          lineas: [],
          total: 0,
        });
      }
      const c = comandas.get(id)!;
      const clave = `${o.plato.id}|${o.detalles ?? ''}`;
      let linea = c.lineas.find((l) => l.clave === clave);
      if (!linea) {
        linea = { clave, nombre: o.plato.nombre, cantidad: 0, ids: [], detalles: o.detalles ?? '' };
        c.lineas.push(linea);
      }
      linea.cantidad++;
      linea.ids.push(o.id);
      c.total++;
      if (typeof o.etaMinutos === 'number') c.eta = Math.max(c.eta ?? 0, o.etaMinutos);
    }
    // Orden de llegada: la comanda más antigua primero
    return [...comandas.values()].sort((a, b) => b.minutos - a.minutos);
  }
}
