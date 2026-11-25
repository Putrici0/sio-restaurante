import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterLink, RouterLinkActive } from '@angular/router';
import { Subscription, catchError, of, switchMap, take, timer } from 'rxjs';
import { CuentaApiService } from '../../services/cuenta-api.service';
import { NotificacionesApiService } from '../../services/notificaciones-api.service';

/**
 * Cabecera de la web del cliente en su mesa (acceso por QR): navegación
 * Carta / Mi cuenta y el botón "Llamar al camarero".
 */
@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterLinkActive],
  templateUrl: './header.html',
  styleUrls: ['./header.css'],
})
export class Header implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly cuentaApi = inject(CuentaApiService);
  private readonly notificacionesApi = inject(NotificacionesApiService);
  private sub?: Subscription;

  readonly mesaId = signal('');
  readonly cuentaId = signal<string | null>(null);
  readonly llamadaPendiente = signal(false);
  readonly enviando = signal(false);
  readonly mensaje = signal<string | null>(null);

  ngOnInit(): void {
    this.mesaId.set(this.route.snapshot.paramMap.get('id') ?? '');
    this.sub = timer(0, 6000)
      .pipe(
        switchMap(() => this.cuentaApi.obtenerCuentaActivaDeMesa(this.mesaId()).pipe(catchError(() => of(null)))),
        switchMap((cuenta) => {
          this.cuentaId.set(cuenta?.id ?? null);
          return cuenta?.id
            ? this.notificacionesApi.hayLlamadaPendiente(cuenta.id).pipe(catchError(() => of(false)))
            : of(false);
        }),
      )
      .subscribe((pendiente) => this.llamadaPendiente.set(pendiente));
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
  }

  llamarCamarero(): void {
    const cuentaId = this.cuentaId();
    if (!cuentaId || this.enviando()) return;
    this.enviando.set(true);
    this.notificacionesApi.llamarCamarero(cuentaId).pipe(take(1)).subscribe({
      next: () => {
        this.llamadaPendiente.set(true);
        this.enviando.set(false);
        this.avisar('Hemos avisado al camarero. Enseguida viene a tu mesa.');
      },
      error: () => {
        this.enviando.set(false);
        this.avisar('No se ha podido avisar al camarero. Inténtalo de nuevo.');
      },
    });
  }

  private avisar(texto: string): void {
    this.mensaje.set(texto);
    window.setTimeout(() => this.mensaje.set(null), 3500);
  }
}
