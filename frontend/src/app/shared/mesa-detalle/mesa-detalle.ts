import { CommonModule, DatePipe } from '@angular/common';
import { Component, EventEmitter, Input, OnChanges, Output, SimpleChanges } from '@angular/core';
import { ETIQUETA_ESTADO_MESA, Mesa } from '../../models/mesa.model';

/**
 * Panel lateral de una mesa con las acciones según su estado:
 * libre → abrir sesión · ocupada → cerrar sesión / cobrar ·
 * pendiente de cobro → cobrar / reabrir · sucia → marcar como limpia.
 */
@Component({
  selector: 'app-mesa-detalle',
  standalone: true,
  imports: [CommonModule, DatePipe],
  templateUrl: './mesa-detalle.html',
  styleUrl: './mesa-detalle.css',
})
export class MesaDetalle implements OnChanges {
  @Input({ required: true }) mesa!: Mesa;
  @Input() accionEnCurso = false;

  @Output() ocupar = new EventEmitter<string>();
  @Output() cobrar = new EventEmitter<{ mesaId: string; cuentaId: string }>();
  @Output() liberar = new EventEmitter<string>();
  @Output() cerrarSesion = new EventEmitter<string>();
  @Output() reabrirSesion = new EventEmitter<string>();
  @Output() limpiar = new EventEmitter<string>();

  readonly etiquetas = ETIQUETA_ESTADO_MESA;

  mostrarCuenta = false;
  mostrarPassword = false;

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['mesa']) {
      this.mostrarCuenta = false;
      this.mostrarPassword = false;
    }
  }

  get tieneSesion(): boolean {
    return (this.mesa.estado === 'ocupada' || this.mesa.estado === 'pendiente-cobro') && !!this.mesa.cuentaActiva;
  }

  toggleCuenta(): void {
    if (!this.tieneSesion) return;
    this.mostrarCuenta = !this.mostrarCuenta;
  }

  togglePassword(): void {
    if (!this.tieneSesion) return;
    this.mostrarPassword = !this.mostrarPassword;
  }

  solicitarCobro(): void {
    if (!this.tieneSesion || !this.mesa.cuentaActiva) return;
    this.cobrar.emit({ mesaId: this.mesa.id, cuentaId: this.mesa.cuentaActiva.id });
  }

  solicitarLiberacion(): void {
    if (!this.tieneSesion || this.accionEnCurso) return;
    this.liberar.emit(this.mesa.id);
  }

  tituloMesa(): string {
    const grupoMesaIds = this.grupoMesaIds();
    return grupoMesaIds.length <= 1
      ? `MESA ${this.mesa.id}`
      : grupoMesaIds.map((id) => `M${id}`).join(' + ');
  }

  subtituloMesa(): string {
    const grupoMesaIds = this.grupoMesaIds();
    return grupoMesaIds.length <= 1 ? 'Mesa seleccionada' : 'Grupo de mesas seleccionado';
  }

  private grupoMesaIds(): string[] {
    return (this.mesa.grupoMesaIds?.length ? this.mesa.grupoMesaIds : [this.mesa.id]).slice();
  }
}
