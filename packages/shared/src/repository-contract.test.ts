import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const repoRoot = resolve(import.meta.dir, '../../..');

function readRepoFile(path: string): string {
  return readFileSync(resolve(repoRoot, path), 'utf8');
}

describe('repository contracts', () => {
  test('CI test script bypasses the local schema-push lifecycle hook', () => {
    const packageJson = JSON.parse(readRepoFile('package.json')) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.test).toBe('NODE_ENV=test bun --env-file=./.env test');
    expect(packageJson.scripts.pretest).toBe('bun run db:push:test');
    expect(packageJson.scripts['test:ci']).toBe(
      'NODE_ENV=test bun --env-file=./.env test',
    );
    expect(packageJson.scripts['pretest:ci']).toBeUndefined();
  });

  test('migration-gated workflows use the CI test path and validate OpenSpec', () => {
    for (const path of ['.github/workflows/ci.yml', '.github/workflows/deploy.yml']) {
      const workflow = readRepoFile(path);
      const migrateAt = workflow.indexOf('run: bun run db:migrate:apply:test');
      const testAt = workflow.indexOf('run: bun run test:ci');

      expect(migrateAt, `${path} must apply migrations`).toBeGreaterThan(-1);
      expect(testAt, `${path} must use test:ci`).toBeGreaterThan(migrateAt);
      expect(workflow).not.toMatch(/^\s*run:\s*bun run test\s*$/m);
      expect(workflow).toContain('run: bun run spec:validate');
    }
  });
});
