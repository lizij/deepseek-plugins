import { Command } from 'commander';
import { fetchBalance, formatBalance } from '@deepseek-plugins/shared/balance';

export function registerBalance(program: Command) {
  program
    .command('balance')
    .description('查询 DeepSeek API 账户余额')
    .option('--json', '以 JSON 格式输出')
    .action(async (opts) => {
      const { result, error } = await fetchBalance();
      if (!result) {
        console.error(error ?? '未知错误');
        process.exit(1);
      }

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
        return;
      }

      const main = result.balances[0];
      if (!main) {
        console.log('未找到余额数据');
        return;
      }

      console.log(`账户状态: ${result.isAvailable ? '可用 ✓' : '不可用 ⚠'}`);
      console.log('');
      for (const b of result.balances) {
        console.log(`[${b.currency}]`);
        console.log(`  总额: ${formatBalance(b.totalBalance, b.currency)}`);
        console.log(`  充值: ${formatBalance(b.toppedUpBalance, b.currency)}`);
        console.log(`  赠金: ${formatBalance(b.grantedBalance, b.currency)}`);
      }
    });
}