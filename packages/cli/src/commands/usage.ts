import { Command } from 'commander';
import { fetchUsageForSource, fetchAllUsages } from '@deepseek-plugins/shared/usage';
import { getSource, loadAllSources } from '@deepseek-plugins/shared/sources';

export function registerUsage(program: Command) {
  program
    .command('usage')
    .description('查询使用量（支持多来源）')
    .option('-s, --source <id>', '查询指定来源的使用量，不指定则查询所有支持 usage 的来源')
    .option('--json', '以 JSON 格式输出')
    .action(async (opts) => {
      if (opts.source) {
        const source = await getSource(opts.source);
        if (!source) {
          console.error(`✗ 来源不存在: ${opts.source}`);
          process.exit(1);
        }
        const { result, error } = await fetchUsageForSource(source);
        if (error) {
          console.error(error);
          process.exit(1);
        }
        if (!result) {
          console.error('未获取到使用量数据');
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify([{ source: { id: source.id, name: source.name, type: source.type }, result }], null, 2));
          return;
        }
        printUsage(source.name, result);
        return;
      }

      const results = await fetchAllUsages();
      if (results.length === 0) {
        console.log('没有已启用 usage 功能的来源。');
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      for (const r of results) {
        if (r.error) {
          console.log(`[${r.source.name}] 查询失败: ${r.error}`);
        } else if (r.result) {
          printUsage(r.source.name, r.result);
        }
        console.log('');
      }
    });
}

function printUsage(name: string, result: { usage: Array<{ model?: string; inputTokens?: number; outputTokens?: number; cachedInputTokens?: number; totalTokens?: number; cost?: number; currency?: string; period?: string }>; totalCost?: number; currency?: string }) {
  console.log(`[${name}]`);
  if (result.totalCost !== undefined && result.currency) {
    console.log(`  总费用: ${result.totalCost.toFixed(4)} ${result.currency}`);
  }
  if (result.usage.length === 0) {
    console.log('  暂无使用量数据');
    return;
  }
  for (const u of result.usage) {
    const parts: string[] = [];
    if (u.period) parts.push(u.period);
    if (u.model) parts.push(u.model);
    if (u.totalTokens !== undefined) parts.push(`${u.totalTokens} tokens`);
    if (u.inputTokens !== undefined) parts.push(`输入 ${u.inputTokens}`);
    if (u.outputTokens !== undefined) parts.push(`输出 ${u.outputTokens}`);
    if (u.cost !== undefined && u.currency) parts.push(`${u.cost.toFixed(4)} ${u.currency}`);
    console.log(`  ${parts.join(' · ')}`);
  }
}
