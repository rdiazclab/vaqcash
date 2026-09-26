import { Unauthorized } from '../../domain/errors';
import type { UserRecord } from '../../domain/models';
import type { AuthTokenSigner } from '../../domain/ports/auth-token-signer';
import type { PasswordHasher } from '../../domain/ports/password-hasher';
import type { UserRepository } from '../../domain/ports/repositories';

export interface LoginUserInput {
  email: string;
  password: string;
}

export class LoginUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: AuthTokenSigner,
  ) {}

  async execute(input: LoginUserInput): Promise<{ token: string; user: UserRecord }> {
    const found = await this.users.findByEmailWithSecret(input.email);
    // Mismo mensaje para "no existe" y "contraseña mala": no confirmamos qué emails hay.
    const invalid = () => Unauthorized('Email o contraseña incorrectos');
    if (!found) throw invalid();

    const ok = await this.hasher.verify(found.passwordHash, input.password);
    if (!ok) throw invalid();

    return { token: this.tokens.sign({ userId: found.user.id }), user: found.user };
  }
}
