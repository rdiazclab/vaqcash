import argon2 from 'argon2';
import type { PasswordHasher } from '../../domain/ports/password-hasher';

/** argon2id con los parámetros por defecto de la librería. */
export class Argon2PasswordHasher implements PasswordHasher {
  hash(plain: string): Promise<string> {
    return argon2.hash(plain, { type: argon2.argon2id });
  }

  async verify(hash: string, plain: string): Promise<boolean> {
    try {
      return await argon2.verify(hash, plain);
    } catch {
      // Hash corrupto o de otro algoritmo: no es una excepción, es un login fallido.
      return false;
    }
  }
}
