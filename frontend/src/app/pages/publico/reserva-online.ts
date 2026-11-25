import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { ReservasApiService } from '../../services/reservas-api.service';
import { PublicoFooter, PublicoNav } from './publico-layout';

/** Turnos de servicio del restaurante (almuerzo y cena), en franjas de 30 min. */
const FRANJAS_ALMUERZO = ['13:00', '13:30', '14:00', '14:30', '15:00'];
const FRANJAS_CENA = ['20:00', '20:30', '21:00', '21:30', '22:00', '22:30'];
const MAX_COMENSALES_ONLINE = 12;

/**
 * Reserva online: el cliente indica fecha, hora, número de comensales y
 * datos de contacto. La reserva queda "Pendiente" hasta que el personal la confirme;
 * no se asigna mesa automáticamente.
 */
@Component({
  selector: 'app-reserva-online',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink, PublicoNav, PublicoFooter],
  styleUrl: './publico.css',
  template: `
    <div class="pub-page">
      <app-publico-nav />
      <main class="pub-main">
        <h1 class="pub-titulo">Reserva tu mesa</h1>
        <p class="pub-subtitulo">
          Elige el día, la hora y cuántos vais a venir. Te contactaremos para confirmar la reserva.
          Para grupos de más de {{ maxComensales }} personas, llámanos directamente.
        </p>

        @if (enviada(); as r) {
          <div class="aviso-ok">
            <strong>¡Reserva recibida, {{ r.nombre }}!</strong><br />
            {{ r.comensales }} {{ r.comensales === 1 ? 'persona' : 'personas' }} el {{ r.fechaTexto }} a las {{ r.hora }}.<br />
            Tu reserva está pendiente de confirmación por parte del restaurante. ¡Arigato!
          </div>
          <p style="margin-top: 20px; display: flex; gap: 12px; flex-wrap: wrap;">
            <button type="button" class="pub-btn pub-btn--claro" (click)="nuevaReserva()">Hacer otra reserva</button>
            <a class="pub-btn" routerLink="/carta">Ver la carta</a>
          </p>
        } @else {
          <form class="form-card" (ngSubmit)="enviar()" novalidate>
            <div class="form-grid">
              <div class="campo">
                <label for="fecha">Fecha</label>
                <input id="fecha" name="fecha" type="date" [min]="hoy" [(ngModel)]="fecha" required />
              </div>
              <div class="campo">
                <label for="hora">Hora</label>
                <select id="hora" name="hora" [(ngModel)]="hora" required>
                  <option value="" disabled>Selecciona una hora</option>
                  <optgroup label="Almuerzo">
                    @for (f of franjasAlmuerzo; track f) { <option [value]="f">{{ f }}</option> }
                  </optgroup>
                  <optgroup label="Cena">
                    @for (f of franjasCena; track f) { <option [value]="f">{{ f }}</option> }
                  </optgroup>
                </select>
              </div>
              <div class="campo">
                <label for="comensales">Comensales</label>
                <input id="comensales" name="comensales" type="number" min="1" [max]="maxComensales" [(ngModel)]="comensales" required />
              </div>
            </div>

            <div class="form-grid">
              <div class="campo">
                <label for="nombre">Nombre</label>
                <input id="nombre" name="nombre" type="text" autocomplete="name" [(ngModel)]="nombre" required />
              </div>
              <div class="campo">
                <label for="telefono">Teléfono</label>
                <input id="telefono" name="telefono" type="tel" autocomplete="tel" [(ngModel)]="telefono" required />
              </div>
              <div class="campo">
                <label for="email">Correo electrónico <small>(opcional)</small></label>
                <input id="email" name="email" type="email" autocomplete="email" [(ngModel)]="email" />
              </div>
            </div>

            <div class="campo">
              <label for="nota">Observaciones <small>(alergias, trona, celebraciones...)</small></label>
              <textarea id="nota" name="nota" rows="3" [(ngModel)]="nota"></textarea>
            </div>

            <label class="consentimiento">
              <input type="checkbox" name="acepta" [(ngModel)]="aceptaPrivacidad" />
              <span>
                Acepto que el Restaurante Sakura Hanami (SUSHI GARDEN S.L.) trate mis datos de contacto
                únicamente para gestionar esta reserva, conforme al RGPD y la LOPDGDD.
              </span>
            </label>

            @if (error()) {
              <p class="aviso-error">{{ error() }}</p>
            }

            <div>
              <button type="submit" class="pub-btn" [disabled]="enviando()">
                {{ enviando() ? 'Enviando...' : 'Solicitar reserva' }}
              </button>
            </div>
          </form>
        }
      </main>
      <app-publico-footer />
    </div>
  `,
})
export class ReservaOnline {
  private readonly reservasApi = inject(ReservasApiService);

