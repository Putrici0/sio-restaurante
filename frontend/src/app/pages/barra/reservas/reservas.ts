import { CommonModule } from '@angular/common';
import { Component, EventEmitter, Output, signal, inject, OnInit, OnDestroy, computed } from '@angular/core';
import { ReservasApiService } from '../../../services/reservas-api.service';
import { EstadoReserva, Reserva } from '../../../models/reserva.model';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-reservas',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './reservas.html',
  styleUrl: './reservas.css',
})
export class Reservas implements OnInit, OnDestroy {
  private readonly reservasApi = inject(ReservasApiService);
  private subscription: Subscription | null = null;

  @Output() cerrar = new EventEmitter<void>();

  private getLocalHoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  readonly vistaActual = signal<'lista' | 'crear'>('lista');
  readonly fechaSeleccionada = signal<string>(this.getLocalHoy());
  readonly mesCalendario = signal<number>(new Date().getMonth());
  readonly anioCalendario = signal<number>(new Date().getFullYear());

  private readonly todasLasReservas = signal<Reserva[]>([]);

  readonly reservasFiltradas = computed(() => {
    return this.todasLasReservas()
      .filter((r) => r.fecha === this.fechaSeleccionada())
      .sort((a, b) => a.hora.localeCompare(b.hora));
  });

  readonly nombreMesActual = computed(() => {
    return new Intl.DateTimeFormat('es-ES', { month: 'long' }).format(
      new Date(this.anioCalendario(), this.mesCalendario()),
    );
  });

  readonly nuevoNombre = signal('');
  readonly nuevoTelefono = signal('');
  readonly nuevoEmail = signal('');
  readonly nuevaNota = signal('');
  readonly nuevaFecha = signal(this.getLocalHoy());
  readonly nuevaHora = signal(this.getHoraActualRedondeada());
  readonly nuevosComensales = signal(4);

  readonly reservaAEditar = signal<Reserva | null>(null);
  readonly errorReserva = signal<string | null>(null);
  readonly mostrarConfirmarBorrado = signal(false);
  readonly reservaIdBorrar = signal<string | null>(null);

  /** Resumen del dia para planificar la ocupacion (comensales confirmados y pendientes). */
  readonly resumenDia = computed(() => {
    const activas = this.reservasFiltradas().filter((r) => r.estado === 'Confirmado' || r.estado === 'Pendiente');
    return {
      reservas: activas.length,
      comensales: activas.reduce((acc, r) => acc + (r.comensales || 0), 0),
      pendientes: activas.filter((r) => r.estado === 'Pendiente').length,
    };
  });

  ngOnInit(): void {
    this.subscription = this.reservasApi.obtenerReservas().subscribe((reservas) => {
      this.todasLasReservas.set(reservas);
    });
  }

  ngOnDestroy(): void {
    this.subscription?.unsubscribe();
  }

  private getHoraActualRedondeada(): string {
    const ahora = new Date();
    ahora.setMinutes(Math.ceil(ahora.getMinutes() / 15) * 15);
    const h = String(ahora.getHours()).padStart(2, '0');
    const m = String(ahora.getMinutes() % 60).padStart(2, '0');
    return `${h}:${m}`;
  }

  getAmPm(hora: string): string {
    if (!hora) return 'AM';
    const [h] = hora.split(':');
    return parseInt(h, 10) >= 12 ? 'PM' : 'AM';
  }

  cambiarVista(vista: 'lista' | 'crear'): void {
    this.vistaActual.set(vista);
    if (vista === 'crear') {
      if (!this.reservaAEditar()) {
        this.nuevaFecha.set(this.fechaSeleccionada());
      }
      this.errorReserva.set(null);
    } else {
      this.reservaAEditar.set(null);
      this.resetForm();
    }
  }

  editarReserva(reserva: Reserva): void {
    this.reservaAEditar.set(reserva);
    this.nuevoNombre.set(reserva.nombre);
    this.nuevoTelefono.set(reserva.telefono);
    this.nuevoEmail.set(reserva.email ?? '');
    this.nuevaNota.set(reserva.nota || '');
    this.nuevaFecha.set(reserva.fecha);
    this.nuevaHora.set(reserva.hora);
    this.nuevosComensales.set(reserva.comensales);
    this.cambiarVista('crear');
  }

