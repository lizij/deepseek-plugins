import { Command } from 'commander';
import { getAllKeys, listServices } from '@deepseek-plugins/shared';
import { loadAllModels } from '@deepseek-plugins/shared/multimodal-config';
import { loadAllSources } from '@deepseek-plugins/shared/sources';
import { fetchBalanceForSource } from '@deepseek-plugins/shared/balance';
import { fetchModelsForSource } from '@deepseek-plugins/shared/models';

interface CheckItem {
  ok: boolean;
  label: string;
  detail?: string;
}

/** 诊断命令：检查环境、配置、网络连通性，帮助用户快速定位问题。 */
export function registerDoctor(program: Command) {
  program
    .command('doctor')
    .description('环境自检：检查 Node 版本、API Key、模型配置、网络连通性')
    .action(async () => {
      const checks: CheckItem[] = [];

      // 1. Node.js 版本
      const nodeVer = process.versions.node.split('.').map(Number);
      const nodeMajor = nodeVer[0] ?? 0;
      const nodeMinor = nodeVer[1] ?? 0;
      const nodeOk = nodeMajor > 22 || (nodeMajor === 22 && nodeMinor >= 5);
      checks.push({
        ok: nodeOk,
        label: 'Node.js 版本',
        detail: `v${process.version}（需要 22.5+）`,
      });

      // 2. 凭据文件 & 已配置的 service 数量
      const services = await listServices();
      checks.push({
        ok: services.length > 0,
        label: '凭据文件',
        detail: services.length > 0 ? `已配置 ${services.length} 个 service: ${services.join(', ')}` : '未配置任何 API Key',
      });

      // 3. 来源配置
      const sources = await loadAllSources();
      checks.push({
        ok: sources.length > 0,
        label: '模型来源',
        detail: sources.length > 0
          ? `已配置 ${sources.length} 个来源: ${sources.map((s) => s.id).join(', ')}`
          : '未配置任何来源，运行: source add --type <type> --id <id> --api-key',
      });

      // 4. 多模态模型配置
      const configs = await loadAllModels();
      const primary = configs[0];
      const hasPrimary = !!primary;
      checks.push({
        ok: hasPrimary,
        label: '多模态模型配置',
        detail: hasPrimary
          ? `模型 #0: ${primary.model} @ ${primary.baseUrl}，共 ${configs.length} 个模型`
          : '未配置，运行: multimodal set --base-url <url> --model <name> --api-key',
      });

      // 5. Vision API Key
      const hasVisionKey = !!primary?.apiKey;
      if (hasPrimary && !hasVisionKey) {
        checks.push({
          ok: false,
          label: 'Vision API Key',
          detail: '模型 #0 已配置但缺少 API Key，运行: multimodal set --api-key',
        });
      }

      // 6. 各来源功能连通性检查
      for (const source of sources) {
        if (source.features.includes('balance')) {
          console.log(`  检查来源 ${source.id} 的余额接口...`);
          const { result, error } = await fetchBalanceForSource(source);
          if (result) {
            const main = result.balances[0];
            checks.push({
              ok: true,
              label: `来源 ${source.id} 余额接口`,
              detail: `可达，账户${result.isAvailable ? '可用' : '不可用'}${main ? `，余额 ${main.totalBalance} ${main.currency}` : ''}`,
            });
          } else {
            checks.push({
              ok: false,
              label: `来源 ${source.id} 余额接口`,
              detail: `不可达: ${error}`,
            });
          }
        }

        if (source.features.includes('models')) {
          console.log(`  检查来源 ${source.id} 的模型列表接口...`);
          const { models, error } = await fetchModelsForSource(source);
          if (models) {
            checks.push({
              ok: true,
              label: `来源 ${source.id} 模型接口`,
              detail: `可达，共 ${models.length} 个模型`,
            });
          } else {
            checks.push({
              ok: false,
              label: `来源 ${source.id} 模型接口`,
              detail: `不可达: ${error}`,
            });
          }
        }
      }

      // 输出结果
      console.log('');
      console.log('🔍 环境自检结果');
      console.log('─'.repeat(50));

      let passCount = 0;
      for (const c of checks) {
        const icon = c.ok ? '✅' : '❌';
        console.log(`${icon} ${c.label}`);
        if (c.detail) console.log(`   ${c.detail}`);
        if (c.ok) passCount++;
      }

      console.log('─'.repeat(50));
      const allOk = passCount === checks.length;
      console.log(allOk ? '🎉 全部检查通过，环境就绪！' : `⚠ ${checks.length - passCount} 项未通过，请按上方提示修复`);
      console.log('');

      if (!allOk) process.exit(1);
    });
}
