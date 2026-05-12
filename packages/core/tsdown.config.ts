import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  outDir: 'dist',
  format: 'esm',
  target: 'es2021',
  platform: 'node',
  unbundle: true,
  sourcemap: true,
  external: ['@kreuzberg/tree-sitter-language-pack'],
  dts: {
    sourcemap: true,
  },
  outExtensions: () => ({ js: '.js', dts: '.d.ts' }),
  clean: false,
});
