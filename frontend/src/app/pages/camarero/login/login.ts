import { CommonModule } from '@angular/common';
import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { HttpErrorResponse } from '@angular/common/http';
import { CamareroAuthService } from '../../../services/camarero-auth.service';

/** Acceso del personal de sala (móvil del camarero). */
@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.css',
})
export class LoginCamarero {
  private readonly auth = inject(CamareroAuthService);
  private readonly router = inject(Router);

  usuario = '';
  password = '';
  readonly cargando = signal(false);
  readonly error = signal('');

  async iniciarSesion(): Promise<void> {
    if (this.cargando()) return;
    if (!this.usuario.trim() || !this.password) {
      this.error.set('Introduce tu usuario y tu contraseña.');
      return;
    }
    this.error.set('');
    this.cargando.set(true);
    try {
      await this.auth.iniciarSesion(this.usuario.trim(), this.password);
      await this.router.navigate(['/camarero/mesas']);
    } catch (e) {
      if (e instanceof HttpErrorResponse && e.status === 401) {
        this.error.set('Usuario o contraseña incorrectos.');
      } else if (e instanceof Error && e.message === 'NO_CAMARERO') {
        this.error.set('Esta cuenta no pertenece al personal de sala.');
      } else {
        this.error.set('No se ha podido conectar con el servidor.');
      }
    } finally {
      this.cargando.set(false);
    }
  }
}
