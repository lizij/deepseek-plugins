import { Command } from 'commander';
import { setKey, unsetKey, getKey } from '@deepseek-plugins/shared';
import { loadAllConfigs, getFallbackCount, missingConfigHint } from '@deepseek-plugins/vision-analyze-helper';
import { analyzeImageWithFallback } from '@deepseek-plugins/vision-analyze-helper/vision';

export function registerVision(program: Command) {
  const vision = program
    .command('vision')
    .description('调用视觉模型分析图片，为纯文本模型补充识图能力');

  // vision <image> — 默认行为，使用容灾调用
  vision
    .argument('<image>', '图片路径、URL 或 base64')
    .option('-p, --prompt <text>', '对图片的提问内容', '请详细描述这张图片的内容。')
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
        const text = await analyzeImageWithFallback(configs, {
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

  // vision config — 配置主模型
  vision
    .command('config')
    .description('配置主视觉模型 base_url 和 model（存入 Keychain）')
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

  // vision fallback — 备选模型管理
  const fallback = vision
    .command('fallback')
    .description('管理备选视觉模型（容灾用）');

  fallback
    .command('add')
    .description('添加一个备选视觉模型')
    .requiredOption('-u, --base-url <url>', '视觉模型 API base URL（OpenAI 兼容）')
    .requiredOption('-m, --model <name>', '视觉模型名称')
    .action(async (opts) => {
      const idx = await getFallbackCount();
      await setKey(`vision.fallback.${idx}.base_url`, opts.baseUrl);
      await setKey(`vision.fallback.${idx}.model`, opts.model);
      console.log(`✓ 备选模型 #${idx} 已添加:`);
      console.log(`  base_url: ${opts.baseUrl}`);
      console.log(`  model: ${opts.model}`);
      console.log(`  请运行 'deepseek-plugin-cli auth set vision.fallback.${idx}' 设置其 API Key`);
    });

  fallback
    .command('list')
    .description('列出所有已配置的视觉模型（主模型 + 备选）')
    .action(async () => {
      const configs = await loadAllConfigs();
      if (configs.length === 0) {
        console.log('未配置任何视觉模型。');
        console.log(missingConfigHint());
        return;
      }
      console.log('已配置的视觉模型 (按优先级排列):\n');
      for (let i = 0; i < configs.length; i++) {
        const label = i === 0 ? '主模型' : `备选 #${i - 1}`;
        console.log(`  [${label}] ${configs[i].model} @ ${configs[i].baseUrl}`);
      }
    });

  fallback
    .command('remove <index>')
    .description('删除指定索引的备选模型')
    .action(async (indexStr: string) => {
      const idx = parseInt(indexStr, 10);
      if (isNaN(idx) || idx < 0) {
        console.error('错误：请提供有效的备选模型索引（从 0 开始的非负整数）');
        process.exit(1);
      }
      const apiKey = await getKey(`vision.fallback.${idx}`);
      if (!apiKey) {
        console.error(`错误：备选模型 #${idx} 不存在`);
        process.exit(1);
      }
      await unsetKey(`vision.fallback.${idx}`);
      await unsetKey(`vision.fallback.${idx}.base_url`);
      await unsetKey(`vision.fallback.${idx}.model`);
      console.log(`✓ 备选模型 #${idx} 已删除`);
    });
}