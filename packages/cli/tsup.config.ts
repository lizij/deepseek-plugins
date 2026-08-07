import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node20',
  clean: true,
  outDir: 'dist',
  noExternal: [/.*/], // 打包所有依赖，使 CLI 可独立运行
  splitting: false,
  banner: {
    js: '#!/bin/sh\n":" //# ; exec /usr/bin/env node --experimental-default-type=commonjs "$0" "$@"',
  },
});