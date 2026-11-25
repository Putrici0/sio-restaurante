import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { PublicoFooter, PublicoNav } from './publico-layout';

/** Portada pública del Restaurante Sakura Hanami (SIGO-RSH). */
@Component({
  selector: 'app-inicio-publico',
  standalone: true,
  imports: [RouterLink, PublicoNav, PublicoFooter],
  styleUrls: ['./publico.css', './inicio.css'],
  template: `
    <div class="pub-page">
      <app-publico-nav />

      <header class="hero">
        <div class="hero__petalos" aria-hidden="true">🌸 🌸 🌸</div>
        <p class="hero__eyebrow">Buffet libre a la carta · Cocina japonesa</p>
        <h1 class="hero__titulo">Sakura Hanami</h1>
        <p class="hero__texto">
          El Hanami es la tradición japonesa de contemplar la belleza efímera de los cerezos en flor.
          Con ese espíritu te invitamos a compartir los mejores manjares de la gastronomía nipona
          con familia y amigos.
        </p>
        <div class="hero__acciones">
          <a class="pub-btn" routerLink="/reservar">Reservar mesa</a>
          <a class="pub-btn pub-btn--claro" routerLink="/carta">Ver la carta</a>
        </div>
      </header>

      <main class="pub-main">
        <section class="info-grid">
          <article class="info-card">
            <h2>🍣 Buffet libre a la carta</h2>
            <p>Sushi, sashimi, tempuras, ramen y platos calientes preparados al momento. Pide desde tu mesa escaneando el código QR.</p>
          </article>
          <article class="info-card">
            <h2>🕐 Horario</h2>
            <p>Almuerzos de 13:00 a 16:00<br />Cenas de 20:00 a 23:30</p>
          </article>
          <article class="info-card">
            <h2>📍 Dónde estamos</h2>
            <p>Calle Pilarillo Seco, 10 (San Telmo)<br />Las Palmas de Gran Canaria</p>
          </article>
        </section>
      </main>

      <app-publico-footer />
    </div>
  `,
})
export class InicioPublico {}
