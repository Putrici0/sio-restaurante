import jsPDF from 'jspdf';

export interface LineaTicket {
  descripcion: string;
  cantidad: number;
  importe: number;
}

export interface DatosTicket {
  /** Identificador de la cuenta (se usa para el número de factura simplificada). */
  cuentaId: string;
  mesa: string;
  comensales?: number | null;
  fechaApertura?: string | null;
  fechaPago: string;
  metodoPago: 'EFECTIVO' | 'TARJETA' | string;
  lineas: LineaTicket[];
  total: number;
  entregado?: number | null;
  atendidoPor?: string | null;
}

/** IGIC general aplicado a la restauración en Canarias (precios con impuesto incluido). */
const IGIC = 0.07;
const ANCHO = 80; // mm, papel de impresora térmica

/** Agrupa órdenes (una por unidad) en líneas de ticket: "3 x Buffet libre · cena". */
export function agruparLineas(ordenes: Array<{ nombre: string; precio: number }>): LineaTicket[] {
  const mapa = new Map<string, LineaTicket>();
  for (const o of ordenes) {
    const clave = `${o.nombre}|${o.precio}`;
    const linea = mapa.get(clave) ?? { descripcion: o.nombre, cantidad: 0, importe: 0 };
    linea.cantidad += 1;
    linea.importe = Number((linea.importe + Number(o.precio)).toFixed(2));
    mapa.set(clave, linea);
  }
  // Primero los cubiertos del buffet, después bebidas y el resto
  return [...mapa.values()].sort((a, b) => Number(b.descripcion.startsWith('Buffet')) - Number(a.descripcion.startsWith('Buffet')));
}

/** Separa lo que se cobra (buffet por comensal y bebidas) de los platos incluidos en el buffet. */
export function separarIncluidos(lineas: LineaTicket[]): { cobrables: LineaTicket[]; platosIncluidos: number } {
  return {
    cobrables: lineas.filter((l) => l.importe > 0),
    platosIncluidos: lineas.filter((l) => l.importe === 0).reduce((a, l) => a + l.cantidad, 0),
  };
}

export function numeroFactura(cuentaId: string, fechaPago: string): string {
  const fecha = new Date(fechaPago);
  let hash = 0;
  for (const c of cuentaId) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
  return `FS${fecha.getFullYear()}-${String(hash % 1000000).padStart(6, '0')}`;
}

