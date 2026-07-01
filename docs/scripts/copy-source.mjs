import { cp, writeFile, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const outDir = path.resolve('out');

async function getContentFiles(dir, base = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const rel = path.join(base, entry.name);
    if (entry.isDirectory()) {
      files.push(...await getContentFiles(path.join(dir, entry.name), rel));
    } else {
      files.push(rel);
    }
  }
  return files;
}

const contentFiles = await getContentFiles(path.resolve('content/docs'));
const files = [
  'source.config.ts',
  ...contentFiles.map(f => `content/docs/${f.replace(/\\/g, '/')}`),
];

const manifest = { files };
await writeFile(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

for (const file of files) {
  const src = path.resolve(file);
  const dest = path.join(outDir, file);
  if (existsSync(src)) {
    const destDir = path.dirname(dest);
    await cp(src, dest, { recursive: true });
  }
}

console.log(`Copied ${files.length} source files to out/ for external consumption.`);
