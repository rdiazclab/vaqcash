import type { PrismaClient } from '@prisma/client';
import { AuditService } from './application/services/audit.service';
import { CreateEvent } from './application/use-cases/create-event';
import { GetDashboard } from './application/use-cases/get-dashboard';
import { GetEventQr } from './application/use-cases/get-event-qr';
import { GetMe } from './application/use-cases/get-me';
import { GetPublicBox } from './application/use-cases/get-public-box';
import { GetWallet } from './application/use-cases/get-wallet';
import { ListEvents } from './application/use-cases/list-events';
import { LoginUser } from './application/use-cases/login-user';
import { ProcessContribution } from './application/use-cases/process-contribution';
import { RegisterUser } from './application/use-cases/register-user';
import { RevealAndSettle } from './application/use-cases/reveal-and-settle';
import { WithdrawFromWallet } from './application/use-cases/withdraw-from-wallet';
import { env } from './config/env';
import type { AuthTokenSigner } from './domain/ports/auth-token-signer';
import type { Clock } from './domain/ports/clock';
import type { IdGenerator } from './domain/ports/id-generator';
import type { Logger } from './domain/ports/logger';
import type { PasswordHasher } from './domain/ports/password-hasher';
import type { PaymentGateway } from './domain/ports/payment-gateway';
import type { QrGenerator } from './domain/ports/qr-generator';
import type { EventLocker, WalletLocker } from './domain/ports/repositories';
import { Argon2PasswordHasher } from './infrastructure/auth/argon2-password-hasher';
import { JwtTokenSigner } from './infrastructure/auth/jwt-token-signer';
import { ConsoleLogger } from './infrastructure/console-logger';
import { CryptoIdGenerator } from './infrastructure/crypto-id-generator';
import { FakePaymentGateway } from './infrastructure/payments/fake-payment-gateway';
import { PrismaAuditRepository } from './infrastructure/persistence/prisma/audit.repository';
import { prisma as defaultPrisma } from './infrastructure/persistence/prisma/client';
import { PrismaContributionRepository } from './infrastructure/persistence/prisma/contribution.repository';
import { PrismaEventLocker } from './infrastructure/persistence/prisma/event-locker';
import { PrismaEventRepository } from './infrastructure/persistence/prisma/event.repository';
import { PrismaUserRepository } from './infrastructure/persistence/prisma/user.repository';
import { PrismaWalletLocker } from './infrastructure/persistence/prisma/wallet-locker';
import { PrismaWalletRepository } from './infrastructure/persistence/prisma/wallet.repository';
import { QrCodeGenerator } from './infrastructure/qr/qrcode.generator';
import { SystemClock } from './infrastructure/system-clock';

export interface ContainerOverrides {
  prisma?: PrismaClient;
  payments?: PaymentGateway;
  qr?: QrGenerator;
  clock?: Clock;
  logger?: Logger;
  ids?: IdGenerator;
  hasher?: PasswordHasher;
  tokens?: AuthTokenSigner;
  publicWebUrl?: string;
  /** Igual que `decorateLocker`, para el lock del monedero. */
  decorateWalletLocker?: (locker: WalletLocker) => WalletLocker;
  /**
   * Envuelve el locker real. Es el punto de inyección honesto para probar
   * atomicidad: el test decora el bundle con un repositorio que revienta y
   * comprueba que la transacción entera se deshace.
   */
  decorateLocker?: (locker: EventLocker) => EventLocker;
}

/**
 * Raíz de composición: el ÚNICO sitio donde se eligen implementaciones
 * concretas. Todo lo que está por dentro sólo conoce los puertos.
 */
export function buildContainer(overrides: ContainerOverrides = {}) {
  const db = overrides.prisma ?? defaultPrisma;
  const clock = overrides.clock ?? new SystemClock();
  const logger = overrides.logger ?? new ConsoleLogger();
  const ids = overrides.ids ?? new CryptoIdGenerator();
  const qr = overrides.qr ?? new QrCodeGenerator();
  const payments = overrides.payments ?? new FakePaymentGateway();
  const hasher = overrides.hasher ?? new Argon2PasswordHasher();
  const tokens = overrides.tokens ?? new JwtTokenSigner(env.jwtSecret);
  const publicWebUrl = overrides.publicWebUrl ?? env.publicWebUrl;

  const users = new PrismaUserRepository(db);
  const wallets = new PrismaWalletRepository(db);
  const events = new PrismaEventRepository(db);
  const contributions = new PrismaContributionRepository(db);
  const audit = new AuditService(new PrismaAuditRepository(db), logger);

  const realLocker = new PrismaEventLocker(db);
  const locker = overrides.decorateLocker ? overrides.decorateLocker(realLocker) : realLocker;

  const realWalletLocker = new PrismaWalletLocker(db);
  const walletLocker = overrides.decorateWalletLocker
    ? overrides.decorateWalletLocker(realWalletLocker)
    : realWalletLocker;

  const getDashboard = new GetDashboard(events, contributions, wallets, clock);

  return {
    db,
    tokens,
    publicWebUrl,
    useCases: {
      registerUser: new RegisterUser(users, hasher, tokens),
      loginUser: new LoginUser(users, hasher, tokens),
      getMe: new GetMe(users, wallets),
      getWallet: new GetWallet(wallets),
      withdrawFromWallet: new WithdrawFromWallet(walletLocker, ids),
      createEvent: new CreateEvent(events, ids, qr, publicWebUrl),
      listEvents: new ListEvents(events, clock),
      getEventQr: new GetEventQr(events, qr, publicWebUrl),
      getDashboard,
      revealAndSettle: new RevealAndSettle(events, wallets, locker, clock),
      getPublicBox: new GetPublicBox(events, contributions, clock),
      contribute: new ProcessContribution(events, contributions, locker, payments, audit, clock),
    },
  };
}

export type Container = ReturnType<typeof buildContainer>;
