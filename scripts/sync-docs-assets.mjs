#!/usr/bin/env node
import { copyFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dest = join(root, 'docs/public');
mkdirSync(dest, { recursive: true });

copyFileSync(join(root, 'public/favicon.png'), join(dest, 'favicon.png'));
copyFileSync(join(root, 'public/.nojekyll'), join(dest, '.nojekyll'));

const mediaDest = join(dest, 'media');
mkdirSync(mediaDest, { recursive: true });
const mediaSrc = join(root, 'public/media');
for (const name of readdirSync(mediaSrc)) {
  if (name.endsWith('.mp4')) {
    copyFileSync(join(mediaSrc, name), join(mediaDest, name));
  }
}

const shots = join(root, 'public/docs');
for (const name of readdirSync(shots)) {
  if (name.endsWith('.png')) {
    copyFileSync(join(shots, name), join(dest, name));
  }
}
