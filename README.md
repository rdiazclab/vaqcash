# VaqCash

Aportes en grupo con revelación diferida. En Colombia, "hacer una vaca" es juntar
plata entre varios para un regalo, un viaje o una fiesta: cada uno pone lo que
puede y alguien recoge. VaqCash (vaca + cash) digitaliza exactamente eso y le
agrega la lluvia de sobres: cada aporte entra en un sobre cerrado, nadie ve los
montos mientras la cajita está sellada, y el total aparece de golpe cuando el
organizador abre el cofre.

Monorepo: `backend/` (Express + Prisma + Postgres) y `frontend/` (React + Vite).
Moneda por defecto **COP** (se elige al crear la cajita y es inmutable después).
La pasarela de pagos es **simulada**: no se mueve dinero real, ni en los aportes
ni en los retiros de la wallet.

## Cómo funciona, en cuatro pasos

1. El organizador se registra y crea una **cajita** (título, moneda, fecha de
   revelación opcional).
2. Comparte el link público `/caja/:uuid` o el QR, que el backend genera a partir
   de `PUBLIC_WEB_URL`.
3. Los invitados aportan sin cuenta. Cada aporte es un **sobre**, con nombre o
   anónimo, y el aportante recibe un recibo con su propio monto.
4. El organizador **revela**. Ahí aparecen el total y los sobres uno por uno, y el
   dinero se acredita en su **wallet**, desde donde puede registrar retiros.

### La regla de oro

El ocultamiento es **server-side**. Mientras la cajita está sellada el backend no
serializa montos: `totalCents` viaja como `null` y los sobres van sin
`amountCents` y sin `isAnonymous`, así que son indistinguibles entre sí. Un
organizador impaciente con DevTools no encuentra nada que espiar, porque el número
nunca cruzó la red. La regla vive en un único presenter,
`backend/src/interfaces/http/presenters/event.presenter.ts`, y está protegida por
tests que fallan si un monto aparece en una respuesta sellada.

El anonimato funciona igual: `Contribution.displayName` vale literalmente
"Anónimo" y la identidad real solo existe en `AuditLog`, que no se expone por
ninguna ruta de la API.

## Correr en local

Necesitas Node 20 o superior y Docker.

```bash
# 1) Postgres en Docker. Puerto 5434 para no chocar con otros Postgres locales.
docker run -d --name sobres-db -p 5434:5432 \
  -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=sobres postgres:16

# 2) Backend, queda en http://localhost:4010
cd backend
cp .env.example .env
npm install
npx prisma migrate deploy
npm run dev

# 3) Frontend, queda en http://localhost:5175
cd ../frontend
cp .env.example .env
npm install
npm run dev -- --port 5175 --strictPort
```

El contenedor y las bases se llaman `sobres-db`, `sobres` y `sobres_test` por
razones históricas. Son nombres de infraestructura, no de marca, y renombrarlos
obligaría a recrear la base sin ganar nada.

### Variables de entorno del backend

Todas vienen con valor en `backend/.env.example`.

| Variable | Valor local | Para qué |
|---|---|---|
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5434/sobres?schema=public` | Conexión a Postgres |
| `PORT` | `4010` | Puerto de la API |
| `PUBLIC_WEB_URL` | `http://localhost:5175` | Base de los links y QR compartibles |
| `CORS_ORIGIN` | `http://localhost:5175` | Origen permitido del front |
| `JWT_SECRET` | valor de desarrollo | Firma de los tokens de organizador |
| `PAYMENT_LATENCY_MS` | `1200` | Latencia que simula la pasarela |
| `PAYMENT_FAILURE_RATE` | `0` | Probabilidad de rechazo, de 0 a 1. Pon `1` para ejercitar el 402 |

Si cambias los puertos, cambia `CORS_ORIGIN` y `PUBLIC_WEB_URL` en el backend y
`VITE_API_URL` en el front a la vez. El front trae mocks MSW que implementan
`docs/API.md` al pie de la letra: `VITE_USE_MOCKS=false` lo apunta a la API real.

