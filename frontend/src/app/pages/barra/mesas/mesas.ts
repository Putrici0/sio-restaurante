import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { forkJoin, Subscription, timer, of, catchError, take, firstValueFrom } from 'rxjs';
import jsPDF from 'jspdf';

import { MesaDetalle } from '../../../shared/mesa-detalle/mesa-detalle';
import { Navbar } from '../../../shared/navbar/navbar';
import { Mesa, ZonaMesa } from '../../../models/mesa.model';
import { CuentaApiService, OrdenCuentaResponse } from '../../../services/cuenta-api.service';
import { MesasApiService } from '../../../services/mesas-api.service';
import { MESAS_LAYOUT } from '../../../data/mesas-layout';
import { Reservas } from '../reservas/reservas';
import { ReservasApiService } from '../../../services/reservas-api.service';
import { Reserva } from '../../../models/reserva.model';

type DireccionUnion = 'arriba' | 'derecha' | 'abajo' | 'izquierda';

interface MesaCeldaVista {
  mesaFisicaId: string;
  mesa: Mesa;
  esPrincipal: boolean;
  esFantasma: boolean;
  fila: number;
  columna: number;
  vecinos: Partial<Record<DireccionUnion, string>>;
  // NUEVO: Estados visuales de reserva
  estadoReserva: 'ninguno' | 'reservada' | 'proxima' | 'alerta';
  reservaNombre?: string;
}

interface ItemCobroAgrupado {
  key: string;
  platoId: string;
  nombre: string;
  categoria: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
  estados: string[];
  ordenesIds: string[];
}

interface ItemTicketCobro {
  nombre: string;
  cantidad: number;
  subtotal: number;
}

@Component({
  selector: 'app-mesas',
  standalone: true,
  imports: [CommonModule, MesaDetalle, Navbar, Reservas],
  templateUrl: './mesas.html',
  styleUrl: './mesas.css',
})
export class Mesas implements OnInit, OnDestroy {
  private readonly mesasApi = inject(MesasApiService);
  private readonly cuentaApi = inject(CuentaApiService);
  private readonly reservasApi = inject(ReservasApiService); // API Inyectada
  private readonly apiUrl = `http://${window.location.hostname}:7070`;

  private reservasSub: Subscription | null = null;
  private pollingSub?: Subscription;
  private readonly pollingMs = 2000;
  private readonly reservaLookaheadMinutes = 1;
  private readonly reservaGraceAfterMinutes = 1;
  private readonly reservaBlockBeforeMinutes = 2;
  private readonly reservaReservedSoonMinutes = 0;
  private readonly reservaAlertBusyThresholdMinutes = 20;
  private procesandoCicloReservas = false;
  private relojInterval: any;
  private toastTimeoutRef?: number;

  readonly mostrarReservas = signal(false);
  readonly zona = signal<ZonaMesa>('interior');
  readonly mesaSeleccionada = signal<Mesa | null>(null);
  readonly mesas = signal<Mesa[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly accionMesaId = signal<string | null>(null);
  readonly modoEdicion = signal(false);
  readonly accionAgrupacionMesaId = signal<string | null>(null);

  // NUEVO: Reloj y Reservas del día
  readonly reservasHoy = signal<Reserva[]>([]);
  readonly minutosActuales = signal<number>(this.horaActualMinutos());

  // NUEVO: Variables Modal Advertencia Ocupar
  readonly mostrarAvisoReservaModal = signal(false);
  readonly avisoReservaMinutos = signal<number>(0);
  readonly mesaPendienteOcuparId = signal<string>('');

  readonly mostrarModalCobro = signal(false);
  readonly cuentaCobroId = signal<string | null>(null);
  readonly mesaCobroId = signal<string | null>(null);
  readonly totalCuentaCobro = signal<number | null>(null);
  readonly pendienteCuentaCobro = signal<number | null>(null);
  readonly ultimoCobroPendiente = signal<number>(0);
  readonly cargandoCobro = signal(false);
  readonly procesandoCobro = signal(false);
  readonly resumenCobro = signal<ItemCobroAgrupado[]>([]);
  readonly metodoPago = signal<'EFECTIVO' | 'TARJETA'>('EFECTIVO');
  readonly importeRecibido = signal<number | null>(null);
  readonly eliminandoOrdenId = signal<string | null>(null);

  readonly mostrarConfirmacionEliminar = signal(false);
  readonly itemPendienteEliminar = signal<ItemCobroAgrupado | null>(null);
  readonly ordenesPendientesEliminar = signal<string[]>([]);
  readonly mostrarConfirmacionLiberar = signal(false);
  readonly mesaPendienteLiberarId = signal<string | null>(null);
  readonly mostrarConfirmacionCobroTicket = signal(false);
  readonly mostrarModalCorreoTicket = signal(false);
  readonly enviandoTicketCobro = signal(false);
  readonly correoTicketCobro = signal('');
  readonly errorCorreoTicketCobro = signal<string | null>(null);
  readonly ticketCobroMesaId = signal<string | null>(null);
  readonly ticketCobroCuentaId = signal<string | null>(null);
  readonly ticketCobroMetodoPago = signal<'EFECTIVO' | 'TARJETA'>('EFECTIVO');
  readonly ticketCobroFechaPago = signal<string | null>(null);
  readonly ticketCobroItems = signal<ItemTicketCobro[]>([]);
  readonly ticketCobroTotal = signal(0);
  readonly showToast = signal(false);
  readonly toastMessage = signal('');
  readonly toastTipo = signal<'ok' | 'error'>('ok');

  readonly seleccionCantidadPorPlato = signal<Record<string, number>>({});
  readonly mesasCobroTexto = computed(() => {
    const mesaId = this.mesaCobroId();
    if (!mesaId) {
      return '-';
    }
    return this.obtenerTextoGrupoMesas(mesaId);
  });

  readonly celdasActuales = computed(() => this.construirCeldasZona(this.zona()));
  readonly puedeSepararSeleccion = computed(() => {
    const mesa = this.mesaSeleccionada();
    return !!mesa && mesa.grupoMesaIds.length > 1 && mesa.estado === 'libre';
  });

  // (Computados de cobro se mantienen igual...)
  readonly totalCobro = computed(() => {
    const seleccion = this.seleccionCantidadPorPlato();
    const total = this.resumenCobro().reduce((acc, item) => {
      if (!this.puedeCobrarItem(item)) return acc;
      const cantidad = Math.max(0, Math.min(seleccion[item.key] ?? 0, item.ordenesIds.length));
      return acc + cantidad * item.precioUnitario;
    }, 0);
    return Number(total.toFixed(2));
  });

  readonly ordenesSeleccionadas = computed(() => {
    const seleccion = this.seleccionCantidadPorPlato();
    const ids: string[] = [];
    for (const item of this.resumenCobro()) {
      if (!this.puedeCobrarItem(item)) continue;
      const cantidad = Math.max(0, Math.min(seleccion[item.key] ?? 0, item.ordenesIds.length));
      ids.push(...item.ordenesIds.slice(0, cantidad));
    }
    return ids;
  });

  readonly cambioCobro = computed(() => {
    const total = this.totalCobro();
    const recibido = this.importeRecibido();
    if (this.metodoPago() !== 'EFECTIVO' || recibido == null) return null;
    return Number((recibido - total).toFixed(2));
  });

  readonly faltaCobro = computed(() => {
    const total = this.totalCobro();
    const recibido = this.importeRecibido();
    if (this.metodoPago() !== 'EFECTIVO' || recibido == null) return null;
    if (recibido >= total) return 0;
    return Number((total - recibido).toFixed(2));
  });

  readonly puedeConfirmarCobro = computed(() => {
    const total = this.totalCobro();
    if (total <= 0 || this.procesandoCobro() || this.eliminandoOrdenId() !== null || this.mostrarConfirmacionEliminar()) return false;
    if (this.ordenesSeleccionadas().length === 0) return false;
    if (this.metodoPago() === 'TARJETA') return true;
    const recibido = this.importeRecibido();
    return recibido != null && recibido >= total;
  });

  constructor() {
    this.iniciarStreamReservasHoy();
    this.recargarMesas();
    this.iniciarPolling();
  }

  private getLocalHoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  }

