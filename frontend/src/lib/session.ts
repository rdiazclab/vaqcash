import { readLocal, removeLocal, writeLocal } from './storage';

const TOKEN_KEY = 'sobres:token';

let cached: string | null = null;
let loaded = false;

export function getToken(): string | null {
  if (!loaded) {
    cached = readLocal(TOKEN_KEY);
    loaded = true;
  }
  return cached;
}

export function setToken(token: string): void {
  cached = token;
  loaded = true;
  writeLocal(TOKEN_KEY, token);
}

export function clearToken(): void {
  cached = null;
  loaded = true;
  removeLocal(TOKEN_KEY);
}
