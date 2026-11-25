import { CommonModule } from '@angular/common';
import { Component, OnInit, OnDestroy, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Subscription, forkJoin, take, timer, of, catchError } from 'rxjs';

import { Mesa, ZonaMesa } from '../../../models/mesa.model';
import { CuentaApiService } from '../../../services/cuenta-api.service';
import { MesasApiService } from '../../../services/mesas-api.service';
import { NotificacionesApiService } from '../../../services/notificaciones-api.service';
import { CamareroAuthService } from '../../../services/camarero-auth.service';
import { CamareroHeader } from '../camarero-header/camarero-header';
import { Notificacion } from '../../../models/notificacion.model';
import { ReservasApiService } from '../../../services/reservas-api.service';
import { Reserva } from '../../../models/reserva.model';

interface ItemCobroAgrupado {
  platoId: string;
  nombre: string;
  categoria: string;
  precioUnitario: number;
  cantidad: number;
  subtotal: number;
  estados: string[];
  ordenesIds: string[];
}

@Component({
  selector: 'app-mesas-camarero',
  standalone: true,
  imports: [CommonModule, CamareroHeader],
  templateUrl: './mesas.html',
  styleUrl: './mesas.css',
})
export class MesasCamarero implements OnInit, OnDestroy {
  private readonly mesasApi = inject(MesasApiService);
  private readonly cuentaApi = inject(CuentaApiService);
  private readonly notificacionesApi = inject(NotificacionesApiService);
  private readonly camareroAuth = inject(CamareroAuthService);
  private readonly reservasApi = inject(ReservasApiService);
  private readonly router = inject(Router);

  readonly zonaActiva = signal<ZonaMesa>('interior');
  readonly mesaSeleccionada = signal<Mesa | null>(null);
  readonly mesas = signal<Mesa[]>([]);
  readonly notificacionesAtencion = signal<Notificacion[]>([]);
  readonly asignacionesActivas = signal<Notificacion[]>([]);
  readonly cargando = signal(true);
  readonly error = signal<string | null>(null);
  readonly accionMesaId = signal<string | null>(null);
  readonly accionAtencionMesaId = signal<string | null>(null);
  readonly camareroUidActual = signal<string | null>(null);

  // --- ESTADO DE COBRO ---
  readonly mostrarModalCobro = signal(false);
  readonly cuentaCobroId = signal<string | null>(null);
  readonly mesaCobroId = signal<string | null>(null);
  readonly totalCuentaCobro = signal<number | null>(null);
  readonly cargandoCobro = signal(false);
  readonly procesandoCobro = signal(false);
  readonly resumenCobro = signal<ItemCobroAgrupado[]>([]);
  readonly metodoPago = signal<'EFECTIVO' | 'TARJETA'>('EFECTIVO');
  readonly importeRecibido = signal<number | null>(null);
  readonly eliminandoOrdenId = signal<string | null>(null);
  readonly mostrarConfirmacionEliminar = signal(false);
  readonly itemPendienteEliminar = signal<ItemCobroAgrupado | null>(null);
  readonly ordenesSeleccionadas = signal<string[]>([]);
  readonly mostrarContrasenaModal = signal(false);
  readonly mostrarConfirmacionLiberar = signal(false);
  readonly mesaPendienteLiberarId = signal<string | null>(null);

  // NUEVO: Variables Modal Advertencia Ocupar
  readonly mostrarAvisoReservaModal = signal(false);
  readonly avisoReservaMinutos = signal<number>(0);
  readonly mesaPendienteOcuparId = signal<string>('');

  // NUEVO: Reservas y Reloj
  readonly reservasHoy = signal<Reserva[]>([]);
  readonly ahoraMs = signal<number>(Date.now());
  private reservasSub?: Subscription;
  private relojInterval?: any;

  private pollingSub?: Subscription;
  private readonly pollingMs = 2000;
  private readonly pollingNotificacionesMs = 8000;
  private readonly reservaLookaheadMinutes = 1;
  private readonly reservaGraceAfterMinutes = 1;
  private readonly reservaBlockBeforeMinutes = 2;
  private readonly reservaReservedSoonMinutes = 0;
  private readonly avisoPrevioReservaMinutes = 1; // demo: 1 min (real: 15)
  private readonly reservasAvisadas = new Set<string>();
  readonly avisoReservaMovil = signal<{ reservaId: string; mensaje: string } | null>(null);
  private ultimoRefrescoNotificaciones = 0;

