import { CommonModule } from '@angular/common';
import { Component, computed, input } from '@angular/core';

import { PlatoApi } from '../../models/plato.model';

interface TurnoTarifa {
  id: string;
  icono: string;
  titulo: string;
  dias: string;
  horario: string;
  adulto?: PlatoApi;
  nino?: PlatoApi;
  destacado: boolean;
}

/**
 * Precios del buffet libre para la web pública: una tarjeta por turno con el precio
 * de adultos y el infantil, y debajo lo que incluye (y lo que no).
 */
@Component({
  selector: 'app-tarifas-buffet',
  standalone: true,
  imports: [CommonModule],
  styleUrl: './tarifas-buffet.css',
  template: `
    <section class="tb" aria-label="Precios del buffet libre">
      <div class="tb__turnos">
        @for (t of turnos(); track t.id; let i = $index) {
          <article class="tb__turno" [class.tb__turno--destacado]="t.destacado" [style.--i]="i">
            <header class="tb__cab">
              <span class="tb__icono" aria-hidden="true">{{ t.icono }}</span>
              <div>
                <h2>{{ t.titulo }}</h2>
                <p>{{ t.dias }}<br />{{ t.horario }}</p>
              </div>
            </header>

            @if (t.adulto; as a) {
              <p class="tb__precio">
                <strong>{{ a.precio | number:'1.2-2' }}<span class="tb__euro">€</span></strong>
                <span>por adulto</span>
              </p>
            }
            @if (t.nino; as n) {
              <p class="tb__nino">
                <span>Niños de 100 a 130 cm</span>
                <strong>{{ n.precio | number:'1.2-2' }} €</strong>
              </p>
            }
          </article>
        }
      </div>

      <ul class="tb__incluye">
        <li><span aria-hidden="true">🥢</span> Japonesa, china y tailandesa, sin límites</li>
        <li><span aria-hidden="true">🔁</span> Pide por rondas: la siguiente, cuando os sirvan la anterior</li>
        <li><span aria-hidden="true">👶</span> Niños de menos de 100 cm, gratis</li>
        <li class="tb__aparte"><span aria-hidden="true">🥤</span> Bebidas y postres aparte</li>
        <li class="tb__aparte"><span aria-hidden="true">🍽️</span> +2 € por plato sobrante</li>
        <li><span aria-hidden="true">🧾</span> IGIC incluido</li>
      </ul>
    </section>
  `,
})
export class TarifasBuffet {
  /** Platos de la categoría Buffet (tarifas por comensal). */
  readonly tarifas = input<PlatoApi[]>([]);

  readonly turnos = computed<TurnoTarifa[]>(() => {
    const porId = new Map(this.tarifas().map((t) => [t.id, t]));
    const turnos: TurnoTarifa[] = [
      {
        id: 'sakura', icono: '🌸', titulo: 'Menú Sakura', dias: 'Almuerzos de lunes a jueves', horario: 'Una selección de nuestros mejores platos',
        adulto: porId.get('buffet-almuerzo'), nino: porId.get('buffet-almuerzo-infantil'), destacado: false,
      },
      {
        id: 'deluxe', icono: '✨', titulo: 'Menú Deluxe', dias: 'Cenas, viernes, fines de semana y festivos', horario: 'Más de 110 platos para disfrutar sin límites',
        adulto: porId.get('buffet-cena'), nino: porId.get('buffet-cena-infantil'), destacado: true,
      },
    ];
    return turnos.filter((t) => t.adulto || t.nino);
  });
}
