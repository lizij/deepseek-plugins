import { Command } from 'commander';
import {
  loadAllConfigs,
  getFallbackCount,
  missingConfigHint,
  setPrimaryConfig,
  addFallbackConfig,
  removeFallbackConfig,
} from '@deepseek-plugins/shared/multimodal-config';

export function registerMultimodal(program: Command) {
  const multimodal = program
    .command('multimodal')
    .description('管理多模态模型配置（base_url / model / 备选容灾），同时服务 vision/audio/pdf');

  // multimodal config — 配置主模型
  multimodal
    .command('config')
    .description('配置主多模态模型 base_url 和 model（同时服务 vision/audio/pdf）')
    .option('-u, --base-url <url>', '多模态模型 API base URL（OpenAI 兼容）')
    .option('-m, --model <name>', '多模态模型名称')
    .action(async (opts) => {
      if (!opts.baseUrl && !opts.model) {
        console.error('请提供 --base-url 或 --model');
        console.error('示例: deepseek-plugin-cli multimodal config --base-url https://api.openai.com/v1 --model gpt-4o');
        process.exit(1);
      }
      await setPrimaryConfig({ baseUrl: opts.baseUrl, model: opts.model });
      if (opts.baseUrl) console.log(`✓ base_url 已保存: ${opts.baseUrl}`);
      if (opts.model) console.log(`✓ model 已保存: ${opts.model}`);
    });

  // multimodal fallback — 备选模型管理
  const fallback = multimodal
    .command('fallback')
    .description('管理备选多模态模型（容灾用，同时服务 vision/audio/pdf）');

  fallback
    .command('add')
    .description('添加一个备选多模态模型')
    .requiredOption('-u, --base-url <url>', '多模态模型 API base URL（OpenAI 兼容）')
    .requiredOption('-m, --model <name>', '多模态模型名称')
    .action(async (opts) => {
      const idx = await addFallbackConfig(opts.baseUrl, opts.model);
      console.log(`✓ 备选模型 #${idx} 已添加:`);
      console.log(`  base_url: ${opts.baseUrl}`);
      console.log(`  model: ${opts.model}`);
      console.log(`  请运行 'deepseek-plugin-cli auth set vision.fallback.${idx}' 设置其 API Key`);
    });

  fallback
    .command('list')
    .description('列出所有已配置的多模态模型（主模型 + 备选）')
    .action(async () => {
      const configs = await loadAllConfigs();
      if (configs.length === 0) {
        console.log('未配置任何多模态模型。');
        console.log(missingConfigHint());
        return;
      }
      console.log('已配置的多模态模型 (按优先级排列):\n');
      configs.forEach((cfg, i) => {
        const label = i === 0 ? '主模型' : `备选 #${i - 1}`;
        console.log(`  [${label}] ${cfg.model} @ ${cfg.baseUrl}`);
      });
    });

  fallback
    .command('remove <index>')
    .description('删除指定索引的备选模型，并重排后续索引避免空洞')
    .action(async (indexStr: string) => {
      const idx = parseInt(indexStr, 10);
      if (isNaN(idx) || idx < 0) {
        console.error('错误：请提供有效的备选模型索引（从 0 开始的非负整数）');
        process.exit(1);
      }
      const ok = await removeFallbackConfig(idx);
      if (!ok) {
        console.error(`错误：备选模型 #${idx} 不存在`);
        process.exit(1);
      }
      console.log(`✓ 备选模型 #${idx} 已删除，后续索引已重排`);
    });
}
