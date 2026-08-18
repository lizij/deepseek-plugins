import { Command } from 'commander';
import { fetchModelsForSource, fetchAllModels } from '@deepseek-plugins/shared/models';
import { getSource, loadAllSources } from '@deepseek-plugins/shared/sources';

export function registerModels(program: Command) {
  program
    .command('models')
    .description('查询可用模型列表（支持多来源）')
    .option('-s, --source <id>', '查询指定来源的模型，不指定则查询所有支持 models 的来源')
    .option('--json', '以 JSON 格式输出')
    .action(async (opts) => {
      if (opts.source) {
        const source = await getSource(opts.source);
        if (!source) {
          console.error(`✗ 来源不存在: ${opts.source}`);
          process.exit(1);
        }
        const { models, error } = await fetchModelsForSource(source);
        if (error) {
          console.error(error);
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify([{ source: { id: source.id, name: source.name, type: source.type }, models }], null, 2));
          return;
        }
        printModels(source.name, models ?? []);
        return;
      }

      const results = await fetchAllModels();
      if (results.length === 0) {
        console.log('没有已启用 models 功能的来源。');
        return;
      }

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      for (const r of results) {
        if (r.error) {
          console.log(`[${r.source.name}] 查询失败: ${r.error}`);
        } else if (r.models) {
          printModels(r.source.name, r.models);
        }
        console.log('');
      }
    });
}

function printModels(name: string, models: Array<{ id: string; ownedBy?: string }>) {
  console.log(`[${name}] 共 ${models.length} 个模型:`);
  for (const m of models) {
    const owner = m.ownedBy ? ` (${m.ownedBy})` : '';
    console.log(`  - ${m.id}${owner}`);
  }
}
