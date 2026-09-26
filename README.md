# VaqCash

**En vivo:** <https://vaqcash-web.onrender.com> · API en <https://vaqcash-api.onrender.com>

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

## Capturas

La app está diseñada primero para el teléfono: el invitado que aporta llega casi
siempre desde un QR pegado en una mesa o un link por WhatsApp. Las capturas salen
de `frontend/e2e/screenshots.spec.ts`, el mismo test que verifica que el checkout
cabe sin scroll en una pantalla de 360x640.

### La cajita sellada y la cajita abierta

El contraste que sostiene el producto. Mientras está sellada no hay un solo monto
en pantalla, ni un solo píxel de carmín; al abrirla aparecen el total, cada sobre
y el saldo acreditado en la wallet.

| Sellada | Revelada |
|---|---|
| <img src="docs/screenshots/mobile-dashboard-sealed.png" width="320" alt="Cajita sellada: el total aparece como tres interrogantes y los cinco sobres se ven idénticos, sin nombre ni monto"> | <img src="docs/screenshots/mobile-dashboard-revealed.png" width="320" alt="Cajita revelada: total de 400.000, tres sobres abiertos con nombre, monto y mensaje"> |

Los interrogantes no son un truco de CSS. El backend no serializa los montos
mientras la cajita está sellada, así que el número nunca cruza la red.

### El aporte del invitado

Sin cuenta, sin descargar nada: se abre el link, se pone el monto y se paga.

| Aporte | Recibo | Crear cajita |
|---|---|---|
| <img src="docs/screenshots/mobile-checkout-monto.png" width="240" alt="Formulario de aporte con montos sugeridos y casilla para aportar de forma anónima"> | <img src="docs/screenshots/small-checkout-recibo.png" width="240" alt="Recibo del aporte en una pantalla de 360x640"> | <img src="docs/screenshots/mobile-crear-cajita.png" width="240" alt="Formulario de creación de cajita con título, moneda y fecha de revelación"> |

### Wallet y acceso

| Wallet con retiro | Entrar |
|---|---|
| <img src="docs/screenshots/mobile-wallet-retiro.png" width="240" alt="Wallet con saldo y el formulario de retiro abierto"> | <img src="docs/screenshots/mobile-login.png" width="240" alt="Pantalla de entrar a VaqCash"> |

### Escritorio

<img src="docs/screenshots/desktop-wallet-retiro.png" width="720" alt="Wallet en escritorio con el formulario de retiro abierto">

Para regenerarlas, con las dependencias del front instaladas:

```bash
cd frontend
npm run screenshots   # escribe en docs/screenshots/
```

Corren contra los mocks MSW, que traen una organizadora con cajitas ya pobladas,
por eso los links de las capturas apuntan a `localhost`.

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

La app está desplegada entera en Render, los dos servicios y la base, a partir
del [`render.yaml`](render.yaml) de la raíz.

| | URL |
|---|---|
| App | <https://vaqcash-web.onrender.com> |
| API | <https://vaqcash-api.onrender.com> |
| Health check | <https://vaqcash-api.onrender.com/health> |

Para levantarlo de cero: Render, **New**, **Blueprint**, apuntando al repo. El
blueprint crea los tres recursos, cablea `DATABASE_URL` desde la base, genera
`JWT_SECRET` solo y deja escritas las URLs públicas, así que no hay que tocar
ninguna variable a mano. `npm start` corre `prisma migrate deploy` antes de
arrancar, de modo que las migraciones se aplican en cada deploy.

### Dos cosas que hacen fallar el blueprint

Ambas costaron un deploy fallido, así que quedan anotadas:

- **`sync: false` no significa "opcional"**: Render crea la variable vacía.
  `PUBLIC_WEB_URL` y `CORS_ORIGIN` pasan por `requiredInProduction` en
  `backend/src/config/env.ts`, que lanza excepción si faltan en producción, y la
  API moría antes de escuchar en el puerto. Por eso van con la URL escrita.
- **Render exporta `NODE_ENV=production` también durante el build**, y con esa
  variable `npm install` se salta las `devDependencies`. Sin ellas no existen ni
  el CLI de Prisma ni `tsc`. El build command usa `npm ci --include=dev`.

Renombrar un recurso en el blueprint no lo renombra: Render crea uno nuevo y deja
el viejo huérfano. Como el plan free admite una sola base Postgres por workspace,
hay que borrar la anterior antes de sincronizar.

### Límites del plan free

La API se duerme a los 15 minutos de inactividad y el arranque en frío tarda cerca
de un minuto. Antes de una demo conviene abrir el health check y esperar el
`{"ok":true}`. El sitio estático no se duerme: siempre es la primera llamada a la
API la que se cuelga. La base de datos free expira a los 30 días.

## Deuda técnica consciente (YAGNI)

- Pasarela simulada, sin webhooks ni reembolsos. Los retiros de la wallet también
  son simulados: bajan el saldo y dejan el asiento, no sale dinero a ninguna parte.
- Un `VOIDED` marca que hay que reembolsar, pero nadie lo reembolsa: no hay proceso.
- La revelación programada se evalúa en lectura (`revealAt <= now`), no hay cron.
- El balance de la wallet es un caché del ledger. Si discrepan gana el ledger, pero
  no hay job que lo reconcilie.

## Flake conocido en la suite de backend

En corridas completas aparece de forma intermitente (aprox. 1 de cada 20) un 401 en
`POST /api/events/:id/reveal` dentro de `tests/wallet.integration.test.ts`. El
archivo aislado pasa 14/14 de forma estable. Descartado: `env.test.ts` no muta el
entorno del proceso (lanza procesos hijo), y `registerOrganizer` falla ruidosamente
si hay colisión de email, así que el token siempre nace de un registro exitoso.
Queda por revisar la interacción entre el truncado de tablas y el ciclo de vida del
cliente Prisma compartido entre archivos. No está arreglado.
