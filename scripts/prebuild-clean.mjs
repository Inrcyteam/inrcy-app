import { rmSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const targets = ['.next', 'tsconfig.tsbuildinfo'];

for (const target of targets) {
  const absolutePath = resolve(process.cwd(), target);
  if (!existsSync(absolutePath)) continue;

  rmSync(absolutePath, {
    recursive: true,
    force: true,
    maxRetries: 2,
  });

  console.log(`[prebuild-clean] removed ${target}`);
}
