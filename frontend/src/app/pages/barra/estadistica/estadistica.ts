import { CommonModule } from '@angular/common';
import { Component, computed, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Navbar } from '../../../shared/navbar/navbar';

interface TransaccionCSV {
  cuentaId: string;
  mesa: string;
  tipoPagoCuenta: 'PARCIAL' | 'COMPLETO';
  fechaPago: Date;
  metodoPago: 'EFECTIVO' | 'TARJETA';
  total: number;
  numeroOrdenes: number;
  ordenIds: string;
  ordenes: string;
}

interface NotificacionOrdenCSV {
  ordenId: string;
  pedidoId: string;
  cuentaId: string;
  mesa: string;
  plato: string;
  precio: number;
  estadoOrden: string;
  fechaCreacionOrden: Date | null;
  notificacionId: string;
  tipoNotificacion: string;
  fechaCreacionNotificacion: Date | null;
  nombreItemNotificacion: string;
  categoriaItemNotificacion: string;
  enCurso: boolean;
  fechaEnCursoNotificacion: Date | null;
  leida: boolean;
  camareroUid: string;
  camareroNombre: string;
}

interface CuentaSalidaCSV {
  cuentaId: string;
  mesa: string;
  fechaCreacionCuenta: Date;
  cuentaPagada: boolean;
  fechaPagoCuenta: Date | null;
  totalCuenta: number;
  numeroPedidos: number;
  numeroOrdenes: number;
  numeroOrdenesPagadas: number;
  fechaUltimoPagoOrden: Date | null;
  ultimoPagoOrdenIds: string;
  totalUltimoPagoOrden: number;
}

interface CuentaActivaDetalle extends CuentaSalidaCSV {
  fechaSalidaReal: Date | null;
  duracionMinutos: number;
  duracionHoras: number;
  horaEntradaDecimal: number;
  horaSalidaDecimal: number;
}

interface HoraCuentaActiva {
  hora: number;
  etiqueta: string;
  totalActivas: number;
  x: number;
  y: number;
}

interface BarraCuentaActiva {
  cuentaId: string;
  mesa: string;
  x: number;
  y: number;
  width: number;
  height: number;
  totalCuenta: number;
  duracionHoras: number;
  fechaCreacionCuenta: Date;
  fechaSalidaReal: Date | null;
}

interface MarcaDuracion {
  valorHoras: number;
  etiqueta: string;
  y: number;
}

interface PlatoRanking {
  nombre: string;
  categoria: string;
  unidadesVendidas: number;
  ganancias: number;
}

interface CamareroTrabajo {
  nombre: string;
  inicial: string;
  notificacionesCogidas: number;
  porcentaje: number;
}

interface TramoCuelloBotella {
  ordenId: string;
  plato: string;
  color: string;
  ratioError: number;
  realMinutos: number;
  estimadoMinutos: number;
}

interface BarraCuelloBotella {
  hora: number;
  total: number;
  segmentos: TramoCuelloBotella[];
}

interface LeyendaCuelloBotella {
  plato: string;
  color: string;
}