  ngOnInit() {
    this.relojInterval = setInterval(() => {
      this.minutosActuales.set(this.horaActualMinutos());
    }, 1000);
  }

  ngOnDestroy() {
    this.reservasSub?.unsubscribe();
    this.pollingSub?.unsubscribe();
    if (this.relojInterval) clearInterval(this.relojInterval);
    if (this.toastTimeoutRef) clearTimeout(this.toastTimeoutRef);
  }

  horaActualMinutos(): number {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  }

  timeToMins(hora: string): number {
    if (!hora) return 0;
    const [h, m] = hora.split(':').map(Number);
    return (h || 0) * 60 + (m || 0);
  }

  seleccionarCelda(celda: MesaCeldaVista): void {
    const mesa = celda.mesa;
    const actual = this.mesaSeleccionada();
    if (actual && this.claveGrupo(actual.grupoMesaIds) === this.claveGrupo(mesa.grupoMesaIds)) {
      this.mesaSeleccionada.set(null);
      return;
    }
    this.mesaSeleccionada.set(mesa);
  }

  toggleModoEdicion(): void { this.modoEdicion.update((value) => !value); }

  unirMesaLado(celda: MesaCeldaVista, direccion: DireccionUnion, event: MouseEvent): void {
    event.stopPropagation();
    const mesaIdDestino = celda.vecinos[direccion];
    if (!mesaIdDestino || this.accionAgrupacionMesaId() !== null) return;

    this.error.set(null);
    this.accionAgrupacionMesaId.set(celda.mesaFisicaId);

    this.mesasApi.unirMesas(celda.mesaFisicaId, mesaIdDestino).subscribe({
      next: () => {
        this.accionAgrupacionMesaId.set(null);
        this.recargarMesas(celda.mesa.mesaPrincipalId ?? celda.mesa.id);
      },
      error: (err) => {
        this.accionAgrupacionMesaId.set(null);
        this.error.set(this.extraerMensaje(err));
      },
    });
  }

  separarMesaSeleccionada(): void {
    const mesa = this.mesaSeleccionada();
    if (!mesa || mesa.grupoMesaIds.length <= 1 || this.accionAgrupacionMesaId() !== null) return;

    const mesaId = mesa.mesaPrincipalId ?? mesa.id;
    this.error.set(null);
    this.accionAgrupacionMesaId.set(mesaId);

    this.mesasApi.separarMesa(mesaId).subscribe({
      next: () => {
        this.accionAgrupacionMesaId.set(null);
        this.recargarMesas(mesaId);
      },
      error: (err) => {
        this.accionAgrupacionMesaId.set(null);
        this.error.set(this.extraerMensaje(err));
      },
    });
  }

  cambiarZona(nuevaZona: ZonaMesa): void {
    this.zona.set(nuevaZona);
    this.mesaSeleccionada.set(null);
  }

  esMesaSeleccionada(mesa: Mesa): boolean {
    const seleccionada = this.mesaSeleccionada();
    return !!seleccionada && this.claveGrupo(seleccionada.grupoMesaIds) === this.claveGrupo(mesa.grupoMesaIds);
  }

  etiquetaMesa(mesa: Mesa): string {
    const ids = this.normalizarGrupoMesaIds(mesa.grupoMesaIds);
    // NUEVO: Añadimos espacios alrededor del '+'
    return ids.length <= 1 ? `M${mesa.id}` : ids.map((id) => `M${id}`).join(' + ');
  }

  puedeUnirsePor(direccion: DireccionUnion, celda: MesaCeldaVista): boolean {
    const vecinoId = celda.vecinos[direccion];
    return !!vecinoId && !celda.mesa.grupoMesaIds.includes(vecinoId);
  }

  // NUEVO: Validador antes de Ocupar Mesa
  solicitarOcuparMesa(mesaId: string): void {
    const minNow = this.minutosActuales();
    const reservas = this.reservasHoy().filter(r => r.estado === 'Confirmado');
    const celda = this.celdasActuales().find(c => c.mesa.id === mesaId || c.mesaFisicaId === mesaId);
    const mesaLogica = celda ? celda.mesa : this.mesaSeleccionada();
    const mesasIdsGrupo = mesaLogica ? mesaLogica.grupoMesaIds : [mesaId];

    // NUEVO: Si la mesa ya está en estado reservada, ocupamos directamente
    // (el personal está confirmando la llegada del cliente que reservó)
    if (mesaLogica?.estado === 'reservada' || mesaLogica?.estado === 'proximamente-reservada') {
      this.ocuparMesaFinal(mesaId);
      return;
    }

    // Busca colisiones en una ventana corta de prueba
    const conflict = reservas.find(r =>
      r.mesasIds?.some(id => mesasIdsGrupo.includes(id)) &&
      this.timeToMins(r.hora) - minNow <= this.reservaLookaheadMinutes &&
      this.timeToMins(r.hora) + this.reservaGraceAfterMinutes >= minNow
    );

    if (conflict) {
      const diff = this.timeToMins(conflict.hora) - minNow;
      if (diff <= this.reservaBlockBeforeMinutes && diff >= -this.reservaGraceAfterMinutes) {
        this.error.set(`Mesa bloqueada por reserva de ${conflict.nombre} a las ${conflict.hora}`);
        return;
      }
      this.avisoReservaMinutos.set(diff);
      this.mesaPendienteOcuparId.set(mesaId);
      this.mostrarAvisoReservaModal.set(true);
    } else {
      this.ocuparMesaFinal(mesaId);
    }
  }

  confirmarOcuparConAviso(): void {
    this.mostrarAvisoReservaModal.set(false);
    this.ocuparMesaFinal(this.mesaPendienteOcuparId());
  }

