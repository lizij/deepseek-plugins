#!/usr/bin/env node
import { fetchBalance, formatBalance } from './balance.js';

const { result, error } = await fetchBalance();

// 错误状态 — 顶栏显示警告图标
if (!result) {
  printLine('💰 ⚠', { color: 'red' });
  printSeparator();
  printLine(error ?? '未知错误');
  printSeparator();
  printLine('配置 Key | bash=deepseek-plugin-cli param1=auth param2=set param3=deepseek terminal=true');
  printLine('刷新 | refresh=true');
  process.exit(0);
}

// 正常状态 — 显示主要币种余额
const main = result.balances[0];
if (!main) {
  printLine('💰 ⚠', { color: 'red' });
  printSeparator();
  printLine('未找到余额数据');
  printLine('刷新 | refresh=true');
  process.exit(0);
}

// 顶栏：总额 + 可用状态
const statusIcon = result.isAvailable ? '' : ' ⚠';
printLine(`💰 ${formatBalance(main.totalBalance, main.currency)}${statusIcon}`);

printSeparator();

// 余额明细
for (const b of result.balances) {
  const label = b.currency === 'CNY' ? 'CNY' : b.currency;
  printLine(`${label} 总额: ${formatBalance(b.totalBalance, b.currency)}`);
  printLine(`${label} 充值: ${formatBalance(b.toppedUpBalance, b.currency)}`);
  printLine(`${label} 赠金: ${formatBalance(b.grantedBalance, b.currency)}`);
  if (b !== result.balances[result.balances.length - 1]) {
    printSeparator();
  }
}

printSeparator();
printLine('可用状态: ' + (result.isAvailable ? '是' : '否'));
printSeparator();
printLine('刷新 | refresh=true');
printLine('配置 Key | bash=deepseek-plugin-cli param1=auth param2=set param3=deepseek terminal=true');
printLine('查看文档 | href=https://api-docs.deepseek.com/zh-cn/api/get-user-balance');

// --- helpers ---

function printLine(text: string, opts?: { color?: string }) {
  if (opts?.color) {
    process.stdout.write(`${text} | color=${opts.color}\n`);
  } else {
    process.stdout.write(`${text}\n`);
  }
}

function printSeparator() {
  process.stdout.write('---\n');
}