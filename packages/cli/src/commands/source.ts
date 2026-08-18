import { Command } from 'commander';
import { password } from '@inquirer/prompts';
import {
  loadAllSources,
  getSource,
  addSource,
  updateSource,
  removeSource,
  moveSource,
} from '@deepseek-plugins/shared/sources';
import { listProviders, getProvider, isProviderSupported } from '@deepseek-plugins/shared/providers';
import type { ProviderType, FeatureType } from '@deepseek-plugins/shared/providers/types';

/** 交互式输入 API Key（隐藏回显），空输入返回 undefined。 */
async function promptApiKey(message: string): Promise<string | undefined> {
  const key = await password({ message, mask: true });
  return key || undefined;
}

/** 解析逗号分隔的功能列表。 */
function parseFeatures(raw: string | undefined): FeatureType[] | undefined {
  if (!raw) return undefined;
  return raw.split(',').map((s) => s.trim() as FeatureType);
}

export function registerSource(program: Command) {
  const source = program
    .command('source')
    .description('管理模型来源（供应商 / API Key / 支持功能），支持多来源余额、使用量、模型列表查询');

  // source providers — 列出所有已支持的供应商
  source
    .command('providers')
    .description('列出所有已支持的供应商及其功能')
    .action(() => {
      const providers = listProviders();
      console.log('已支持的供应商：\n');
      for (const p of providers) {
        console.log(`  ${p.type.padEnd(14)} ${p.name.padEnd(18)} ${p.website}`);
        console.log(`  ${' '.repeat(14)} 功能: ${p.supportedFeatures.join(', ')}`);
      }
    });

  // source list — 列出所有已配置的来源
  source
    .command('list')
    .description('列出所有已配置的来源（按优先级排列）')
    .action(async () => {
      const sources = await loadAllSources();
      if (sources.length === 0) {
        console.log('未配置任何来源。');
        console.log('运行 source providers 查看已支持的供应商，然后 source add 添加来源。');
        return;
      }
      console.log('已配置的来源（按优先级排列）:\n');
      sources.forEach((s, i) => {
        const keyMasked = s.apiKey ? `${s.apiKey.slice(0, 4)}…${s.apiKey.slice(-4)}` : '(未设置)';
        console.log(`  [#${i}] ${s.id}  ${s.name}  (${s.type})`);
        console.log(`        功能: ${s.features.join(', ')}`);
        console.log(`        API Key: ${keyMasked}`);
        if (s.baseUrl) console.log(`        Base URL: ${s.baseUrl}`);
      });
    });

  // source add — 新增来源
  source
    .command('add')
    .description('新增一个模型来源')
    .requiredOption('-t, --type <type>', '供应商类型（运行 source providers 查看）')
    .requiredOption('-i, --id <id>', '来源唯一标识（同一供应商可注册多个不同 id）')
    .option('-n, --name <name>', '显示名称（默认取供应商名称）')
    .option('-u, --base-url <url>', '自定义 API base URL')
    .option('-f, --features <list>', '启用的功能列表，逗号分隔（默认启用该供应商全部功能）')
    .option('-k, --api-key', '交互式设置 API Key（隐藏回显）')
    .action(async (opts) => {
      const type = opts.type;
      if (!isProviderSupported(type)) {
        console.error(`✗ 不支持的供应商类型: ${type}`);
        console.error('  运行 source providers 查看已支持的供应商');
        process.exit(1);
      }

      const features = parseFeatures(opts.features);
      let apiKey: string | undefined;
      if (opts.apiKey) {
        apiKey = await promptApiKey(`输入 ${type} 的 API Key:`);
        if (!apiKey) {
          console.error('✗ API Key 不能为空');
          process.exit(1);
        }
      }

      try {
        await addSource(opts.id, type as ProviderType, {
          name: opts.name,
          apiKey: apiKey ?? '',
          baseUrl: opts.baseUrl,
          features,
        });
        const provider = getProvider(type as ProviderType)!;
        console.log(`✓ 来源已添加: ${opts.id} (${provider.name})`);
        console.log(`  功能: ${(features ?? provider.supportedFeatures).join(', ')}`);
        if (!apiKey) {
          console.log(`  请运行 'source update ${opts.id} --api-key' 设置 API Key`);
        }
      } catch (e) {
        console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });

  // source update — 更新来源
  source
    .command('update <id>')
    .description('更新指定来源的字段')
    .option('-n, --name <name>', '显示名称')
    .option('-u, --base-url <url>', '自定义 API base URL')
    .option('-f, --features <list>', '启用的功能列表，逗号分隔（覆盖当前）')
    .option('-k, --api-key', '交互式设置 API Key（隐藏回显）')
    .action(async (id: string, opts) => {
      const existing = await getSource(id);
      if (!existing) {
        console.error(`✗ 来源不存在: ${id}`);
        process.exit(1);
      }

      const patch: { name?: string; apiKey?: string; baseUrl?: string; features?: FeatureType[] } = {};
      if (opts.name !== undefined) patch.name = opts.name;
      if (opts.baseUrl !== undefined) patch.baseUrl = opts.baseUrl || undefined;
      if (opts.features !== undefined) patch.features = parseFeatures(opts.features);
      if (opts.apiKey) {
        const key = await promptApiKey(`输入来源 ${id} 的新 API Key:`);
        if (key) patch.apiKey = key;
      }

      if (Object.keys(patch).length === 0) {
        console.error('请至少提供一项：--name、--base-url、--features 或 --api-key');
        process.exit(1);
      }

      try {
        await updateSource(id, patch);
        console.log(`✓ 来源 ${id} 已更新`);
      } catch (e) {
        console.error(`✗ ${e instanceof Error ? e.message : String(e)}`);
        process.exit(1);
      }
    });

  // source remove — 删除来源
  source
    .command('remove <id>')
    .description('删除指定来源')
    .action(async (id: string) => {
      const ok = await removeSource(id);
      if (!ok) {
        console.error(`✗ 来源不存在: ${id}`);
        process.exit(1);
      }
      console.log(`✓ 来源 ${id} 已删除`);
    });

  // source move — 调整优先级
  source
    .command('move <id> <direction>')
    .description('调整来源优先级（up 上移 / down 下移）')
    .action(async (id: string, direction: string) => {
      const dir = direction === 'up' ? -1 : direction === 'down' ? 1 : NaN;
      if (isNaN(dir)) {
        console.error('✗ 方向必须是 up 或 down');
        process.exit(1);
      }
      const ok = await moveSource(id, dir as -1 | 1);
      if (!ok) {
        console.error(`✗ 无法移动来源 ${id}（不存在或越界）`);
        process.exit(1);
      }
      console.log(`✓ 来源 ${id} 已向${direction}移动`);
    });

  // source features — 查看来源启用的功能
  source
    .command('features <id>')
    .description('查看指定来源启用的功能')
    .action(async (id: string) => {
      const s = await getSource(id);
      if (!s) {
        console.error(`✗ 来源不存在: ${id}`);
        process.exit(1);
      }
      const provider = getProvider(s.type);
      console.log(`来源 ${s.id} (${s.name}):`);
      console.log(`  已启用: ${s.features.join(', ')}`);
      if (provider) {
        console.log(`  可启用: ${provider.supportedFeatures.join(', ')}`);
      }
    });
}
