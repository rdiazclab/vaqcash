/** Única definición del link público de una cajita. */
export function boxShareUrl(publicWebUrl: string, uuid: string): string {
  return `${publicWebUrl.replace(/\/+$/, '')}/caja/${uuid}`;
}
