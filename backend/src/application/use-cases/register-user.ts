import { DEFAULT_CURRENCY } from '../../domain/money';
import type { UserRecord, WalletRecord } from '../../domain/models';
import type { PasswordHasher } from '../../domain/ports/password-hasher';
import type { AuthTokenSigner } from '../../domain/ports/auth-token-signer';
import type { UserRepository } from '../../domain/ports/repositories';

export interface RegisterUserInput {
  email: string;
  password: string;
  displayName: string;
}

export interface RegisterUserOutput {
  token: string;
  user: UserRecord;
  wallet: WalletRecord;
}

/** Alta de organizador. El monedero nace con él, en la misma transacción. */
export class RegisterUser {
  constructor(
    private readonly users: UserRepository,
    private readonly hasher: PasswordHasher,
    private readonly tokens: AuthTokenSigner,
    private readonly defaultCurrency: string = DEFAULT_CURRENCY,
  ) {}

  async execute(input: RegisterUserInput): Promise<RegisterUserOutput> {
    const passwordHash = await this.hasher.hash(input.password);
    // El UNIQUE de email es el árbitro: comprobar antes dejaría una carrera abierta.
    const { user, wallet } = await this.users.createWithWallet({
      email: input.email,
      passwordHash,
      displayName: input.displayName,
      currency: this.defaultCurrency,
    });
    return { token: this.tokens.sign({ userId: user.id }), user, wallet };
  }
}
