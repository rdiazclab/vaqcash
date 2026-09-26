-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'WALLET_WITHDRAWN';

-- AlterEnum
ALTER TYPE "WalletTxType" ADD VALUE 'WITHDRAWAL';

-- AlterTable
ALTER TABLE "Event" ALTER COLUMN "currency" SET DEFAULT 'COP';

-- AlterTable
ALTER TABLE "Wallet" ALTER COLUMN "currency" SET DEFAULT 'COP';
