import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Observable, Subscription, catchError, forkJoin, of, switchMap, timer } from 'rxjs';

import { Navbar } from '../../../shared/navbar/navbar';
import { ETIQUETA_ESTADO_MESA, EstadoMesa, Mesa } from '../../../models/mesa.model';
import { Reserva } from '../../../models/reserva.model';
import { MesasApiService } from '../../../services/mesas-api.service';
import { CuentaApiService, CuentaResumenResponse } from '../../../services/cuenta-api.service';
import { ReservasApiService } from '../../../services/reservas-api.service';
import { DatosTicket, agruparLineas, esTarifa, generarTicketPdf, nombreArchivoTicket, pagosDeCuenta, separarIncluidos } from '../../../services/ticket-pdf';

type MetodoPago = 'EFECTIVO' | 'TARJETA';

/**
 * Sala (encargado y gerencia): plano de las 15 mesas del comedor, apertura y cierre
 * de sesiones, cobro en caja con ticket y vista rápida de las reservas del día.
 */
@Component({
  selector: 'app-sala',
  standalone: true,
  imports: [CommonModule, Navbar, RouterLink],
  templateUrl: './sala.html',
  styleUrl: './sala.css',
})
export class Sala implements OnDestroy {
  private readonly mesasApi = inject(MesasApiService);
  private readonly cuentaApi = inject(CuentaApiService);
  private readonly reservasApi = inject(ReservasApiService);
  private readonly subs: Subscription[] = [];

  readonly etiquetas = ETIQUETA_ESTADO_MESA;
  readonly estados: EstadoMesa[] = ['libre', 'ocupada', 'pendiente-cobro', 'sucia'];
  readonly mesas = signal<Mesa[]>([]);
  readonly reservasHoy = signal<Reserva[]>([]);
  readonly seleccionadaId = signal<string | null>(null);
  readonly ahora = signal(Date.now());
  readonly error = signal<string | null>(null);
  readonly ocupado = signal(false);

  // Apertura
  readonly comensalesApertura = signal(2);
  readonly ninosApertura = signal(0);

  // Cobro en caja
  readonly resumen = signal<CuentaResumenResponse | null>(null);
  readonly cobrando = signal(false);
  readonly metodo = signal<MetodoPago>('TARJETA');
  readonly entregado = signal<number | null>(null);
  readonly ticket = signal<DatosTicket | null>(null);
  /** 'todo': se cobra la cuenta entera; 'separado': cada comensal paga lo que elija. */
  readonly modoCobro = signal<'todo' | 'separado'>('todo');
  readonly seleccionSeparado = signal<Record<string, number>>({});
  /** Tras un pago parcial: lo que aún queda por cobrar de la mesa. */
  readonly restantes = signal(0);

  readonly seleccionada = computed(() => this.mesas().find((m) => m.id === this.seleccionadaId()) ?? null);
  readonly turno = computed(() => (new Date(this.ahora()).getHours() >= 18 ? 'Cena' : 'Almuerzo'));
  readonly resumenEstados = computed(() =>
    this.estados.map((e) => ({ estado: e, total: this.mesas().filter((m) => m.estado === e).length })),
  );
  readonly comensalesEnSala = computed(() =>
    this.mesas().reduce((acc, m) => acc + (m.cuentaActiva?.comensales ?? 0), 0),
  );
  readonly plazas = computed(() => this.mesas().reduce((acc, m) => acc + m.capacidad, 0));
  readonly proximasReservas = computed(() =>
    this.reservasHoy()
      .filter((r) => r.estado === 'Confirmado' || r.estado === 'Pendiente')
      .sort((a, b) => a.hora.localeCompare(b.hora)),
  );
  readonly lineasCobro = computed(() => {
    const r = this.resumen();
    if (!r) return [];
    return agruparLineas(
      r.ordenes
        .filter((o) => o.ordenEstado !== 'Cancelado')
        .map((o) => ({ nombre: o.plato?.nombre ?? 'Consumo', precio: Number(o.precio ?? 0) })),
    );
  });
  readonly cuentaSeparada = computed(() => separarIncluidos(this.lineasCobro()));

  /** Líneas con importe que quedan por pagar, agrupadas por plato y precio (para cobrar por separado). */
  readonly pendientesSeparado = computed(() => {
    const r = this.resumen();
    if (!r) return [];
    const mapa = new Map<string, { clave: string; descripcion: string; precio: number; ids: string[] }>();
    for (const o of r.ordenes) {
      const precio = Number(o.precio ?? 0);
      if (o.ordenEstado === 'Cancelado' || o.pagada || precio <= 0) continue;
      const descripcion = o.plato?.nombre ?? 'Consumo';
      const clave = `${descripcion}|${precio}`;
      const grupo = mapa.get(clave) ?? { clave, descripcion, precio, ids: [] };
      grupo.ids.push(o.id);
      mapa.set(clave, grupo);
    }
    return [...mapa.values()].sort(
      (a, b) => Number(esTarifa(b.descripcion)) - Number(esTarifa(a.descripcion)),
    );
  });

