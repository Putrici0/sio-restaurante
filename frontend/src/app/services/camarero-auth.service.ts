import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

export type RolPersonal = 'Camarero' | 'Cocinero' | 'Gerente';

export interface SesionPersonal {
  id: string;
  usuario: string;
  nombre: string;
  rol: RolPersonal;
}

export interface CamareroPerfilActual {
  uid: string | null;
  nombreCompleto: string;
  correo: string | null;
}

const CLAVE_SESION = 'sio-restaurante.sesion';

/**
 * Sesión del personal de sala. El login se valida contra el backend (usuarios del JSON de datos)
 * y la sesión se guarda en sessionStorage mientras la pestaña esté abierta.
 */
@Injectable({ providedIn: 'root' })
export class CamareroAuthService {
  private readonly http = inject(HttpClient);
  private readonly router = inject(Router);
  private readonly apiUrl = `http://${window.location.hostname}:7070`;

  async iniciarSesion(usuario: string, password: string): Promise<SesionPersonal> {
    const sesion = await firstValueFrom(
      this.http.post<SesionPersonal>(`${this.apiUrl}/auth/login`, { usuario, password }),
    );
    // El gerente y el encargado también pueden usar la vista de sala
    if (sesion.rol !== 'Camarero' && sesion.rol !== 'Gerente') {
      throw new Error('NO_CAMARERO');
    }
    sessionStorage.setItem(CLAVE_SESION, JSON.stringify(sesion));
    return sesion;
  }

  sesionActual(): SesionPersonal | null {
    try {
      const raw = sessionStorage.getItem(CLAVE_SESION);
      return raw ? (JSON.parse(raw) as SesionPersonal) : null;
    } catch {
      return null;
    }
  }

  estaAutenticado(): boolean {
    return this.sesionActual() !== null;
  }

  async obtenerPerfilCamareroActual(): Promise<CamareroPerfilActual> {
    const sesion = this.sesionActual();
    return {
      uid: sesion?.id ?? null,
      nombreCompleto: sesion?.nombre ?? 'Camarero',
      correo: sesion?.usuario ?? null,
    };
  }

  async cerrarSesion(): Promise<void> {
    sessionStorage.removeItem(CLAVE_SESION);
    await this.router.navigate(['/camarero/login']);
  }
}
