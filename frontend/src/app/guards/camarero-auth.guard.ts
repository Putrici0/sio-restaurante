import { CanActivateFn, Router } from '@angular/router';
import { inject } from '@angular/core';
import { CamareroAuthService } from '../services/camarero-auth.service';

/** Solo el personal de sala con sesión iniciada accede a la vista móvil del camarero. */
export const camareroAuthGuard: CanActivateFn = () => {
  const authService = inject(CamareroAuthService);
  const router = inject(Router);
  return authService.estaAutenticado() ? true : router.createUrlTree(['/camarero/login']);
};
