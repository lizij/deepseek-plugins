import { Command } from 'commander';
import { ensureServiceRunning, openBrowser } from '../gui/service.js';

export function registerGui(program: Command) {
  program
    .command('gui')
    .description('启动本地图形化配置界面（管理 API Key / 多模态模型 / Token 用量），后台服务常驻')
    .option('--no-open', '不自动打开浏览器')
    .action(async (opts: { open: boolean }) => {
      const cliPath = process.argv[1] || 'deepseek-plugin-cli';
      const { url, started } = await ensureServiceRunning(cliPath);
      if (opts.open) openBrowser(url);
      console.log(started ? `✓ 后台服务已启动: ${url}` : `✓ 后台服务已在运行: ${url}`);
      console.log('  后台服务常驻，可重复运行本命令打开新页面');
      // 不阻塞，直接退出（后台服务由 detached 子进程承载）
    });
}