@Component({
  selector: 'app-estadistica',
  standalone: true,
  imports: [CommonModule, FormsModule, Navbar],
  templateUrl: './estadistica.html',
  styleUrl: './estadistica.css',
})
export class EstadisticaComponent implements OnInit {
  readonly transacciones = signal<TransaccionCSV[]>([]);
  readonly notificacionesOrdenes = signal<NotificacionOrdenCSV[]>([]);
  readonly cuentasSalida = signal<CuentaSalidaCSV[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  readonly filtroActual = signal<'dia' | 'semana' | 'mes'>('semana');
  readonly limiteRanking = signal<number>(3);
  readonly fechaTrabajoSeleccionada = signal(this.formatearFechaInput(new Date()));
  readonly fechaCuelloBotellaSeleccionada = signal(this.formatearFechaInput(new Date()));
  readonly fechaCuentasSeleccionada = signal(this.formatearFechaInput(new Date()));
  readonly cuentaActivaSeleccionadaId = signal<string | null>(null);

  readonly graficoCuentasAncho = 760;
  readonly graficoCuentasAlto = 380;
  readonly graficoCuentasPadding = {
    top: 20,
    right: 58,
    bottom: 58,
    left: 58,
  };

  readonly coloresCuelloBotella = [
    '#d73027',
    '#f28a30',
    '#bfd522',
    '#5a8fa5',
    '#9b5a92',
    '#16a34a',
    '#ef4444',
    '#0ea5e9',
    '#b45309',
    '#7c3aed',
    '#14b8a6',
    '#db2777',
  ];

  readonly transaccionesFiltradas = computed(() => {
    const data = this.transacciones();
    const filtro = this.filtroActual();
    const ahora = new Date();

    return data.filter((t) => {
      if (filtro === 'dia') {
        return this.esMismoDia(t.fechaPago, ahora);
      }

      if (filtro === 'semana') {
        const sieteDiasAgo = new Date();
        sieteDiasAgo.setDate(ahora.getDate() - 7);
        sieteDiasAgo.setHours(0, 0, 0, 0);
        return t.fechaPago >= sieteDiasAgo;
      }

      if (filtro === 'mes') {
        const unMesAgo = new Date();
        unMesAgo.setMonth(ahora.getMonth() - 1);
        unMesAgo.setHours(0, 0, 0, 0);
        return t.fechaPago >= unMesAgo;
      }

      return true;
    });
  });

  readonly totalGanancias = computed(() =>
    this.transaccionesFiltradas().reduce((acc, t) => acc + t.total, 0),
  );

  readonly totalEfectivo = computed(() =>
    this.transaccionesFiltradas()
      .filter((t) => t.metodoPago === 'EFECTIVO')
      .reduce((acc, t) => acc + t.total, 0),
  );

  readonly totalTarjeta = computed(() =>
    this.transaccionesFiltradas()
      .filter((t) => t.metodoPago === 'TARJETA')
      .reduce((acc, t) => acc + t.total, 0),
  );

  readonly totalPagosParciales = computed(() =>
    this.transaccionesFiltradas()
      .filter((t) => t.tipoPagoCuenta === 'PARCIAL')
      .reduce((acc, t) => acc + t.total, 0),
  );

  readonly totalPagosCompletos = computed(() =>
    this.transaccionesFiltradas()
      .filter((t) => t.tipoPagoCuenta === 'COMPLETO')
      .reduce((acc, t) => acc + t.total, 0),
  );

  readonly porcentajeEfectivo = computed(() => {
    const total = this.totalGanancias();
    return total > 0 ? (this.totalEfectivo() / total) * 100 : 0;
  });

  readonly porcentajeTarjeta = computed(() => {
    const total = this.totalGanancias();
    return total > 0 ? (this.totalTarjeta() / total) * 100 : 0;
  });

  readonly platosMasVendidos = computed(() => {
    const mapa = new Map<string, PlatoRanking>();

    for (const transaccion of this.transaccionesFiltradas()) {
      const ordenes = transaccion.ordenes
        .split('|')
        .map((o) => o.trim())
        .filter((o) => o.length > 0);

      for (const orden of ordenes) {
        const match = orden.match(/^(.*?)\s\(([\d.]+)\s+euros\)$/);

        if (!match) continue;

        const nombre = match[1].trim();
        const precio = Number(match[2]);

        if (!mapa.has(nombre)) {
          mapa.set(nombre, {
            nombre,
            categoria: 'Sin categoria',
            unidadesVendidas: 0,
            ganancias: 0,
          });
        }

        const plato = mapa.get(nombre)!;
        plato.unidadesVendidas++;
        plato.ganancias += precio;
      }
    }

    return [...mapa.values()]
      .sort((a, b) => {
        if (b.unidadesVendidas !== a.unidadesVendidas) {
          return b.unidadesVendidas - a.unidadesVendidas;
        }

        return b.ganancias - a.ganancias;
      })
      .slice(0, this.limiteRanking());
  });

  readonly notificacionesDiaSeleccionado = computed(() => {
    const fechaSeleccionada = this.fechaTrabajoSeleccionada();

    return this.notificacionesOrdenes().filter((notificacion) => {
      if (!notificacion.notificacionId || !notificacion.fechaCreacionNotificacion) {
        return false;
      }

      return this.formatearFechaInput(notificacion.fechaCreacionNotificacion) === fechaSeleccionada;
    });
  });

  readonly totalNotificacionesDiaSeleccionado = computed(() => {
    const ids = new Set(
      this.notificacionesDiaSeleccionado().map((notificacion) => notificacion.notificacionId),
    );

    return ids.size;
  });

  readonly trabajoCamareros = computed<CamareroTrabajo[]>(() => {
    const total = this.totalNotificacionesDiaSeleccionado();

    if (total === 0) {
      return [];
    }

    const mapa = new Map<string, Set<string>>();

    for (const notificacion of this.notificacionesDiaSeleccionado()) {
      const nombre = notificacion.camareroNombre.trim();

      if (!nombre) {
        continue;
      }

      if (!mapa.has(nombre)) {
        mapa.set(nombre, new Set<string>());
      }

      mapa.get(nombre)!.add(notificacion.notificacionId);
    }

    return [...mapa.entries()]
      .map(([nombre, ids]) => ({
        nombre,
        inicial: nombre.charAt(0).toUpperCase(),
        notificacionesCogidas: ids.size,
        porcentaje: (ids.size / total) * 100,
      }))
      .sort((a, b) => {
        if (b.porcentaje !== a.porcentaje) {
          return b.porcentaje - a.porcentaje;
        }

        return a.nombre.localeCompare(b.nombre, 'es');
      });
  });

  readonly ordenesCuelloBotellaDiaSeleccionado = computed(() => {
    const fechaSeleccionada = this.fechaCuelloBotellaSeleccionada();

    return this.notificacionesOrdenes()
      .filter((notificacion) => {
        if (!notificacion.ordenId) return false;
        if (!notificacion.fechaCreacionOrden || !notificacion.fechaEnCursoNotificacion) return false;
        if (!notificacion.categoriaItemNotificacion.trim()) return false;

        return this.formatearFechaInput(notificacion.fechaCreacionOrden) === fechaSeleccionada;
      })
      .map((notificacion) => {
        const realMinutos = this.diferenciaMinutos(
          notificacion.fechaCreacionOrden!,
          notificacion.fechaEnCursoNotificacion!,
        );

        const estimadoMinutos = this.tiempoObjetivoMinutos(
          notificacion.categoriaItemNotificacion,
        );

        const ratioError = Math.max(0, (realMinutos - estimadoMinutos) / estimadoMinutos);

        return {
          ...notificacion,
          realMinutos,
          estimadoMinutos,
          ratioError,
        };
      })
      .filter((notificacion) => notificacion.ratioError > 0);
  });

  readonly leyendaCuelloBotella = computed<LeyendaCuelloBotella[]>(() => {
    const platos = [
      ...new Set(
        this.ordenesCuelloBotellaDiaSeleccionado().map((notificacion) => notificacion.plato),
      ),
    ];

    return platos.map((plato, index) => ({
      plato,
      color: this.coloresCuelloBotella[index % this.coloresCuelloBotella.length],
    }));
  });

  readonly barrasCuelloBotella = computed<BarraCuelloBotella[]>(() => {
    const colorPorPlato = new Map(
      this.leyendaCuelloBotella().map((item) => [item.plato, item.color]),
    );

    const barras = new Map<number, TramoCuelloBotella[]>();

    for (let hora = 8; hora <= 23; hora++) {
      barras.set(hora, []);
    }

    for (const notificacion of this.ordenesCuelloBotellaDiaSeleccionado()) {
      const hora = notificacion.fechaCreacionOrden!.getUTCHours();

      if (!barras.has(hora)) {
        barras.set(hora, []);
      }

      barras.get(hora)!.push({
        ordenId: notificacion.ordenId,
        plato: notificacion.plato,
        color: colorPorPlato.get(notificacion.plato) ?? '#7f5a3c',
        ratioError: notificacion.ratioError,
        realMinutos: notificacion.realMinutos,
        estimadoMinutos: notificacion.estimadoMinutos,
      });
    }

    return [...barras.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([hora, segmentos]) => ({
        hora,
        total: segmentos.reduce((acc, segmento) => acc + segmento.ratioError, 0),
        segmentos,
      }));
  });

  readonly maximoCuelloBotella = computed(() => {
    const maximo = Math.max(...this.barrasCuelloBotella().map((barra) => barra.total), 0);
    return Math.max(maximo, 1);
  });

  readonly marcasEjeCuelloBotella = computed(() => {
    const maximo = this.maximoCuelloBotella();
    const limite = Math.ceil(maximo);

    return Array.from({ length: limite + 1 }, (_, index) => limite - index);
  });

  readonly circunferencia = 251.33;

  readonly strokeDashArrayTarjeta = computed(() => {
    const porc = this.porcentajeTarjeta();
    return `${(porc / 100) * this.circunferencia} ${this.circunferencia}`;
  });

  readonly strokeDashArrayEfectivo = computed(() => {
    const porc = this.porcentajeEfectivo();
    return `${(porc / 100) * this.circunferencia} ${this.circunferencia}`;
  });

  readonly strokeDashOffsetEfectivo = computed(() => {
    const porcTarjeta = this.porcentajeTarjeta();
    return -((porcTarjeta / 100) * this.circunferencia);
  });

  readonly cuentasDiaSeleccionado = computed<CuentaActivaDetalle[]>(() => {
    const fechaSeleccionada = this.fechaCuentasSeleccionada();

    return this.cuentasSalida()
      .filter(
        (cuenta) =>
          this.formatearFechaInput(cuenta.fechaCreacionCuenta) === fechaSeleccionada,
      )
      .map((cuenta) => {
        const fechaSalidaReal = cuenta.fechaUltimoPagoOrden ?? cuenta.fechaPagoCuenta;
        const fin = fechaSalidaReal ?? cuenta.fechaCreacionCuenta;
        const duracionMinutos = this.diferenciaMinutos(cuenta.fechaCreacionCuenta, fin);
        return {
          ...cuenta,
          fechaSalidaReal,
          duracionMinutos,
          duracionHoras: duracionMinutos / 60,
          horaEntradaDecimal: this.obtenerHoraDecimalUTC(cuenta.fechaCreacionCuenta),
          horaSalidaDecimal: this.obtenerHoraDecimalUTC(fin),
        };
      })
      .sort(
        (a, b) =>
          a.fechaCreacionCuenta.getTime() - b.fechaCreacionCuenta.getTime(),
      );
  });

  readonly cuentaActivaSeleccionada = computed<CuentaActivaDetalle | null>(() => {
    const cuentaId = this.cuentaActivaSeleccionadaId();
    const cuentas = this.cuentasDiaSeleccionado();

    if (!cuentaId) {
      return null;
    }

    return cuentas.find((cuenta) => cuenta.cuentaId === cuentaId) ?? null;
  });

  readonly tiempoMedioServicioDiaSeleccionado = computed(() => {
    const cuentas = this.cuentasDiaSeleccionado();

    if (cuentas.length === 0) {
      return 0;
    }

    const totalMinutos = cuentas.reduce(
      (acumulado, cuenta) => acumulado + cuenta.duracionMinutos,
      0,
    );

    return totalMinutos / cuentas.length;
  });

  readonly rangoHorasCuentas = computed(() => {
    const cuentas = this.cuentasDiaSeleccionado();

    if (cuentas.length === 0) {
      return { inicio: 8, fin: 23 };
    }

    const horaMinima = Math.min(
      8,
      ...cuentas.map((cuenta) => Math.floor(cuenta.horaEntradaDecimal)),
    );
    const horaMaxima = Math.max(
      23,
      ...cuentas.map((cuenta) => Math.ceil(cuenta.horaSalidaDecimal)),
    );

    return {
      inicio: Math.max(0, horaMinima),
      fin: Math.min(24, Math.max(horaMinima + 1, horaMaxima)),
    };
  });

  readonly horasCuentas = computed(() => {
    const { inicio, fin } = this.rangoHorasCuentas();
    return Array.from({ length: fin - inicio + 1 }, (_, index) => inicio + index);
  });

  readonly maximoCuentasActivas = computed(() => {
    const maximo = Math.max(
      ...this.horasLineaCuentasActivas().map((punto) => punto.totalActivas),
      0,
    );
    return Math.max(maximo, 1);
  });

  readonly marcasCuentasActivas = computed(() => {
    const maximo = this.maximoCuentasActivas();
    return Array.from({ length: maximo }, (_, index) => {
      const valor = maximo - index;
      return {
        valor,
        y: this.calcularYCuentasActivas(valor, maximo),
      };
    });
  });

  readonly maximoDuracionHoras = computed(() => {
    const maximo = Math.max(
      ...this.cuentasDiaSeleccionado().map((cuenta) => cuenta.duracionHoras),
      0,
    );
    return Math.max(0.5, Math.ceil(maximo * 2) / 2);
  });

  readonly horasLineaCuentasActivas = computed<HoraCuentaActiva[]>(() => {
    const horas = this.horasCuentas();
    const cuentas = this.cuentasDiaSeleccionado();
    const maximo = this.maximoCuentasActivasBase(cuentas, horas);

    return horas.map((hora) => {
      const totalActivas = cuentas.filter(
        (cuenta) =>
          cuenta.horaEntradaDecimal <= hora && cuenta.horaSalidaDecimal >= hora,
      ).length;

      return {
        hora,
        etiqueta: `${hora}:00`,
        totalActivas,
        x: this.calcularXCuentas(hora),
        y: this.calcularYCuentasActivas(totalActivas, maximo),
      };
    });
  });

  readonly polylineCuentasActivas = computed(() =>
    this.horasLineaCuentasActivas()
      .map((punto) => `${punto.x},${punto.y}`)
      .join(' '),
  );

  readonly barrasDuracionCuentas = computed<BarraCuentaActiva[]>(() => {
    const ancho = this.graficoCuentasAncho;
    const padding = this.graficoCuentasPadding;
    const baseY = this.alturaGraficoCuentas();
    const maximoDuracion = this.maximoDuracionHoras();
    const totalHoras = this.totalHorasRangoCuentas();
    const cuentas = this.cuentasDiaSeleccionado();
    const anchoBarra = Math.min(18, Math.max(8, 220 / Math.max(cuentas.length, 1)));

    return cuentas.map((cuenta) => {
      const offsetHoras = cuenta.horaEntradaDecimal - this.rangoHorasCuentas().inicio;
      const x =
        padding.left + (offsetHoras / totalHoras) * (ancho - padding.left - padding.right);
      const height =
        maximoDuracion === 0
          ? 0
          : (cuenta.duracionHoras / maximoDuracion) * (baseY - padding.top);

      return {
        cuentaId: cuenta.cuentaId,
        mesa: cuenta.mesa,
        x,
        y: baseY - height,
        width: anchoBarra,
        height,
        totalCuenta: cuenta.totalCuenta,
        duracionHoras: cuenta.duracionHoras,
        fechaCreacionCuenta: cuenta.fechaCreacionCuenta,
        fechaSalidaReal: cuenta.fechaSalidaReal,
      };
    });
  });

  readonly marcasDuracionCuentas = computed<MarcaDuracion[]>(() => {
    const maximo = this.maximoDuracionHoras();
    const pasos = Math.max(1, Math.ceil(maximo / 0.5));
    const marcas: MarcaDuracion[] = [];

    for (let paso = 1; paso <= pasos; paso++) {
      const valorHoras = paso * 0.5;
      marcas.push({
        valorHoras,
        etiqueta: this.formatearDuracionHoras(valorHoras),
        y: this.calcularYDuracion(valorHoras, maximo),
      });
    }

    return marcas.reverse();
  });

  ngOnInit(): void {
    this.cargarDatosCSV();
  }

  cambiarFiltro(filtro: 'dia' | 'semana' | 'mes'): void {
    this.filtroActual.set(filtro);
  }

  cambiarFechaTrabajo(fecha: string): void {
    this.fechaTrabajoSeleccionada.set(fecha);
  }

  cambiarFechaCuelloBotella(fecha: string): void {
    this.fechaCuelloBotellaSeleccionada.set(fecha);
  }

  cambiarFechaCuentas(fecha: string): void {
    this.fechaCuentasSeleccionada.set(fecha);
    this.sincronizarCuentaActivaSeleccionada();
  }

  seleccionarCuentaActiva(cuentaId: string): void {
    this.cuentaActivaSeleccionadaId.set(cuentaId);
  }

  cerrarCuentaActivaSeleccionada(): void {
    this.cuentaActivaSeleccionadaId.set(null);
  }

  esCuentaActivaSeleccionada(cuentaId: string): boolean {
    return this.cuentaActivaSeleccionada()?.cuentaId === cuentaId;
  }

  obtenerAlturaSegmento(ratioError: number): number {
    return (ratioError / this.maximoCuelloBotella()) * 100;
  }

  cargarDatosCSV(): void {
    this.cargando.set(true);
    this.error.set(null);

    Promise.all([
      fetch('/ganancias.csv').then((response) => {
        if (!response.ok) {
          throw new Error('No se pudo cargar ganancias.csv');
        }

        return response.text();
      }),
      fetch('/ordenes_notificaciones.csv').then((response) => {
        if (!response.ok) {
          throw new Error('No se pudo cargar ordenes_notificaciones.csv');
        }

        return response.text();
      }),
      fetch('/cuentas_salida.csv').then((response) => {
        if (!response.ok) {
          throw new Error('No se pudo cargar cuentas_salida.csv');
        }

        return response.text();
      }),
    ])
      .then(([gananciasCsv, notificacionesCsv, cuentasSalidaCsv]) => {
        this.transacciones.set(this.parsearGananciasCsv(gananciasCsv));

        const notificaciones = this.parsearNotificacionesCsv(notificacionesCsv);
        this.notificacionesOrdenes.set(notificaciones);
        const cuentasSalida = this.parsearCuentasSalidaCsv(cuentasSalidaCsv);
        this.cuentasSalida.set(cuentasSalida);

        const ultimaFecha = this.obtenerUltimaFechaNotificacion(notificaciones);
        const ultimaFechaCuenta = this.obtenerUltimaFechaCuenta(cuentasSalida);

        if (ultimaFecha) {
          const fechaFormateada = this.formatearFechaInput(ultimaFecha);
          this.fechaTrabajoSeleccionada.set(fechaFormateada);
          this.fechaCuelloBotellaSeleccionada.set(fechaFormateada);
        }

        if (ultimaFechaCuenta) {
          this.fechaCuentasSeleccionada.set(this.formatearFechaInput(ultimaFechaCuenta));
        }

        this.sincronizarCuentaActivaSeleccionada();

        this.cargando.set(false);
      })
      .catch((err) => {
        console.error('Error cargando CSV de estadisticas:', err);

        this.error.set(
          'Aun no hay datos de estadisticas disponibles. Ejecuta el backend para generar los CSV desde Firestore.',
        );

        this.cargando.set(false);
      });
  }

  private parsearGananciasCsv(csvText: string): TransaccionCSV[] {
    const lineas = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parseadas: TransaccionCSV[] = [];

    for (const linea of lineas) {
      const lineaLimpia = linea.replace(/^\uFEFF/, '');

      if (lineaLimpia.toLowerCase().startsWith('sep=')) continue;
      if (lineaLimpia.toLowerCase().startsWith('cuentaid;')) continue;
      if (lineaLimpia.toLowerCase().startsWith('"cuentaid";')) continue;

      const columnas = this.parsearLineaCSV(lineaLimpia);

      if (columnas.length < 9) continue;

      const cuentaId = columnas[0].trim();
      const mesa = columnas[1].trim();

      const tipoPagoCuenta =
        columnas[2].trim().toUpperCase() === 'PARCIAL' ? 'PARCIAL' : 'COMPLETO';

      const fechaStr = columnas[3].trim();
      const metodoStr = columnas[4].trim().toUpperCase();
      const totalStr = columnas[5].trim().replace(',', '.');
      const numeroOrdenesStr = columnas[6].trim();
      const ordenIds = columnas[7].trim();
      const ordenes = columnas[8].trim();

      const fecha = new Date(fechaStr);
      const metodoPago = metodoStr === 'TARJETA' ? 'TARJETA' : 'EFECTIVO';
      const total = Number(totalStr);
      const numeroOrdenes = Number(numeroOrdenesStr);

      if (!isNaN(fecha.getTime()) && !isNaN(total)) {
        parseadas.push({
          cuentaId,
          mesa,
          tipoPagoCuenta,
          fechaPago: fecha,
          metodoPago,
          total,
          numeroOrdenes: isNaN(numeroOrdenes) ? 0 : numeroOrdenes,
          ordenIds,
          ordenes,
        });
      }
    }

    return parseadas;
  }

  private parsearNotificacionesCsv(csvText: string): NotificacionOrdenCSV[] {
    const lineas = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parseadas: NotificacionOrdenCSV[] = [];

    for (const linea of lineas) {
      const lineaLimpia = linea.replace(/^\uFEFF/, '');

      if (lineaLimpia.toLowerCase().startsWith('sep=')) continue;
      if (lineaLimpia.toLowerCase().startsWith('ordenid;')) continue;
      if (lineaLimpia.toLowerCase().startsWith('"ordenid";')) continue;

      const columnas = this.parsearLineaCSV(lineaLimpia);

      if (columnas.length < 18) continue;

      parseadas.push({
        ordenId: columnas[0].trim(),
        pedidoId: columnas[1].trim(),
        cuentaId: columnas[2].trim(),
        mesa: columnas[3].trim(),
        plato: columnas[4].trim(),
        precio: Number(columnas[5].trim().replace(',', '.')) || 0,
        estadoOrden: columnas[6].trim(),
        fechaCreacionOrden: this.parsearFecha(columnas[7]),
        notificacionId: columnas[8].trim(),
        tipoNotificacion: columnas[9].trim(),
        fechaCreacionNotificacion: this.parsearFecha(columnas[10]),
        nombreItemNotificacion: columnas[11].trim(),
        categoriaItemNotificacion: columnas[12].trim(),
        enCurso: columnas[13].trim().toLowerCase() === 'true',
        fechaEnCursoNotificacion: this.parsearFecha(columnas[14]),
        leida: columnas[15].trim().toLowerCase() === 'true',
        camareroUid: columnas[16].trim(),
        camareroNombre: columnas[17].trim(),
      });
    }

    return parseadas;
  }

  private parsearCuentasSalidaCsv(csvText: string): CuentaSalidaCSV[] {
    const lineas = csvText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    const parseadas: CuentaSalidaCSV[] = [];

    for (const linea of lineas) {
      const lineaLimpia = linea.replace(/^\uFEFF/, '');

      if (lineaLimpia.toLowerCase().startsWith('sep=')) continue;
      if (lineaLimpia.toLowerCase().startsWith('cuentaid;')) continue;
      if (lineaLimpia.toLowerCase().startsWith('"cuentaid";')) continue;

      const columnas = this.parsearLineaCSV(lineaLimpia);

      if (columnas.length < 12) continue;

      const fechaCreacionCuenta = this.parsearFecha(columnas[2]);
      const fechaPagoCuenta = this.parsearFecha(columnas[4]);
      const fechaUltimoPagoOrden = this.parsearFecha(columnas[9]);
      const totalCuenta = Number(columnas[5].trim().replace(',', '.'));
      const numeroPedidos = Number(columnas[6].trim());
      const numeroOrdenes = Number(columnas[7].trim());
      const numeroOrdenesPagadas = Number(columnas[8].trim());
      const totalUltimoPagoOrden = Number(columnas[11].trim().replace(',', '.'));

      if (!fechaCreacionCuenta || isNaN(totalCuenta)) {
        continue;
      }

      parseadas.push({
        cuentaId: columnas[0].trim(),
        mesa: columnas[1].trim(),
        fechaCreacionCuenta,
        cuentaPagada: columnas[3].trim().toLowerCase() === 'true',
        fechaPagoCuenta,
        totalCuenta,
        numeroPedidos: isNaN(numeroPedidos) ? 0 : numeroPedidos,
        numeroOrdenes: isNaN(numeroOrdenes) ? 0 : numeroOrdenes,
        numeroOrdenesPagadas: isNaN(numeroOrdenesPagadas) ? 0 : numeroOrdenesPagadas,
        fechaUltimoPagoOrden,
        ultimoPagoOrdenIds: columnas[10].trim(),
        totalUltimoPagoOrden: isNaN(totalUltimoPagoOrden) ? 0 : totalUltimoPagoOrden,
      });
    }

    return parseadas;
  }

  private obtenerUltimaFechaNotificacion(
    notificaciones: NotificacionOrdenCSV[],
  ): Date | null {
    const fechas = notificaciones
      .flatMap((notificacion) => [
        notificacion.fechaCreacionNotificacion,
        notificacion.fechaCreacionOrden,
      ])
      .filter((fecha): fecha is Date => fecha instanceof Date && !isNaN(fecha.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    return fechas[0] ?? null;
  }

  private obtenerUltimaFechaCuenta(cuentas: CuentaSalidaCSV[]): Date | null {
    const fechas = cuentas
      .map((cuenta) => cuenta.fechaCreacionCuenta)
      .filter((fecha) => fecha instanceof Date && !isNaN(fecha.getTime()))
      .sort((a, b) => b.getTime() - a.getTime());

    return fechas[0] ?? null;
  }

  private parsearFecha(valor: string): Date | null {
    const texto = valor.trim();

    if (!texto) {
      return null;
    }

    const fecha = new Date(texto);
    return isNaN(fecha.getTime()) ? null : fecha;
  }

  private parsearLineaCSV(linea: string): string[] {
    const resultado: string[] = [];
    let actual = '';
    let dentroComillas = false;

    for (let i = 0; i < linea.length; i++) {
      const caracter = linea[i];
      const siguiente = linea[i + 1];

      if (caracter === '"' && dentroComillas && siguiente === '"') {
        actual += '"';
        i++;
        continue;
      }

      if (caracter === '"') {
        dentroComillas = !dentroComillas;
        continue;
      }

      if (caracter === ';' && !dentroComillas) {
        resultado.push(actual);
        actual = '';
        continue;
      }

      actual += caracter;
    }

    resultado.push(actual);

    return resultado;
  }

  private diferenciaMinutos(inicio: Date, fin: Date): number {
    return Math.max(0, (fin.getTime() - inicio.getTime()) / 60000);
  }

  private obtenerHoraDecimalUTC(fecha: Date): number {
    return fecha.getUTCHours() + fecha.getUTCMinutes() / 60;
  }

  private totalHorasRangoCuentas(): number {
    const { inicio, fin } = this.rangoHorasCuentas();
    return Math.max(1, fin - inicio);
  }

  private alturaGraficoCuentas(): number {
    return this.graficoCuentasAlto - this.graficoCuentasPadding.bottom;
  }

  private calcularXCuentas(hora: number): number {
    const { left, right } = this.graficoCuentasPadding;
    const anchoUtil = this.graficoCuentasAncho - left - right;
    const offset = hora - this.rangoHorasCuentas().inicio;
    return left + (offset / this.totalHorasRangoCuentas()) * anchoUtil;
  }

  private calcularYCuentasActivas(
    totalActivas: number,
    maximoActivas: number = this.maximoCuentasActivas(),
  ): number {
    const { top } = this.graficoCuentasPadding;
    const alturaBase = this.alturaGraficoCuentas();
    const alturaUtil = alturaBase - top;
    return alturaBase - (totalActivas / Math.max(maximoActivas, 1)) * alturaUtil;
  }

  private calcularYDuracion(
    duracionHoras: number,
    maximoDuracion: number = this.maximoDuracionHoras(),
  ): number {
    const { top } = this.graficoCuentasPadding;
    const alturaBase = this.alturaGraficoCuentas();
    const alturaUtil = alturaBase - top;
    return alturaBase - (duracionHoras / Math.max(maximoDuracion, 0.5)) * alturaUtil;
  }

  private maximoCuentasActivasBase(
    cuentas: CuentaActivaDetalle[],
    horas: number[],
  ): number {
    const maximo = Math.max(
      ...horas.map(
        (hora) =>
          cuentas.filter(
            (cuenta) =>
              cuenta.horaEntradaDecimal <= hora && cuenta.horaSalidaDecimal >= hora,
          ).length,
      ),
      0,
    );

    return Math.max(maximo, 1);
  }

  private formatearDuracionHoras(horas: number): string {
    const horasEnteras = Math.floor(horas);
    const minutos = Math.round((horas - horasEnteras) * 60);

    if (horasEnteras === 0) {
      return `0:${String(minutos).padStart(2, '0')}`;
    }

    if (minutos === 0) {
      return `${horasEnteras}`;
    }

    return `${horasEnteras}:${String(minutos).padStart(2, '0')}`;
  }

  formatearHora(fecha: Date | null): string {
    if (!fecha) {
      return 'En curso';
    }

    const horas = String(fecha.getUTCHours()).padStart(2, '0');
    const minutos = String(fecha.getUTCMinutes()).padStart(2, '0');
    return `${horas}:${minutos}`;
  }

  formatearDuracionMinutos(duracionMinutos: number): string {
    const minutosRedondeados = Math.max(0, Math.round(duracionMinutos));
    const horas = Math.floor(minutosRedondeados / 60);
    const minutos = minutosRedondeados % 60;

    if (horas === 0) {
      return `${minutos}min`;
    }

    if (minutos === 0) {
      return `${horas}h`;
    }

    return `${horas}h ${minutos}min`;
  }

  productividadCuenta(cuenta: CuentaActivaDetalle | null): number {
    if (!cuenta || cuenta.duracionHoras <= 0) {
      return 0;
    }

    return cuenta.totalCuenta / cuenta.duracionHoras;
  }

  private sincronizarCuentaActivaSeleccionada(): void {
    const cuentas = this.cuentasDiaSeleccionado();
    const seleccionada = this.cuentaActivaSeleccionadaId();

    if (cuentas.length === 0) {
      this.cuentaActivaSeleccionadaId.set(null);
      return;
    }

    if (seleccionada && !cuentas.some((cuenta) => cuenta.cuentaId === seleccionada)) {
      this.cuentaActivaSeleccionadaId.set(null);
    }
  }

  private tiempoObjetivoMinutos(categoria: string): number {
    switch (categoria) {
      case 'Entrante':
        return 10;
      case 'Principal':
        return 18;
      case 'Postre':
        return 8;
      case 'Bebida':
        return 4;
      default:
        return 12;
    }
  }

  private esMismoDia(fechaA: Date, fechaB: Date): boolean {
    return (
      fechaA.getFullYear() === fechaB.getFullYear() &&
      fechaA.getMonth() === fechaB.getMonth() &&
      fechaA.getDate() === fechaB.getDate()
    );
  }

  private formatearFechaInput(fecha: Date): string {
    const year = fecha.getUTCFullYear();
    const month = String(fecha.getUTCMonth() + 1).padStart(2, '0');
    const day = String(fecha.getUTCDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }
}
