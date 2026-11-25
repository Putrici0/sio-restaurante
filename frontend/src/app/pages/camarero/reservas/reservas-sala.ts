import { CommonModule } from '@angular/common';
import { Component, OnDestroy, computed, signal, inject } from '@angular/core';
import { Subscription, catchError, of } from 'rxjs';
import { Reserva } from '../../../models/reserva.model';
import { ReservasApiService } from '../../../services/reservas-api.service';
import { CamareroHeader } from '../camarero-header/camarero-header';

/** Reservas del día en el móvil del camarero (solo consulta: las gestiona el encargado). */
@Component({
  selector: 'app-reservas-sala',
  standalone: true,
  imports: [CommonModule, CamareroHeader],
  template: `
    <app-camarero-header />
    <main class="sala-pagina">
      <p class="sh-eyebrow">Reservas</p>
      <div class="cab">
        <h1>{{ titulo() }}</h1>
        <div class="dias">
          <button type="button" [class.activo]="dia() === 0" (click)="dia.set(0); cargar()">Hoy</button>
          <button type="button" [class.activo]="dia() === 1" (click)="dia.set(1); cargar()">Mañana</button>
        </div>
      </div>
      <p class="sub">{{ activas().length }} reservas · {{ comensales() }} comensales</p>

      @for (r of reservas(); track r.id) {
        <article class="reserva sh-tarjeta" [class.reserva--cerrada]="r.estado === 'Finalizado' || r.estado === 'Cancelado'">
          <span class="hora">{{ r.hora }}</span>
          <div>
            <strong>{{ r.nombre }}</strong>
            <small>{{ r.comensales }} comensales@if (r.nota) { · {{ r.nota }} }</small>
          </div>
          <span class="estado estado--{{ r.estado }}">{{ etiqueta(r) }}</span>
        </article>
      } @empty {
        <p class="vacio">🌸 No hay reservas.</p>
      }
      <p class="pie">Para confirmar reservas o sentar a un cliente con reserva, avisa al encargado de sala.</p>
    </main>
  `,
  styles: [`
    .cab { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
    h1 { margin: 2px 0; font-size: 1.6rem; }
    .sub { margin: 0 0 14px; color: var(--sh-tinta-suave); }
    .dias { display: flex; gap: 6px; }
    .dias button { padding: 7px 14px; border-radius: 999px; border: 1px solid var(--sh-borde); background: #fff; font-weight: 700; cursor: pointer; }
    .dias button.activo { background: var(--sh-tinta); border-color: var(--sh-tinta); color: #fff; }
    .reserva { display: grid; grid-template-columns: 56px 1fr auto; gap: 10px; align-items: center; padding: 12px 14px; margin-bottom: 10px; }
    .reserva--cerrada { opacity: 0.55; box-shadow: none; }
    .hora { font-family: var(--sh-fuente-titulos); font-size: 1.25rem; font-weight: 700; color: var(--sh-sakura-800); }
    .reserva div { display: grid; }
    .reserva small { color: var(--sh-tinta-suave); }
    .estado { font-size: 0.72rem; font-weight: 700; padding: 3px 10px; border-radius: 999px; }
    .estado--Pendiente { background: #fff1d6; color: #8a5a00; }
    .estado--Confirmado { background: #e3f4e8; color: var(--sh-ok); }
    .estado--Finalizado { background: var(--sh-sakura-100); color: var(--sh-sakura-800); }
    .estado--Cancelado { background: #ece7e3; color: #5e5048; }
    .vacio { text-align: center; color: var(--sh-tinta-suave); padding: 24px 0; }
    .pie { color: var(--sh-tinta-suave); font-size: 0.82rem; text-align: center; }
  `],
})
export class ReservasSala implements OnDestroy {
  private readonly reservasApi = inject(ReservasApiService);
  private sub?: Subscription;

  readonly dia = signal(0);
  readonly reservas = signal<Reserva[]>([]);
  readonly activas = computed(() => this.reservas().filter((r) => r.estado === 'Pendiente' || r.estado === 'Confirmado'));
  readonly comensales = computed(() => this.activas().reduce((a, r) => a + r.comensales, 0));
  readonly titulo = computed(() => (this.dia() === 0 ? 'Hoy' : 'Mañana'));

  constructor() {
    this.cargar();
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  cargar(): void {
    const d = new Date();
    d.setDate(d.getDate() + this.dia());
    const fecha = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    this.sub?.unsubscribe();
    this.sub = this.reservasApi
      .obtenerReservasPorFecha(fecha)
      .pipe(catchError(() => of([] as Reserva[])))
      .subscribe((r) => this.reservas.set([...r].sort((a, b) => a.hora.localeCompare(b.hora))));
  }

  etiqueta(r: Reserva): string {
    return { Pendiente: 'Por confirmar', Confirmado: 'Confirmada', Finalizado: 'Ha venido', Cancelado: 'Cancelada' }[r.estado];
  }
}
