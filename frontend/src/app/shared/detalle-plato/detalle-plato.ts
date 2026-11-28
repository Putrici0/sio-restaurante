import { CommonModule } from '@angular/common';
import { Component, HostListener, computed, input, output } from '@angular/core';

import { ETIQUETA_CATEGORIA, PlatoApi, descripcionLimpia, porUnidad } from '../../models/plato.model';
import { Alergenos } from '../alergenos/alergenos';

/**
 * Detalle de un plato en una hoja que sube desde abajo (pensada para el móvil): foto grande,
 * descripción, si se sirve por unidad, alérgenos y, si se puede pedir, el selector de cantidad.
 */
@Component({
  selector: 'app-detalle-plato',
  standalone: true,
  imports: [CommonModule, Alergenos],
  templateUrl: './detalle-plato.html',
  styleUrl: './detalle-plato.css',
})
export class DetallePlato {
  readonly plato = input.required<PlatoApi>();
  /** false en la carta pública (solo consulta). */
  readonly pedir = input(true);
  readonly cantidad = input(0);
  readonly puedeSumar = input(true);
  /** Por qué no se puede añadir ahora (ronda en camino, límite…), si es el caso. */
  readonly motivoBloqueo = input<string | null>(null);

  readonly cerrar = output<void>();
  readonly cambiar = output<number>();

  readonly etiquetas = ETIQUETA_CATEGORIA;
  readonly descripcion = computed(() => descripcionLimpia(this.plato()));
  readonly porUnidad = computed(() => porUnidad(this.plato()));
  readonly cobraAparte = computed(() => this.plato().precio > 0);
  readonly numero = computed(() => this.plato().nombre.match(/^(\d+)\.\s*/)?.[1] ?? null);
  readonly nombre = computed(() => this.plato().nombre.replace(/^\d+\.\s*/, ''));

  @HostListener('document:keydown.escape')
  alPulsarEscape(): void {
    this.cerrar.emit();
  }
}
