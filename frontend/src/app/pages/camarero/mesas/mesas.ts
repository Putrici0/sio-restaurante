import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, Subscription, catchError, forkJoin, of, switchMap, timer } from 'rxjs';

import { ETIQUETA_ESTADO_MESA, EstadoMesa, Mesa } from '../../../models/mesa.model';
import { Notificacion } from '../../../models/notificacion.model';
import { MesasApiService } from '../../../services/mesas-api.service';
import { CuentaApiService, CuentaResumenResponse } from '../../../services/cuenta-api.service';
import { NotificacionesApiService } from '../../../services/notificaciones-api.service';
import { CamareroHeader } from '../camarero-header/camarero-header';

type MesaSala = Mesa & { llamando: boolean };

/**
 * Mapa interactivo de las 15 mesas en el móvil del camarero:
 * apertura y cierre de sesión, toma de comandas, cobro y limpieza.
 */
@Component({
  selector: 'app-mesas-camarero',
  standalone: true,
  imports: [CommonModule, CamareroHeader],
  templateUrl: './mesas.html',
  styleUrl: './mesas.css',
})
export class MesasCamarero implements OnDestroy {
  private readonly mesasApi = inject(MesasApiService);
  private readonly notificacionesApi = inject(NotificacionesApiService);
  private readonly router = inject(Router);
  private readonly cuentaApi = inject(CuentaApiService);
  private readonly sub: Subscription;

  readonly etiquetas = ETIQUETA_ESTADO_MESA;
  readonly estados: EstadoMesa[] = ['libre', 'ocupada', 'pendiente-cobro', 'sucia'];
  readonly mesas = signal<Mesa[]>([]);
  readonly avisos = signal<Notificacion[]>([]);
  readonly seleccionadaId = signal<string | null>(null);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly accionEnCurso = signal(false);
  readonly mostrarCodigo = signal(false);
  readonly confirmarLiberar = signal(false);
  readonly comensales = signal(2);
  readonly cuentaCobro = signal<CuentaResumenResponse | null>(null);
  readonly cobrado = signal(false);

  /** Mesas lógicas (las unidas se muestran como una sola). */
  readonly mesasSala = computed<MesaSala[]>(() => {
    const llamando = new Set(this.avisos().flatMap((a) => a.mesaIds));
    const vistas = new Set<string>();
    const resultado: MesaSala[] = [];
    for (const mesa of this.mesas()) {
      const grupo = [...mesa.grupoMesaIds].sort((a, b) => Number(a) - Number(b));
      const clave = grupo.join('|');
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      const miembros = this.mesas().filter((m) => grupo.includes(m.id));
      resultado.push({
        ...mesa,
        id: grupo[0],
        grupoMesaIds: grupo,
        capacidad: miembros.reduce((acc, m) => acc + m.capacidad, 0),
        estado: this.estadoGrupo(miembros),
        cuentaActiva: miembros.find((m) => m.cuentaActiva)?.cuentaActiva ?? null,
        llamando: grupo.some((id) => llamando.has(id)),
      });
    }
    return resultado.sort((a, b) => Number(a.id) - Number(b.id));
  });

  readonly seleccionada = computed(() => this.mesasSala().find((m) => m.id === this.seleccionadaId()) ?? null);

  readonly resumen = computed(() => {
    const cuenta = (e: EstadoMesa) => this.mesasSala().filter((m) => m.estado === e).length;
    return this.estados.map((e) => ({ estado: e, total: cuenta(e) }));
  });

  constructor() {
    this.sub = timer(0, 3000)
      .pipe(
        switchMap(() =>
          forkJoin({
            mesas: this.mesasApi.cargarMesasParaVista().pipe(catchError(() => of(null))),
            avisos: this.notificacionesApi.pendientes().pipe(catchError(() => of(this.avisos()))),
          }),
        ),
      )
      .subscribe(({ mesas, avisos }) => {
        if (mesas) {
          this.mesas.set(mesas);
          this.error.set(null);
        } else if (this.mesas().length === 0) {
          this.error.set('No se han podido cargar las mesas.');
        }
        this.avisos.set(avisos);
        this.cargando.set(false);
      });
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
  }

