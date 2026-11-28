import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { take } from 'rxjs';
import {
  ALERGENOS,
  CATEGORIAS_CARTA,
  CategoriaPlato,
  ETIQUETA_CATEGORIA,
  PlatoApi,
  aptoPara,
  coincideBusqueda,
  porUnidad,
} from '../../models/plato.model';
import { Alergenos } from '../../shared/alergenos/alergenos';
import { DetallePlato } from '../../shared/detalle-plato/detalle-plato';
import { PlatosApiService } from '../../services/platos-api.service';
import { PublicoFooter, PublicoNav } from './publico-layout';
import { TarifasBuffet } from './tarifas-buffet';

type FiltroCarta = CategoriaPlato | 'Todos' | 'MasPedidos';

/**
 * Carta digital pública (solo consulta). Incluye la sección de platos más
 * pedidos y la división por categorías. Para pedir, el cliente escanea el QR de su mesa.
 */
@Component({
  selector: 'app-carta-publica',
  standalone: true,
  imports: [CommonModule, RouterLink, PublicoNav, PublicoFooter, TarifasBuffet, Alergenos, DetallePlato],
  styleUrl: './publico.css',
  template: `
    <div class="pub-page">
      <app-publico-nav />
      <main class="pub-main">
        <h1 class="pub-titulo">Nuestra carta</h1>
        <p class="pub-subtitulo">
          Lo mejor de la cocina de fusión japonesa, china y tailandesa, sin límites: pide por rondas desde el móvil
          de tu mesa y te lo preparamos al momento. Los platos marcados se sirven por unidad; el resto, para compartir.
          ¿Aún no tienes mesa? <a routerLink="/reservar">Reserva aquí</a>.
        </p>

        <app-tarifas-buffet [tarifas]="tarifas()" />

        <div class="herramientas-carta">
          <input class="buscar-carta" type="search" placeholder="Buscar plato por nombre o número…" aria-label="Buscar plato"
                 [value]="busqueda()" (input)="busqueda.set($any($event.target).value)" />
          <button type="button" class="chip" [class.active]="evitar().length > 0" [attr.aria-expanded]="panelAlergenos()"
                  (click)="panelAlergenos.set(!panelAlergenos())">
            ⚠ Alérgenos@if (evitar().length > 0) { ({{ evitar().length }}) }
          </button>
        </div>
        @if (panelAlergenos()) {
          <div class="panel-alergenos-pub">
            <p>Marca lo que quieres <strong>evitar</strong>:</p>
            <div class="chips">
              @for (a of listaAlergenos; track a.clave) {
                <button type="button" class="chip" [class.active]="evitar().includes(a.clave)" [attr.aria-pressed]="evitar().includes(a.clave)"
                        (click)="alternarAlergeno(a.clave)">{{ a.icono }} {{ a.nombre }}</button>
              }
            </div>
            <small>También ocultamos los platos sin información de alérgenos. Ante cualquier duda, pregunta en el restaurante.</small>
          </div>
        }

        <div class="chips">
          <button type="button" class="chip" [class.active]="filtro() === 'Todos'" (click)="filtro.set('Todos')">Todos</button>
          @if (masPedidosIds().length > 0) {
            <button type="button" class="chip" [class.active]="filtro() === 'MasPedidos'" (click)="filtro.set('MasPedidos')">🌸 Más pedidos</button>
          }
          @for (categoria of categorias; track categoria) {
            <button type="button" class="chip" [class.active]="filtro() === categoria" (click)="filtro.set(categoria)">
              {{ etiquetas[categoria] }}
            </button>
          }
        </div>

        @if (cargando()) {
          <p class="estado-carga">Cargando la carta...</p>
        } @else if (error()) {
          <p class="aviso-error">{{ error() }}</p>
        } @else {
          <section class="platos-grid">
            @for (plato of platosVisibles(); track plato.id; let i = $index) {
              <article class="plato-card" [style.--i]="i" tabindex="0" role="button" [attr.aria-label]="'Ver ' + plato.nombre"
                       (click)="detalle.set(plato)" (keydown.enter)="detalle.set(plato)">
                <div class="plato-card__img">
                  <img [src]="plato.imagen" [alt]="plato.nombre" loading="lazy" />
                  @if (esPopular(plato.id)) { <span class="etiqueta-popular">🌸 Favorito</span> }
                  @if (porUnidad(plato)) { <span class="etiqueta-unidad">por unidad</span> }
                </div>
                <div class="plato-card__body">
                  <h3 class="plato-card__nombre">{{ plato.nombre }}</h3>
                  <p class="plato-card__desc">{{ plato.descripcion }}</p>
                  <app-alergenos [alergenos]="plato.alergenos" />
                  <div class="plato-card__meta">
                    <span>{{ etiquetas[plato.categoria] }}</span>
                    @if (plato.categoria === 'Bebida' || plato.categoria === 'Postre') {
                      <span class="plato-card__precio">{{ plato.precio | number:'1.2-2' }} €</span>
                    } @else {
                      <span class="plato-card__incluido">Incluido</span>
                    }
                  </div>
                </div>
              </article>
            } @empty {
              <p class="estado-carga">{{ busqueda().trim() ? 'No hay platos que coincidan con la búsqueda.' : 'No hay platos en esta sección.' }}</p>
            }
          </section>
        }
        @if (detalle(); as d) {
          <app-detalle-plato [plato]="d" [pedir]="false" (cerrar)="detalle.set(null)" />
        }
      </main>
      <app-publico-footer />
    </div>
  `,
})
export class CartaPublica implements OnInit {
  private readonly platosApi = inject(PlatosApiService);

