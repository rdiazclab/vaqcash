/** Port. Convierte un texto (la URL pública de la cajita) en un PNG data URL. */
export interface QrGenerator {
  toDataUrl(text: string): Promise<string>;
}
