# Contrato de API — VaqCash (v2 multi-cliente)

Base: `/api`. Auth de organizador: `Authorization: Bearer <jwt>`.
Errores: `{ error: { code, message, details? } }`.
## Dinero y moneda
Todo el dinero viaja en **enteros de la unidad menor de su moneda**. Nunca decimales.
El campo se llama `amountCents` por herencia, pero su semántica es "unidades menores".

| Moneda | Exponente | `amountCents: 150000` significa |
|---|---|---|
| **COP** (por defecto) | 0 | $ 150.000 |
| CLP | 0 | $ 150.000 |
| USD | 2 | US$ 1.500,00 |
| PEN | 2 | S/ 1.500,00 |
| MXN | 2 | $ 1.500,00 |
| ARS | 2 | $ 1.500,00 |
| EUR | 2 | € 1.500,00 |

Dividir siempre entre 100 está MAL: en COP y CLP la unidad menor es el peso entero.
Un único módulo compartido resuelve exponente y formato (`Intl.NumberFormat` con
`maximumFractionDigits` = exponente). Back y front usan la misma tabla.

La moneda **se elige al crear la cajita** y es inmutable después. Si no se envía,
el servidor asume **COP**. La wallet se abre en COP.

## Invariante que manda sobre todo lo demás
Mientras la cajita está sellada, el servidor **no serializa montos**: `totalCents` es
`null` y los sobres viajan sin `amountCents`. Esta regla vive en un único presenter.
Y la identidad real de un aporte anónimo **no sale por ninguna ruta de esta API**:
existe solo en `AuditLog`.

## Auth
| Método | Ruta | Cuerpo | Respuesta |
|---|---|---|---|
| POST | `/auth/register` | `{email, password, displayName}` | `201 {token, user}` |
| POST | `/auth/login` | `{email, password}` | `200 {token, user}` |
| GET | `/me` | — | `200 {user, wallet:{balanceCents, currency}}` |

`user` = `{id, email, displayName}`. Nunca se devuelve `passwordHash`.

## Cajitas (organizador, requiere Bearer)
| Método | Ruta | Respuesta |
|---|---|---|
| POST | `/events` | `201 {event: DashboardView, shareUrl, qrDataUrl}` |
| GET | `/events` | `200 [{id, uuid, title, envelopeCount, isRevealed, createdAt}]` |
| GET | `/events/:id/dashboard` | `200 DashboardView` |
| POST | `/events/:id/reveal` | `200 DashboardView` (incluye `walletCredit`) |
| GET | `/events/:id/qr` | `200 {qrDataUrl, shareUrl}` |

Cajita de otro organizador: `404` (no `403`: no confirmamos que exista).

### DashboardView
Común: `{id, uuid, title, description, currency, revealAt, revealedAt, envelopeCount, isRevealed, shareUrl}`

Sellada. Los sobres son **indistinguibles entre sí**: sin monto y sin `isAnonymous`.
Ese flag, cruzado con la hora de llegada y pocos aportantes, desanonimiza por
deducción, así que no viaja hasta que la cajita se abre.
```json
{ "totalCents": null,
  "envelopes": [{ "id": "...", "createdAt": "..." }] }
```
Revelada:
```json
{ "totalCents": 245000,
  "settledTotalCents": 245000,
  "walletBalanceCents": 245000,
  "pendingRefundCount": 0,
  "walletCredit": { "amountCents": 245000, "transactionId": "..." },
  "envelopes": [{ "id":"...", "createdAt":"...", "isAnonymous":false,
                  "amountCents":150000, "displayName":"Carlos", "message":null }] }
```
`walletCredit` solo aparece en la respuesta de `POST /reveal`.

## Invitado (público, sin auth)
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/caja/:uuid` | `200 {uuid, title, description, currency, envelopeCount, isRevealed}` |
| POST | `/caja/:uuid/contributions` | `201 Receipt` |

Cuerpo del aporte:
```json
{ "amountCents": 150000, "displayName": "Carlos", "isAnonymous": false,
  "message": "¡Felicidades!", "method": "CARD" }
```
`method`: `"CARD" | "QR" | "LINK"` — solo afecta la simulación y queda auditado.
`displayName` es obligatorio salvo que `isAnonymous` sea `true`, en cuyo caso el
servidor guarda `displayName: "Anónimo"` y la identidad real va a `AuditLog`.

`Receipt` = `{id, status, amountCents, currency, paymentRef, boxTitle, createdAt}`.
El aportante ve **su** monto; jamás el total.

## Wallet
| Método | Ruta | Respuesta |
|---|---|---|
| GET | `/wallet` | `200 {balanceCents, currency, transactions:[{id, amountCents, type, eventTitle, createdAt}]}` |
| POST | `/wallet/withdrawals` | `201 {transactionId, amountCents, balanceCents}` |

### Retiro
Cuerpo: `{ "amountCents": 50000 }`. Reglas:
- El retiro se escribe en el ledger como `WalletTransaction` de tipo `WITHDRAWAL`
  con **`amountCents` negativo**, para que la suma del ledger siga siendo el balance.
- La comprobación de saldo y la escritura van en UNA transacción con
  `SELECT ... FOR UPDATE` sobre la fila de la wallet. Sin ese lock, dos retiros
  simultáneos dejan el saldo en negativo: es el bug clásico de doble gasto.
- Saldo insuficiente → `409 INSUFFICIENT_FUNDS` con `details.balanceCents`.
- Monto cero o negativo → `422`.
- Es un retiro **simulado**: no sale dinero a ninguna parte, solo baja el saldo y
  queda el asiento. La UI debe decirlo, no fingir una transferencia real.

## Códigos de error
| Código | HTTP | Cuándo |
|---|---|---|
| `VALIDATION_ERROR` | 422 | Cuerpo inválido |
| `UNAUTHORIZED` | 401 | Sin token, token inválido, credenciales malas |
| `NOT_FOUND` | 404 | Cajita inexistente o de otro organizador |
| `EMAIL_TAKEN` | 409 | Registro con email existente |
| `EVENT_CLOSED` | 409 | Aporte sobre cajita ya revelada |
| `EVENT_CLOSED_MID_PAYMENT` | 409 | El cofre se abrió durante el cobro. Trae `details.paymentRef` |
| `ALREADY_REVEALED` | 409 | Segunda revelación |
| `PAYMENT_DECLINED` | 402 | Pasarela simulada rechaza |
| `INSUFFICIENT_FUNDS` | 409 | Retiro mayor que el saldo |
| `UNSUPPORTED_CURRENCY` | 422 | Moneda fuera de la tabla soportada |
| `LOCK_BUSY` / `SETTLEMENT_BUSY` | 503 | Contención de lock. `SETTLEMENT_BUSY` trae `details.paymentRef` |
