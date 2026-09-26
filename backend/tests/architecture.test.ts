import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '..', 'src');

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    return statSync(full).isDirectory() ? walk(full) : full.endsWith('.ts') ? [full] : [];
  });
}

/** Todos los especificadores de `import ... from 'x'` / `export ... from 'x'`. */
function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8');
  return [...source.matchAll(/(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
}

const isRelative = (spec: string) => spec.startsWith('.');

/**
 * La regla de dependencia es el contrato de esta arquitectura, así que se
 * comprueba con un test y no con buena voluntad: si alguien mete PrismaClient
 * en un caso de uso, la suite se pone roja.
 */
describe('regla de dependencia', () => {
  const domainFiles = walk(path.join(SRC, 'domain'));
  const applicationFiles = walk(path.join(SRC, 'application'));

  it('hay ficheros que inspeccionar (el test no puede pasar por vacío)', () => {
    expect(domainFiles.length).toBeGreaterThan(5);
    expect(applicationFiles.length).toBeGreaterThan(5);
  });

  it('domain no importa NADA de fuera de domain: ni paquetes, ni otras capas', () => {
    const offences: string[] = [];
    for (const file of domainFiles) {
      for (const spec of importsOf(file)) {
        if (!isRelative(spec)) {
          offences.push(`${path.relative(SRC, file)} -> paquete externo '${spec}'`);
          continue;
        }
        const resolved = path.resolve(path.dirname(file), spec);
        if (!resolved.startsWith(path.join(SRC, 'domain'))) {
          offences.push(`${path.relative(SRC, file)} -> '${spec}'`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('application sólo importa domain (o sí mismo): nunca prisma, express ni config', () => {
    const allowed = [path.join(SRC, 'domain'), path.join(SRC, 'application')];
    const offences: string[] = [];
    for (const file of applicationFiles) {
      for (const spec of importsOf(file)) {
        if (!isRelative(spec)) {
          offences.push(`${path.relative(SRC, file)} -> paquete externo '${spec}'`);
          continue;
        }
        const resolved = path.resolve(path.dirname(file), spec);
        if (!allowed.some((root) => resolved.startsWith(root))) {
          offences.push(`${path.relative(SRC, file)} -> '${spec}'`);
        }
      }
    }
    expect(offences).toEqual([]);
  });

  it('ningún fichero de domain o application menciona PrismaClient ni express', () => {
    const offences: string[] = [];
    for (const file of [...domainFiles, ...applicationFiles]) {
      const source = readFileSync(file, 'utf8');
      if (/PrismaClient|@prisma\/client|from 'express'/.test(source)) {
        offences.push(path.relative(SRC, file));
      }
    }
    expect(offences).toEqual([]);
  });

  it('el presenter es el único sitio que serializa importes de la vista del organizador', () => {
    // Si aparece un segundo módulo construyendo `totalCents`, la garantía del
    // presenter único deja de ser una garantía.
    const owners = walk(SRC).filter((file) => /totalCents:/.test(readFileSync(file, 'utf8')));
    expect(owners.map((f) => path.relative(SRC, f)).sort()).toEqual([
      'interfaces/http/presenters/event.presenter.ts',
    ]);
  });
});
