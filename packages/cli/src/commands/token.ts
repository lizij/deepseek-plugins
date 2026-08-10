import { Command } from 'commander';
import {
  formatReport,
  clearAll,
  scanAndAggregate,
  getSummary,
  getBuckets,
  formatNumber,
} from '@deepseek-plugins/token-counter';

export function registerToken(program: Command) {
  const tokenCmd = program
    .command('token')
    .description('Token 用量统计（本地扫描 agent 日志，按 30 分钟桶聚合）');

  tokenCmd
    .command('scan')
    .description('扫描本地 agent 日志（Claude Code / Codex / Cursor / opencode），聚合 token 用量')
    .option('--json', '输出 JSON 格式')
    .action(async (opts) => {
      const result = scanAndAggregate();
      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`扫描完成: ${result.scanned} 个文件, 新增 ${result.new_entries} 条记录, 共 ${result.total_buckets} 个桶`);
        console.log(`数据源: ${result.sources.join(', ') || '无'}`);
      }
    });

  tokenCmd
    .command('today')
    .description('显示今日 token 用量汇总')
    .option('--json', '输出 JSON 格式（供菜单栏使用）')
    .action(async (opts) => {
      const summary = getSummary();
      if (opts.json) {
        console.log(JSON.stringify(summary, null, 2));
      } else {
        console.log('今日 Token 用量');
        console.log('─'.repeat(40));
        console.log(`总计:     ${formatNumber(summary.today).padStart(10)}`);
        console.log(`输入:     ${formatNumber(summary.today_input).padStart(10)}`);
        console.log(`输出:     ${formatNumber(summary.today_output).padStart(10)}`);
        console.log(`缓存:     ${formatNumber(summary.today_cached).padStart(10)}`);
        console.log(`缓存创建: ${formatNumber(summary.today_cache_creation).padStart(10)}`);
        console.log(`推理:     ${formatNumber(summary.today_reasoning).padStart(10)}`);
        console.log('─'.repeat(40));
        console.log(`近 7 天:   ${formatNumber(summary.seven_day).padStart(10)}`);
        console.log(`累计:     ${formatNumber(summary.all_time).padStart(10)}`);
        console.log(`更新时间: ${summary.updated_at}`);
      }
    });

  tokenCmd
    .command('buckets')
    .description('查看最近的 token 桶数据')
    .option('-n, --limit <number>', '显示最近 N 个桶', '20')
    .action(async (opts) => {
      const buckets = getBuckets();
      const limit = parseInt(opts.limit, 10) || 20;
      const recent = buckets.slice(-limit).reverse();
      if (recent.length === 0) {
        console.log('暂无桶数据，请先执行: deepseek-plugin-cli token scan');
        return;
      }
      console.log('时间                  来源          模型                    输入      输出      缓存      总计');
      console.log('─'.repeat(100));
      for (const b of recent) {
        const time = b.bucket_start.replace('T', ' ').replace(':00.000Z', '');
        console.log(
          `${time}  ${b.source.padEnd(12)}  ${b.model.padEnd(20)}  ${formatNumber(b.input_tokens).padStart(6)}  ${formatNumber(b.output_tokens).padStart(6)}  ${formatNumber(b.cached_input_tokens).padStart(6)}  ${formatNumber(b.total_tokens).padStart(8)}`
        );
      }
    });

  tokenCmd
    .command('report')
    .description('生成按日用量报告（基于桶数据）')
    .option('-d, --days <number>', '统计天数', '7')
    .action(async (opts) => {
      const days = parseInt(opts.days, 10);
      if (isNaN(days) || days <= 0) {
        console.error('days 必须是正整数');
        process.exit(1);
      }
      console.log(formatReport(days));
    });

  tokenCmd
    .command('clear')
    .description('清空所有 token 数据（桶 + 扫描元数据）')
    .action(async () => {
      clearAll();
      console.log('所有 token 数据已清空');
    });
}