  readonly idsSeleccionados = computed(() => {
    const sel = this.seleccionSeparado();
    return this.pendientesSeparado().flatMap((g) => g.ids.slice(0, sel[g.clave] ?? 0));
  });

  /** Importe del cobro actual: toda la cuenta o solo la parte seleccionada. */
  readonly importeACobrar = computed(() => {
    const r = this.resumen();
    if (!r) return 0;
    if (this.modoCobro() === 'todo') return Number(r.pendiente);
    const sel = this.seleccionSeparado();
    const total = this.pendientesSeparado().reduce((acc, g) => acc + (sel[g.clave] ?? 0) * g.precio, 0);
    return Number(total.toFixed(2));
  });

  readonly cambio = computed(() => {
    const e = this.entregado();
    return e == null ? null : Number((e - this.importeACobrar()).toFixed(2));
  });

  constructor() {
    this.subs.push(
      timer(0, 3000)
        .pipe(switchMap(() => this.mesasApi.cargarMesasParaVista().pipe(catchError(() => of(null)))))
        .subscribe((mesas) => {
          if (mesas) {
            this.mesas.set(mesas);
            this.error.set(null);
          } else if (this.mesas().length === 0) {
            this.error.set('No se ha podido conectar con el servidor.');
          }
        }),
      this.reservasApi
        .obtenerReservasPorFecha(this.hoyIso())
        .pipe(catchError(() => of([] as Reserva[])))
        .subscribe((r) => this.reservasHoy.set(r)),
      timer(0, 30000).subscribe(() => this.ahora.set(Date.now())),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  seleccionar(m: Mesa): void {
    this.seleccionadaId.set(this.seleccionadaId() === m.id ? null : m.id);
    this.comensalesApertura.set(Math.min(2, m.capacidad));
    this.ninosApertura.set(0);
    this.cerrarCobro();
    this.error.set(null);
  }

  sillas(n: number): number[] {
    return Array.from({ length: n }, (_, i) => i);
  }

  minutosAbierta(m: Mesa): string {
    const inicio = m.cuentaActiva?.fechaCreacion;
    if (!inicio) return '';
    const min = Math.max(0, Math.floor((this.ahora() - new Date(inicio).getTime()) / 60000));
    return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  }

  cambiarComensales(delta: number, m: Mesa): void {
    this.comensalesApertura.update((n) => Math.max(1, Math.min(m.capacidad, n + delta)));
    this.ninosApertura.update((n) => Math.min(n, this.comensalesApertura() - 1));
  }

  cambiarNinos(delta: number, _m: Mesa): void {
    this.ninosApertura.update((n) => Math.max(0, Math.min(this.comensalesApertura() - 1, n + delta)));
  }

  abrir(m: Mesa): void {
    this.accion(this.mesasApi.ocuparMesa(m.id, this.comensalesApertura(), this.ninosApertura()));
  }

  cerrarSesion(m: Mesa): void {
    this.accion(this.mesasApi.cerrarSesion(m.id));
  }

  reabrir(m: Mesa): void {
    this.accion(this.mesasApi.reabrirSesion(m.id));
  }

  limpiar(m: Mesa): void {
    this.accion(this.mesasApi.limpiarMesa(m.id));
  }

  liberar(m: Mesa): void {
    if (!confirm(`¿Liberar la mesa ${m.id} sin cobrar? Se cancelarán los platos pendientes.`)) return;
    this.accion(this.mesasApi.liberarMesa(m.id));
  }

  abrirCobro(m: Mesa): void {
    if (!m.cuentaActiva) return;
    this.modoCobro.set('todo');
    this.prepararCobro(m.cuentaActiva.id);
  }

  /** Tras cobrar una parte, vuelve a la cuenta para cobrar al siguiente comensal. */
  cobrarSiguiente(): void {
    const cuentaId = this.resumen()?.cuentaId;
    if (cuentaId) this.prepararCobro(cuentaId);
  }

  cambiarModoCobro(modo: 'todo' | 'separado'): void {
    this.modoCobro.set(modo);
    this.seleccionSeparado.set({});
    this.entregado.set(null);
    this.error.set(null);
  }

  unidadesSeleccionadas(clave: string): number {
    return this.seleccionSeparado()[clave] ?? 0;
  }

  cambiarUnidades(grupo: { clave: string; ids: string[] }, delta: number): void {
    const actual = this.unidadesSeleccionadas(grupo.clave);
    const nueva = Math.max(0, Math.min(grupo.ids.length, actual + delta));
    this.seleccionSeparado.update((s) => ({ ...s, [grupo.clave]: nueva }));
  }

  cerrarCobro(): void {
    this.cobrando.set(false);
    this.resumen.set(null);
    this.ticket.set(null);
  }

  confirmarCobro(m: Mesa): void {
    const r = this.resumen();
    if (!r || !m.cuentaActiva) return;
    const importe = this.importeACobrar();
    if (importe <= 0) return;
    if (this.metodo() === 'EFECTIVO' && (this.entregado() ?? 0) < importe) {
      this.error.set('El importe entregado no cubre lo que se cobra.');
      return;
    }
    const cuenta = m.cuentaActiva;
    const ids = this.idsSeleccionados();
    const totalPendientes = this.pendientesSeparado().reduce((acc, g) => acc + g.ids.length, 0);
    const pagaTodo = this.modoCobro() === 'todo' || ids.length >= totalPendientes;
    const idsCobrados = new Set(ids);
    // Ticket de este cobro: lo que queda pendiente (todo junto) o solo lo que paga este comensal
    const lineas = agruparLineas(
      r.ordenes
        .filter((o) => o.ordenEstado !== 'Cancelado' && !o.pagada && (pagaTodo || idsCobrados.has(o.id)))
        .map((o) => ({ nombre: o.plato?.nombre ?? 'Consumo', precio: Number(o.precio ?? 0) })),
    );
    // Pagos anteriores (p. ej. desde el móvil) para numerar este: «Pago 2 de 2»
    const pagosPrevios = pagosDeCuenta(
      r.ordenes.map((o) => ({
        nombre: o.plato?.nombre ?? 'Consumo', precio: Number(o.precio ?? 0), pagada: o.pagada,
        cancelada: o.ordenEstado === 'Cancelado', fechaPago: o.fechaPago, metodoPago: o.metodoPago,
      })),
    ).length;
    const unicoPago = pagaTodo && pagosPrevios === 0;
    const peticion = pagaTodo
      ? this.cuentaApi.pagarCuentaCompleta(r.cuentaId, this.metodo())
      : this.cuentaApi.pagarCuentaParcial(r.cuentaId, ids, this.metodo());

    this.ocupado.set(true);
    this.error.set(null);
    peticion.subscribe({
      next: () => {
        this.ocupado.set(false);
        this.restantes.set(pagaTodo ? 0 : Number((Number(r.pendiente) - importe).toFixed(2)));
        this.ticket.set({
          cuentaId: r.cuentaId,
          mesa: m.id,
          comensales: unicoPago ? (cuenta.comensales ?? null) : null,
          fechaApertura: cuenta.fechaCreacion,
          fechaPago: new Date().toISOString(),
          metodoPago: this.metodo(),
          lineas,
          total: importe,
          entregado: this.metodo() === 'EFECTIVO' ? this.entregado() : null,
          pago: unicoPago ? null : { numero: pagosPrevios + 1, de: pagaTodo ? pagosPrevios + 1 : null },
        });
        this.refrescar();
      },
      error: (err) => {
        this.ocupado.set(false);
        this.error.set(err?.error?.message ?? 'No se ha podido registrar el cobro.');
      },
    });
  }

  descargarTicket(): void {
    const t = this.ticket();
    if (t) generarTicketPdf(t).save(nombreArchivoTicket(t));
  }

  hoyTexto(): string {
    return new Date(this.ahora()).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  private accion(peticion: Observable<unknown>): void {
    if (this.ocupado()) return;
    this.ocupado.set(true);
    this.error.set(null);
    peticion.subscribe({
      next: () => {
        this.ocupado.set(false);
        this.refrescar();
      },
      error: (err) => {
        this.ocupado.set(false);
        this.error.set(err?.error?.message ?? 'No se ha podido completar la acción.');
      },
    });
  }

  private prepararCobro(cuentaId: string): void {
    this.ticket.set(null);
    this.resumen.set(null);
    this.entregado.set(null);
    this.seleccionSeparado.set({});
    this.metodo.set('TARJETA');
    this.error.set(null);
    this.cobrando.set(true);
    this.cuentaApi.obtenerResumenCuenta(cuentaId).subscribe({
      next: (r) => this.resumen.set(r),
      error: () => this.error.set('No se ha podido cargar la cuenta.'),
    });
  }

  private refrescar(): void {
    forkJoin([this.mesasApi.cargarMesasParaVista()]).subscribe(([mesas]) => this.mesas.set(mesas));
  }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
