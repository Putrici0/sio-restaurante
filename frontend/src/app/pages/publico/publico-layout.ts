import { Component } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';

/** Cabecera y pie comunes de la web pública del restaurante. */
@Component({
  selector: 'app-publico-nav',
  standalone: true,
  imports: [RouterLink, RouterLinkActive],
  styleUrl: './publico.css',
  template: `
    <nav class="pub-nav">
      <a class="pub-brand" routerLink="/">
        <span class="pub-brand__flor" aria-hidden="true">🌸</span>
        <span class="pub-brand__nombre">Sakura Hanami <span class="pub-brand__kanji">桜花見</span></span>
      </a>
      <div class="pub-links">
        <a routerLink="/carta" routerLinkActive="activo">Carta</a>
        <a class="cta" routerLink="/reservar">Reservar mesa</a>
      </div>
    </nav>
  `,
})
export class PublicoNav {}

@Component({
  selector: 'app-publico-footer',
  standalone: true,
  imports: [RouterLink],
  styleUrl: './publico.css',
  template: `
    <footer class="pub-footer">
      <span>Restaurante Sakura Hanami · Buffet libre japonés · Calle Pilarillo Seco, 10 (San Telmo), Las Palmas de Gran Canaria</span>
      <span>
        Acceso personal:
        <a routerLink="/camarero/login">Sala</a> ·
        <a routerLink="/cocina">Cocina</a> ·
        <a routerLink="/mesas">Gerencia</a>
      </span>
    </footer>
  `,
})
export class PublicoFooter {}
