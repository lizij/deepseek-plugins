import { Command } from 'commander';
import { getAllKeys, listServices } from '@deepseek-plugins/shared';
import { loadAllConfigs } from '@deepseek-plugins/shared/multimodal-config';
import { fetchBalance } from '@deepseek-plugins/shared/balance';

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
      const nodeMajor = parseInt(process.versions.node.split('.')[0] ?? '0', 10);
      checks.push({
        ok: nodeMajor >= 20,
        label: 'Node.js 版本',
        detail: `v${process.version}（需要 20+）`,
      });

      // 2. 凭据文件 & 已配置的 service 数量
      const services = await listServices();
      checks.push({
        ok: services.length > 0,
        label: '凭据文件',
        detail: services.length > 0 ? `已配置 ${services.length} 个 service: ${services.join(', ')}` : '未配置任何 API Key',
      });

      // 3. DeepSeek API Key
      const allKeys = await getAllKeys();
      const hasDeepSeekKey = !!allKeys['deepseek'];
      checks.push({
        ok: hasDeepSeekKey,
        label: 'DeepSeek API Key',
        detail: hasDeepSeekKey ? '已配置' : '未配置（余额查询不可用），运行: auth set deepseek',
      });

      // 4. 多模态模型配置
      const configs = await loadAllConfigs();
      const hasPrimary = configs.length > 0;
      const fallbackCount = Math.max(0, configs.length - 1);
      checks.push({
        ok: hasPrimary,
        label: '多模态模型配置',
        detail: hasPrimary
          ? `主模型: ${configs[0].model} @ ${configs[0].base_url}，备选 ${fallbackCount} 个`
          : '未配置，运行: auth set vision + multimodal config',
      });

      // 5. Vision API Key（单独检查，因为可能配了 base_url/model 但没配 key）
      const hasVisionKey = !!allKeys['vision'];
      if (hasPrimary && !hasVisionKey) {
        checks.push({
          ok: false,
          label: 'Vision API Key',
          detail: '主模型已配置但缺少 API Key，运行: auth set vision',
        });
      }

      // 6. DeepSeek 余额接口连通性（实际请求，免费）
      if (hasDeepSeekKey) {
        process.stdout.write('  检查 DeepSeek 余额接口连通性...\r');
        const { result, error } = await fetchBalance();
        if (result) {
          const main = result.balances[0];
          checks.push({
            ok: true,
            label: 'DeepSeek 余额接口',
            detail: `可达，账户${result.isAvailable ? '可用' : '不可用'}${main ? `，余额 ${main.totalBalance} ${main.currency}` : ''}`,
          });
        } else {
          checks.push({
            ok: false,
            label: 'DeepSeek 余额接口',
            detail: `不可达: ${error}`,
          });
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
