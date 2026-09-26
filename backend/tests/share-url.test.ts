import { describe, expect, it } from 'vitest';
import { boxShareUrl } from '../src/domain/share-url';

describe('boxShareUrl', () => {
  it('builds the /caja/:uuid link', () => {
    expect(boxShareUrl('http://localhost:5175', 'abc-uuid')).toBe('http://localhost:5175/caja/abc-uuid');
  });

  it('never doubles the slash when the base url ends in one', () => {
    expect(boxShareUrl('https://sobres.app/', 'abc-uuid')).toBe('https://sobres.app/caja/abc-uuid');
    expect(boxShareUrl('https://sobres.app///', 'abc-uuid')).toBe('https://sobres.app/caja/abc-uuid');
  });
});
