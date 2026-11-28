import { Component, computed, input } from '@angular/core';

import { ALERGENOS } from '../../models/plato.model';

/**
 * Alérgenos de un plato. «iconos»: fila compacta para tarjetas (con nombre al pasar el dedo/ratón);
 * «completo»: lista con nombres para el detalle del plato. Sin información → aviso de consultar.
 */
@Component({
  selector: 'app-alergenos',
  standalone: true,
  template: `
    @if (alergenos() == null) {
      @if (modo() === 'completo') {
        <p class="al-aviso">ⓘ Alérgenos no indicados en la carta: consulta al personal antes de pedir.</p>
      }
    } @else if (lista().length === 0) {
      @if (modo() === 'completo') {
        <p class="al-ninguno">Sin alérgenos declarados.</p>
      }
    } @else if (modo() === 'iconos') {
      <span class="al-iconos" [attr.aria-label]="'Alérgenos: ' + nombres()">
        @for (a of lista(); track a.clave) {
          <span class="al-icono" [title]="a.nombre" aria-hidden="true">{{ a.icono }}</span>
        }
      </span>
    } @else {
      <ul class="al-lista" aria-label="Alérgenos">
        @for (a of lista(); track a.clave) {
          <li><span aria-hidden="true">{{ a.icono }}</span> {{ a.nombre }}</li>
        }
      </ul>
    }
  `,
  styles: `
    :host { display: contents; }
    .al-iconos { display: inline-flex; flex-wrap: wrap; gap: 3px; }
    .al-icono {
      display: inline-grid; place-items: center; width: 22px; height: 22px; border-radius: 50%;
      background: #fff6e6; border: 1px solid #f3d39a; font-size: 0.72rem; line-height: 1;
    }
    .al-lista { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 6px; }
    .al-lista li {
      display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px;
      background: #fff6e6; border: 1px solid #f3d39a; color: #6b4600; font-size: 0.84rem; font-weight: 600;
    }
    .al-aviso { margin: 0; padding: 8px 12px; border-radius: 12px; background: #fff6e6; color: #6b4600; font-size: 0.85rem; }
    .al-ninguno { margin: 0; color: var(--sh-ok, #2f7a46); font-size: 0.85rem; font-weight: 600; }
  `,
})
export class Alergenos {
  readonly alergenos = input<string[] | null | undefined>(null);
  readonly modo = input<'iconos' | 'completo'>('iconos');

  readonly lista = computed(() => ALERGENOS.filter((a) => (this.alergenos() ?? []).includes(a.clave)));
  readonly nombres = computed(() => this.lista().map((a) => a.nombre).join(', '));
}
