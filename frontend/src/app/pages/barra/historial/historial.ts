import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { forkJoin } from 'rxjs';
import { LineaTicket, PagoCuenta, agruparLineas, generarTicketPdf, nombreArchivoTicket, pagosDeCuenta, ticketDePago } from '../../../services/ticket-pdf';

import { Navbar } from '../../../shared/navbar/navbar';
import {
  CuentaApiService,
  CuentaDetalleResponse,
  CuentaPagadaResumenResponse,
  OrdenCuentaResponse,
} from '../../../services/cuenta-api.service';

interface ItemDetalleAgrupado {
  platoId: string;
  nombre: string;
  categoria: string;
  cantidad: number;
  precioUnitario: number;
  subtotal: number;
  estados: string[];
}

interface PagoDetalleAgrupado {
  clave: string;
  numero: number;
  fechaPago: string;
  metodoPago: string;
  total: number;
  items: ItemDetalleAgrupado[];
}

@Component({
  selector: 'app-historial',
  standalone: true,
  imports: [CommonModule, Navbar],
  templateUrl: './historial.html',
  styleUrl: './historial.css',
})
export class HistorialComponent {
  private readonly cuentaApi = inject(CuentaApiService);
  private toastTimeoutRef?: number;

  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  readonly fechaFiltro = signal(this.hoyISO());
  readonly mesaFiltro = signal('');
  readonly cuentas = signal<CuentaPagadaResumenResponse[]>([]);

  readonly filtroMetodo = signal<'todos' | 'TARJETA' | 'EFECTIVO' | 'divididos'>('todos');
  readonly paginaActual = signal(1);
  readonly pageSize = 15;

  readonly mostrarDetalle = signal(false);
  readonly cargandoDetalle = signal(false);
  readonly cuentaDetalle = signal<CuentaDetalleResponse | null>(null);
  readonly ordenesDetalle = signal<OrdenCuentaResponse[]>([]);
  readonly totalDetalle = signal<number>(0);

  readonly showToast = signal(false);
  readonly toastMessage = signal('');
  readonly toastTipo = signal<'ok' | 'error'>('ok');

  readonly cuentasFiltradas = computed(() => {
    const filtroMesa = this.mesaFiltro().trim().toLowerCase();
    const metodo = this.filtroMetodo();

    return this.cuentas().filter((cuenta) => {
      const mesaOk =
        !filtroMesa ||
        this.obtenerMesaResumen(cuenta)
          .split(',')
          .map((mesa) => mesa.trim().toLowerCase())
          .some((mesa) => mesa === filtroMesa);
      const metodos = cuenta.metodos?.length ? cuenta.metodos : cuenta.metodoPago ? [cuenta.metodoPago] : [];
      const metodoOk =
        metodo === 'todos' ||
        (metodo === 'divididos' ? (cuenta.pagos ?? 1) > 1 : metodos.includes(metodo));
      return mesaOk && metodoOk;
    });
  });

  /** Resumen del día (de las cuentas que se están viendo). */
  readonly resumenDia = computed(() => {
    const cuentas = this.cuentasFiltradas();
    const total = cuentas.reduce((a, c) => a + Number(c.importeTotal ?? 0), 0);
    const comensales = cuentas.reduce((a, c) => a + (c.comensales ?? 0), 0);
    const ninos = cuentas.reduce((a, c) => a + (c.ninos ?? 0), 0);
    const extras = cuentas.reduce((a, c) => a + Number(c.extras ?? 0), 0);
    const conTarjeta = cuentas.filter((c) => (c.metodos ?? [c.metodoPago]).includes('TARJETA')).length;
    const divididas = cuentas.filter((c) => (c.pagos ?? 1) > 1).length;
    return {
      total,
      cuentas: cuentas.length,
      ticketMedio: cuentas.length ? total / cuentas.length : 0,
      comensales,
      ninos,
      extras,
      pctExtras: total > 0 ? Math.round((extras / total) * 100) : 0,
      pctTarjeta: cuentas.length ? Math.round((conTarjeta / cuentas.length) * 100) : 0,
      divididas,
    };
  });

  readonly cuentasPaginadas = computed(() => {
    const inicio = (this.paginaActual() - 1) * this.pageSize;
    return this.cuentasFiltradas().slice(inicio, inicio + this.pageSize);
  });

  readonly totalPaginas = computed(() =>
    Math.max(1, Math.ceil(this.cuentasFiltradas().length / this.pageSize)),
  );