/** Factura simplificada del Restaurante Sakura Hanami en formato ticket (80 mm). */
export function generarTicketPdf(d: DatosTicket): jsPDF {
  const { cobrables, platosIncluidos } = separarIncluidos(d.lineas);
  const lineasDetalle = cobrables.length + (platosIncluidos > 0 ? 1 : 0);
  const alto = 150 + lineasDetalle * 5 + (d.entregado ? 10 : 0);
  const pdf = new jsPDF({ unit: 'mm', format: [ANCHO, alto] });
  const izq = 5;
  const der = ANCHO - 5;
  const centro = ANCHO / 2;
  let y = 9;

  const texto = (t: string, x: number, opciones?: { negrita?: boolean; tam?: number; alinear?: 'left' | 'center' | 'right' }) => {
    pdf.setFont('courier', opciones?.negrita ? 'bold' : 'normal');
    pdf.setFontSize(opciones?.tam ?? 8);
    pdf.text(t, x, y, { align: opciones?.alinear ?? 'left' });
  };
  const salto = (mm = 4) => (y += mm);
  const separador = (estilo: 'simple' | 'doble' = 'simple') => {
    pdf.setFont('courier', 'normal');
    pdf.setFontSize(8);
    pdf.text((estilo === 'doble' ? '=' : '-').repeat(40), centro, y, { align: 'center' });
    salto(4);
  };
  const euros = (v: number) => `${v.toFixed(2).replace('.', ',')} EUR`;
  const fechaHora = (iso: string) => {
    const f = new Date(iso);
    return `${f.toLocaleDateString('es-ES')} ${f.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}`;
  };

  // --- Cabecera
  texto('SAKURA HANAMI', centro, { negrita: true, tam: 13, alinear: 'center' });
  salto(5);
  texto('Buffet libre japones', centro, { tam: 8, alinear: 'center' });
  salto(4);
  texto('SUSHI GARDEN S.L.U.', centro, { tam: 7, alinear: 'center' });
  salto(3.5);
  texto('C/ Pilarillo Seco, 10 - San Telmo', centro, { tam: 7, alinear: 'center' });
  salto(3.5);
  texto('35002 Las Palmas de Gran Canaria', centro, { tam: 7, alinear: 'center' });
  salto(5);
  separador('doble');

  texto('FACTURA SIMPLIFICADA', centro, { negrita: true, tam: 9, alinear: 'center' });
  salto(5);
  texto(`N.: ${numeroFactura(d.cuentaId, d.fechaPago)}`, izq);
  salto();
  texto(`Fecha: ${fechaHora(d.fechaPago)}`, izq);
  salto();
  texto(`Mesa: ${d.mesa}`, izq);
  if (d.comensales) texto(`Comensales: ${d.comensales}`, der, { alinear: 'right' });
  salto();
  if (d.atendidoPor) {
    texto(`Le atendio: ${d.atendidoPor}`, izq);
    salto();
  }
  separador();

  // --- Detalle
  texto('UDS  DESCRIPCION', izq, { negrita: true });
  texto('IMPORTE', der, { negrita: true, alinear: 'right' });
  salto();
  for (const l of cobrables) {
    const descripcion = l.descripcion.length > 24 ? `${l.descripcion.slice(0, 23)}.` : l.descripcion;
    texto(`${String(l.cantidad).padStart(3)}  ${descripcion}`, izq);
    texto(l.importe.toFixed(2).replace('.', ','), der, { alinear: 'right' });
    salto();
  }
  if (platosIncluidos > 0) {
    texto(`     (${platosIncluidos} platos de buffet incl.)`, izq, { tam: 7 });
    salto();
  }
  separador();

  // --- Totales con desglose de IGIC
  const base = d.total / (1 + IGIC);
  const cuota = d.total - base;
  texto('Base imponible', izq);
  texto(euros(base), der, { alinear: 'right' });
  salto();
  texto(`IGIC ${(IGIC * 100).toFixed(0)}%`, izq);
  texto(euros(cuota), der, { alinear: 'right' });
  salto(5);
  texto('TOTAL', izq, { negrita: true, tam: 11 });
  texto(euros(d.total), der, { negrita: true, tam: 11, alinear: 'right' });
  salto(6);
  separador();

  // --- Pago
  texto(`Forma de pago: ${d.metodoPago === 'TARJETA' ? 'Tarjeta' : d.metodoPago === 'EFECTIVO' ? 'Efectivo' : d.metodoPago}`, izq);
  salto();
  if (d.entregado && d.metodoPago === 'EFECTIVO') {
    texto('Entregado', izq);
    texto(euros(d.entregado), der, { alinear: 'right' });
    salto();
    texto('Cambio', izq);
    texto(euros(Math.max(0, d.entregado - d.total)), der, { alinear: 'right' });
    salto();
  }
  if (d.metodoPago === 'TARJETA') {
    texto('Operacion aprobada - TPV', izq);
    salto();
  }
  salto(2);
  separador('doble');

  // --- Pie
  texto('IGIC incluido en los precios', centro, { tam: 7, alinear: 'center' });
  salto(4);
  texto('Gracias por su visita', centro, { negrita: true, alinear: 'center' });
  salto(4);
  texto('Arigato gozaimasu', centro, { tam: 7, alinear: 'center' });
  return pdf;
}

export function nombreArchivoTicket(d: DatosTicket): string {
  return `ticket-sakura-hanami-mesa-${d.mesa}-${numeroFactura(d.cuentaId, d.fechaPago)}.pdf`;
}
