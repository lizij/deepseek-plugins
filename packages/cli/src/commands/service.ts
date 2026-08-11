import { Command } from 'commander';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { PID_FILE, PORT_FILE, isProcessAlive } from '../gui/service.js';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export function registerService(program: Command) {
  const service = program
    .command('service')
    .description('管理共享后台服务（为 gui / menubar 提供配置与 Token 接口）');

  service
    .command('status')
    .description('查看后台服务运行状态')
    .action(() => {
      if (!existsSync(PID_FILE)) {
        console.log('后台服务未运行');
        return;
      }
      try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
        const port = existsSync(PORT_FILE) ? readFileSync(PORT_FILE, 'utf-8').trim() : '?';
        if (isProcessAlive(pid)) {
          console.log(`✓ 后台服务运行中 (PID: ${pid}, 端口: ${port})`);
          console.log(`  访问: http://127.0.0.1:${port}`);
        } else {
          console.log('✗ 后台服务未运行（PID 文件残留，已清理）');
          unlinkSync(PID_FILE);
          if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE);
        }
      } catch {
        console.log('后台服务未运行');
      }
    });

  service
    .command('stop')
    .description('终止后台服务')
    .action(async () => {
      if (!existsSync(PID_FILE)) {
        console.log('后台服务未运行');
        return;
      }
      try {
        const pid = parseInt(readFileSync(PID_FILE, 'utf-8').trim(), 10);
        if (isProcessAlive(pid)) {
          process.kill(pid, 'SIGTERM');
          for (let i = 0; i < 20; i++) {
            if (!isProcessAlive(pid)) break;
            await sleep(100);
          }
        }
        if (existsSync(PID_FILE)) unlinkSync(PID_FILE);
        if (existsSync(PORT_FILE)) unlinkSync(PORT_FILE);
        console.log('✓ 后台服务已终止');
      } catch (e) {
        console.error('✗ 终止失败:', e instanceof Error ? e.message : String(e));
        process.exit(1);
      }
    });
}
