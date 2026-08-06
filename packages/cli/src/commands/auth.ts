import { Command } from 'commander';
import { password } from '@inquirer/prompts';
import { setKey, getKey, unsetKey, listServices } from '@deepseek-plugins/shared';

export function registerAuth(program: Command) {
  const auth = program
    .command('auth')
    .description('API Key 管理（macOS Keychain 安全存储）');

  auth
    .command('set <service>')
    .description('交互式设置 API Key（隐藏回显）')
    .action(async (service: string) => {
      const key = await password({
        message: `输入 ${service} 的 API Key:`,
        mask: true,
      });
      await setKey(service, key);
      console.log(`✓ 已保存到 Keychain (service: ${service})`);
    });

  auth
    .command('get <service>')
    .description('读取 API Key（输出到 stdout，谨慎使用）')
    .action(async (service: string) => {
      const key = await getKey(service);
      if (key === null) {
        console.error(`✗ 未找到 service: ${service}`);
        process.exit(1);
      }
      process.stdout.write(key);
    });

  auth
    .command('unset <service>')
    .description('删除 API Key')
    .action(async (service: string) => {
      await unsetKey(service);
      console.log(`✓ 已从 Keychain 删除 (service: ${service})`);
    });

  auth
    .command('list')
    .description('列出已注册的 service 名（不显示 Key 值）')
    .action(async () => {
      const services = await listServices();
      if (services.length === 0) {
        console.log('(空)');
        return;
      }
      for (const s of services) console.log(s);
    });
}