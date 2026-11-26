import { CommonModule } from '@angular/common';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { take } from 'rxjs';
import { Navbar } from '../../../shared/navbar/navbar';
import { CategoriaPlato, ETIQUETA_CATEGORIA } from '../../../models/plato.model';

interface Serie { etiqueta: string; valor: number; }
interface ProductoVendido { platoId: string; nombre: string; categoria: CategoriaPlato; unidades: number; ingresos: number; }
interface CategoriaVendida { categoria: CategoriaPlato; unidades: number; ingresos: number; }
interface RotacionDia { fecha: string; sesiones: number; rotacion: number; }
interface RentabilidadMesa {
  mesa: string; capacidad: number; sesiones: number; comensales: number; ingresos: number;
  ingresoMedioSesion: number; ingresoPorComensal: number; ingresoPorPlaza: number; ocupacionMediaMinutos: number;
}
interface Turno { turno: string; sesiones: number; comensales: number; ingresos: number; gastoPorComensal: number; }
interface DiaSemana { dia: string; sesiones: number; ingresos: number; }

export interface CuadroMando {
  desde: string;
  hasta: string;
  ventas: {
    ingresos: number;
    cuentas: number;
    ticketMedio: number;
    ingresosPorDia: Serie[];
    ingresosPorHora: Serie[];
    ingresosPorMetodo: Serie[];
  };
  carta: {
    ranking: ProductoVendido[];
    categorias: CategoriaVendida[];
    bajaRotacion: ProductoVendido[];
  };
  eficiencia: {
    sesiones: number;
    ocupacionMediaMinutos: number;
    rotacionMediaDiaria: number;
    numeroMesas: number;
    rotacionPorDia: RotacionDia[];
  };
  sala: {
    comensales: number;
    gastoPorComensal: number;
    porcentajeBebidas: number;
    mesas: RentabilidadMesa[];
    turnos: Turno[];
    diasSemana: DiaSemana[];
  };
  reservas: { total: number; web: number; canceladas: number; cumplidas: number; comensales: number };
}

/** Barra de un gráfico de barras de una sola serie (alto/ancho en % del máximo). */
interface Barra { etiqueta: string; valor: number; pct: number; texto: string; eje: string; }

/** Como máximo se rotulan unas 10 marcas del eje X; el resto se ve al pasar el ratón. */
const MAX_ROTULOS_EJE = 10;

type Rango = '7d' | '30d' | 'mes' | 'personalizado';

/**
 * Cuadro de mando gerencial de SIGO-RSH: análisis de ventas, de carta y de
 * eficiencia (ocupación y rotación de mesas) para el rango de fechas elegido.
 */
