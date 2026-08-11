import { Command } from 'commander';
import { loadAllConfigs, missingConfigHint, DEFAULT_PROMPT } from '@deepseek-plugins/shared/multimodal-config';
import { analyzeWithFallback } from '@deepseek-plugins/vision-helper/vision';

export function registerVision(program: Command) {
  program
    .command('vision')
    .description('调用多模态模型分析图片，为纯文本模型补充识图能力（与 audio/pdf 共享模型配置）')
    .argument('<image>', '图片路径、URL 或 base64')
    .option('-p, --prompt <text>', '对图片的提问内容', DEFAULT_PROMPT)
    .option('-d, --detail <level>', '采样精度：low 更快更省 token，high 更精细', 'high')
    .action(async (image: string, opts) => {
      if (!['low', 'high'].includes(opts.detail)) {
        console.error('错误：--detail 仅支持 low 或 high');
        process.exit(1);
      }
      const configs = await loadAllConfigs();
      if (configs.length === 0) {
        console.error(missingConfigHint());
        process.exit(1);
      }
      try {
        const text = await analyzeWithFallback(configs, 'image', {
          input: image,
          prompt: opts.prompt,
          detail: opts.detail,
        });
        process.stdout.write(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`图片识别失败: ${msg}`);
        process.exit(1);
      }
    });
}
