import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Navbar } from '../../../shared/navbar/navbar';
import { CATEGORIAS_CARTA, CategoriaPlato, ETIQUETA_CATEGORIA, PlatoApi } from '../../../models/plato.model';

interface Borrador {
  id: string | null;
  nombre: string;
  categoria: CategoriaPlato;
  descripcion: string;
  precio: number;
  estaActivo: boolean;
  imagen: string;
}

/** Configuración de productos y precios de la carta (perfil Gerente). */
@Component({
  selector: 'app-carta-gestion',
  standalone: true,
  imports: [CommonModule, FormsModule, Navbar],
  templateUrl: './carta-gestion.html',
  styleUrl: './carta-gestion.css',
})
export class CartaGestion implements OnInit {
  private readonly http = inject(HttpClient);
  private readonly apiUrl = `http://${window.location.hostname}:7070/platos`;

  readonly categorias = CATEGORIAS_CARTA;
  readonly etiquetas = ETIQUETA_CATEGORIA;
  readonly platos = signal<PlatoApi[]>([]);
  readonly filtro = signal<CategoriaPlato | 'Todos'>('Todos');
  readonly borrador = signal<Borrador | null>(null);
  readonly error = signal<string | null>(null);
  readonly guardando = signal(false);

  readonly visibles = computed(() => {
    const f = this.filtro();
    return this.platos()
      .filter((p) => f === 'Todos' || p.categoria === f)
      .sort((a, b) =>
        this.categorias.indexOf(a.categoria) - this.categorias.indexOf(b.categoria) || a.nombre.localeCompare(b.nombre),
      );
  });

  ngOnInit(): void {
    this.cargar();
  }

  cargar(): void {
    this.http.get<PlatoApi[]>(this.apiUrl).subscribe({
      next: (p) => this.platos.set(p),
      error: () => this.error.set('No se ha podido cargar la carta.'),
    });
  }

  nuevo(): void {
    this.borrador.set({ id: null, nombre: '', categoria: 'Principal', descripcion: '', precio: 0, estaActivo: true, imagen: '' });
  }

  editar(p: PlatoApi): void {
    this.borrador.set({ ...p, id: p.id, precio: Number(p.precio) });
  }

  alternarActivo(p: PlatoApi): void {
    this.guardar({ ...p, id: p.id, precio: Number(p.precio), estaActivo: !p.estaActivo }, false);
  }

  guardarBorrador(): void {
    const b = this.borrador();
    if (!b) return;
    if (!b.nombre.trim()) {
      this.error.set('El plato necesita un nombre.');
      return;
    }
    if (!(b.precio >= 0)) {
      this.error.set('El precio no es válido.');
      return;
    }
    this.guardar(b, true);
  }

  private guardar(b: Borrador, cerrar: boolean): void {
    this.guardando.set(true);
    this.error.set(null);
    const cuerpo = {
      nombre: b.nombre.trim(),
      categoria: b.categoria,
      descripcion: b.descripcion.trim(),
      precio: Number(b.precio).toFixed(2),
      estaActivo: b.estaActivo,
      imagen: b.imagen || '/logo.svg',
    };
    const peticion = b.id ? this.http.put(`${this.apiUrl}/${b.id}`, cuerpo) : this.http.post(this.apiUrl, cuerpo);
    peticion.subscribe({
      next: () => {
        this.guardando.set(false);
        if (cerrar) this.borrador.set(null);
        this.cargar();
      },
      error: (err) => {
        this.guardando.set(false);
        this.error.set(err?.error?.message ?? 'No se ha podido guardar el plato.');
      },
    });
  }
}
