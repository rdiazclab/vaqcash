import type { Logger } from '../domain/ports/logger';

export class ConsoleLogger implements Logger {
  error(message: string, error?: unknown): void {
    console.error(message, error ?? '');
  }
}