  readonly mesasFiltradas = computed(() => {
    const activas = this.notificacionesAtencion();
    const idsMesasConAtencion = new Set<string>();
    const nowMs = this.ahoraMs();
    const reservas = this.reservasHoy().filter(r => r.estado === 'Confirmado');

    activas.forEach((n: Notificacion) => {
      if (n.enCurso && n.camareroUid && n.camareroUid !== this.camareroUidActual()) return;
      n.cuenta?.mesas?.forEach((m: any) => idsMesasConAtencion.add(m.id));
    });

    const mesasZona = this.mesas()
      .filter((mesa) => mesa.zona === this.zonaActiva())
      .sort((a, b) => this.compararMesaIds(a.id, b.id));

    // MAPEO DINÁMICO DE RESERVAS A MESAS
    const mesasLibresFisicas = mesasZona.filter(m => !m.cuentaActiva);
    const mesasOcupadasFisicas = mesasZona.filter(m => m.cuentaActiva);

    const asignacionDinamica = new Map<string, { reserva: Reserva, estado: 'reservada' | 'proximamente-reservada' | 'alerta' }>();
    const mesasYaAsignadas = new Set<string>();

    for (const res of reservas) {
      const diff = this.diffMinDesdeAhora(res.hora, nowMs);
      if (diff > this.reservaLookaheadMinutes || diff < -this.reservaGraceAfterMinutes) continue;

      let mesasAElegir: string[] | null = null;
      let esAlerta = false;

      // 1. FORZAR UNIÓN VISUAL: Si la reserva tiene mesas asignadas, las bloqueamos juntas siempre.
      if (res.mesasIds && res.mesasIds.length > 0) {
        mesasAElegir = res.mesasIds;
        // Revisar si están ocupadas por otra cuenta para lanzar alerta si falta mucho tiempo
        const estanOcupadas = res.mesasIds.some(id => mesasOcupadasFisicas.some(m => m.id === id));
        if (estanOcupadas && diff > this.reservaAlertThresholdMinutes()) {
          esAlerta = true;
        }
      } else {
        const zonaRes = res.zona?.toLowerCase() || 'interior';
        if (zonaRes !== 'cualquiera' && zonaRes !== this.zonaActiva()) continue;

        const libresCandidatas = mesasLibresFisicas.filter(m => !mesasYaAsignadas.has(m.id));
        const singleMesa = libresCandidatas
          .filter(m => m.capacidad >= res.comensales)
          .sort((a, b) => a.capacidad - b.capacidad)[0];

        if (singleMesa) {
          mesasAElegir = [singleMesa.id];
        } else {
          // ALGORITMO ALERTA: Buscar las ocupadas más antiguas
          const ocupadasCandidatas = mesasOcupadasFisicas.filter(m => !mesasYaAsignadas.has(m.id));
          ocupadasCandidatas.sort((a, b) => {
            const cA = a.cuentaActivaId || '';
            const cB = b.cuentaActivaId || '';
            return cA.localeCompare(cB);
          });
          const singleOcupada = ocupadasCandidatas.filter(m => m.capacidad >= res.comensales)[0];
          if (singleOcupada) {
            mesasAElegir = [singleOcupada.id];
            esAlerta = true;
          }
        }
      }

      if (mesasAElegir && mesasAElegir.length > 0) {
        const estadoRes = esAlerta ? 'alerta' : ((diff <= this.reservaReservedSoonMinutes) ? 'reservada' : 'proximamente-reservada');
        mesasAElegir.forEach(id => {
          mesasYaAsignadas.add(id);
          asignacionDinamica.set(id, { reserva: res, estado: estadoRes });
        });
      }
    }

    const mesasAgrupadas = new Map<string, (Mesa & { tieneAtencion: boolean, alertaReserva?: boolean })>();

    for (const mesa of mesasZona) {
      // Forzar agrupación visual si están ligadas por la misma reserva.
      const asignacionTemp = asignacionDinamica.get(mesa.id);
      const esParteDeReservaAgrupada = !!asignacionTemp &&
        (asignacionTemp.reserva.mesasIds?.length ?? 0) > 1;

      const grupoMesaIds = esParteDeReservaAgrupada
        ? this.normalizarGrupoMesaIds(asignacionTemp!.reserva.mesasIds!)
        : this.normalizarGrupoMesaIds(mesa.grupoMesaIds);

      const clave = this.claveGrupo(grupoMesaIds);
      if (mesasAgrupadas.has(clave)) continue;

      const miembros = grupoMesaIds
        .map((id) => mesasZona.find((mesaZona) => mesaZona.id === id))
        .filter((value): value is Mesa => !!value)
        .sort((a, b) => this.compararMesaIds(a.id, b.id));

      const cuentaActiva = miembros.find((item) => item.cuentaActiva)?.cuentaActiva ?? null;
      const mesaPrincipalId = miembros[0]?.id ?? mesa.id;

      let estado: 'libre' | 'ocupada' | 'reservada' | 'proximamente-reservada' = cuentaActiva ? 'ocupada' : 'libre';
      let alertaReserva = false;

      if (estado === 'libre' || estado === 'ocupada') {
        const asigId = Array.from(asignacionDinamica.keys()).find(id => grupoMesaIds.includes(id));
        if (asigId) {
          const asignacion = asignacionDinamica.get(asigId)!;
          if (estado === 'libre') {
            estado = (asignacion.estado === 'reservada') ? 'reservada' : 'proximamente-reservada';
          } else if (estado === 'ocupada' && asignacion.estado === 'alerta') {
            alertaReserva = true;
          }
        }
      }

      mesasAgrupadas.set(clave, {
        id: mesaPrincipalId,
        capacidad: miembros.reduce((acc, item) => acc + item.capacidad, 0),
        zona: mesa.zona,
        estado: estado,
        cuentaActivaId: cuentaActiva?.id ?? null,
        cuentaActiva,
        grupoMesaIds,
        mesaPrincipalId,
        tieneAtencion: grupoMesaIds.some((id) => idsMesasConAtencion.has(id)),
        alertaReserva
      });
    }

    return Array.from(mesasAgrupadas.values()).sort((a, b) =>
      this.compararMesaIds(a.id, b.id),
    );
  });