  private ocuparMesaFinal(mesaId: string): void {
    this.error.set(null);
    this.accionMesaId.set(mesaId);

    this.mesasApi.ocuparMesa(mesaId).subscribe({
      next: () => this.recargarMesas(mesaId),
      error: (err) => {
        this.accionMesaId.set(null);
        this.error.set(this.extraerMensaje(err));
      },
    });
  }

  // El resto de métodos de cobro, eliminar, etc...
  abrirCobro(payload: { mesaId: string; cuentaId: string }): void {
    this.error.set(null);
    this.cargandoCobro.set(true);
    this.mesaCobroId.set(payload.mesaId);
    this.cuentaCobroId.set(payload.cuentaId);
    this.totalCuentaCobro.set(null);
    this.pendienteCuentaCobro.set(null);
    this.resumenCobro.set([]);
    this.seleccionCantidadPorPlato.set({});
    this.metodoPago.set('EFECTIVO');
    this.importeRecibido.set(null);
    this.eliminandoOrdenId.set(null);
    this.mostrarConfirmacionEliminar.set(false);
    this.itemPendienteEliminar.set(null);
    this.mostrarModalCobro.set(true);
    this.recargarResumenCobro();
  }

  confirmarCobro(): void {
    const cuentaId = this.cuentaCobroId();
    const mesaId = this.mesaCobroId();
    const metodoPago = this.metodoPago();
    const ordenesSeleccionadas = this.ordenesSeleccionadas();
    const totalOrdenesPendientes = this.resumenCobro().reduce((acc, item) => acc + item.ordenesIds.length, 0);

    if (!cuentaId || !mesaId || ordenesSeleccionadas.length === 0 || !this.puedeConfirmarCobro()) return;
    const itemsTicket = this.resumenCobro()
      .map((item) => {
        const cantidadSeleccionada = this.cantidadSeleccionada(item);
        if (cantidadSeleccionada <= 0) return null;
        return {
          nombre: item.nombre,
          cantidad: cantidadSeleccionada,
          subtotal: Number((cantidadSeleccionada * item.precioUnitario).toFixed(2)),
        } as ItemTicketCobro;
      })
      .filter((item): item is ItemTicketCobro => item !== null);
    const totalTicket = Number(this.totalCobro().toFixed(2));
    const fechaTicket = new Date().toISOString();

    this.error.set(null);
    this.procesandoCobro.set(true);
    this.accionMesaId.set(mesaId);

    const request$ = ordenesSeleccionadas.length === totalOrdenesPendientes
      ? this.mesasApi.pagarCuentaCompleta(cuentaId, metodoPago)
      : this.mesasApi.pagarCuentaParcial(cuentaId, ordenesSeleccionadas, metodoPago);

    request$.subscribe({
      next: (cuentaPagada) => {
        this.procesandoCobro.set(false);
        const pendientePrevio = this.pendienteCuentaCobro() ?? 0;
        this.ultimoCobroPendiente.set(Math.max(0, pendientePrevio - totalTicket));
        
        this.ticketCobroMesaId.set(mesaId);
        this.ticketCobroCuentaId.set(cuentaPagada?.id ?? cuentaId);
        this.ticketCobroMetodoPago.set(metodoPago);
        this.ticketCobroFechaPago.set(cuentaPagada?.fechaPago ?? fechaTicket);
        this.ticketCobroItems.set(itemsTicket);
        this.ticketCobroTotal.set(totalTicket);
        this.correoTicketCobro.set('');
        this.errorCorreoTicketCobro.set(null);
        setTimeout(() => {
          this.mostrarConfirmacionCobroTicket.set(true);
        }, 0);
        this.mostrarToast('Cobro registrado correctamente.', 'ok');
        this.recargarMesas(mesaId);
      },
      error: (err) => {
        this.procesandoCobro.set(false);
        this.accionMesaId.set(null);
        this.error.set(this.extraerMensaje(err));
      },
    });
  }

  eliminarUnaUnidad(item: ItemCobroAgrupado): void {
    if (!this.puedeEliminarItem(item)) return;
    const cantidadSolicitada = this.cantidadSeleccionada(item);
    const cantidadAEliminar = Math.max(1, Math.min(cantidadSolicitada > 0 ? cantidadSolicitada : 1, item.ordenesIds.length));

    this.itemPendienteEliminar.set(item);
    this.ordenesPendientesEliminar.set(item.ordenesIds.slice(0, cantidadAEliminar));
    this.mostrarConfirmacionEliminar.set(true);
  }

  solicitarLiberarMesa(mesaId: string): void {
    if (!mesaId || this.accionMesaId() !== null) return;
    this.mesaPendienteLiberarId.set(mesaId);
    this.mostrarConfirmacionLiberar.set(true);
  }

  cancelarConfirmacionLiberar(): void {
    this.mostrarConfirmacionLiberar.set(false);
    this.mesaPendienteLiberarId.set(null);
  }

  confirmarLiberarMesa(): void {
    const mesaId = this.mesaPendienteLiberarId();
    if (!mesaId) return;
    const mesaActual = this.mesas().find((m) => m.id === mesaId);
    const grupoPrevio = mesaActual?.grupoMesaIds ?? [mesaId];

    this.error.set(null);
    this.accionMesaId.set(mesaId);

    this.mesasApi.liberarMesa(mesaId).subscribe({
      next: async () => {
        if (grupoPrevio.length > 1) {
          try {
            await firstValueFrom(this.mesasApi.separarMesa(grupoPrevio[0]));
          } catch {
            // Ignorado para no bloquear liberacion si ya quedo separado.
          }
        }
        this.mostrarConfirmacionLiberar.set(false);
        this.mesaPendienteLiberarId.set(null);
        this.recargarMesas(mesaId);
      },
      error: (err) => {
        this.accionMesaId.set(null);
        this.error.set(this.extraerMensaje(err));
      },
    });
  }

  cancelarConfirmacionEliminar(): void {
    this.mostrarConfirmacionEliminar.set(false);
    this.itemPendienteEliminar.set(null);
    this.ordenesPendientesEliminar.set([]);
  }

  confirmarEliminarUnidad(): void {
    const cuentaId = this.cuentaCobroId();
    const ordenesIds = this.ordenesPendientesEliminar();
    const primeraOrdenId = ordenesIds[0];

    if (!cuentaId || ordenesIds.length === 0 || !primeraOrdenId || this.eliminandoOrdenId() !== null) {
      this.cancelarConfirmacionEliminar();
      return;
    }

    this.error.set(null);
    this.eliminandoOrdenId.set(primeraOrdenId);

    forkJoin(ordenesIds.map((ordenId) => this.cuentaApi.eliminarOrdenDeCuenta(cuentaId, ordenId))).subscribe({
      next: () => {
        this.eliminandoOrdenId.set(null);
        this.cancelarConfirmacionEliminar();
        this.recargarResumenCobro();
      },
      error: (err) => {
        this.eliminandoOrdenId.set(null);
        this.cancelarConfirmacionEliminar();
        this.error.set(this.extraerMensaje(err));
      },
    });
  }

