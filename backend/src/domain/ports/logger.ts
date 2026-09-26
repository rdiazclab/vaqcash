/** Port mínimo de log. Existe para que la auditoría pueda fallar en silencio pero no en secreto. */
export interface Logger {
  error(message: string, error?: unknown): void;
}