  etiqueta(m: Mesa): string {
    return m.grupoMesaIds.length > 1 ? m.grupoMesaIds.join(' + ') : m.id;
  }

  abrir(m: MesaSala): void {
    this.seleccionadaId.set(m.id);
    this.mostrarCodigo.set(false);
    this.confirmarLiberar.set(false);
    this.cuentaCobro.set(null);
    this.cobrado.set(false);
    this.comensales.set(Math.min(2, m.capacidad));
  }

  cambiarComensales(delta: number, m: Mesa): void {
    this.comensales.update((n) => Math.max(1, Math.min(m.capacidad, n + delta)));
  }

  /** Carga el importe pendiente para cobrar desde el móvil (TPV portátil o efectivo). */
  prepararCobro(m: Mesa): void {
    if (!m.cuentaActiva) return;
    this.cuentaApi.obtenerResumenCuenta(m.cuentaActiva.id).subscribe({
      next: (r) => this.cuentaCobro.set(r),
      error: () => this.error.set('No se ha podido cargar la cuenta.'),
    });
  }

  cobrar(metodo: 'TARJETA' | 'EFECTIVO'): void {
    const r = this.cuentaCobro();
    if (!r) return;
    this.accionEnCurso.set(true);
    this.cuentaApi.pagarCuentaCompleta(r.cuentaId, metodo).subscribe({
      next: () => {
        this.accionEnCurso.set(false);
        this.cuentaCobro.set(null);
        this.cobrado.set(true);
        this.mesasApi.cargarMesasParaVista().subscribe((mesas) => this.mesas.set(mesas));
      },
      error: (err) => {
        this.accionEnCurso.set(false);
        this.error.set(err?.error?.message ?? 'No se ha podido registrar el cobro.');
      },
    });
  }

  cerrar(): void {
    this.seleccionadaId.set(null);
  }

  abrirSesion(m: Mesa): void {
    this.accion(this.mesasApi.ocuparMesa(m.id, this.comensales()));
  }

  cerrarSesion(m: Mesa): void {
    this.accion(this.mesasApi.cerrarSesion(m.id));
  }

  reabrirSesion(m: Mesa): void {
    this.accion(this.mesasApi.reabrirSesion(m.id));
  }

  marcarLimpia(m: Mesa): void {
    this.accion(this.mesasApi.limpiarMesa(m.id));
  }

  liberar(m: Mesa): void {
    this.accion(this.mesasApi.liberarMesa(m.id), true);
  }

  tomarComanda(m: Mesa): void {
    void this.router.navigate(['/camarero/menu', m.id]);
  }

  verCuenta(m: Mesa): void {
    void this.router.navigate(['/camarero/cuenta', m.id]);
  }

  private accion(peticion: Observable<unknown>, cerrarPanel = false): void {
    if (this.accionEnCurso()) return;
    this.accionEnCurso.set(true);
    this.error.set(null);
    peticion
      .pipe(switchMap(() => this.mesasApi.cargarMesasParaVista()))
      .subscribe({
        next: (mesas) => {
          this.mesas.set(mesas);
          this.accionEnCurso.set(false);
          this.confirmarLiberar.set(false);
          if (cerrarPanel) this.cerrar();
        },
        error: (err) => {
          this.accionEnCurso.set(false);
          this.error.set(err?.error?.message ?? 'No se ha podido completar la acción.');
        },
      });
  }

  private estadoGrupo(miembros: Mesa[]): EstadoMesa {
    for (const e of ['pendiente-cobro', 'ocupada', 'sucia'] as EstadoMesa[]) {
      if (miembros.some((m) => m.estado === e)) return e;
    }
    return 'libre';
  }
}
