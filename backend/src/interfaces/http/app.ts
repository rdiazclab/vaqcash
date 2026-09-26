import cors from 'cors';
import express from 'express';
import { buildContainer, type Container } from '../../container';
import { env } from '../../config/env';
import { authRouter } from './controllers/auth.controller';
import { boxRouter } from './controllers/box.controller';
import { eventRouter } from './controllers/event.controller';
import { walletRouter } from './controllers/wallet.controller';
import { errorHandler } from './middlewares/error-handler';

export function createApp(container: Container = buildContainer()) {
  const app = express();
  // Sin esto, `req.ip` detrás de un proxy sería la IP del balanceador y la
  // auditoría guardaría siempre la misma dirección.
  app.set('trust proxy', 1);
  app.use(cors({ origin: env.corsOrigin === '*' ? true : env.corsOrigin.split(',') }));
  app.use(express.json());

  app.get('/health', (_req, res) => res.json({ ok: true }));
  app.use('/api', authRouter(container));
  app.use('/api', walletRouter(container));
  app.use('/api', eventRouter(container));
  app.use('/api', boxRouter(container));
  app.use(errorHandler);

  return app;
}
