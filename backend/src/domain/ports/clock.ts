/** Reloj inyectable: el dominio nunca llama a `new Date()` por su cuenta. */
export interface Clock {
  now(): Date;
}
