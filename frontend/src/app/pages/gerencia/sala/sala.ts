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
import { DatosTicket, agruparLineas, generarTicketPdf, nombreArchivoTicket } from '../../../services/ticket-pdf';

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

  // Cobro en caja
  readonly resumen = signal<CuentaResumenResponse | null>(null);
  readonly cobrando = signal(false);
  readonly metodo = signal<MetodoPago>('TARJETA');
  readonly entregado = signal<number | null>(null);
  readonly ticket = signal<DatosTicket | null>(null);

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
  readonly cambio = computed(() => {
    const e = this.entregado();
    const p = this.resumen()?.pendiente ?? 0;
    return e == null ? null : Number((e - p).toFixed(2));
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
  }

  abrir(m: Mesa): void {
    this.accion(this.mesasApi.ocuparMesa(m.id, this.comensalesApertura()));
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
    this.ticket.set(null);
    this.entregado.set(null);
    this.metodo.set('TARJETA');
    this.cobrando.set(true);
    this.cuentaApi.obtenerResumenCuenta(m.cuentaActiva.id).subscribe({
      next: (r) => this.resumen.set(r),
      error: () => this.error.set('No se ha podido cargar la cuenta.'),
    });
  }

  cerrarCobro(): void {
    this.cobrando.set(false);
    this.resumen.set(null);
    this.ticket.set(null);
  }

  confirmarCobro(m: Mesa): void {
    const r = this.resumen();
    if (!r || !m.cuentaActiva) return;
    if (this.metodo() === 'EFECTIVO' && (this.entregado() ?? 0) < r.pendiente) {
      this.error.set('El importe entregado no cubre el total.');
      return;
    }
    const cuenta = m.cuentaActiva;
    this.ocupado.set(true);
    this.cuentaApi.pagarCuentaCompleta(r.cuentaId, this.metodo()).subscribe({
      next: () => {
        this.ocupado.set(false);
        this.ticket.set({
          cuentaId: r.cuentaId,
          mesa: m.id,
          comensales: cuenta.comensales ?? null,
          fechaApertura: cuenta.fechaCreacion,
          fechaPago: new Date().toISOString(),
          metodoPago: this.metodo(),
          lineas: this.lineasCobro(),
          total: Number(r.total),
          entregado: this.metodo() === 'EFECTIVO' ? this.entregado() : null,
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

  private refrescar(): void {
    forkJoin([this.mesasApi.cargarMesasParaVista()]).subscribe(([mesas]) => this.mesas.set(mesas));
  }

  private hoyIso(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
