import { CommonModule } from '@angular/common';
import { Component, Input, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { Subscription, catchError, of, switchMap, take, timer } from 'rxjs';

import {
  CATEGORIAS_CARTA,
  CategoriaPlato,
  ETIQUETA_CATEGORIA,
  PLATOS_POR_COMENSAL_Y_RONDA,
  PlatoApi,
  esComida,
} from '../../models/plato.model';
import { PlatosApiService } from '../../services/platos-api.service';
import { PedidosApiService } from '../../services/pedidos-api.service';
import { CuentaActivaResponse, CuentaApiService } from '../../services/cuenta-api.service';

type Filtro = CategoriaPlato | 'MasPedidos';

/**
 * Carta del buffet libre a la carta, compartida por el cliente (QR de la mesa)
 * y por el camarero (toma de comanda desde su móvil).
 * La comida está incluida en el precio por comensal y se pide por rondas
 * (máximo de platos por comensal en cada ronda); las bebidas se cobran aparte.
 */
@Component({
  selector: 'app-carta-buffet',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './carta-buffet.html',
  styleUrl: './carta-buffet.css',
})
export class CartaBuffet implements OnInit, OnDestroy {
  @Input({ required: true }) mesaId!: string;
  @Input() modo: 'cliente' | 'camarero' = 'cliente';

  private readonly platosApi = inject(PlatosApiService);
  private readonly pedidosApi = inject(PedidosApiService);
  private readonly cuentaApi = inject(CuentaApiService);
  private sub?: Subscription;

  readonly etiquetas = ETIQUETA_CATEGORIA;
  readonly filtros: Filtro[] = ['MasPedidos', ...CATEGORIAS_CARTA];
  readonly filtro = signal<Filtro>('Entrante');
  readonly platos = signal<PlatoApi[]>([]);
  readonly masPedidos = signal<string[]>([]);
  readonly cuenta = signal<CuentaActivaResponse | null>(null);
  readonly cargando = signal(true);
  readonly cantidades = signal<Record<string, number>>({});
  readonly notas = signal('');
  readonly revisando = signal(false);
  readonly enviando = signal(false);
  readonly mensaje = signal<{ texto: string; tipo: 'ok' | 'error' } | null>(null);

  readonly sesionCerrada = computed(() => !!this.cuenta()?.payed || !!this.cuenta()?.cobroSolicitado);
  readonly comensales = computed(() => this.cuenta()?.comensales || 1);
  readonly maximoRonda = computed(() => this.comensales() * PLATOS_POR_COMENSAL_Y_RONDA);

  readonly visibles = computed(() => {
    const f = this.filtro();
    const lista = this.platos();
    if (f === 'MasPedidos') {
      return this.masPedidos().map((id) => lista.find((p) => p.id === id)).filter((p): p is PlatoApi => !!p);
    }
    return lista.filter((p) => p.categoria === f);
  });

  readonly seleccion = computed(() =>
    this.platos()
      .map((p) => ({ plato: p, cantidad: this.cantidades()[p.id] ?? 0 }))
      .filter((l) => l.cantidad > 0),
  );
  readonly platosRonda = computed(() =>
    this.seleccion().filter((l) => esComida(l.plato.categoria)).reduce((a, l) => a + l.cantidad, 0),
  );
  readonly bebidasRonda = computed(() =>
    this.seleccion().filter((l) => l.plato.categoria === 'Bebida').reduce((a, l) => a + l.cantidad, 0),
  );
  readonly importeBebidas = computed(() =>
    this.seleccion()
      .filter((l) => l.plato.categoria === 'Bebida')
      .reduce((a, l) => a + l.cantidad * Number(l.plato.precio), 0),
  );

  ngOnInit(): void {
    this.platosApi.obtenerPlatos().pipe(take(1)).subscribe({
      next: (p) => {
        this.platos.set(p.filter((x) => x.categoria !== 'Buffet'));
        this.cargando.set(false);
      },
      error: () => {
        this.cargando.set(false);
        this.mensaje.set({ texto: 'No se ha podido cargar la carta.', tipo: 'error' });
      },
    });
    this.platosApi.obtenerMasPedidos(8).pipe(take(1)).subscribe({
      next: (r) => {
        this.masPedidos.set(r.map((x) => x.plato.id));
        if (r.length > 0) this.filtro.set('MasPedidos');
      },
      error: () => undefined,
    });
    this.sub = timer(0, 5000)
      .pipe(switchMap(() => this.cuentaApi.obtenerCuentaActivaDeMesa(this.mesaId).pipe(catchError(() => of(null)))))
      .subscribe((c) => this.cuenta.set(c));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  nombreFiltro(f: Filtro): string {
    return f === 'MasPedidos' ? 'Más pedidos' : this.etiquetas[f];
  }

  cantidad(p: PlatoApi): number {
    return this.cantidades()[p.id] ?? 0;
  }

  puedeSumar(p: PlatoApi): boolean {
    if (!this.cuenta() || this.sesionCerrada()) return false;
    return !esComida(p.categoria) || this.platosRonda() < this.maximoRonda();
  }

  sumar(p: PlatoApi, delta: number): void {
    if (delta > 0 && !this.puedeSumar(p)) return;
    this.cantidades.update((c) => ({ ...c, [p.id]: Math.max(0, (c[p.id] ?? 0) + delta) }));
  }

  vaciar(): void {
    this.cantidades.set({});
    this.notas.set('');
    this.revisando.set(false);
  }

  enviar(): void {
    const items = this.seleccion().map((l) => ({ platoId: l.plato.id, cantidad: l.cantidad, detalles: this.notas().trim() }));
    if (items.length === 0 || this.enviando()) return;
    this.enviando.set(true);
    this.pedidosApi.crearPedidoDesdeMesa(this.mesaId, { items }).pipe(take(1)).subscribe({
      next: () => {
        this.enviando.set(false);
        this.vaciar();
        this.avisar(this.modo === 'cliente' ? '¡Ronda enviada a cocina! Sigue su estado en «Mis platos y cuenta».' : 'Comanda enviada a cocina.', 'ok');
      },
      error: (err) => {
        this.enviando.set(false);
        this.avisar(err?.error?.message ?? 'No se ha podido enviar el pedido.', 'error');
      },
    });
  }

  private avisar(texto: string, tipo: 'ok' | 'error'): void {
    this.mensaje.set({ texto, tipo });
    window.setTimeout(() => this.mensaje.set(null), 4000);
  }
}
