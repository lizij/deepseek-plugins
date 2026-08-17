import { Command } from 'commander';
import { password } from '@inquirer/prompts';
import {
  loadAllModels,
  setModel,
  addModel,
  updateModel,
  removeModel,
  moveModel,
  missingConfigHint,
} from '@deepseek-plugins/shared/multimodal-config';

/** 交互式输入 API Key（隐藏回显），空输入返回 undefined。 */
async function promptApiKey(message: string): Promise<string | undefined> {
  const key = await password({ message, mask: true });
  return key || undefined;
}

export function registerMultimodal(program: Command) {
  const multimodal = program
    .command('multimodal')
    .description('管理多模态模型配置（base_url / model / API Key），按数组顺序依次尝试，同时服务 vision/audio/pdf');

  // multimodal list — 列出所有模型
  multimodal
    .command('list')
    .description('列出所有已配置的多模态模型（按调用优先级排列）')
    .action(async () => {
      const configs = await loadAllModels();
      if (configs.length === 0) {
        console.log('未配置任何多模态模型。');
        console.log(missingConfigHint());
        return;
      }
      console.log('已配置的多模态模型 (按调用优先级排列):\n');
      configs.forEach((cfg, i) => {
        const keyMasked = cfg.apiKey ? `${cfg.apiKey.slice(0, 4)}…${cfg.apiKey.slice(-4)}` : '(未设置)';
        console.log(`  [#${i}] ${cfg.model} @ ${cfg.baseUrl}`);
        console.log(`        API Key: ${keyMasked}`);
      });
    });

  // multimodal set — 设置第一个模型（索引 0）
  multimodal
    .command('set')
    .description('设置第一个多模态模型（索引 0）的 base_url / model / API Key')
    .option('-u, --base-url <url>', '多模态模型 API base URL（OpenAI 兼容）')
    .option('-m, --model <name>', '多模态模型名称')
    .option('-k, --api-key', '交互式设置 API Key（隐藏回显，避免出现在命令行参数中）')
    .action(async (opts) => {
      if (!opts.baseUrl && !opts.model && !opts.apiKey) {
        console.error('请至少提供一项：--base-url、--model 或 --api-key');
        console.error('示例: deepseek-plugin-cli multimodal set --base-url https://open.bigmodel.cn/api/paas/v4 --model glm-4.6v --api-key');
        process.exit(1);
      }
      const patch: { baseUrl?: string; model?: string; apiKey?: string } = {};
      if (opts.baseUrl) patch.baseUrl = opts.baseUrl;
      if (opts.model) patch.model = opts.model;
      if (opts.apiKey) {
        const key = await promptApiKey('输入模型 API Key:');
        if (key) patch.apiKey = key;
      }
      await setModel(0, patch);
      if (opts.baseUrl) console.log(`✓ base_url 已保存: ${opts.baseUrl}`);
      if (opts.model) console.log(`✓ model 已保存: ${opts.model}`);
      if (opts.apiKey && patch.apiKey) console.log('✓ API Key 已保存');
    });

  // multimodal add — 添加模型到末尾
  multimodal
    .command('add')
    .description('添加一个多模态模型到末尾（按顺序依次尝试）')
    .requiredOption('-u, --base-url <url>', '多模态模型 API base URL（OpenAI 兼容）')
    .requiredOption('-m, --model <name>', '多模态模型名称')
    .option('-k, --api-key', '交互式设置 API Key（隐藏回显）')
    .action(async (opts) => {
      let apiKey: string | undefined;
      if (opts.apiKey) {
        apiKey = await promptApiKey('输入模型 API Key:');
      }
      const idx = await addModel(opts.baseUrl, opts.model, apiKey);
      console.log(`✓ 模型 #${idx} 已添加:`);
      console.log(`  base_url: ${opts.baseUrl}`);
      console.log(`  model: ${opts.model}`);
      if (!apiKey) {
        console.log(`  请运行 'deepseek-plugin-cli multimodal update ${idx} --api-key' 设置其 API Key`);
      }
    });

  // multimodal update — 更新指定索引模型
  multimodal
    .command('update <index>')
    .description('更新指定索引的模型（base_url / model / API Key）')
    .option('-u, --base-url <url>', '多模态模型 API base URL')
    .option('-m, --model <name>', '多模态模型名称')
    .option('-k, --api-key', '交互式设置 API Key（隐藏回显）')
    .action(async (indexStr: string, opts) => {
      const idx = parseInt(indexStr, 10);
      if (isNaN(idx) || idx < 0) {
        console.error('错误：请提供有效的模型索引（从 0 开始的非负整数）');
        process.exit(1);
      }
      const models = await loadAllModels();
      if (idx >= models.length) {
        console.error(`错误：模型 #${idx} 不存在（当前共 ${models.length} 个模型）`);
        process.exit(1);
      }
      if (!opts.baseUrl && !opts.model && !opts.apiKey) {
        console.error('请至少提供一项：--base-url、--model 或 --api-key');
        process.exit(1);
      }
      const patch: { baseUrl?: string; model?: string; apiKey?: string } = {};
      if (opts.baseUrl) patch.baseUrl = opts.baseUrl;
      if (opts.model) patch.model = opts.model;
      if (opts.apiKey) {
        const key = await promptApiKey(`输入模型 #${idx} 的新 API Key:`);
        if (key) patch.apiKey = key;
      }
      await updateModel(idx, patch);
      console.log(`✓ 模型 #${idx} 已更新`);
    });

  // multimodal remove — 删除指定索引模型
  multimodal
    .command('remove <index>')
    .description('删除指定索引的模型，后续索引自动前移')
    .action(async (indexStr: string) => {
      const idx = parseInt(indexStr, 10);
      if (isNaN(idx) || idx < 0) {
        console.error('错误：请提供有效的模型索引（从 0 开始的非负整数）');
        process.exit(1);
      }
      const ok = await removeModel(idx);
      if (!ok) {
        console.error(`错误：模型 #${idx} 不存在`);
        process.exit(1);
      }
      console.log(`✓ 模型 #${idx} 已删除，后续索引已重排`);
    });

  // multimodal move — 调整模型优先级
  multimodal
    .command('move <index> <direction>')
    .description('调整模型优先级（up 上移 / down 下移）')
    .action(async (indexStr: string, direction: string) => {
      const idx = parseInt(indexStr, 10);
      if (isNaN(idx) || idx < 0) {
        console.error('错误：请提供有效的模型索引（从 0 开始的非负整数）');
        process.exit(1);
      }
      const dir = direction === 'up' ? -1 : direction === 'down' ? 1 : NaN;
      if (isNaN(dir)) {
        console.error('错误：方向必须是 up 或 down');
        process.exit(1);
      }
      const ok = await moveModel(idx, dir as -1 | 1);
      if (!ok) {
        console.error(`错误：无法将模型 #${idx} 向${direction}移动（越界）`);
        process.exit(1);
      }
      console.log(`✓ 模型 #${idx} 已向${direction}移动`);
    });
}
