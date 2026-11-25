import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { CamareroHeader } from '../camarero-header/camarero-header';
import { CartaBuffet } from '../../../shared/carta-buffet/carta-buffet';

/** Toma de comanda desde el móvil del camarero (misma carta de buffet que el cliente). */
@Component({
  selector: 'app-menu-camarero',
  standalone: true,
  imports: [CamareroHeader, CartaBuffet],
  template: `<app-camarero-header /><app-carta-buffet [mesaId]="mesaId" modo="camarero" />`,
})
export class MenuCamarero {
  readonly mesaId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
}
