import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { Notificacion } from '../../../models/notificacion.model';
import { CamareroAuthService } from '../../../services/camarero-auth.service';
import { NotificacionesApiService } from '../../../services/notificaciones-api.service';

/**
 * Cabecera de la app móvil del camarero: marca, avisos de "llamar al camarero"
 * (se consultan cada pocos segundos) y barra de navegación inferior.
 */
@Component({
  selector: 'app-camarero-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './camarero-header.html',
  styleUrl: './camarero-header.css',
})
export class CamareroHeader implements OnInit, OnDestroy {
  private readonly auth = inject(CamareroAuthService);
  private readonly notificacionesApi = inject(NotificacionesApiService);
  private sub?: Subscription;
  private idsConocidos = new Set<string>();

  readonly nombre = this.auth.sesionActual()?.nombre ?? 'Sala';
  readonly avisos = signal<Notificacion[]>([]);
  readonly panelAbierto = signal(false);
  readonly avisoNuevo = signal(false);
  readonly atendiendoId = signal<string | null>(null);

  ngOnInit(): void {
    this.sub = timer(0, 5000)
      .pipe(switchMap(() => this.notificacionesApi.pendientes().pipe(catchError(() => of(this.avisos())))))
      .subscribe((avisos) => {
        const nuevos = avisos.some((a) => !this.idsConocidos.has(a.id));
        if (nuevos && this.idsConocidos.size > 0) {
          this.avisoNuevo.set(true);
          navigator.vibrate?.(200);
        }
        this.idsConocidos = new Set(avisos.map((a) => a.id));
        this.avisos.set(avisos);
      });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  togglePanel(): void {
    this.panelAbierto.update((v) => !v);
    this.avisoNuevo.set(false);
  }

  mesasTexto(n: Notificacion): string {
    return n.mesaIds.length > 1 ? `Mesas ${n.mesaIds.join(' + ')}` : `Mesa ${n.mesaIds[0] ?? '?'}`;
  }

  haceCuanto(n: Notificacion): string {
    const min = Math.max(0, Math.floor((Date.now() - new Date(n.fecha).getTime()) / 60000));
    return min < 1 ? 'ahora mismo' : `hace ${min} min`;
  }

  atender(n: Notificacion): void {
    this.atendiendoId.set(n.id);
    this.notificacionesApi.marcarAtendida(n.id).subscribe({
      next: () => {
        this.avisos.update((lista) => lista.filter((a) => a.id !== n.id));
        this.atendiendoId.set(null);
      },
      error: () => this.atendiendoId.set(null),
    });
  }

  salir(): void {
    void this.auth.cerrarSesion();
  }
}