  readonly misMesasAsignadas = computed(() =>
    this.mesasFiltradas().filter((mesa) => {
      const atencion = this.obtenerAsignacionResponsableDeMesa(mesa);
      return !!atencion?.enCurso && atencion.camareroUid === this.camareroUidActual();
    }),
  );

  readonly misMesasAsignadasTexto = computed(() =>
    this.misMesasAsignadas().map((mesa) => this.etiquetaMesa(mesa)).join(', '),
  );

  readonly totalCobro = computed(() => {
    const seleccionadas = new Set(this.ordenesSeleccionadas());
    const total = this.resumenCobro().reduce((acc, item) => {
      const cantidadSeleccionada = item.ordenesIds.filter((id) => seleccionadas.has(id)).length;
      return acc + cantidadSeleccionada * item.precioUnitario;
    }, 0);
    return Number(total.toFixed(2));
  });

  readonly cambioCobro = computed(() => {
    const total = this.totalCobro();
    const recibido = this.importeRecibido();
    if (this.metodoPago() !== 'EFECTIVO' || recibido == null) return null;
    return Number((recibido - total).toFixed(2));
  });

  readonly faltaCobro = computed(() => {
    const total = this.totalCobro();
    const recibido = this.importeRecibido();
    if (this.metodoPago() !== 'EFECTIVO' || recibido == null) return null;
    if (recibido >= total) return 0;
    return Number((total - recibido).toFixed(2));
  });

  readonly puedeConfirmarCobro = computed(() => {
    const total = this.totalCobro();
    if (total <= 0 || this.procesandoCobro() || this.eliminandoOrdenId() !== null || this.mostrarConfirmacionEliminar()) {
      return false;
    }
    if (this.ordenesSeleccionadas().length === 0) return false;
    if (this.metodoPago() === 'TARJETA') return true;
    const recibido = this.importeRecibido();
    return recibido != null && recibido >= total;
  });

  constructor() {
    this.cargarPerfilCamareroActual();
    this.iniciarStreamReservasHoy();
    this.recargarMesas();
    this.iniciarPolling();
  }

  ngOnInit(): void {
    this.relojInterval = setInterval(() => {
      this.ahoraMs.set(Date.now());
    }, 1000);
  }

  ngOnDestroy(): void {
    this.pollingSub?.unsubscribe();
    this.reservasSub?.unsubscribe();
    if (this.relojInterval) clearInterval(this.relojInterval);
  }

