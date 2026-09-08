#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const destRoot = join(root, 'dist/docs/javadoc');

const copies = [
  ['libraries/frc/build/docs/javadoc', 'frc'],
  ['libraries/ftc/build/docs/javadoc', 'ftc'],
];

for (const [fromRel, name] of copies) {
  const from = join(root, fromRel);
  if (!existsSync(from)) {
    console.warn(`Skipping ${name} Javadoc (not built yet): ${fromRel}`);
    continue;
  }
  const dest = join(destRoot, name);
  mkdirSync(dest, { recursive: true });
  cpSync(from, dest, { recursive: true });
  console.log(`Copied ${name} Javadoc → dist/docs/javadoc/${name}`);
}
