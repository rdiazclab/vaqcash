import type { NextFunction, Request, Response } from 'express';
import { Unauthorized } from '../../../domain/errors';
import type { AuthTokenSigner } from '../../../domain/ports/auth-token-signer';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Resuelve el organizador a partir del Bearer. No comprueba propiedad de nada:
 * eso lo hace cada caso de uso con un WHERE por userId, para que una cajita
 * ajena responda 404 en vez de 403.
 */
export function requireAuth(tokens: AuthTokenSigner) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const header = req.header('authorization') ?? '';
    const [scheme, token] = header.split(' ');
    if (!token || scheme?.toLowerCase() !== 'bearer') {
      return next(Unauthorized('Falta el token de sesión (Authorization: Bearer)'));
    }
    const payload = tokens.verify(token);
    if (!payload) return next(Unauthorized('Token de sesión inválido o caducado'));

    req.userId = payload.userId;
    next();
  };
}
