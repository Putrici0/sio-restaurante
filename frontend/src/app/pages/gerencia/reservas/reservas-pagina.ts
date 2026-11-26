import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Subscription, catchError, of, switchMap, timer } from 'rxjs';
import { toObservable } from '@angular/core/rxjs-interop';

import { Navbar } from '../../../shared/navbar/navbar';
import { EstadoReserva, Reserva } from '../../../models/reserva.model';
import { Mesa } from '../../../models/mesa.model';
import { ReservasApiService } from '../../../services/reservas-api.service';
import { MesasApiService } from '../../../services/mesas-api.service';

interface Formulario {
  id: string | null;
  nombre: string;
  telefono: string;
  email: string;
  fecha: string;
  hora: string;
  comensales: number;
  nota: string;
}

/**
 * Gestión de reservas (encargado y gerencia): reservas del día, confirmación,
 * alta manual y llegada del cliente con asignación obligatoria de mesa.
 */
@Component({
  selector: 'app-reservas-pagina',
  standalone: true,
  imports: [CommonModule, FormsModule, Navbar],
  templateUrl: './reservas-pagina.html',
  styleUrl: './reservas-pagina.css',
})
export class ReservasPagina implements OnDestroy {
  private readonly reservasApi = inject(ReservasApiService);
  private readonly mesasApi = inject(MesasApiService);
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `http://${window.location.hostname}:7070/reservas`;
  private readonly subs: Subscription[] = [];

  readonly fecha = signal(this.iso(new Date()));
  readonly reservas = signal<Reserva[]>([]);
  readonly mesas = signal<Mesa[]>([]);
  readonly formulario = signal<Formulario | null>(null);
  readonly llegada = signal<Reserva | null>(null);
  readonly mesaElegida = signal<string | null>(null);
  readonly ninosLlegada = signal(0);
  readonly error = signal<string | null>(null);
  readonly guardando = signal(false);

  readonly esHoy = computed(() => this.fecha() === this.iso(new Date()));
  readonly activas = computed(() => this.reservas().filter((r) => r.estado === 'Pendiente' || r.estado === 'Confirmado'));
  readonly cerradas = computed(() => this.reservas().filter((r) => r.estado === 'Finalizado' || r.estado === 'Cancelado'));
  readonly resumen = computed(() => ({
    reservas: this.activas().length,
    comensales: this.activas().reduce((a, r) => a + r.comensales, 0),
    porConfirmar: this.activas().filter((r) => r.estado === 'Pendiente').length,
  }));
  /** Mesas libres donde caben los comensales de la reserva, de menor a mayor. */
  readonly mesasDisponibles = computed(() => {
    const r = this.llegada();
    if (!r) return [];
    return this.mesas()
      .filter((m) => m.estado === 'libre' && m.capacidad >= r.comensales)
      .sort((a, b) => a.capacidad - b.capacidad || Number(a.id) - Number(b.id));
  });

  constructor() {
    this.subs.push(
      toObservable(this.fecha)
        .pipe(switchMap((f) => this.reservasApi.obtenerReservasPorFecha(f).pipe(catchError(() => of([] as Reserva[])))))
        .subscribe((r) => this.reservas.set([...r].sort((a, b) => a.hora.localeCompare(b.hora)))),
      timer(0, 5000)
        .pipe(switchMap(() => this.mesasApi.cargarMesasParaVista().pipe(catchError(() => of(null)))))
        .subscribe((m) => m && this.mesas.set(m)),
    );
  }

  ngOnDestroy(): void {
    this.subs.forEach((s) => s.unsubscribe());
  }

  moverDia(dias: number): void {
    const d = new Date(`${this.fecha()}T12:00:00`);
    d.setDate(d.getDate() + dias);
    this.fecha.set(this.iso(d));
  }

  irAHoy(): void {
    this.fecha.set(this.iso(new Date()));
  }

  fechaLarga(): string {
    return new Date(`${this.fecha()}T12:00:00`).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
  }

  nueva(): void {
    this.error.set(null);
    this.formulario.set({ id: null, nombre: '', telefono: '', email: '', fecha: this.fecha(), hora: '21:00', comensales: 2, nota: '' });
  }

  editar(r: Reserva): void {
    this.error.set(null);
    this.formulario.set({
      id: r.id ?? null, nombre: r.nombre, telefono: r.telefono, email: r.email ?? '',
      fecha: r.fecha, hora: r.hora, comensales: r.comensales, nota: r.nota ?? '',
    });
  }

  async guardar(): Promise<void> {
    const f = this.formulario();
    if (!f) return;
    if (!f.nombre.trim() || (!f.telefono.trim() && !f.email.trim()) || !f.fecha || !f.hora || f.comensales < 1) {
      this.error.set('Completa nombre, contacto, fecha, hora y comensales.');
      return;
    }
    this.guardando.set(true);
    try {
      const datos = {
        nombre: f.nombre.trim(), telefono: f.telefono.trim(), email: f.email.trim(), fecha: f.fecha,
        hora: f.hora, comensales: Number(f.comensales), nota: f.nota.trim(),
      };
      if (f.id) {
        await this.reservasApi.actualizarReserva(f.id, datos);
      } else {
        await this.reservasApi.crearReserva({ ...datos, estado: 'Confirmado', origen: 'personal' });
      }
      this.formulario.set(null);
      this.fecha.set(f.fecha);
      this.recargar();
    } catch (e: any) {
      this.error.set(e?.error?.message ?? 'No se ha podido guardar la reserva.');
    } finally {
      this.guardando.set(false);
    }
  }

  async cambiarEstado(r: Reserva, estado: EstadoReserva): Promise<void> {
    if (!r.id) return;
    if (estado === 'Cancelado' && !confirm(`¿Cancelar la reserva de ${r.nombre}?`)) return;
    await this.reservasApi.actualizarEstado(r.id, estado);
    this.recargar();
  }

  abrirLlegada(r: Reserva): void {
    this.error.set(null);
    this.llegada.set(r);
    this.ninosLlegada.set(0);
    this.mesaElegida.set(this.mesasDisponibles()[0]?.id ?? null);
  }

  confirmarLlegada(): void {
    const r = this.llegada();
    const mesa = this.mesaElegida();
    if (!r?.id || !mesa) {
      this.error.set('Selecciona la mesa donde se sienta el cliente.');
      return;
    }
    this.guardando.set(true);
    this.http.post(`${this.apiUrl}/${r.id}/llegada`, { mesaId: mesa, ninos: this.ninosLlegada() }).subscribe({
      next: () => {
        this.guardando.set(false);
        this.llegada.set(null);
        this.recargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.error.set(err?.error?.message ?? 'No se ha podido sentar al cliente.');
      },
    });
  }

  cambiarNinos(delta: number, r: Reserva): void {
    this.ninosLlegada.update((n) => Math.max(0, Math.min(r.comensales - 1, n + delta)));
  }

  private recargar(): void {
    this.reservasApi
      .listarPorFecha(this.fecha())
      .pipe(catchError(() => of(this.reservas())))
      .subscribe((r) => this.reservas.set([...r].sort((a, b) => a.hora.localeCompare(b.hora))));
  }

  private iso(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
}