@Component({
  selector: 'app-estadistica',
  standalone: true,
  imports: [CommonModule, Navbar],
  templateUrl: './estadistica.html',
  styleUrl: './estadistica.css',
})
export class EstadisticaComponent implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `http://${window.location.hostname}:7070`;

  readonly etiquetasCategoria = ETIQUETA_CATEGORIA;
  readonly rango = signal<Rango>('7d');
  readonly desde = signal(this.isoDia(-6));
  readonly hasta = signal(this.isoDia(0));
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly datos = signal<CuadroMando | null>(null);
  readonly verTablas = signal(false);

  readonly barrasDia = computed<Barra[]>(() =>
    this.aBarras(
      (this.datos()?.ventas.ingresosPorDia ?? []).map((s) => ({ etiqueta: this.diaLargo(s.etiqueta), valor: s.valor })),
      (v) => this.euros(v),
      (s, n) => this.diaEje(s, n),
    ),
  );
  readonly barrasHora = computed<Barra[]>(() =>
    this.aBarras(this.datos()?.ventas.ingresosPorHora ?? [], (v) => this.euros(v)),
  );
  readonly barrasRanking = computed<Barra[]>(() =>
    this.aBarras(
      (this.datos()?.carta.ranking ?? []).map((p) => ({ etiqueta: p.nombre, valor: p.unidades })),
      (v) => `${v} uds.`,
    ),
  );
  readonly barrasCategoria = computed<Barra[]>(() =>
    this.aBarras(
      (this.datos()?.carta.categorias ?? []).map((c) => ({ etiqueta: ETIQUETA_CATEGORIA[c.categoria], valor: c.unidades })),
      (v) => `${v} uds.`,
    ),
  );
  readonly barrasRotacion = computed<Barra[]>(() =>
    this.aBarras(
      (this.datos()?.eficiencia.rotacionPorDia ?? []).map((r) => ({ etiqueta: this.diaLargo(r.fecha), valor: r.rotacion })),
      (v) => `${v.toFixed(2)} rot.`,
      (s, n) => this.diaEje(s, n),
    ),
  );
  /** Mesas ordenadas por ingresos por plaza (rentabilidad independiente del tamaño de la mesa). */
  readonly mesasPorRentabilidad = computed(() =>
    [...(this.datos()?.sala.mesas ?? [])].sort((a, b) => b.ingresoPorPlaza - a.ingresoPorPlaza),
  );
  readonly masRentables = computed(() => this.mesasPorRentabilidad().slice(0, 3));
  readonly menosRentables = computed(() => this.mesasPorRentabilidad().slice(-3).reverse());
  readonly barrasMesas = computed<Barra[]>(() =>
    this.aBarras(
      [...(this.datos()?.sala.mesas ?? [])]
        .sort((a, b) => Number(a.mesa) - Number(b.mesa))
        .map((m) => ({ etiqueta: `Mesa ${m.mesa} (${m.capacidad})`, valor: m.ingresos })),
      (v) => this.euros(v),
    ),
  );
  readonly barrasDiaSemana = computed<Barra[]>(() =>
    this.aBarras(
      (this.datos()?.sala.diasSemana ?? []).map((d) => ({ etiqueta: d.dia.slice(0, 3), valor: d.ingresos })),
      (v) => this.euros(v),
    ),
  );
  readonly pctWeb = computed(() => {
    const r = this.datos()?.reservas;
    return r && r.total > 0 ? Math.round((r.web / r.total) * 100) : 0;
  });

  readonly franjaPico = computed(() => {
    const horas = this.datos()?.ventas.ingresosPorHora ?? [];
    return horas.length ? horas.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;
  });

  ngOnInit(): void {
    this.cargar();
  }

  elegirRango(rango: Rango): void {
    this.rango.set(rango);
    if (rango === '7d') { this.desde.set(this.isoDia(-6)); this.hasta.set(this.isoDia(0)); }
    if (rango === '30d') { this.desde.set(this.isoDia(-29)); this.hasta.set(this.isoDia(0)); }
    if (rango === 'mes') {
      const hoy = new Date();
      this.desde.set(this.iso(new Date(hoy.getFullYear(), hoy.getMonth(), 1)));
      this.hasta.set(this.isoDia(0));
    }
    if (rango !== 'personalizado') this.cargar();
  }

  cambiarFecha(campo: 'desde' | 'hasta', valor: string): void {
    this.rango.set('personalizado');
    (campo === 'desde' ? this.desde : this.hasta).set(valor);
    if (this.desde() && this.hasta() && this.desde() <= this.hasta()) this.cargar();
  }

  cargar(): void {
    this.cargando.set(true);
    this.error.set(null);
    const params = new HttpParams().set('desde', this.desde()).set('hasta', this.hasta());
    this.http
      .get<CuadroMando>(`${this.apiUrl}/estadisticas`, { params })
      .pipe(take(1))
      .subscribe({
        next: (d) => {
          this.datos.set(d);
          this.cargando.set(false);
        },
        error: (err) => {
          this.error.set(err?.error?.message ?? 'No se han podido calcular las estadísticas.');
          this.cargando.set(false);
        },
      });
  }

  euros(v: number): string {
    return `${Number(v).toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
  }

  minutosATexto(min: number): string {
    const h = Math.floor(min / 60);
    const m = Math.round(min % 60);
    return h > 0 ? `${h} h ${m} min` : `${m} min`;
  }

  porcentajeMetodo(s: Serie): number {
    const total = this.datos()?.ventas.ingresos ?? 0;
    return total > 0 ? Math.round((s.valor / total) * 100) : 0;
  }

  /** Valor máximo de una serie, para rotular la escala del gráfico. */
  maximo(barras: Barra[]): Barra | null {
    return barras.length ? barras.reduce((a, b) => (b.valor > a.valor ? b : a)) : null;
  }

  private aBarras(
    series: Serie[],
    formato: (v: number) => string,
    rotuloEje: (s: Serie, total: number) => string = (s) => s.etiqueta,
  ): Barra[] {
    const max = Math.max(0, ...series.map((s) => Number(s.valor)));
    // Con muchas barras solo se rotula una de cada 'paso' para que el eje no se solape
    const paso = Math.max(1, Math.ceil(series.length / MAX_ROTULOS_EJE));
    return series.map((s, i) => ({
      etiqueta: s.etiqueta,
      valor: Number(s.valor),
      pct: max > 0 ? (Number(s.valor) / max) * 100 : 0,
      texto: formato(Number(s.valor)),
      eje: i % paso === 0 ? rotuloEje(s, series.length) : '',
    }));
  }

  /** Fecha completa para el tooltip y las tablas: «lun, 3 nov». */
  private diaLargo(iso: string): string {
    const d = new Date(`${iso}T00:00:00`);
    return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' });
  }

  /** Rótulo del eje a partir de «lun, 3 nov»: con pocos días «lun 3»; con muchos, «3 nov». */
  private diaEje(s: Serie, total: number): string {
    const [semana, dia, mes] = s.etiqueta.replace(',', '').split(' ');
    return total <= MAX_ROTULOS_EJE ? `${semana} ${dia}` : `${dia} ${mes ?? ''}`.trim();
  }

  private isoDia(desplazamiento: number): string {
    const d = new Date();
    d.setDate(d.getDate() + desplazamiento);
    return this.iso(d);
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
