import type { Request } from 'express';
import type { PaymentMethod } from '../../../domain/models';
import type { RequestContext } from '../../../domain/ports/repositories';

/**
 * Extrae lo que sólo la auditoría verá. `req.ip` es fiable porque la app hace
 * `trust proxy`, así que detrás de un reverse proxy se registra la IP del
 * invitado y no la del balanceador.
 */
export function requestContext(req: Request, method: PaymentMethod = 'LINK'): RequestContext {
  return {
    ipAddress: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
    method,
  };
}
