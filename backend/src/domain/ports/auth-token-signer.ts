export interface AuthTokenPayload {
  userId: string;
}

/** Port. Firma y verifica el token de sesión del organizador. */
export interface AuthTokenSigner {
  sign(payload: AuthTokenPayload): string;
  /** Devuelve null si el token es inválido, caducado o no es nuestro. */
  verify(token: string): AuthTokenPayload | null;
}