  private iniciarStreamReservasHoy(): void {
    this.reservasSub?.unsubscribe();
    const hoy = this.getLocalHoy();
    this.reservasSub = this.reservasApi
      .obtenerReservasPorFecha(hoy)
      .pipe(catchError((err) => {
        console.warn('Error stream reservas camarero:', err);
        return of([] as Reserva[]);
      }))
      .subscribe((reservas) => {
        this.reservasHoy.set(reservas);
      });
  }

  private diffMinDesdeAhora(hora: string, nowMs = this.ahoraMs()): number {
    const now = new Date(nowMs);
    const reserva = new Date(now);
    const [h, m] = hora.split(':').map(Number);
    reserva.setHours(h || 0, m || 0, 0, 0);
    return (reserva.getTime() - nowMs) / 60000;
  }

  private getLocalHoy(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  cambiarZona(nuevaZona: ZonaMesa): void {
    this.zonaActiva.set(nuevaZona);
    this.mesaSeleccionada.set(null);
  }

  abrirMesa(mesa: Mesa): void {
    const actual = this.mesaSeleccionada();
    if (actual && this.claveGrupo(actual.grupoMesaIds) === this.claveGrupo(mesa.grupoMesaIds)) {
      this.mesaSeleccionada.set(null);
      return;
    }
    this.mesaSeleccionada.set(mesa);
  }

  cerrarModal(): void {
    this.mesaSeleccionada.set(null);
    this.mostrarContrasenaModal.set(false);
  }

  hacerPedido(mesaId: string): void {
    this.router.navigate(['/camarero/menu', mesaId]);
  }

  toggleContrasena(): void {
    this.mostrarContrasenaModal.update(v => !v);
  }

  async asignarmeAtencionMesa(mesa: Mesa): Promise<void> {
    if (this.accionAtencionMesaId()) {
      return;
    }
    if (!mesa.cuentaActiva?.id) {
      this.error.set('La mesa debe tener una cuenta activa para asignar responsable.');
      return;
    }

    this.error.set(null);
    this.accionAtencionMesaId.set(mesa.id);

    try {
      const perfil = await this.camareroAuth.obtenerPerfilCamareroActual();
      this.notificacionesApi
        .asignarResponsableMesa(mesa.cuentaActiva.id, perfil.uid, perfil.nombreCompleto)
        .pipe(take(1))
        .subscribe({
          next: () => {
            forkJoin({
              notifs: this.notificacionesApi.obtenerActivas().pipe(catchError(() => of([]))),
              asignaciones: this.notificacionesApi.obtenerAsignacionesActivas().pipe(catchError(() => of([]))),
            }).pipe(take(1)).subscribe({
              next: ({ notifs, asignaciones }) => {
                this.notificacionesAtencion.set(notifs);
                this.asignacionesActivas.set(asignaciones);
                this.accionAtencionMesaId.set(null);
              },
              error: (err) => {
                console.error('Error refrescando atenciones:', err);
                this.accionAtencionMesaId.set(null);
              },
            });
          },
          error: (err) => {
            console.error('Error asignando responsable de mesa:', err);
            this.error.set('No se ha podido asignar el responsable de esta mesa.');
            this.accionAtencionMesaId.set(null);
          },
        });
    } catch (err) {
      console.error(err);
      this.error.set('No se ha podido identificar al camarero actual.');
      this.accionAtencionMesaId.set(null);
    }
  }

  desasignarAtencionMesa(mesa: Mesa): void {
    const asignacion = this.obtenerAsignacionResponsableDeMesa(mesa);
    const cuentaId = asignacion?.cuenta?.id ?? mesa.cuentaActiva?.id ?? null;

    if (!cuentaId || this.accionAtencionMesaId()) {
      return;
    }

    this.error.set(null);
    this.accionAtencionMesaId.set(mesa.id);

    this.notificacionesApi
      .liberarResponsableMesa(cuentaId)
      .pipe(take(1))
      .subscribe({
        next: () => {
          forkJoin({
            notifs: this.notificacionesApi.obtenerActivas().pipe(catchError(() => of([]))),
            asignaciones: this.notificacionesApi.obtenerAsignacionesActivas().pipe(catchError(() => of([]))),
          }).pipe(take(1)).subscribe({
            next: ({ notifs, asignaciones }) => {
              this.notificacionesAtencion.set(notifs);
              this.asignacionesActivas.set(asignaciones);
              this.accionAtencionMesaId.set(null);
            },
            error: (err) => {
              console.error('Error refrescando atenciones:', err);
              this.accionAtencionMesaId.set(null);
            },
          });
        },
        error: (err) => {
          console.error('Error desasignando atencion:', err);
          this.error.set('No se ha podido cancelar el responsable de la mesa.');
          this.accionAtencionMesaId.set(null);
        },
      });
  }

  verCuenta(mesa: Mesa): void {
    if (!mesa.cuentaActiva) {
      this.error.set('La mesa no tiene una cuenta activa asociada.');
      return;
    }
    this.cerrarModal();
    this.router.navigate(['/camarero/cuenta', mesa.id]);
  }

  solicitarOcuparMesa(mesaId: string): void {
    const nowMs = this.ahoraMs();
    const reservas = this.reservasHoy().filter(r => r.estado === 'Confirmado');
    const mesaLogica = this.mesasFiltradas().find(m => m.id === mesaId);
    const mesasIdsGrupo = mesaLogica ? mesaLogica.grupoMesaIds : [mesaId];

    if (mesaLogica?.estado === 'reservada' || mesaLogica?.estado === 'proximamente-reservada') {
      this.ocuparMesaFinal(mesaId);
      return;
    }

    // Busca colisiones en la ventana configurada
    const conflict = reservas.find(r =>
      r.mesasIds?.some(id => mesasIdsGrupo.includes(id)) &&
      this.diffMinDesdeAhora(r.hora, nowMs) <= this.reservaLookaheadMinutes &&
      this.diffMinDesdeAhora(r.hora, nowMs) >= -this.reservaGraceAfterMinutes
    );

    if (conflict) {
      const diff = this.diffMinDesdeAhora(conflict.hora, nowMs);
      if (diff <= this.reservaBlockBeforeMinutes && diff >= -this.reservaGraceAfterMinutes) {
        this.error.set(`Mesa bloqueada por reserva de ${conflict.nombre} a las ${conflict.hora}`);
        return;
      }
      this.ocuparMesaFinal(mesaId);
    } else {
      this.ocuparMesaFinal(mesaId);
    }
  }

  confirmarOcuparConAviso(): void {
    this.mostrarAvisoReservaModal.set(false);
    this.ocuparMesaFinal(this.mesaPendienteOcuparId());
  }

  private ocuparMesaFinal(mesaId: string): void {
    this.error.set(null);
    this.accionMesaId.set(mesaId);
    this.mesasApi.ocuparMesa(mesaId).subscribe({
      next: () => {
        this.recargarMesas(mesaId);
        this.cerrarModal();
      },
      error: (err: any) => {
        console.error('Error ocupando mesa:', err);
        this.accionMesaId.set(null);
        this.error.set('Error al ocupar mesa.');
      },
    });
  }

  solicitarLiberarMesa(mesaId: string): void {
    if (!mesaId || this.accionMesaId() !== null) {
      return;
    }

    this.mesaPendienteLiberarId.set(mesaId);
    this.mostrarConfirmacionLiberar.set(true);
  }

  cancelarConfirmacionLiberar(): void {
    this.mostrarConfirmacionLiberar.set(false);
    this.mesaPendienteLiberarId.set(null);
  }

  confirmarLiberarMesa(): void {
    const mesaId = this.mesaPendienteLiberarId();
    if (!mesaId) {
      return;
    }

    this.error.set(null);
    this.accionMesaId.set(mesaId);
    this.mesasApi.liberarMesa(mesaId).subscribe({
      next: () => {
        this.mostrarConfirmacionLiberar.set(false);
        this.mesaPendienteLiberarId.set(null);
        this.recargarMesas(mesaId);
        this.cerrarModal();
      },
      error: (err: any) => {
        console.error('Error liberando mesa:', err);
        this.accionMesaId.set(null);
        this.error.set('Error al liberar mesa.');
      },
    });
  }

  private iniciarPolling(): void {
    this.pollingSub = timer(0, this.pollingMs).subscribe(() => {
      this.recargarMesas(undefined, false);
    });
  }

  private recargarMesas(mesaAReseleccionar?: string, mostrarLoading = true): void {
    if (mostrarLoading) {
      this.cargando.set(true);
    }

    const debeRefrescarNotificaciones =
      Date.now() - this.ultimoRefrescoNotificaciones >= this.pollingNotificacionesMs ||
      this.notificacionesAtencion().length === 0;

    const notifs$ = debeRefrescarNotificaciones
      ? this.notificacionesApi.obtenerActivas().pipe(take(1), catchError(err => { console.warn('Error notifs:', err); return of(this.notificacionesAtencion()); }))
      : of(this.notificacionesAtencion());

    const asignaciones$ = debeRefrescarNotificaciones
      ? this.notificacionesApi.obtenerAsignacionesActivas().pipe(take(1), catchError(err => { console.warn('Error asignaciones:', err); return of(this.asignacionesActivas()); }))
      : of(this.asignacionesActivas());

    // Mesas cada 2s; reservas por stream realtime; notificaciones cada 8s.
    forkJoin({
      notifs: notifs$,
      asignaciones: asignaciones$,
      mesas: this.mesasApi.cargarMesasParaVista().pipe(take(1)) // Sin catchError para que falle el forkJoin si no hay mesas
    }).subscribe({
      next: ({ notifs, asignaciones, mesas }: { notifs: Notificacion[], asignaciones: Notificacion[], mesas: Mesa[] }) => {
        this.error.set(null);
        this.notificacionesAtencion.set(notifs);
        this.asignacionesActivas.set(asignaciones);
        if (debeRefrescarNotificaciones) {
          this.ultimoRefrescoNotificaciones = Date.now();
        }
        this.mesas.set(mesas);
        this.cargando.set(false);
        this.accionMesaId.set(null);

        if (mesaAReseleccionar) {
          const nuevaMesa = mesas.find((m) => m.id === mesaAReseleccionar) ?? null;
          this.mesaSeleccionada.set(nuevaMesa);
        } else {
          const seleccionActual = this.mesaSeleccionada();
          if (seleccionActual) {
            const mesaRefrescada = this.buscarMesaLogicaPorId(mesas, seleccionActual.id);
            this.mesaSeleccionada.set(mesaRefrescada);
          }
        }
      },
      error: (err: any) => {
        console.error('Error cargando mesas:', err);
        this.cargando.set(false);
        this.accionMesaId.set(null);
        // Si ya teníamos mesas, no las borramos, solo avisamos
        if (this.mesas().length === 0) {
          this.error.set('No se han podido cargar las mesas. Revisa la conexión.');
        } else {
          // Opcional: mostrar un toast de "Error al actualizar"
        }
      },
    });
  }

  etiquetaMesa(mesa: Mesa): string {
    const ids = this.normalizarGrupoMesaIds(mesa.grupoMesaIds);
    if (ids.length <= 1) {
      return `M${mesa.id}`;
    }

    return ids.map((id) => `M${id}`).join(' + ');
  }

  esMesaAgrupada(mesa: Mesa): boolean {
    return this.normalizarGrupoMesaIds(mesa.grupoMesaIds).length > 1;
  }

  responsableMesaTexto(mesa: Mesa): string {
    const atencion = this.obtenerAsignacionResponsableDeMesa(mesa);
    if (!atencion) {
      return 'Sin responsable asignado';
    }
    if (!atencion.enCurso) {
      return 'Sin responsable asignado';
    }
    const nombre = atencion.camareroNombre?.trim() || 'Camarero';
    return `Responsable: ${nombre}`;
  }

  responsableMesaCorto(mesa: Mesa): string {
    const atencion = this.obtenerAsignacionResponsableDeMesa(mesa);
    if (!atencion) {
      return 'Sin responsable';
    }
    if (!atencion.enCurso) {
      return 'Sin responsable';
    }
    return atencion.camareroNombre?.trim() || 'Responsable asignado';
  }

  puedeAsignarmeMesa(mesa: Mesa): boolean {
    const atencion = this.obtenerAsignacionResponsableDeMesa(mesa);
    if (!mesa.cuentaActiva?.id || !!this.accionAtencionMesaId()) {
      return false;
    }
    return !atencion || !atencion.enCurso;
  }

  puedeDesasignarMesa(mesa: Mesa): boolean {
    const atencion = this.obtenerAsignacionResponsableDeMesa(mesa);
    const uidActual = this.camareroUidActual();
    if (!atencion || !atencion.enCurso || !!this.accionAtencionMesaId()) {
      return false;
    }
    if (!uidActual) {
      return false;
    }
    return atencion.camareroUid === uidActual;
  }

  private obtenerAtencionActivaDeMesa(mesa: Mesa): Notificacion | null {
    const idsGrupo = new Set(this.normalizarGrupoMesaIds(mesa.grupoMesaIds));
    const notificacion = this.notificacionesAtencion().find((n) => {
      if (n.tipo !== 'Atencion' || n.leida) {
        return false;
      }
      const mesasNotificacion = n.cuenta?.mesas ?? [];
      return mesasNotificacion.some((m) => idsGrupo.has(String(m.id)));
    });
    return notificacion ?? null;
  }

  private obtenerAsignacionResponsableDeMesa(mesa: Mesa): Notificacion | null {
    const idsGrupo = new Set(this.normalizarGrupoMesaIds(mesa.grupoMesaIds));
    const asignacion = this.asignacionesActivas().find((n) => {
      const mesasNotificacion = n.cuenta?.mesas ?? [];
      return mesasNotificacion.some((m) => idsGrupo.has(String(m.id)));
    });
    return asignacion ?? null;
  }

  private buscarMesaLogicaPorId(mesas: Mesa[], mesaId: string): Mesa | null {
    if (!mesaId) {
      return null;
    }

    const mesaFisica = mesas.find((mesa) => mesa.id === mesaId);
    if (!mesaFisica) {
      return null;
    }

    const grupoMesaIds = this.normalizarGrupoMesaIds(mesaFisica.grupoMesaIds);
    const miembros = grupoMesaIds
      .map((id) => mesas.find((mesa) => mesa.id === id))
      .filter((value): value is Mesa => !!value)
      .sort((a, b) => this.compararMesaIds(a.id, b.id));

    const cuentaActiva = miembros.find((item) => item.cuentaActiva)?.cuentaActiva ?? null;
    const mesaPrincipalId = miembros[0]?.id ?? mesaFisica.id;

    return {
      id: mesaPrincipalId,
      capacidad: miembros.reduce((acc, item) => acc + item.capacidad, 0),
      zona: mesaFisica.zona,
      estado: cuentaActiva ? 'ocupada' : 'libre',
      cuentaActivaId: cuentaActiva?.id ?? null,
      cuentaActiva,
      grupoMesaIds,
      mesaPrincipalId,
    };
  }

  private normalizarGrupoMesaIds(grupoMesaIds: string[]): string[] {
    return Array.from(new Set(grupoMesaIds)).sort((a, b) => this.compararMesaIds(a, b));
  }

  private claveGrupo(grupoMesaIds: string[]): string {
    return this.normalizarGrupoMesaIds(grupoMesaIds).join('|');
  }

  private compararMesaIds(left: string, right: string): number {
    return Number(left) - Number(right);
  }

  private reservaAlertThresholdMinutes(): number {
    return Math.max(this.reservaReservedSoonMinutes + 1, 1);
  }

  private evaluarAvisoReservaMovil(reservas: Reserva[]): void {
    const nowMs = this.ahoraMs();
    const candidata = reservas
      .filter((r) => r.estado === 'Confirmado')
      .map((r) => ({ r, diff: this.diffMinDesdeAhora(r.hora, nowMs) }))
      .filter(({ diff }) => diff >= 0 && diff <= this.avisoPrevioReservaMinutes)
      .sort((a, b) => a.diff - b.diff)[0];

    if (!candidata || !candidata.r.id) return;
    if (this.reservasAvisadas.has(candidata.r.id)) return;

    this.avisoReservaMovil.set({
      reservaId: candidata.r.id,
      mensaje: `Reserva en ${Math.ceil(candidata.diff)} min (${candidata.r.nombre})`,
    });
  }

  aceptarAvisoReservaMovil(): void {
    const aviso = this.avisoReservaMovil();
    if (!aviso) return;
    this.reservasAvisadas.add(aviso.reservaId);
    this.avisoReservaMovil.set(null);
  }

  private async cargarPerfilCamareroActual(): Promise<void> {
    try {
      const perfil = await this.camareroAuth.obtenerPerfilCamareroActual();
      this.camareroUidActual.set(perfil.uid);
    } catch (err) {
      console.warn('No se ha podido cargar el perfil del camarero actual.', err);
      this.camareroUidActual.set(null);
    }
  }
}
