import { Routes } from '@angular/router';

import { InicioPublico } from './pages/publico/inicio';
import { CartaPublica } from './pages/publico/carta-publica';
import { ReservaOnline } from './pages/publico/reserva-online';

import { Mesas } from './pages/barra/mesas/mesas';
import { Bebidas } from './pages/barra/bebidas/bebidas';
import { PlatosComponent } from './pages/barra/platos/platos';
import { HistorialComponent } from './pages/barra/historial/historial';
import { EstadisticaComponent } from './pages/barra/estadistica/estadistica';

import { tableAccessGuard } from './guards/table-access.guard';
import { TableLogin } from './pages/cliente/table-login/table-login';
import { QrGenerator } from './pages/cliente/qr-generator/qr-generator';
import { MenuPage } from './pages/cliente/menu-page/menu-page';
import { BillPage } from './pages/cliente/bill-page/bill-page';

import { TableroPedidos } from './pages/cocina/tablero-pedidos';
import { NotificacionesCamarero } from './pages/notificaciones-camarero/notificaciones-camarero';
import {MesasCamarero} from './pages/camarero/mesas/mesas';
import {PlatosCamarero} from './pages/camarero/platos/platos';
import {BebidasCamarero} from './pages/camarero/bebidas/bebidas';
import {PedidoCamarero} from './pages/camarero/pedido/pedido';
import {MenuCamarero} from './pages/camarero/menu/menu';
import { LoginCamarero } from './pages/camarero/login/login';
import { RegistroCamarero } from './pages/camarero/registro/registro';
import { camareroAuthGuard } from './guards/camarero-auth.guard';

export const routes: Routes = [
  // Web pública del restaurante (sin login): portada, carta y reservas online
  { path: '', component: InicioPublico, pathMatch: 'full', title: 'Sakura Hanami · Buffet japonés' },
  { path: 'carta', component: CartaPublica, title: 'Carta · Sakura Hanami' },
  { path: 'reservar', component: ReservaOnline, title: 'Reservas · Sakura Hanami' },

  // Gerencia / encargado de sala

  { path: 'mesas', component: Mesas },
  { path: 'bebidas', component: Bebidas },
  { path: 'platos', component: PlatosComponent },
  { path: 'historial', component: HistorialComponent },
  { path: 'estadistica', component: EstadisticaComponent },

  // Cliente en mesa (QR)
  { path: 'acceso/:id', component: TableLogin },
  { path: 'admin/generar-qr', component: QrGenerator },
  { path: 'menu/:id', component: MenuPage, canActivate: [tableAccessGuard] },
  { path: 'cuenta/:id', component: BillPage, canActivate: [tableAccessGuard] },

  // Cocina
  { path: 'cocina', component: TableroPedidos },

  // Camareros
  { path: 'camarero', redirectTo: 'camarero/mesas', pathMatch: 'full' },
  { path: 'camarero/login', component: LoginCamarero },
  { path: 'camarero/registro', component: RegistroCamarero },
  { path: 'camarero/notificaciones', component: NotificacionesCamarero, canActivate: [camareroAuthGuard] },
  { path: 'camarero/mesas', component: MesasCamarero, canActivate: [camareroAuthGuard] },
  { path: 'camarero/platos', component: PlatosCamarero, canActivate: [camareroAuthGuard] },
  { path: 'camarero/bebidas', component: BebidasCamarero, canActivate: [camareroAuthGuard] },
  { path: 'camarero/cuenta/:id', component: PedidoCamarero, canActivate: [camareroAuthGuard] },
  { path: 'camarero/menu/:id', component: MenuCamarero, canActivate: [camareroAuthGuard] },

  { path: '**', redirectTo: '' },
];
