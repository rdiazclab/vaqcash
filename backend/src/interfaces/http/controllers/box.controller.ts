import { Router } from 'express';
import type { Container } from '../../../container';
import { requestContext } from '../middlewares/request-context';
import { validateBody } from '../middlewares/validate';
import { presentPublicBox } from '../presenters/event.presenter';
import { createContributionSchema } from '../schemas';

/** Rutas del invitado: públicas, sin auth, y sin totales jamás. */
export function boxRouter(container: Container): Router {
  const router = Router();
  const { getPublicBox, contribute } = container.useCases;

  router.get('/caja/:uuid', async (req, res, next) => {
    try {
      res.json(presentPublicBox(await getPublicBox.execute(req.params.uuid)));
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/caja/:uuid/contributions',
    validateBody(createContributionSchema),
    async (req, res, next) => {
      try {
        // La IP y el user-agent viajan al caso de uso sólo para la auditoría.
        const ctx = requestContext(req, req.body.method);
        res.status(201).json(await contribute.execute(req.params.uuid, req.body, ctx));
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