## Pruebas

```bash
cd backend
npm run typecheck   # tsc --noEmit
npm test            # Vitest: unitarios + integración
```

Las pruebas de integración necesitan el contenedor `sobres-db` arriba: el setup
global crea la base aislada `sobres_test` y le corre las migraciones. Nunca tocan
la base de desarrollo.

```bash
cd frontend
npm run typecheck
npm run test:e2e    # Playwright en Chromium
```

El test que más importa es el guarda antifuga de
`backend/tests/event.presenter.test.ts`: serializa la vista sellada y falla si
aparece cualquier monto. Está verificado por mutación, inyectar `amountCents` en
la rama sellada tumba varios tests, así que no es decorativo.

## Documentación

- [`docs/API.md`](docs/API.md): contrato de la API. Rutas, cuerpos, forma de las
  respuestas, tabla de monedas y códigos de error. Es la fuente de verdad que el
  front implementa.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md): modelo de datos, las decisiones
  que lo sostienen, estructura de carpetas y estrategia de link y QR.
- [`docs/DESIGN.md`](docs/DESIGN.md): dirección de diseño, tokens y movimiento.

## Concurrencia: por qué el total anunciado no cambia

Entre insertar el aporte y liquidar el cobro pasa la latencia de la pasarela, hasta
1,2 s. Si el organizador revelaba en esa ventana, el total se anunciaba sin ese
sobre y después cambiaba solo. El aporte y la revelación toman ahora el mismo lock
(`SELECT ... FOR UPDATE` sobre la fila del evento), en la reserva y en la
liquidación. Un cobro que aterriza tarde se marca `VOIDED`, cobrado pero fuera de
plazo, conserva su `paymentRef` y hay que reembolsarlo; el invitado recibe un 409
`EVENT_CLOSED_MID_PAYMENT` en vez de un recibo mentiroso. Un `VOIDED` nunca suma al
total. El pago a la wallet es exactamente-una-vez porque
`WalletTransaction.idempotencyKey` es `UNIQUE` y vale `reveal:<eventId>`.

## Despliegue

1. Sube el repo a GitHub. Vercel y Render importan desde ahí.
2. Backend y base de datos: Render, New, **Blueprint**, apuntando al repo. El
   [`render.yaml`](render.yaml) de la raíz crea el Postgres y el web service,
   cablea `DATABASE_URL` y expone el health check en `/health`. `npm start` corre
   `prisma migrate deploy` antes de arrancar.
3. Frontend: Vercel, import repo, root `frontend/`, framework Vite, env
   `VITE_API_URL=https://<servicio>.onrender.com/api`. Cierra el círculo poniendo
   en Render `CORS_ORIGIN` y `PUBLIC_WEB_URL` con el dominio final de Vercel.

## Deuda técnica consciente (YAGNI)

- Pasarela simulada, sin webhooks ni reembolsos. Los retiros de la wallet también
  son simulados: bajan el saldo y dejan el asiento, no sale dinero a ninguna parte.
- Un `VOIDED` marca que hay que reembolsar, pero nadie lo reembolsa: no hay proceso.
- La revelación programada se evalúa en lectura (`revealAt <= now`), no hay cron.
- El balance de la wallet es un caché del ledger. Si discrepan gana el ledger, pero
  no hay job que lo reconcilie.
- Plan free de Render: el primer request tras inactividad tarda unos 30 s en despertar.

## Flake conocido en la suite de backend

En corridas completas aparece de forma intermitente (aprox. 1 de cada 20) un 401 en
`POST /api/events/:id/reveal` dentro de `tests/wallet.integration.test.ts`. El
archivo aislado pasa 14/14 de forma estable. Descartado: `env.test.ts` no muta el
entorno del proceso (lanza procesos hijo), y `registerOrganizer` falla ruidosamente
si hay colisión de email, así que el token siempre nace de un registro exitoso.
Queda por revisar la interacción entre el truncado de tablas y el ciclo de vida del
cliente Prisma compartido entre archivos. No está arreglado.
