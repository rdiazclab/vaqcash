# Dirección de diseño — VaqCash

Design read: producto de celebración multi-cliente para organizadores y sus invitados
en móvil, con dinero de por medio. Lenguaje editorial-confiable.
Diales: DESIGN_VARIANCE 6 · MOTION_INTENSITY 6 · VISUAL_DENSITY 4.

## La idea rectora: el color es la recompensa

En estado **sellado** la pantalla es monocroma: papel, tinta, sobres cerrados.
Sin acento, sin color de marca, sin brillo. Deliberadamente contenida.

Al **revelar**, el carmín entra por primera vez: el total, los montos, el sello de la
wallet. El color no decora, es el premio. Consecuencia práctica: la revelación
funciona aunque el usuario tenga `prefers-reduced-motion` activado, porque el salto
emocional lo carga el color y la tipografía, no la animación.

Lo que esto prohíbe: pintar de carmín los botones del estado sellado "para que se vea
vivo". Si el acento aparece antes de revelar, el truco se gasta.

## Tokens

Un solo tema por página, con modo claro y oscuro (`prefers-color-scheme` + toggle).
Nada de secciones que inviertan el tema a mitad de scroll.

| Token | Claro | Oscuro | Uso |
|---|---|---|---|
| `--paper` | `#FAFAF8` | `#121213` | Fondo de página |
| `--surface` | `#FFFFFF` | `#1A1A1C` | Tarjetas, sobres |
| `--surface-sunken` | `#F1F1EE` | `#0C0C0D` | Zonas hundidas, inputs |
| `--ink` | `#17171A` | `#F4F4F2` | Texto principal |
| `--ink-muted` | `#5E5E66` | `#9C9CA5` | Texto secundario (AA garantizado) |
| `--rule` | `#E3E3DE` | `#2A2A2E` | Filetes y bordes |
| `--accent` | `#B0203F` | `#E85A76` | Carmín. SOLO estado revelado y CTA primario |
| `--accent-ink` | `#FFFFFF` | `#17171A` | Texto sobre carmín |

Un único acento en todo el producto. Nada de verde para "éxito" y azul para "info":
los estados se comunican con tinta, filete y peso tipográfico.

## Tipografía

- Display y UI: **Geist** (no Inter, no serif).
- Cifras de dinero: **Geist Mono**, `font-variant-numeric: tabular-nums`, siempre.
  El dinero se alinea en columna o no se lee.
- Escala display: `text-4xl md:text-5xl lg:text-6xl`, `tracking-tighter`, `leading-none`.
- Cuerpo: `text-base leading-relaxed max-w-[65ch] text-[--ink-muted]`.
- Énfasis dentro de un titular: itálica o peso de la MISMA familia. Nunca mezclar familias.

## Forma y materia

- Radio único: `12px` en tarjetas y campos, `full` en botones e íconos circulares.
  No mezclar más escalas.
- Sombras tintadas al fondo, nunca negro puro. En estado sellado, casi ninguna:
  el sobre cerrado se define por filete punteado, no por elevación.
- Íconos: **Phosphor** (`@phosphor-icons/react`), `weight="duotone"` para el sobre y
  el cofre, `regular` para el resto. Familia única. Cero SVG dibujado a mano.
- Cero emoji en la interfaz.

## Movimiento (MOTION_INTENSITY 6)

Cada animación tiene que justificarse en una frase. Las tres que se ganan el sitio:

1. **Apertura de sobres** — stagger de 70 ms por sobre al revelar. Justificación:
   narra la secuencia de abrir uno por uno, que es el ritual que digitalizamos.
2. **Conteo del total** — el número sube desde 0 al revelar, 900 ms, ease-out.
   Justificación: retiene la atención en la cifra, que es el clímax.
3. **Feedback táctil** — `scale-[0.98]` en `:active` de todo control.
   Justificación: acuse de recibo en móvil, donde no hay hover.

Todo lo anterior colapsa a estado final instantáneo bajo `prefers-reduced-motion`.
Sin marquesinas, sin parallax, sin scroll hijack, sin cursores personalizados.

## Responsive

Mobile-first de verdad: el invitado llega por WhatsApp en un teléfono.
- Una columna por defecto; la rejilla de sobres es `grid-cols-2` en móvil,
  `sm:grid-cols-3`, `lg:grid-cols-4`.
- Alturas de viewport con `min-h-[100dvh]`, nunca `h-screen`.
- Objetivos táctiles de 44px mínimo.
- El checkout del invitado cabe en una pantalla sin scroll en un teléfono de 360×640.

## Accesibilidad (bloqueante, no deseable)

- Contraste AA mínimo en todo texto, incluidos placeholder, helper y error.
- Label SIEMPRE encima del campo. Nunca placeholder como label.
- Anillo de foco visible en todo control interactivo.
- La revelación se anuncia con `aria-live="polite"`.
- Estados de carga, vacío y error diseñados, no improvisados.

## Prohibiciones heredadas del rediseño

El diseño anterior era violeta `#8b5cf6` con degradado a fucsia sobre fondo oscuro:
el tell número uno de interfaz generada por IA. Queda prohibido volver a:
degradados violeta/fucsia, resplandores de neón, negro puro `#000`, tres tarjetas
iguales en fila, e íconos de familias mezcladas.
