#!/usr/bin/env node
import { Command } from 'commander';
import { password } from '@inquirer/prompts';
import { setKey, getKey, unsetKey, listServices } from './credentials.js';

const program = new Command();

program
  .name('deepseek-creds')
  .description('DeepSeek 插件本地凭据管理（macOS Keychain）')
  .version('0.1.0');

program
  .command('set <service>')
  .description('交互式设置指定 service 的 API Key（隐藏回显）')
  .action(async (service: string) => {
    const key = await password({
      message: `输入 ${service} 的 API Key:`,
      mask: true,
    });
    await setKey(service, key);
    console.log(`✓ 已保存到 Keychain (service: ${service})`);
  });

program
  .command('get <service>')
  .description('读取指定 service 的 API Key（输出到 stdout）')
  .action(async (service: string) => {
    const key = await getKey(service);
    if (key === null) {
      console.error(`✗ 未找到 service: ${service}`);
      process.exit(1);
    }
    process.stdout.write(key);
  });

program
  .command('unset <service>')
  .description('删除指定 service 的 API Key')
  .action(async (service: string) => {
    await unsetKey(service);
    console.log(`✓ 已从 Keychain 删除 (service: ${service})`);
  });

program
  .command('list')
  .description('列出已注册的 service 名（不显示 key 值）')
  .action(async () => {
    const services = await listServices();
    if (services.length === 0) {
      console.log('(空)');
      return;
    }
    for (const s of services) console.log(s);
  });

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
