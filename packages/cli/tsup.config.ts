import { defineConfig } from 'tsup';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const bannerJs = [
  '#!/bin/sh',
  '":" //# ; if ! command -v node >/dev/null 2>&1; then',
  '":" //# ;   printf \'❌ 未检测到 Node.js。deepseek-plugin-cli 需要 Node.js 22.5+，请安装：https://nodejs.org\\n\' >&2',
  '":" //# ;   exit 127',
  '":" //# ; fi',
  '":" //# ; _dsp_node_major=$(node -p "process.versions.node.split(\'.\')[0]")',
  '":" //# ; _dsp_node_minor=$(node -p "process.versions.node.split(\'.\')[1]")',
  '":" //# ; if [ "$_dsp_node_major" -lt 22 ] || { [ "$_dsp_node_major" -eq 22 ] && [ "$_dsp_node_minor" -lt 5 ]; }; then',
  '":" //# ;   printf "❌ Node.js 版本过低（当前 v%s），需要 22.5+，请升级后重试\\n" "$(node -v)" >&2',
  '":" //# ;   exit 1',
  '":" //# ; fi',
  '":" //# ; exec /usr/bin/env node --experimental-default-type=commonjs "$0" "$@"',
].join('\n');

export default defineConfig({
  entry: ['src/cli.ts'],
  format: ['cjs'],
  platform: 'node',
  target: 'node22',
  clean: true,
  outDir: 'dist',
  noExternal: [/.*/], // 打包所有依赖，使 CLI 可独立运行
  splitting: false,
  loader: { '.swift': 'text', '.html': 'text' }, // 将 Swift/HTML 源码作为字符串嵌入单文件
  minify: 'terser',
  terserOptions: {
    mangle: { toplevel: true },
    compress: { passes: 2 },
  },
  // banner 在 terser 之后注入，避免被 terser 当作死代码删除
  onSuccess: async () => {
    const outFile = join('dist', 'cli.cjs');
    const content = readFileSync(outFile, 'utf-8');
    writeFileSync(outFile, bannerJs + '\n' + content, 'utf-8');
  },
});
