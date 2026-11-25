import { Component, inject } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { Header } from '../../../shared/header/header';
import { CartaBuffet } from '../../../shared/carta-buffet/carta-buffet';

/** Carta del buffet para el cliente que ha entrado con el QR de su mesa. */
@Component({
  selector: 'app-menu-page',
  standalone: true,
  imports: [Header, CartaBuffet],
  template: `<app-header /><app-carta-buffet [mesaId]="mesaId" modo="cliente" />`,
})
export class MenuPage {
  readonly mesaId = inject(ActivatedRoute).snapshot.paramMap.get('id') ?? '';
}
