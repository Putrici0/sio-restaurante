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
  /** Cuando la cuenta se paga en varias veces: «Pago 1 de 3» (o «Pago 2» si aún no se sabe cuántos habrá). */
  pago?: { numero: number; de?: number | null } | null;
}

/** Una orden de la cuenta, con lo mínimo para repartirla en tickets por pago. */
export interface OrdenParaTicket {
  nombre: string;
  precio: number;
  pagada?: boolean;
  cancelada?: boolean;
  fechaPago?: string | null;
  metodoPago?: string | null;
}

/** Un cobro de la cuenta: lo que se pagó a la vez y con el mismo método. */
export interface PagoCuenta {
  clave: string;
  numero: number;
  fechaPago: string;
  metodoPago: string;
  total: number;
  lineas: LineaTicket[];
}

/** Clave de un cobro: mismo segundo y mismo método de pago. */
function clavePago(o: OrdenParaTicket): string {
  return `${(o.fechaPago ?? '').slice(0, 19)}|${o.metodoPago ?? ''}`;
}

/**
 * Reparte las órdenes pagadas de una cuenta en cobros (uno por pago parcial o total),
 * ordenados del primero al último.
 */
export function pagosDeCuenta(ordenes: OrdenParaTicket[]): PagoCuenta[] {
  const mapa = new Map<string, OrdenParaTicket[]>();
  for (const o of ordenes) {
    if (!o.pagada || o.cancelada || !o.fechaPago) continue;
    const clave = clavePago(o);
    mapa.set(clave, [...(mapa.get(clave) ?? []), o]);
  }
  return [...mapa.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([clave, grupo], i) => ({
      clave,
      numero: i + 1,
      fechaPago: grupo[0].fechaPago!,
      metodoPago: grupo[0].metodoPago ?? 'TARJETA',
      total: Number(grupo.reduce((acc, o) => acc + Number(o.precio), 0).toFixed(2)),
      lineas: agruparLineas(grupo),
    }));
}

/** Un ticket por cada cobro de la cuenta. */
export function ticketsPorPago(
  base: Pick<DatosTicket, 'cuentaId' | 'mesa' | 'comensales' | 'fechaApertura'>,
  ordenes: OrdenParaTicket[],
): DatosTicket[] {
  const pagos = pagosDeCuenta(ordenes);
  return pagos.map((p) => ticketDePago(base, p, pagos.length));
}

export function ticketDePago(
  base: Pick<DatosTicket, 'cuentaId' | 'mesa' | 'comensales' | 'fechaApertura'>,
  pago: PagoCuenta,
  totalPagos: number,
): DatosTicket {
  return {
    ...base,
    // Con varios pagos, los comensales solo tienen sentido en la cuenta completa
    comensales: totalPagos > 1 ? null : base.comensales ?? null,
    fechaPago: pago.fechaPago,
    metodoPago: pago.metodoPago,
    lineas: pago.lineas,
    total: pago.total,
    pago: totalPagos > 1 ? { numero: pago.numero, de: totalPagos } : null,
  };
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
  // Primero los menús por comensal, después bebidas y el resto
  return [...mapa.values()].sort((a, b) => Number(esTarifa(b.descripcion)) - Number(esTarifa(a.descripcion)));
}

/** Líneas de tarifa por comensal («Menú Sakura…», «Menú infantil…»). */
export function esTarifa(descripcion: string): boolean {
  return descripcion.startsWith('Menú') || descripcion.startsWith('Buffet');
}

/** Separa lo que se cobra (buffet por comensal y bebidas) de los platos incluidos en el buffet. */
export function separarIncluidos(lineas: LineaTicket[]): { cobrables: LineaTicket[]; platosIncluidos: number } {
  return {
    cobrables: lineas.filter((l) => l.importe > 0),
    platosIncluidos: lineas.filter((l) => l.importe === 0).reduce((a, l) => a + l.cantidad, 0),
  };
}

/** Número de factura simplificada: distinto para cada cobro (cuenta + momento del pago). */
export function numeroFactura(cuentaId: string, fechaPago: string): string {
  const fecha = new Date(fechaPago);
  let hash = 0;
  for (const c of `${cuentaId}|${fechaPago.slice(0, 19)}`) hash = (hash * 31 + c.charCodeAt(0)) >>> 0;
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
  texto('Cocina de fusion asiatica', centro, { tam: 8, alinear: 'center' });
  salto(4);
  texto('SUSHI GARDEN S.L.U.', centro, { tam: 7, alinear: 'center' });
  salto(3.5);
  texto('C/ Pilarillo Seco, 5 - San Telmo', centro, { tam: 7, alinear: 'center' });
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
  if (d.pago) texto(d.pago.de ? `Pago ${d.pago.numero} de ${d.pago.de}` : `Pago ${d.pago.numero}`, der, { alinear: 'right' });
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
    const limpia = l.descripcion.replace(/\s*·\s*/g, ' - ');
    const descripcion = limpia.length > 24 ? `${limpia.slice(0, 23)}.` : limpia;
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
  const pago = d.pago ? `-pago-${d.pago.numero}` : '';
  return `ticket-sakura-hanami-mesa-${d.mesa}-${numeroFactura(d.cuentaId, d.fechaPago)}${pago}.pdf`;
}
