import jwt from 'jsonwebtoken';
import type { AuthTokenPayload, AuthTokenSigner } from '../../domain/ports/auth-token-signer';

export class JwtTokenSigner implements AuthTokenSigner {
  constructor(
    private readonly secret: string,
    private readonly expiresIn = '7d',
  ) {}

  sign(payload: AuthTokenPayload): string {
    return jwt.sign({ sub: payload.userId }, this.secret, {
      expiresIn: this.expiresIn,
    } as jwt.SignOptions);
  }

  verify(token: string): AuthTokenPayload | null {
    try {
      const decoded = jwt.verify(token, this.secret);
      if (typeof decoded === 'string' || typeof decoded.sub !== 'string') return null;
      return { userId: decoded.sub };
    } catch {
      // Firma inválida, token caducado o malformado: todos son "no autenticado".
      return null;
    }
  }
}
