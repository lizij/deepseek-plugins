#!/usr/bin/env node
import { Command } from 'commander';
import { loadConfig, missingConfigHint } from './config.js';
import { analyzeImage } from './vision.js';

const program = new Command();

program
  .name('vision-analyze-helper')
  .description('辅助纯文本模型识图：调用视觉模型分析图片，为 DeepSeek-V4 等纯文本模型补充识图能力')
  .version('0.1.0');

program
  .requiredOption('-i, --image <input>', '图片输入：本地文件路径、http(s) URL 或 data: base64 URI')
  .option('-p, --prompt <text>', '对图片的提问内容', '请详细描述这张图片的内容。')
  .option('-d, --detail <level>', '采样精度：low 更快更省 token，high 更精细', 'high')
  .action(async (opts) => {
    if (!['low', 'high'].includes(opts.detail)) {
      console.error('错误：--detail 仅支持 low 或 high');
      process.exit(1);
    }
    const detail = opts.detail;
    const config = await loadConfig();
    if (!config) {
      console.error(missingConfigHint());
      process.exit(1);
    }
    try {
      const text = await analyzeImage(config, {
        image: opts.image,
        prompt: opts.prompt,
        detail,
      });
      process.stdout.write(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`图片识别失败: ${msg}`);
      process.exit(1);
    }
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