  puedeEliminarItem(item: ItemCobroAgrupado): boolean {
    return (item.ordenesIds.length > 0 && this.eliminandoOrdenId() === null && !this.procesandoCobro() && !this.mostrarConfirmacionEliminar());
  }

  cerrarModalCobro(): void {
    this.mostrarModalCobro.set(false);
    this.cargandoCobro.set(false);
    this.procesandoCobro.set(false);
    this.cuentaCobroId.set(null);
    this.mesaCobroId.set(null);
    this.totalCuentaCobro.set(null);
    this.pendienteCuentaCobro.set(null);
    this.resumenCobro.set([]);
    this.seleccionCantidadPorPlato.set({});
    this.metodoPago.set('EFECTIVO');
    this.importeRecibido.set(null);
    this.eliminandoOrdenId.set(null);
    this.mostrarConfirmacionEliminar.set(false);
    this.itemPendienteEliminar.set(null);
    this.ordenesPendientesEliminar.set([]);
  }

  cerrarConfirmacionCobroTicket(): void {
    if (this.enviandoTicketCobro()) return;
    this.mostrarConfirmacionCobroTicket.set(false);
    this.correoTicketCobro.set('');
    this.errorCorreoTicketCobro.set(null);
    this.cerrarModalCobro();
  }

  abrirModalCorreoTicket(): void {
    this.correoTicketCobro.set('');
    this.errorCorreoTicketCobro.set(null);
    this.mostrarModalCorreoTicket.set(true);
  }

  cerrarModalCorreoTicket(): void {
    if (this.enviandoTicketCobro()) return;
    this.mostrarModalCorreoTicket.set(false);
    this.correoTicketCobro.set('');
    this.errorCorreoTicketCobro.set(null);
  }

  descargarTicketCobro(): void {
    const pdf = this.construirPdfTicketCobro();
    pdf.save(this.obtenerNombreArchivoTicketCobro());
  }

  actualizarCorreoTicketCobro(valor: string): void {
    this.correoTicketCobro.set(valor);
    this.errorCorreoTicketCobro.set(null);
  }

