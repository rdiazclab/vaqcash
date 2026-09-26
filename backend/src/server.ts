import { env } from './config/env';
import { createApp } from './interfaces/http/app';

createApp().listen(env.port, () => {
  console.log(`[vaqcash] API escuchando en http://localhost:${env.port}`);
});