  readonly categorias = CATEGORIAS_CARTA;
  readonly etiquetas = ETIQUETA_CATEGORIA;
  readonly filtro = signal<FiltroCarta>('Todos');
  readonly platos = signal<PlatoApi[]>([]);
  readonly tarifas = signal<PlatoApi[]>([]);
  readonly masPedidosIds = signal<string[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);

  readonly listaAlergenos = ALERGENOS;
  readonly porUnidad = porUnidad;
  readonly busqueda = signal('');
  readonly evitar = signal<string[]>([]);
  readonly panelAlergenos = signal(false);
  readonly detalle = signal<PlatoApi | null>(null);

  readonly platosVisibles = computed(() =>
    this.platosDeSeccion()
      .filter((p) => coincideBusqueda(p, this.busqueda()))
      .filter((p) => aptoPara(p, this.evitar())),
  );

  alternarAlergeno(clave: string): void {
    this.evitar.update((l) => (l.includes(clave) ? l.filter((a) => a !== clave) : [...l, clave]));
  }

  private readonly platosDeSeccion = computed(() => {
    const filtro = this.busqueda().trim() ? 'Todos' : this.filtro();
    const lista = this.platos();
    if (filtro === 'Todos') {
      return [...lista].sort(
        (a, b) => this.categorias.indexOf(a.categoria) - this.categorias.indexOf(b.categoria),
      );
    }
    if (filtro === 'MasPedidos') {
      return this.masPedidosIds()
        .map((id) => lista.find((p) => p.id === id))
        .filter((p): p is PlatoApi => !!p);
    }
    return lista.filter((p) => p.categoria === filtro);
  });

  ngOnInit(): void {
    this.platosApi
      .obtenerPlatos()
      .pipe(take(1))
      .subscribe({
        next: (platos) => {
          this.tarifas.set(platos.filter((p) => p.categoria === 'Buffet'));
          this.platos.set(platos.filter((p) => p.categoria !== 'Buffet'));
          this.cargando.set(false);
        },
        error: () => {
          this.error.set('No se ha podido cargar la carta. Inténtalo de nuevo en unos minutos.');
          this.cargando.set(false);
        },
      });

    this.platosApi
      .obtenerMasPedidos(6)
      .pipe(take(1))
      .subscribe({
        next: (ranking) => this.masPedidosIds.set(ranking.map((r) => r.plato.id)),
        error: () => this.masPedidosIds.set([]),
      });
  }

  esPopular(id: string): boolean {
    return this.masPedidosIds().includes(id);
  }
}