  readonly diasCalendario = computed(() => {
    const dias = [];
    const mes = this.mesCalendario();
    const anio = this.anioCalendario();
    const primerDiaMes = new Date(anio, mes, 1).getDay();
    const ultimoDiaMes = new Date(anio, mes + 1, 0).getDate();
    const ultimoDiaMesAnterior = new Date(anio, mes, 0).getDate();

    for (let i = primerDiaMes - 1; i >= 0; i--) {
      const d = ultimoDiaMesAnterior - i;
      const m = mes === 0 ? 11 : mes - 1;
      const y = mes === 0 ? anio - 1 : anio;
      dias.push({ dia: d, esMuted: true, fecha: this.formatFecha(y, m, d), esHoy: false });
    }

    const hoy = this.getLocalHoy();
    for (let i = 1; i <= ultimoDiaMes; i++) {
      const f = this.formatFecha(anio, mes, i);
      dias.push({ dia: i, esMuted: false, fecha: f, esHoy: f === hoy });
    }

    const rest = 42 - dias.length;
    for (let i = 1; i <= rest; i++) {
      const m = mes === 11 ? 0 : mes + 1;
      const y = mes === 11 ? anio + 1 : anio;
      dias.push({ dia: i, esMuted: true, fecha: this.formatFecha(y, m, i), esHoy: false });
    }

    return dias;
  });

  private formatFecha(y: number, m: number, d: number): string {
    return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }

  cambiarMes(delta: number): void {
    let nuevoMes = this.mesCalendario() + delta;
    let nuevoAnio = this.anioCalendario();
    if (nuevoMes < 0) {
      nuevoMes = 11;
      nuevoAnio--;
    } else if (nuevoMes > 11) {
      nuevoMes = 0;
      nuevoAnio++;
    }
    this.mesCalendario.set(nuevoMes);
    this.anioCalendario.set(nuevoAnio);
  }

  seleccionarFecha(fecha: string): void {
    this.fechaSeleccionada.set(fecha);
    const [y, m] = fecha.split('-').map(Number);
    if (m - 1 !== this.mesCalendario() || y !== this.anioCalendario()) {
      this.mesCalendario.set(m - 1);
      this.anioCalendario.set(y);
    }
  }

  incrementarComensales(): void {
    this.nuevosComensales.update((c) => c + 1);
  }

  decrementarComensales(): void {
    if (this.nuevosComensales() > 1) this.nuevosComensales.update((c) => c - 1);
  }

  async confirmarReserva(): Promise<void> {
    const nombre = this.nuevoNombre().trim();
    const telefono = this.nuevoTelefono().trim();
    const email = this.nuevoEmail().trim();
    if (!nombre) {
      this.errorReserva.set('Indica el nombre del cliente.');
      return;
    }
    if (!telefono && !email) {
      this.errorReserva.set('Indica un teléfono o un correo de contacto.');
      return;
    }
    if (!this.nuevaFecha() || !this.nuevaHora()) {
      this.errorReserva.set('Indica la fecha y la hora de la reserva.');
      return;
    }

    const edicion = this.reservaAEditar();
    const reservaData: Omit<Reserva, 'id'> = {
      nombre,
      telefono,
      email,
      nota: this.nuevaNota(),
      fecha: this.nuevaFecha(),
      hora: this.nuevaHora(),
      comensales: this.nuevosComensales(),
      estado: edicion?.estado || 'Confirmado',
      origen: edicion?.origen ?? 'personal',
    };

    try {
      this.errorReserva.set(null);
      if (edicion?.id) {
        await this.reservasApi.actualizarReserva(edicion.id, reservaData);
      } else {
        await this.reservasApi.crearReserva(reservaData);
      }
      this.fechaSeleccionada.set(this.nuevaFecha());
      this.resetForm();
      this.cambiarVista('lista');
    } catch (error) {
      console.error('Error al guardar reserva:', error);
      this.errorReserva.set('No se ha podido guardar la reserva.');
    }
  }

  solicitarBorrarReserva(id: string): void {
    this.reservaIdBorrar.set(id);
    this.mostrarConfirmarBorrado.set(true);
  }

  async confirmarBorrado(): Promise<void> {
    const id = this.reservaIdBorrar();
    if (!id) return;

    try {
      await this.reservasApi.borrarReserva(id);
      this.mostrarConfirmarBorrado.set(false);
      this.reservaIdBorrar.set(null);
    } catch (error) {
      console.error('Error al borrar reserva:', error);
    }
  }

  async cancelarReserva(id: string): Promise<void> {
    await this.cambiarEstado(id, 'Cancelado');
  }

  /** El cliente ha llegado: la reserva se da por cumplida (el personal le abre una mesa). */
  async marcarLlegada(id: string): Promise<void> {
    await this.cambiarEstado(id, 'Finalizado');
  }

  private async cambiarEstado(id: string, estado: EstadoReserva): Promise<void> {
    try {
      await this.reservasApi.actualizarEstado(id, estado);
    } catch (error) {
      console.error('Error:', error);
    }
  }

  async confirmarEstadoReserva(id: string): Promise<void> {
    await this.cambiarEstado(id, 'Confirmado');
  }

  private resetForm(): void {
    this.nuevoNombre.set('');
    this.nuevoTelefono.set('');
    this.nuevoEmail.set('');
    this.nuevaNota.set('');
    this.nuevosComensales.set(4);
    this.errorReserva.set(null);
  }

  cerrarModal(): void {
    this.cerrar.emit();
  }
}