  enviarTicketCobro(): void {
    const correo = this.correoTicketCobro().trim();
    if (!correo) {
      this.errorCorreoTicketCobro.set('Introduce un correo.');
      return;
    }
    if (!this.esCorreoValido(correo)) {
      this.errorCorreoTicketCobro.set('Correo no valido.');
      return;
    }

    this.enviandoTicketCobro.set(true);
    this.errorCorreoTicketCobro.set(null);
    const pdf = this.construirPdfTicketCobro();
    const pdfBase64 = pdf.output('datauristring');

    fetch(`${this.apiUrl}/tiques/enviar`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        correo,
        nombreArchivo: this.obtenerNombreArchivoTicketCobro(),
        pdfBase64,
      }),
    })
      .then(async (respuesta) => {
        if (!respuesta.ok) {
          const error = await respuesta.json().catch(() => null);
          throw new Error(error?.error ?? error?.message ?? 'No se pudo enviar el ticket');
        }
        return respuesta.json();
      })
      .then(() => {
        this.enviandoTicketCobro.set(false);
        this.mostrarToast(`Ticket enviado correctamente a ${correo}`, 'ok');
        this.cerrarModalCorreoTicket();
      })
      .catch((error) => {
        this.enviandoTicketCobro.set(false);
        this.errorCorreoTicketCobro.set(error.message ?? 'No se pudo enviar el ticket');
      });
  }

  private construirPdfTicketCobro(): jsPDF {
    const pdf = new jsPDF();
    const margenIzq = 14;
    const margenDer = 196;
    let y = 18;
    const ahora = new Date();
    const mesa = this.obtenerMesasTextoTicketCobro();
    const cuentaId = this.ticketCobroCuentaId();
    const identificador = `TK-${ahora.getFullYear()}${String(ahora.getMonth() + 1).padStart(2, '0')}${String(ahora.getDate()).padStart(2, '0')}-${cuentaId?.slice(-6).toUpperCase() ?? 'SINID'}`;

    const saltarPaginaSiHaceFalta = () => {
      if (y > 280) {
        pdf.addPage();
        y = 18;
      }
    };

    const escribirTexto = (
      texto: string,
      x = margenIzq,
      salto = 7,
      opciones?: { negrita?: boolean; tamano?: number },
    ) => {
      pdf.setFontSize(opciones?.tamano ?? 11);
      pdf.setFont('helvetica', opciones?.negrita ? 'bold' : 'normal');
      const lineas = pdf.splitTextToSize(texto, margenDer - margenIzq);
      for (const linea of lineas) {
        saltarPaginaSiHaceFalta();
        pdf.text(linea, x, y);
        y += salto;
      }
    };

    const escribirImporte = (texto: string, importe: number) => {
      saltarPaginaSiHaceFalta();
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'normal');
      pdf.text(texto, margenIzq, y);
      pdf.text(`${importe.toFixed(2)} €`, margenDer, y, { align: 'right' });
      y += 7;
    };

    escribirTexto('RESTAURANTE EJEMPLO', margenIzq, 8, { negrita: true, tamano: 15 });
    escribirTexto('TICKET');
    escribirTexto(`No. ticket: ${identificador}`);
    escribirTexto(`Fecha: ${ahora.toLocaleDateString('es-ES')}  Hora: ${ahora.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`);
    escribirTexto(`Mesa(s): ${mesa}`);
    escribirTexto(`Metodo de pago: ${this.ticketCobroMetodoPago()}`);
    if (this.ticketCobroFechaPago()) {
      escribirTexto(`Fecha de pago: ${this.formatearFecha(this.ticketCobroFechaPago()!)}`);
    }

    y += 4;
    pdf.line(margenIzq, y, margenDer, y);
    y += 9;

    escribirTexto('Productos', margenIzq, 8, { negrita: true, tamano: 13 });
    for (const item of this.ticketCobroItems()) {
      escribirImporte(`${item.cantidad}x ${item.nombre}`, item.subtotal);
    }

    y += 4;
    pdf.line(margenIzq, y, margenDer, y);
    y += 9;
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(13);
    pdf.text('TOTAL', margenIzq, y);
    pdf.text(`${this.ticketCobroTotal().toFixed(2)} €`, margenDer, y, { align: 'right' });
    y += 12;

    const fechaPago = this.ticketCobroFechaPago();
    const metodoPago = this.ticketCobroMetodoPago();
    escribirTexto('Pagos', margenIzq, 8, { negrita: true, tamano: 13 });
    escribirTexto(
      `Pago 1 - Metodo: ${metodoPago}${fechaPago ? ` - ${this.formatearFecha(fechaPago)}` : ''}`,
      margenIzq,
      7,
      { negrita: true },
    );
    for (const item of this.ticketCobroItems()) {
      escribirImporte(`  ${item.cantidad}x ${item.nombre}`, item.subtotal);
    }
    escribirImporte('  Total pago', this.ticketCobroTotal());
    y += 4;

    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text('Gracias por su visita', 105, y, { align: 'center' });
    return pdf;
  }

  private obtenerNombreArchivoTicketCobro(): string {
    const mesa = this.ticketCobroMesaId() ?? 'sin-mesa';
    const fecha = new Date().toISOString().slice(0, 10);
    return `ticket-mesa-${mesa}-${fecha}.pdf`;
  }

  private obtenerMesasTextoTicketCobro(): string {
    const mesaId = this.ticketCobroMesaId();
    if (!mesaId) {
      return '-';
    }
    return this.obtenerTextoGrupoMesas(mesaId);
  }

  private obtenerTextoGrupoMesas(mesaId: string): string {
    const mesa = this.mesas().find((m) => m.id === mesaId);
    if (!mesa) {
      return mesaId;
    }

    const ids = (mesa.grupoMesaIds?.length ? mesa.grupoMesaIds : [mesa.id])
      .filter(Boolean)
      .sort((a, b) => Number(a) - Number(b));

    return ids.join(', ');
  }

  private esCorreoValido(correo: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo);
  }

  private formatearFecha(fechaIso: string): string {
    const fecha = new Date(fechaIso);
    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(fecha);
  }

  cambiarMetodoPago(metodo: 'EFECTIVO' | 'TARJETA'): void {
    this.metodoPago.set(metodo);
    if (metodo === 'TARJETA') this.importeRecibido.set(null);
  }

  actualizarImporteRecibido(valor: string): void {
    if (valor.trim() === '') {
      this.importeRecibido.set(null);
      return;
    }
    const numero = Number(valor);
    this.importeRecibido.set(Number.isNaN(numero) ? null : numero);
  }

  obtenerResumenEstado(estados: string[]): string {
    const estadosNormalizados = estados.map((e) => (e === 'Preparación' || e === 'Preparacion') ? 'En preparación' : e);
    return Array.from(new Set(estadosNormalizados)).join(' · ');
  }

  cantidadSeleccionada(item: ItemCobroAgrupado): number {
    const seleccion = this.seleccionCantidadPorPlato();
    return Math.max(0, Math.min(seleccion[item.key] ?? 0, item.ordenesIds.length));
  }

  incrementarSeleccion(item: ItemCobroAgrupado): void {
    const actual = this.cantidadSeleccionada(item);
    if (actual >= item.ordenesIds.length) return;
    this.seleccionCantidadPorPlato.update((prev) => ({ ...prev, [item.key]: actual + 1 }));
  }

  decrementarSeleccion(item: ItemCobroAgrupado): void {
    const actual = this.cantidadSeleccionada(item);
    if (actual <= 0) return;
    this.seleccionCantidadPorPlato.update((prev) => ({ ...prev, [item.key]: actual - 1 }));
  }

  itemSeleccionado(item: ItemCobroAgrupado): boolean { return this.cantidadSeleccionada(item) === item.cantidad; }

  toggleSeleccionItem(item: ItemCobroAgrupado): void {
    const actual = this.cantidadSeleccionada(item);
    this.seleccionCantidadPorPlato.update((prev) => ({ ...prev, [item.key]: actual === item.cantidad ? 0 : item.cantidad }));

    if (this.metodoPago() === 'EFECTIVO') {
      const recibido = this.importeRecibido();
      if (recibido != null && recibido < this.totalCobro()) this.importeRecibido.set(null);
    }
  }

  seleccionarTodoCobro(): void {
    const seleccion: Record<string, number> = {};
    for (const item of this.resumenCobro()) seleccion[item.key] = this.puedeCobrarItem(item) ? item.cantidad : 0;
    this.seleccionCantidadPorPlato.set(seleccion);
  }

  limpiarSeleccionCobro(): void {
    const seleccion: Record<string, number> = {};
    for (const item of this.resumenCobro()) seleccion[item.key] = 0;
    this.seleccionCantidadPorPlato.set(seleccion);
    if (this.metodoPago() === 'EFECTIVO') this.importeRecibido.set(null);
  }

  private recargarResumenCobro(): void {
    const cuentaId = this.cuentaCobroId();
    if (!cuentaId) return;

    this.cargandoCobro.set(true);
    this.cuentaApi.obtenerResumenCuenta(cuentaId).subscribe({
      next: (cuentaResumen) => {
        const ordenesPendientes = cuentaResumen.ordenes.filter((orden) => orden.ordenEstado !== 'Cancelado' && !orden.pagada);
        this.totalCuentaCobro.set(Number(cuentaResumen.total));
        this.pendienteCuentaCobro.set(Number(cuentaResumen.pendiente));
        const resumenAgrupado = this.agruparOrdenes(ordenesPendientes);
        this.resumenCobro.set(resumenAgrupado);

        const seleccionInicial: Record<string, number> = {};
        for (const item of resumenAgrupado) seleccionInicial[item.key] = 0;
        this.seleccionCantidadPorPlato.set(seleccionInicial);
        this.cargandoCobro.set(false);
      },
      error: (err) => {
        this.cargandoCobro.set(false);
        this.cerrarModalCobro();
        this.error.set(this.extraerMensaje(err));
      },
    });
  }

  private agruparOrdenes(ordenes: OrdenCuentaResponse[]): ItemCobroAgrupado[] {
    const mapa = new Map<string, ItemCobroAgrupado>();

    for (const orden of ordenes) {
      const plato = orden.plato;
      const platoId = plato?.id ?? `sin-id-${Math.random()}`;
      const nombre = plato?.nombre?.trim() || 'Producto';
      const categoria = plato?.categoria?.trim() || '';
      const estado = orden.ordenEstado?.trim() || 'Sin estado';
      const key = `${platoId}::${estado}`;
      const precioUnitario = Number(orden.precio ?? 0);

      if (!mapa.has(key)) {
        mapa.set(key, { key, platoId, nombre, categoria, precioUnitario, cantidad: 0, subtotal: 0, estados: [], ordenesIds: [] });
      }

      const item = mapa.get(key)!;
      item.cantidad += 1;
      item.subtotal += precioUnitario;
      if (orden.ordenEstado) item.estados.push(orden.ordenEstado);
      if (orden.id) item.ordenesIds.push(orden.id);
    }

    return Array.from(mapa.values()).sort((a, b) => {
      const entregaA = this.puedeCobrarItem(a) ? 1 : 0;
      const entregaB = this.puedeCobrarItem(b) ? 1 : 0;
      if (entregaA !== entregaB) return entregaB - entregaA;
      const nombre = a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' });
      if (nombre !== 0) return nombre;
      return this.obtenerResumenEstado(a.estados).localeCompare(this.obtenerResumenEstado(b.estados), 'es', { sensitivity: 'base' });
    });
  }

  puedeCobrarItem(item: ItemCobroAgrupado): boolean {
    const estado = (item.estados[0] ?? '').trim().toLowerCase();
    return estado === 'entregado';
  }

  private iniciarPolling(): void {
    this.pollingSub = timer(this.pollingMs, this.pollingMs).subscribe(() => {
      this.recargarMesas(undefined, false);
    });
  }

  private recargarMesas(mesaAReseleccionar?: string, mostrarLoading = true): void {
    if (mostrarLoading) {
      this.cargando.set(true);
    }

    forkJoin({
      mesas: this.mesasApi.cargarMesasParaVista().pipe(take(1)) // Crítico
    }).subscribe({
      next: ({ mesas }: { mesas: Mesa[] }) => {
        this.error.set(null);
        this.mesas.set(mesas);
        void this.sincronizarCicloReservas(mesas, this.reservasHoy());
        this.cargando.set(false);
        this.accionMesaId.set(null);

        if (mesaAReseleccionar) {
          const nuevaMesa = this.buscarMesaLogicaPorId(mesas, mesaAReseleccionar);
          this.mesaSeleccionada.set(nuevaMesa);
        } else {
          const seleccionActual = this.mesaSeleccionada();
          if (seleccionActual) {
            const mesaRefrescada = this.buscarMesaLogicaPorId(mesas, seleccionActual.mesaPrincipalId ?? seleccionActual.id);
            this.mesaSeleccionada.set(mesaRefrescada);
          }
        }
      },
      error: (err) => {
        console.error('Error fatal recargando mesas barra:', err);
        this.cargando.set(false);
        this.accionMesaId.set(null);
        if (this.mesas().length === 0) {
          this.error.set('No se han podido cargar las mesas de la barra.');
        }
      },
    });
  }

  private iniciarStreamReservasHoy(): void {
    this.reservasSub?.unsubscribe();
    const hoy = this.getLocalHoy();
    this.reservasSub = this.reservasApi
      .obtenerReservasPorFecha(hoy)
      .pipe(
        catchError((err) => {
          console.warn('Error stream reservas barra:', err);
          return of([] as Reserva[]);
        }),
      )
      .subscribe((reservas) => {
        this.reservasHoy.set(reservas);
      });
  }

  private async sincronizarCicloReservas(mesas: Mesa[], reservas: Reserva[]): Promise<void> {
    if (this.procesandoCicloReservas) return;
    this.procesandoCicloReservas = true;
    try {
      let huboCambios = false;
      const confirmadas = reservas
        .filter((r) => r.estado === 'Confirmado')
        .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));

      const mesasPorId = new Map(mesas.map((m) => [m.id, m]));
      const reservadasEnUso = new Set<string>();

      for (const r of confirmadas) {
        const diff = this.timeToMins(r.hora) - this.minutosActuales();
        const asignadas = (r.mesasIds ?? []).filter((id) => id && id.trim() !== '');

        if (diff > this.reservaLookaheadMinutes) {
          continue;
        }

        const hayMesaOcupada = asignadas.some((id) => mesasPorId.get(id)?.estado === 'ocupada');
        if (hayMesaOcupada && r.id) {
          await this.reservasApi.actualizarEstado(r.id, 'Finalizado');
          huboCambios = true;
          continue;
        }

        if (diff <= -this.reservaGraceAfterMinutes && r.id) {
          if (asignadas.length > 1) {
            try {
              await firstValueFrom(this.mesasApi.separarMesa(asignadas[0]));
            } catch {
              // Ignorado: puede no existir una union fisica persistida.
            }
          }
          await this.reservasApi.actualizarReserva(r.id, { estado: 'Cancelado', mesasIds: [] });
          huboCambios = true;
          continue;
        }

        if (asignadas.length > 0) {
          asignadas.forEach((id) => reservadasEnUso.add(id));
          continue;
        }

        const candidatas = this.buscarMejorCombinacionMesas(
          mesas,
          reservadasEnUso,
          r.comensales ?? 1,
          (r.zona ?? 'Cualquiera').toLowerCase(),
        );

        if (candidatas.length > 0 && r.id) {
          if (candidatas.length > 1) {
            await this.unirGrupoMesas(candidatas);
          }
          await this.reservasApi.actualizarReserva(r.id, { mesasIds: candidatas });
          candidatas.forEach((id) => reservadasEnUso.add(id));
          huboCambios = true;
        }
      }

      if (huboCambios) {
        // Refresco inmediato para evitar parpadeos de estado libre/proxima.
        this.recargarMesas(undefined, false);
      }
    } finally {
      this.procesandoCicloReservas = false;
    }
  }

  private async unirGrupoMesas(ids: string[]): Promise<void> {
    const grupo = Array.from(new Set(ids));
    if (grupo.length <= 1) return;
    const origen = grupo[0];
    for (let i = 1; i < grupo.length; i++) {
      await firstValueFrom(this.mesasApi.unirMesas(origen, grupo[i]));
    }
  }

  private buscarMejorCombinacionMesas(
    mesas: Mesa[],
    reservadasEnUso: Set<string>,
    comensales: number,
    zonaReserva: string,
  ): string[] {
    const zonasAProbar =
      zonaReserva === 'cualquiera' ? ['interior', 'terraza'] : [zonaReserva];

    const obtenerVecinos = (mesaId: string, zona: string): string[] => {
      const layoutZona = MESAS_LAYOUT.filter((m) => m.zona === zona);
      const idx = layoutZona.findIndex((m) => m.id === mesaId);
      if (idx < 0) return [];
      const vecinos: string[] = [];
      const fila = Math.floor(idx / 3);
      const col = idx % 3;
      if (fila > 0) vecinos.push(layoutZona[idx - 3].id);
      if (col < 2 && idx + 1 < layoutZona.length) vecinos.push(layoutZona[idx + 1].id);
      if (idx + 3 < layoutZona.length) vecinos.push(layoutZona[idx + 3].id);
      if (col > 0) vecinos.push(layoutZona[idx - 1].id);
      return vecinos;
    };

    const esConectado = (ids: string[], zona: string): boolean => {
      if (ids.length <= 1) return true;
      const objetivos = new Set(ids);
      const visitados = new Set<string>();
      const cola: string[] = [ids[0]];
      visitados.add(ids[0]);

      while (cola.length > 0) {
        const actual = cola.shift()!;
        for (const v of obtenerVecinos(actual, zona)) {
          if (!objetivos.has(v) || visitados.has(v)) continue;
          visitados.add(v);
          cola.push(v);
        }
      }
      return visitados.size === objetivos.size;
    };

    let mejorGlobal: { ids: string[]; count: number; over: number } | null = null;

    for (const zona of zonasAProbar) {
      const candidatas = mesas
        .filter((m) => m.zona.toLowerCase() === zona)
        .filter((m) => m.estado === 'libre')
        .filter((m) => !reservadasEnUso.has(m.id))
        .sort((a, b) => {
          if (a.capacidad !== b.capacidad) return a.capacidad - b.capacidad;
          return this.compararMesaIds(a.id, b.id);
        });

      if (candidatas.length === 0) continue;

      const maxMesas = Math.min(4, candidatas.length);
      let mejorZona: { ids: string[]; count: number; over: number } | null = null;

      for (let k = 1; k <= maxMesas; k++) {
        const soluciones: { ids: string[]; over: number }[] = [];
        const recolectar = (inicio: number, seleccion: Mesa[], capacidad: number): void => {
          if (seleccion.length > k) return;
          if (seleccion.length === k) {
            if (capacidad < comensales) return;
            const ids = seleccion.map((m) => m.id);
            if (!esConectado(ids, zona)) return;
            soluciones.push({ ids, over: capacidad - comensales });
            return;
          }
          for (let i = inicio; i < candidatas.length; i++) {
            recolectar(i + 1, [...seleccion, candidatas[i]], capacidad + candidatas[i].capacidad);
          }
        };

        recolectar(0, [], 0);
        if (soluciones.length > 0) {
          soluciones.sort((a, b) => a.over - b.over);
          mejorZona = { ids: soluciones[0].ids, count: k, over: soluciones[0].over };
          break;
        }
      }

      if (!mejorZona) continue;
      if (!mejorGlobal) {
        mejorGlobal = mejorZona;
      } else if (
        mejorZona.count < mejorGlobal.count ||
        (mejorZona.count === mejorGlobal.count && mejorZona.over < mejorGlobal.over)
      ) {
        mejorGlobal = mejorZona;
      }
    }

    return mejorGlobal?.ids ?? [];
  }

  private extraerMensaje(error: unknown): string {
    const err = error as { error?: { message?: string } };
    return err?.error?.message ?? 'Ha ocurrido un error al comunicar con el backend';
  }

  private construirCeldasZona(zona: ZonaMesa): MesaCeldaVista[] {
    const mesasZona = this.mesas().filter((m) => m.zona === zona).sort((a, b) => this.compararMesaIds(a.id, b.id));
    const layoutZona = MESAS_LAYOUT.filter((m) => m.zona === zona);
    const ordenMesaIds = layoutZona.map((m) => m.id);
    const indiceMesaId = new Map(ordenMesaIds.map((id, index) => [id, index]));
    const mesasPorId = new Map(mesasZona.map((m) => [m.id, m]));
    const mesasLogicasPorClave = new Map<string, Mesa>();

    for (const mesa of mesasZona) {
      const grupoMesaIds = this.normalizarGrupoMesaIds(mesa.grupoMesaIds);
      const clave = this.claveGrupo(grupoMesaIds);
      if (mesasLogicasPorClave.has(clave)) continue;

      const miembros = grupoMesaIds.map((id) => mesasPorId.get(id)).filter((v): v is Mesa => !!v).sort((a, b) => this.compararMesaIds(a.id, b.id));
      const mesaPrincipalId = [...grupoMesaIds].sort((a, b) => {
        const indiceA = indiceMesaId.get(a) ?? Number.MAX_SAFE_INTEGER;
        const indiceB = indiceMesaId.get(b) ?? Number.MAX_SAFE_INTEGER;
        return indiceA - indiceB || this.compararMesaIds(a, b);
      })[0];

      const mesaPrincipal = mesasPorId.get(mesaPrincipalId) ?? mesa;
      const cuentaActiva = miembros.find((item) => item.cuentaActiva)?.cuentaActiva ?? null;

      mesasLogicasPorClave.set(clave, {
        id: mesaPrincipal.id,
        capacidad: miembros.reduce((acc, item) => acc + item.capacidad, 0),
        zona,
        estado: cuentaActiva ? 'ocupada' : 'libre',
        cuentaActivaId: cuentaActiva?.id ?? null,
        cuentaActiva,
        grupoMesaIds,
        mesaPrincipalId,
      });
    }

    const reservasActivas = this.reservasHoy()
      .filter(r => r.estado === 'Confirmado' && (r.mesasIds?.length ?? 0) > 0)
      .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
    const minNow = this.minutosActuales();

    // 1. Identificar mesas realmente libres y ocupadas
    const mesasLibresFisicas = layoutZona.filter(l => {
      const mLogica = mesasLogicasPorClave.get(this.claveGrupo(this.normalizarGrupoMesaIds(mesasPorId.get(l.id)?.grupoMesaIds ?? [l.id])));
      return mLogica?.estado === 'libre';
    });
    const mesasOcupadasFisicas = layoutZona.filter(l => {
      const mLogica = mesasLogicasPorClave.get(this.claveGrupo(this.normalizarGrupoMesaIds(mesasPorId.get(l.id)?.grupoMesaIds ?? [l.id])));
      return mLogica?.estado === 'ocupada';
    });

    const asignacionDinamica = new Map<string, { reserva: Reserva, estado: 'reservada' | 'proxima' | 'alerta' }>();
    const mesasYaAsignadas = new Set<string>();

    // MAPEO DINÁMICO DE RESERVAS A MESAS
    for (const res of reservasActivas) {
      const diff = this.timeToMins(res.hora) - minNow;
      if (diff > this.reservaLookaheadMinutes || diff <= -this.reservaGraceAfterMinutes) continue;

      let mesasAElegir: string[] | null = null;
      let esAlerta = false;

      // 1. FORZAR UNIÓN VISUAL: Si la reserva tiene mesas asignadas, las bloqueamos juntas siempre.
      if (res.mesasIds && res.mesasIds.length > 0) {
        mesasAElegir = res.mesasIds;
        // Revisar si están ocupadas por otra cuenta para lanzar alerta si falta mucho tiempo
        const estanOcupadas = res.mesasIds.some(id => mesasOcupadasFisicas.some(m => m.id === id));
        if (estanOcupadas && diff > this.reservaAlertBusyThresholdMinutes) {
          esAlerta = true;
        }
      } else {
        // Lógica de búsqueda de mesas libres si el cliente pidió "Indiferente"
        const zonaRes = res.zona?.toLowerCase() || 'interior';
        if (zonaRes !== 'cualquiera' && zonaRes !== zona) continue;

        const libresCandidatas = mesasLibresFisicas.filter(m => !mesasYaAsignadas.has(m.id));

        // CORRECCIÓN: Cruzamos con mesasPorId para leer el aforo físico y usamos res.capacidad
        const singleMesa = libresCandidatas
          .filter(m => (mesasPorId.get(m.id)?.capacidad ?? 0) >= (res.comensales ?? 0))
          .sort((a, b) => (mesasPorId.get(a.id)?.capacidad ?? 0) - (mesasPorId.get(b.id)?.capacidad ?? 0))[0];

        if (singleMesa) {
          mesasAElegir = [singleMesa.id];
        } else {
          // ALGORITMO ALERTA: Buscar las ocupadas más antiguas
          const ocupadasCandidatas = mesasOcupadasFisicas.filter(m => !mesasYaAsignadas.has(m.id));
          ocupadasCandidatas.sort((a, b) => {
            const cA = mesasPorId.get(a.id)?.cuentaActivaId || '';
            const cB = mesasPorId.get(b.id)?.cuentaActivaId || '';
            return cA.localeCompare(cB);
          });

          // CORRECCIÓN: Aplicamos el mismo cruce seguro a las mesas ocupadas
          const singleOcupada = ocupadasCandidatas
            .filter(m => (mesasPorId.get(m.id)?.capacidad ?? 0) >= (res.comensales ?? 0))[0];

          if (singleOcupada) {
            mesasAElegir = [singleOcupada.id];
            esAlerta = true;
          }
        }
      }

      if (mesasAElegir && mesasAElegir.length > 0) {
        const estadoRes = esAlerta ? 'alerta' : ((diff <= this.reservaReservedSoonMinutes) ? 'reservada' : 'proxima');
        mesasAElegir.forEach(id => {
          mesasYaAsignadas.add(id);
          asignacionDinamica.set(id, { reserva: res, estado: estadoRes });
        });
      }
    }

    return ordenMesaIds.map((mesaId, index) => {
      const mesaFisica = mesasPorId.get(mesaId);
      const asignacion = asignacionDinamica.get(mesaId);
      const esParteDeReservaAgrupada = asignacion && (asignacion.reserva.mesasIds?.length ?? 0) > 1 && asignacion.estado !== 'proxima';

      const grupoMesaIds = esParteDeReservaAgrupada
        ? this.normalizarGrupoMesaIds(asignacion!.reserva.mesasIds!)
        : this.normalizarGrupoMesaIds(mesaFisica?.grupoMesaIds ?? [mesaId]);

      const clave = this.claveGrupo(grupoMesaIds);

      // CORRECCIÓN: Rescatamos o creamos la mesa unificada y la guardamos para las siguientes
      let mesaLogicaOriginal = mesasLogicasPorClave.get(clave);

      if (!mesaLogicaOriginal) {
        const mesaPrincipalId = grupoMesaIds[0];
        mesaLogicaOriginal = {
          id: mesaPrincipalId,
          capacidad: grupoMesaIds.reduce((acc, id) => acc + (mesasPorId.get(id)?.capacidad ?? 0), 0),
          zona,
          estado: mesaFisica?.estado ?? 'libre',
          cuentaActivaId: mesaFisica?.cuentaActivaId ?? null,
          cuentaActiva: mesaFisica?.cuentaActiva ?? null,
          grupoMesaIds,
          mesaPrincipalId
        } as Mesa;
        mesasLogicasPorClave.set(clave, mesaLogicaOriginal);
      }

      const mesaLogica = { ...mesaLogicaOriginal };

      let estadoReserva: 'ninguno' | 'reservada' | 'proxima' | 'alerta' = 'ninguno';
      let reservaNombre = '';

      if (asignacion) {
        estadoReserva = asignacion.estado;
        reservaNombre = asignacion.reserva.nombre;

        // Si está libre, automáticamente actualiza el color del cuadro al de la reserva
        if (mesaLogica.estado === 'libre' && (estadoReserva === 'reservada' || estadoReserva === 'proxima')) {
          mesaLogica.estado = (estadoReserva === 'reservada') ? 'reservada' : 'proximamente-reservada';
        }
      }

      const mesaPrincipalId = grupoMesaIds[0];
      const fila = Math.floor(index / 3) + 1;
      const columna = (index % 3) + 1;

      return {
        mesaFisicaId: mesaId,
        mesa: mesaLogica,
        esPrincipal: mesaPrincipalId === mesaId,
        esFantasma: grupoMesaIds.length > 1 && mesaPrincipalId !== mesaId,
        fila,
        columna,
        vecinos: {
          arriba: fila > 1 ? ordenMesaIds[index - 3] : undefined,
          derecha: columna < 3 ? ordenMesaIds[index + 1] : undefined,
          abajo: index + 3 < ordenMesaIds.length ? ordenMesaIds[index + 3] : undefined,
          izquierda: columna > 1 ? ordenMesaIds[index - 1] : undefined,
        },
        estadoReserva,
        reservaNombre
      };
    });
  }

  private buscarMesaLogicaPorId(mesas: Mesa[], mesaId: string): Mesa | null {
    if (!mesaId) return null;
    const mesaFisica = mesas.find((m) => m.id === mesaId);
    if (!mesaFisica) return null;

    const grupoMesaIds = this.normalizarGrupoMesaIds(mesaFisica.grupoMesaIds);
    const miembros = grupoMesaIds.map((id) => mesas.find((m) => m.id === id)).filter((v): v is Mesa => !!v).sort((a, b) => this.compararMesaIds(a.id, b.id));
    const cuentaActiva = miembros.find((item) => item.cuentaActiva)?.cuentaActiva ?? null;
    const mesaPrincipalId = miembros[0]?.id ?? mesaFisica.id;

    const mesaLogica: Mesa = {
      id: mesaPrincipalId, capacidad: miembros.reduce((acc, item) => acc + item.capacidad, 0), zona: mesaFisica.zona, estado: cuentaActiva ? 'ocupada' : 'libre', cuentaActivaId: cuentaActiva?.id ?? null, cuentaActiva, grupoMesaIds, mesaPrincipalId,
    };

    if (mesaLogica.estado === 'libre') {
      const minNow = this.minutosActuales();
      const reserva = this.reservasHoy().find((r) =>
        r.estado === 'Confirmado' &&
        (r.mesasIds ?? []).some((id) => grupoMesaIds.includes(id)) &&
        this.timeToMins(r.hora) - minNow <= this.reservaLookaheadMinutes &&
        this.timeToMins(r.hora) - minNow >= -this.reservaGraceAfterMinutes
      );
      if (reserva) {
        const diff = this.timeToMins(reserva.hora) - minNow;
        mesaLogica.estado = diff <= this.reservaReservedSoonMinutes ? 'reservada' : 'proximamente-reservada';
      }
    }

    return mesaLogica;
  }

  private normalizarGrupoMesaIds(grupoMesaIds: string[]): string[] { return Array.from(new Set(grupoMesaIds)).sort((a, b) => this.compararMesaIds(a, b)); }
  private claveGrupo(grupoMesaIds: string[]): string { return this.normalizarGrupoMesaIds(grupoMesaIds).join('|'); }
  private compararMesaIds(left: string, right: string): number { return Number(left) - Number(right); }

  private mostrarToast(mensaje: string, tipo: 'ok' | 'error'): void {
    this.toastMessage.set(mensaje);
    this.toastTipo.set(tipo);
    this.showToast.set(true);

    if (this.toastTimeoutRef) {
      clearTimeout(this.toastTimeoutRef);
    }

    this.toastTimeoutRef = window.setTimeout(() => {
      this.showToast.set(false);
    }, 2600);
  }
}
