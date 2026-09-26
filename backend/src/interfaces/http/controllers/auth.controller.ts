import { Router } from 'express';
import type { Container } from '../../../container';
import { requireAuth } from '../middlewares/require-auth';
import { validateBody } from '../middlewares/validate';
import { presentUser, presentWalletSummary } from '../presenters/user.presenter';
import { loginSchema, registerSchema } from '../schemas';

export function authRouter(container: Container): Router {
  const router = Router();
  const { registerUser, loginUser, getMe } = container.useCases;

  router.post('/auth/register', validateBody(registerSchema), async (req, res, next) => {
    try {
      const { token, user } = await registerUser.execute(req.body);
      res.status(201).json({ token, user: presentUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/login', validateBody(loginSchema), async (req, res, next) => {
    try {
      const { token, user } = await loginUser.execute(req.body);
      res.json({ token, user: presentUser(user) });
    } catch (err) {
      next(err);
    }
  });

  router.get('/me', requireAuth(container.tokens), async (req, res, next) => {
    try {
      const { user, wallet } = await getMe.execute(req.userId!);
      res.json({ user: presentUser(user), wallet: presentWalletSummary(wallet) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
