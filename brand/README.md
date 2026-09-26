# VaqCash — identidad

"Hacer una vaca" es juntar plata entre varios. VaqCash es vaca + cash, así que la
marca es una **vaquita con manchas carmín**: simpática de lejos, sobria de cerca,
porque la app mueve dinero real.

Paleta heredada de `docs/DESIGN.md`. No se introdujo ningún color nuevo.

## Archivos

| Archivo | Qué es |
|---|---|
| `logo-mark.svg` | Solo la vaquita. Cuadrado, `viewBox="0 0 128 128"`, sin texto. Fondo claro. |
| `logo-mark-dark.svg` | La misma vaquita para fondo oscuro. |
| `logo-full.svg` | Vaquita + wordmark "VaqCash" para cabeceras. `viewBox="0 0 412 128"`. Fondo claro. |
| `logo-full-dark.svg` | Lockup para fondo oscuro. |
| `favicon.svg` | **Dibujo aparte**, no el logo encogido: silueta de cabeza, orejas, dos ojos macizos, una mancha y un hocico plano, sobre teja carmín redondeada. Geometría alineada a la rejilla de 16 px. |
| `favicon-square.svg` | El mismo favicon a sangre, sin esquinas redondeadas. Es la fuente de los iconos de sistema: iOS y Android aplican su propia máscara. |
| `favicon-16.png` `favicon-32.png` | Favicon rasterizado. |
| `favicon.ico` | 16 + 32 + 48 en un solo `.ico` (payloads PNG). |
| `favicon-180.png` | `apple-touch-icon`. |
| `icon-192.png` `icon-512.png` | Iconos de PWA / manifest. |

El favicon **no necesita variante oscura**: la teja carmín es opaca, así que se
recorta igual contra una pestaña clara y una oscura.

## Hex usados

| Rol | Claro | Oscuro |
|---|---|---|
| Cuerpo / tinta | `#17171A` | `#F4F4F2` |
| Manchas, hocico, "Cash" | `#B0203F` | `#E85A76` |
| Ojos / papel | `#FAFAF8` | `#121213` |

La teja del favicon y de los iconos de sistema es siempre `#B0203F`, con la cabeza
en `#FAFAF8` y los ojos en `#17171A`.

Sin degradados, sin sombras, sin trazos: todo son formas macizas.

## Cómo enlazarlo

Pegar en el `<head>`, con los archivos servidos desde la raíz del sitio:

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32.png">
<link rel="apple-touch-icon" sizes="180x180" href="/favicon-180.png">
<link rel="manifest" href="/site.webmanifest">
```

Y en el `site.webmanifest`:

```json
{
  "icons": [
    { "src": "/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icon-512.png", "sizes": "512x512", "type": "image/png" }
  ],
  "theme_color": "#B0203F",
  "background_color": "#FAFAF8"
}
```

En cabeceras, el lockup se usa por altura, nunca por ancho:

```html
<img src="/brand/logo-full.svg" alt="VaqCash" height="32">
```

## Notas de producción

- El wordmark de `logo-full*.svg` es texto con `font-family: Geist, …`. Si el logo
  va a viajar fuera del producto (prensa, PDF, camisetas), conviene convertirlo a
  curvas antes; dentro de la app, donde Geist ya está cargada, se ve correcto.
- Todo está dibujado con `<path>` y `<ellipse>` a propósito: algunos rasterizadores
  (entre ellos el de macOS) dibujan mal `<rect>` con `rx`. Si se edita, no meter `rect`.
- Tamaño mínimo del `logo-mark`: 24 px. Por debajo de eso va el `favicon.svg`.
