import { Router } from 'express';
import type { Container } from '../../../container';
import { requireAuth } from '../middlewares/require-auth';
import { requestContext } from '../middlewares/request-context';
import { validateBody } from '../middlewares/validate';
import { withdrawalSchema } from '../schemas';
import { presentWallet } from '../presenters/user.presenter';

export function walletRouter(container: Container): Router {
  const router = Router();

  router.get('/wallet', requireAuth(container.tokens), async (req, res, next) => {
    try {
      const { wallet, transactions } = await container.useCases.getWallet.execute(req.userId!);
      res.json(presentWallet(wallet, transactions));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/wallet/withdrawals',
    requireAuth(container.tokens),
    validateBody(withdrawalSchema),
    async (req, res, next) => {
      try {
        // Retiro simulado: baja el saldo y deja el asiento. No transfiere nada.
        const result = await container.useCases.withdrawFromWallet.execute(
          req.userId!,
          req.body.amountCents,
          requestContext(req),
        );
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