  readonly hoy = this.formatearFecha(new Date());
  readonly franjasAlmuerzo = FRANJAS_ALMUERZO;
  readonly franjasCena = FRANJAS_CENA;
  readonly maxComensales = MAX_COMENSALES_ONLINE;

  fecha = this.hoy;
  hora = '';
  comensales = 2;
  nombre = '';
  telefono = '';
  email = '';
  nota = '';
  aceptaPrivacidad = false;

  readonly enviando = signal(false);
  readonly error = signal<string | null>(null);
  readonly enviada = signal<{ nombre: string; comensales: number; fechaTexto: string; hora: string } | null>(null);

  async enviar(): Promise<void> {
    const problema = this.validar();
    if (problema) {
      this.error.set(problema);
      return;
    }

    this.error.set(null);
    this.enviando.set(true);
    try {
      await this.reservasApi.crearReserva({
        nombre: this.nombre.trim(),
        telefono: this.telefono.trim(),
        email: this.email.trim(),
        fecha: this.fecha,
        hora: this.hora,
        comensales: Number(this.comensales),
        nota: this.nota.trim(),
        estado: 'Pendiente',
        origen: 'web',
      });
      this.enviada.set({
        nombre: this.nombre.trim(),
        comensales: Number(this.comensales),
        fechaTexto: new Date(`${this.fecha}T00:00:00`).toLocaleDateString('es-ES', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        }),
        hora: this.hora,
      });
    } catch (err) {
      console.error('Error al crear la reserva online:', err);
      this.error.set('No hemos podido registrar la reserva. Inténtalo de nuevo o llámanos por teléfono.');
    } finally {
      this.enviando.set(false);
    }
  }

  nuevaReserva(): void {
    this.enviada.set(null);
    this.hora = '';
    this.nota = '';
    this.aceptaPrivacidad = false;
  }

  private validar(): string | null {
    if (!this.fecha || this.fecha < this.hoy) return 'Elige una fecha a partir de hoy.';
    if (!this.hora) return 'Elige una hora de almuerzo o de cena.';
    if (this.fecha === this.hoy) {
      const ahora = new Date();
      const [h, m] = this.hora.split(':').map(Number);
      if (h * 60 + m <= ahora.getHours() * 60 + ahora.getMinutes()) {
        return 'Esa hora ya ha pasado. Elige una hora posterior.';
      }
    }
    const n = Number(this.comensales);
    if (!Number.isInteger(n) || n < 1) return 'Indica cuántos comensales vais a venir.';
    if (n > MAX_COMENSALES_ONLINE) return `Para más de ${MAX_COMENSALES_ONLINE} personas, llámanos por teléfono.`;
    if (!this.nombre.trim()) return 'Indica tu nombre.';
    if (!/^[+\d][\d\s-]{6,}$/.test(this.telefono.trim())) return 'Indica un teléfono de contacto válido.';
    if (this.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.email.trim())) return 'El correo no es válido.';
    if (!this.aceptaPrivacidad) return 'Debes aceptar el tratamiento de datos para gestionar la reserva.';
    return null;
  }

  private formatearFecha(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
