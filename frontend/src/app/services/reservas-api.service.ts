import { Injectable } from '@angular/core';
import { from, map, Observable } from 'rxjs';
import { Reserva } from '../models/reserva.model';
import { firebaseDb } from '../firebase.config';
import {
  Timestamp,
  collection as firestoreCollection,
  addDoc as firestoreAddDoc,
  onSnapshot,
  getDocs,
  query as firestoreQuery,
  orderBy as firestoreOrderBy,
  doc as firestoreDoc,
  updateDoc as firestoreUpdateDoc,
  deleteDoc as firestoreDeleteDoc,
} from 'firebase/firestore';

@Injectable({
  providedIn: 'root',
})
export class ReservasApiService {
  private readonly collectionName = 'reservas';

  private toFechaTimestamp(fecha: string): Timestamp {
    return Timestamp.fromDate(new Date(`${fecha}T00:00:00`));
  }

  private fromFechaRaw(raw: unknown): string {
    if (typeof raw === 'string') return raw;
    if (raw && typeof raw === 'object' && 'toDate' in (raw as Record<string, unknown>)) {
      const d = (raw as Timestamp).toDate();
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }
    return '';
  }

  private normalizeReserva(docId: string, data: Record<string, unknown>): Reserva {
    const fechaTexto = (data['fechaTexto'] as string | undefined) ?? this.fromFechaRaw(data['fecha']);
    const comensales = (data['comensales'] as number | undefined) ?? (data['capacidad'] as number | undefined) ?? 0;
    return {
      ...(data as unknown as Reserva),
      id: docId,
      fecha: fechaTexto,
      comensales,
      fechaCreacion:
        (data['fechaCreacion'] as string | undefined) ??
        (data['creadoEn'] as string | undefined),
    };
  }

  obtenerReservas(): Observable<Reserva[]> {
    const ref = firestoreCollection(firebaseDb, this.collectionName);
    const q = firestoreQuery(ref, firestoreOrderBy('fecha', 'asc'));

    return new Observable<Reserva[]>((subscriber) => {
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const reservas = snapshot.docs.map((doc) => ({
            ...this.normalizeReserva(doc.id, doc.data() as Record<string, unknown>),
          })) as Reserva[];
          subscriber.next(reservas);
        },
        (error) => {
          console.error('Error en onSnapshot:', error);
          subscriber.error(error);
        },
      );
      return () => unsubscribe();
    });
  }

  obtenerReservasPorFecha(fecha: string): Observable<Reserva[]> {
    const ref = firestoreCollection(firebaseDb, this.collectionName);
    const q = firestoreQuery(ref, firestoreOrderBy('fecha', 'asc'));

    return new Observable<Reserva[]>((subscriber) => {
      const unsubscribe = onSnapshot(
        q,
        (snapshot) => {
          const reservas = snapshot.docs
            .map((doc) => ({
              ...this.normalizeReserva(doc.id, doc.data() as Record<string, unknown>),
            }) as Reserva)
            .filter((r) => r.fecha === fecha)
            .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
          subscriber.next(reservas as Reserva[]);
        },
        (error) => {
          subscriber.error(error);
        },
      );
      return () => unsubscribe();
    });
  }

  obtenerReservasPorFechaUnaVez(fecha: string): Observable<Reserva[]> {
    const ref = firestoreCollection(firebaseDb, this.collectionName);
    const q = firestoreQuery(ref, firestoreOrderBy('fecha', 'asc'));

    return from(getDocs(q)).pipe(
      map((snapshot) => {
        const reservas = snapshot.docs
          .map((doc) =>
            this.normalizeReserva(doc.id, doc.data() as Record<string, unknown>),
          )
          .filter((r) => r.fecha === fecha)
          .sort((a, b) => (a.hora || '').localeCompare(b.hora || ''));
        return reservas as Reserva[];
      }),
    );
  }

  crearReserva(reserva: Omit<Reserva, 'id'>): Promise<string> {
    const ref = firestoreCollection(firebaseDb, this.collectionName);
    const payload = {
      ...reserva,
      fecha: this.toFechaTimestamp(reserva.fecha),
      fechaTexto: reserva.fecha,
      capacidad: reserva.comensales,
      fechaCreacion: Timestamp.now(),
    };
    return firestoreAddDoc(ref, {
      ...payload,
    }).then((docRef) => docRef.id);
  }

  actualizarEstado(id: string, estado: 'Confirmado' | 'Cancelado' | 'Pendiente' | 'Finalizado'): Promise<void> {
    const ref = firestoreDoc(firebaseDb, this.collectionName, id);
    return firestoreUpdateDoc(ref, { estado });
  }

  actualizarReserva(id: string, reserva: Partial<Reserva>): Promise<void> {
    const ref = firestoreDoc(firebaseDb, this.collectionName, id);
    const updatePayload: Record<string, unknown> = { ...reserva };
    if (typeof reserva.fecha === 'string') {
      updatePayload['fecha'] = this.toFechaTimestamp(reserva.fecha);
      updatePayload['fechaTexto'] = reserva.fecha;
    }
    if (typeof reserva.comensales === 'number') {
      updatePayload['capacidad'] = reserva.comensales;
    }
    return firestoreUpdateDoc(ref, updatePayload);
  }

  borrarReserva(id: string): Promise<void> {
    const ref = firestoreDoc(firebaseDb, this.collectionName, id);
    return firestoreDeleteDoc(ref);
  }
}
