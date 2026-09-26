/**
 * Port. El azar es un efecto de borde, así que no vive en el dominio:
 * el uuid público del link y el slug legible se piden por aquí.
 */
export interface IdGenerator {
  uuid(): string;
  slug(title: string): string;
}
