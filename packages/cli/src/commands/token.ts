import { Command } from 'commander';
import { logUsage, formatReport, clearLog } from '@deepseek-plugins/token-counter';

export function registerToken(program: Command) {
  const tokenCmd = program
    .command('token')
    .description('Token 用量统计（基于 Claude Code statusline 数据）');

  tokenCmd
    .command('log')
    .description('接收 statusline JSON（stdin），写入日志')
    .action(async () => {
      const chunks: Buffer[] = [];
      for await (const chunk of process.stdin) {
        chunks.push(Buffer.from(chunk));
      }
      const raw = Buffer.concat(chunks).toString('utf-8').trim();
      if (!raw) {
        console.error('未收到 stdin 数据');
        process.exit(1);
      }

      const entry = logUsage(raw);
      if (!entry) {
        console.error('JSON 解析失败');
        process.exit(1);
      }
    });

  tokenCmd
    .command('report')
    .description('生成用量报告')
    .option('-d, --days <number>', '统计天数', '7')
    .option('--clear', '清空日志')
    .action(async (opts) => {
      if (opts.clear) {
        clearLog();
        console.log('日志已清空');
        return;
      }
      const days = parseInt(opts.days, 10);
      if (isNaN(days) || days <= 0) {
        console.error('days 必须是正整数');
        process.exit(1);
      }
      console.log(formatReport(days));
    });
}