  readonly textoResumen = computed(() => {
    const total = this.cuentasFiltradas().length;
    if (total === 0) return '';
    const desde = (this.paginaActual() - 1) * this.pageSize + 1;
    const hasta = desde + this.cuentasPaginadas().length - 1;
    return `${desde}–${hasta} de ${total} cuentas`;
  });

  readonly esHoy = computed(() => this.fechaFiltro() === this.hoyISO());

  readonly tituloDia = computed(() => {
    const f = this.fechaFiltro();
    if (!f) return 'Todas las fechas';
    if (this.esHoy()) return 'Hoy';
    return new Date(`${f}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  });

  readonly detalleAgrupado = computed(() =>
    this.agruparOrdenes(
      this.ordenesDetalle().filter((orden) => orden.ordenEstado !== 'Cancelado'),
    ),
  );

  readonly pagosDetalle = computed(() =>
    this.agruparOrdenesPorPago(
      this.ordenesDetalle().filter((orden) => orden.ordenEstado !== 'Cancelado'),
    ),
  );

  readonly canceladosDetalle = computed(() =>
    this.agruparOrdenes(
      this.ordenesDetalle().filter((orden) => orden.ordenEstado === 'Cancelado'),
    ),
  );

  constructor() {
    this.cargarHistorial();
  }

  cargarHistorial(): void {
    this.cargando.set(true);
    this.error.set(null);
    this.paginaActual.set(1);

    this.cuentaApi.obtenerCuentasPagadas(this.fechaFiltro()).subscribe({
      next: (cuentas) => {
        this.cuentas.set(cuentas);
        this.cargando.set(false);
      },
      error: (err) => {
        console.error('Error cargando historial:', err);
        this.cargando.set(false);
        this.error.set(this.extraerMensaje(err));
      },
    });
  }

  actualizarFecha(valor: string): void {
    this.fechaFiltro.set(valor);
    this.cargarHistorial();
  }

  /** Día anterior o siguiente. */
  moverDia(delta: number): void {
    const base = this.fechaFiltro() ? new Date(`${this.fechaFiltro()}T00:00:00`) : new Date();
    base.setDate(base.getDate() + delta);
    this.actualizarFecha(this.iso(base));
  }

  irAHoy(): void {
    this.actualizarFecha(this.hoyISO());
  }

  actualizarMesa(valor: string): void {
    this.mesaFiltro.set(valor);
    this.paginaActual.set(1);
  }

  elegirMetodo(metodo: 'todos' | 'TARJETA' | 'EFECTIVO' | 'divididos'): void {
    this.filtroMetodo.set(metodo);
    this.paginaActual.set(1);
  }

  duracion(c: CuentaPagadaResumenResponse): string {
    if (!c.fechaApertura) return '';
    const min = Math.max(0, Math.round((new Date(c.fechaHora).getTime() - new Date(c.fechaApertura).getTime()) / 60000));
    return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  }

  metodosDe(c: CuentaPagadaResumenResponse): string[] {
    return c.metodos?.length ? c.metodos : c.metodoPago ? [c.metodoPago] : [];
  }

  limpiarFiltro(): void {
    this.fechaFiltro.set('');
    this.mesaFiltro.set('');
    this.cargarHistorial();
  }

  aplicarFiltro(): void {
    this.paginaActual.set(1);
    this.cargarHistorial();
  }

  irAPagina(pagina: number): void {
    if (pagina < 1 || pagina > this.totalPaginas()) {
      return;
    }

    this.paginaActual.set(pagina);
  }

  abrirDetalle(cuentaId: string): void {
    this.mostrarDetalle.set(true);
    this.cargandoDetalle.set(true);
    this.error.set(null);

    forkJoin({
      cuenta: this.cuentaApi.obtenerCuentaPorId(cuentaId),
      ordenes: this.cuentaApi.obtenerTodasLasOrdenesDeCuenta(cuentaId),
    }).subscribe({
      next: ({ cuenta, ordenes }) => {
        this.cuentaDetalle.set(cuenta);
        this.ordenesDetalle.set(ordenes);
        const total = ordenes
          .filter((orden) => orden.ordenEstado !== 'Cancelado')
          .reduce((acc, orden) => acc + Number(orden.precio ?? 0), 0);
        this.totalDetalle.set(Number(total));
        this.cargandoDetalle.set(false);
      },
      error: (err) => {
        console.error('Error cargando detalle:', err);
        this.cargandoDetalle.set(false);
        this.mostrarDetalle.set(false);
        this.error.set(this.extraerMensaje(err));
      },
    });
  }
  private readonly ordenesValidas = computed(() =>
    this.ordenesDetalle().filter((o) => o.ordenEstado !== 'Cancelado'),
  );

  /** Lo que se cobra, por bloques: tarifas del buffet, bebidas y postres. */
  readonly bloquesConsumo = computed<{ titulo: string; lineas: LineaTicket[]; total: number }[]>(() => {
    const bloques: { titulo: string; categoria: string }[] = [
      { titulo: 'Buffet', categoria: 'Buffet' },
      { titulo: 'Bebidas', categoria: 'Bebida' },
      { titulo: 'Postres', categoria: 'Postre' },
    ];
    return bloques
      .map((b) => {
        const lineas = agruparLineas(
          this.ordenesValidas()
            .filter((o) => o.plato?.categoria === b.categoria && Number(o.precio) > 0)
            .map((o) => ({ nombre: o.plato.nombre, precio: Number(o.precio) })),
        ).sort((x, y) => y.importe - x.importe);
        return { titulo: b.titulo, lineas, total: lineas.reduce((a, l) => a + l.importe, 0) };
      })
      .filter((b) => b.lineas.length > 0);
  });

  /** Platos del buffet incluidos en la tarifa (0 €), de más a menos pedidos. */
  readonly platosIncluidos = computed(() =>
    agruparLineas(
      this.ordenesValidas()
        .filter((o) => Number(o.precio) <= 0)
        .map((o) => ({ nombre: o.plato?.nombre ?? 'Plato', precio: 0 })),
    ).sort((a, b) => b.cantidad - a.cantidad),
  );
  readonly totalIncluidos = computed(() => this.platosIncluidos().reduce((a, l) => a + l.cantidad, 0));

  readonly ninosDetalle = computed(
    () => this.ordenesValidas().filter((o) => o.plato?.categoria === 'Buffet' && o.plato.id.endsWith('infantil')).length,
  );

  /** «1 h 15 min» entre la apertura de la mesa y el último cobro. */
  readonly duracionDetalle = computed(() => {
    const cuenta = this.cuentaDetalle();
    const fin = this.cobros().at(-1)?.fechaPago ?? cuenta?.fechaPago;
    if (!cuenta?.fechaCreacion || !fin) return null;
    const min = Math.max(0, Math.round((new Date(fin).getTime() - new Date(cuenta.fechaCreacion).getTime()) / 60000));
    return min >= 60 ? `${Math.floor(min / 60)} h ${min % 60} min` : `${min} min`;
  });

  hora(iso?: string | null): string {
    return iso ? new Date(iso).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }) : '';
  }

  fechaLarga(iso?: string | null): string {
    return iso ? new Date(iso).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' }) : '';
  }

  metodoTexto(m: string): string {
    return m === 'TARJETA' ? 'Tarjeta' : m === 'EFECTIVO' ? 'Efectivo' : m;
  }

  /** Cobros de la cuenta (uno por pago parcial o total), cada uno con su ticket. */
  readonly cobros = computed<PagoCuenta[]>(() =>
    pagosDeCuenta(
      this.ordenesDetalle().map((o) => ({
        nombre: o.plato?.nombre ?? 'Consumo',
        precio: Number(o.precio ?? 0),
        pagada: o.pagada,
        cancelada: o.ordenEstado === 'Cancelado',
        fechaPago: o.fechaPago,
        metodoPago: o.metodoPago,
      })),
    ),
  );

  /** Descarga el ticket (factura simplificada) de un cobro concreto. */
  descargarTique(pago: PagoCuenta): void {
    const cuenta = this.cuentaDetalle();
    if (!cuenta) return;
    const datos = ticketDePago(
      {
        cuentaId: cuenta.id,
        mesa: this.obtenerMesaDetalle(),
        comensales: (cuenta as { comensales?: number }).comensales ?? null,
        fechaApertura: (cuenta as { fechaCreacion?: string }).fechaCreacion ?? null,
      },
      pago,
      this.cobros().length,
    );
    generarTicketPdf(datos).save(nombreArchivoTicket(datos));
  }
  cerrarDetalle(): void {
    this.mostrarDetalle.set(false);
    this.cargandoDetalle.set(false);
    this.cuentaDetalle.set(null);
    this.ordenesDetalle.set([]);
    this.totalDetalle.set(0);
    if (this.toastTimeoutRef) {
      window.clearTimeout(this.toastTimeoutRef);
    }
    this.showToast.set(false);
  }

  formatearFecha(fechaIso: string): string {
    const fecha = new Date(fechaIso);

    return new Intl.DateTimeFormat('es-ES', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(fecha);
  }

  obtenerMesaDetalle(): string {
    const mesas = this.cuentaDetalle()?.mesas ?? [];
    if (mesas.length === 0) {
      return '-';
    }

    return mesas.map((mesa) => mesa.id).join(', ');
  }

  obtenerMesaResumen(cuenta: CuentaPagadaResumenResponse): string {
    const mesas = cuenta.mesas ?? [];
    if (mesas.length > 0) {
      return mesas.map((mesa) => mesa.id).join(', ');
    }

    return cuenta.mesa || '-';
  }

  obtenerMetodoPagoDetalle(): string {
    return this.cuentaDetalle()?.metodoPago ?? '-';
  }

  obtenerResumenEstado(estados: string[]): string {
    const estadosNormalizados = estados.map((estado) =>
      estado === 'Preparación' || estado === 'Preparacion'
        ? 'En preparación'
        : estado,
    );

    return Array.from(new Set(estadosNormalizados)).join(' · ');
  }

  private agruparOrdenes(ordenes: OrdenCuentaResponse[]): ItemDetalleAgrupado[] {
    const mapa = new Map<string, ItemDetalleAgrupado>();

    for (const orden of ordenes) {
      const plato = orden.plato;
      const platoId = plato?.id ?? `sin-id-${Math.random()}`;
      const nombre = plato?.nombre?.trim() || 'Producto';
      const categoria = plato?.categoria?.trim() || '';
      const precioUnitario = Number(orden.precio ?? 0);

      if (!mapa.has(platoId)) {
        mapa.set(platoId, {
          platoId,
          nombre,
          categoria,
          cantidad: 0,
          precioUnitario,
          subtotal: 0,
          estados: [],
        });
      }

      const item = mapa.get(platoId)!;
      item.cantidad += 1;
      item.subtotal += precioUnitario;

      if (orden.ordenEstado) {
        item.estados.push(orden.ordenEstado);
      }
    }

    return Array.from(mapa.values()).sort((a, b) =>
      a.nombre.localeCompare(b.nombre, 'es', { sensitivity: 'base' }),
    );
  }

  private agruparOrdenesPorPago(
    ordenes: OrdenCuentaResponse[],
  ): PagoDetalleAgrupado[] {
    const mapa = new Map<string, OrdenCuentaResponse[]>();

    for (const orden of ordenes) {
      const fechaPago = orden.fechaPago ?? 'SIN_FECHA';
      const metodoPago = orden.metodoPago ?? 'SIN_METODO';
      const clave = `${fechaPago}-${metodoPago}`;

      if (!mapa.has(clave)) {
        mapa.set(clave, []);
      }

      mapa.get(clave)!.push(orden);
    }

    return Array.from(mapa.entries())
      .map(([clave, ordenesPago], index) => {
        const fechaPago = ordenesPago[0].fechaPago ?? '';
        const metodoPago = ordenesPago[0].metodoPago ?? '-';

        return {
          clave,
          numero: index + 1,
          fechaPago,
          metodoPago,
          total: ordenesPago.reduce(
            (acc, orden) => acc + Number(orden.precio ?? 0),
            0,
          ),
          items: this.agruparOrdenes(ordenesPago),
        };
      })
      .sort((a, b) => {
        if (!a.fechaPago) return 1;
        if (!b.fechaPago) return -1;

        return a.fechaPago.localeCompare(b.fechaPago);
      })
      .map((pago, index) => ({
        ...pago,
        numero: index + 1,
      }));
  }

  private hoyISO(): string {
    return this.iso(new Date());
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  private extraerMensaje(error: unknown): string {
    const err = error as { error?: { message?: string } };

    return err?.error?.message ?? 'Ha ocurrido un error al comunicar con el backend';
  }

  private mostrarToast(mensaje: string, tipo: 'ok' | 'error'): void {
    this.toastMessage.set(mensaje);
    this.toastTipo.set(tipo);
    this.showToast.set(true);

    if (this.toastTimeoutRef) {
      window.clearTimeout(this.toastTimeoutRef);
    }

    this.toastTimeoutRef = window.setTimeout(() => {
      this.showToast.set(false);
    }, 2600);
  }
}

