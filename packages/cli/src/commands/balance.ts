import { Command } from 'commander';
import { fetchBalance, fetchBalanceForSource, formatBalance } from '@deepseek-plugins/shared/balance';
import { getSource, loadAllSources } from '@deepseek-plugins/shared/sources';

export function registerBalance(program: Command) {
  program
    .command('balance')
    .description('查询账户余额（支持多来源）')
    .option('-s, --source <id>', '查询指定来源的余额，不指定则查询所有支持 balance 的来源')
    .option('--json', '以 JSON 格式输出')
    .action(async (opts) => {
      if (opts.source) {
        const source = await getSource(opts.source);
        if (!source) {
          console.error(`✗ 来源不存在: ${opts.source}`);
          process.exit(1);
        }
        const { result, error } = await fetchBalanceForSource(source);
        if (error) {
          console.error(error);
          process.exit(1);
        }
        if (!result) {
          console.error('未获取到余额数据');
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify([{ source: { id: source.id, name: source.name, type: source.type }, result }], null, 2));
          return;
        }
        printBalance(source.name, result);
        return;
      }

      // 查询所有来源
      const sources = await loadAllSources();
      const balanceSources = sources.filter((s) => s.features.includes('balance'));
      if (balanceSources.length === 0) {
        // 向后兼容：尝试旧的 deepseek service key
        const { result, error } = await fetchBalance();
        if (error) {
          console.error(error);
          process.exit(1);
        }
        if (!result) {
          console.error('未获取到余额数据');
          process.exit(1);
        }
        if (opts.json) {
          console.log(JSON.stringify([{ source: { id: 'deepseek', name: 'DeepSeek', type: 'deepseek' }, result }], null, 2));
          return;
        }
        printBalance('DeepSeek', result);
        return;
      }

      const results = await Promise.all(balanceSources.map(fetchBalanceForSource));

      if (opts.json) {
        console.log(JSON.stringify(results, null, 2));
        return;
      }

      for (const r of results) {
        if (r.error) {
          console.log(`[${r.source.name}] 查询失败: ${r.error}`);
        } else if (r.result) {
          printBalance(r.source.name, r.result);
        }
        console.log('');
      }
    });
}

function printBalance(name: string, result: { isAvailable: boolean; balances: Array<{ currency: string; totalBalance: string; grantedBalance?: string; toppedUpBalance?: string }> }) {
  console.log(`[${name}]`);
  console.log(`  账户状态: ${result.isAvailable ? '可用 ✓' : '不可用 ⚠'}`);
  for (const b of result.balances) {
    console.log(`  [${b.currency}] 总额: ${formatBalance(b.totalBalance, b.currency)}`);
    if (b.toppedUpBalance !== undefined) {
      console.log(`  [${b.currency}] 充值: ${formatBalance(b.toppedUpBalance, b.currency)}`);
    }
    if (b.grantedBalance !== undefined) {
      console.log(`  [${b.currency}] 赠金: ${formatBalance(b.grantedBalance, b.currency)}`);
    }
  }
}
