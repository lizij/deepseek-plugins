import { Command } from 'commander';
import { setKey } from '@deepseek-plugins/shared';
import { loadConfig, missingConfigHint } from '@deepseek-plugins/vision-analyze-helper';
import { analyzeImage } from '@deepseek-plugins/vision-analyze-helper/vision';

export function registerVision(program: Command) {
  const vision = program
    .command('vision')
    .description('调用视觉模型分析图片，为纯文本模型补充识图能力');

  // vision <image> — 默认行为
  vision
    .argument('<image>', '图片路径、URL 或 base64')
    .option('-p, --prompt <text>', '对图片的提问内容', '请详细描述这张图片的内容。')
    .option('-d, --detail <level>', '采样精度：low 更快更省 token，high 更精细', 'high')
    .action(async (image: string, opts) => {
      if (!['low', 'high'].includes(opts.detail)) {
        console.error('错误：--detail 仅支持 low 或 high');
        process.exit(1);
      }
      const config = await loadConfig();
      if (!config) {
        console.error(missingConfigHint());
        process.exit(1);
      }
      try {
        const text = await analyzeImage(config, {
          image,
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

  // vision config — 配置子命令
  vision
    .command('config')
    .description('配置视觉模型 base_url 和 model（存入 Keychain）')
    .option('-u, --base-url <url>', '视觉模型 API base URL（OpenAI 兼容）')
    .option('-m, --model <name>', '视觉模型名称')
    .action(async (opts) => {
      if (!opts.baseUrl && !opts.model) {
        console.error('请提供 --base-url 或 --model');
        console.error('示例: deepseek-plugin-cli vision config --base-url https://api.openai.com/v1 --model gpt-4o');
        process.exit(1);
      }
      if (opts.baseUrl) {
        await setKey('vision.base_url', opts.baseUrl);
        console.log(`✓ base_url 已保存: ${opts.baseUrl}`);
      }
      if (opts.model) {
        await setKey('vision.model', opts.model);
        console.log(`✓ model 已保存: ${opts.model}`);
      }
    });
}