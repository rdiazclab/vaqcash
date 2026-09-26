import { Router } from 'express';
import type { Container } from '../../../container';
import { requireAuth } from '../middlewares/require-auth';
import { requestContext } from '../middlewares/request-context';
import { validateBody } from '../middlewares/validate';
import { presentDashboard, presentEventSummary } from '../presenters/event.presenter';
import { createEventSchema } from '../schemas';

/** Rutas del organizador. Todas exigen Bearer; la propiedad la comprueba el caso de uso. */
export function eventRouter(container: Container): Router {
  const router = Router();
  const auth = requireAuth(container.tokens);
  const { createEvent, listEvents, getDashboard, revealAndSettle, getEventQr } = container.useCases;

  router.post('/events', auth, validateBody(createEventSchema), async (req, res, next) => {
    try {
      const { event, shareUrl, qrDataUrl } = await createEvent.execute({
        userId: req.userId!,
        ...req.body,
      });
      const data = await getDashboard.forEvent(event, req.userId!, null);
      res.status(201).json({
        event: presentDashboard(data, container.publicWebUrl),
        shareUrl,
        qrDataUrl,
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/events', auth, async (req, res, next) => {
    try {
      const list = await listEvents.execute(req.userId!);
      res.json(list.map(presentEventSummary));
    } catch (err) {
      next(err);
    }
  });

  router.get('/events/:id/dashboard', auth, async (req, res, next) => {
    try {
      const data = await getDashboard.execute(req.params.id, req.userId!);
      res.json(presentDashboard(data, container.publicWebUrl));
    } catch (err) {
      next(err);
    }
  });

  router.get('/events/:id/qr', auth, async (req, res, next) => {
    try {
      res.json(await getEventQr.execute(req.params.id, req.userId!));
    } catch (err) {
      next(err);
    }
  });

  router.post('/events/:id/reveal', auth, async (req, res, next) => {
    try {
      const ctx = requestContext(req);
      const { event, walletCredit } = await revealAndSettle.execute(req.params.id, req.userId!, ctx);
      const data = await getDashboard.forEvent(event, req.userId!, walletCredit);
      res.json(presentDashboard(data, container.publicWebUrl));
    } catch (err) {
      next(err);
    }
  });

  return router;
}
