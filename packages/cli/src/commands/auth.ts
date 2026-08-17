import { Command } from 'commander';
import { password } from '@inquirer/prompts';
import { setKey, getKey, unsetKey, listServices } from '@deepseek-plugins/shared';

/** 判断 service 是否属于多模态模型配置（应由 multimodal 命令管理）。 */
function isMultimodalService(service: string): boolean {
  return service === 'multimodal.models' || service.startsWith('multimodal.');
}

/** 输出多模态模型配置操作的重定向提示。 */
function multimodalRedirectHint(service: string): string {
  return '多模态模型配置请通过 multimodal 命令管理：\n  deepseek-plugin-cli multimodal --help';
}

export function registerAuth(program: Command) {
  const auth = program
    .command('auth')
    .description('API Key 管理（加密本地文件存储）');

  auth
    .command('set <service>')
    .description('交互式设置 API Key（隐藏回显）')
    .action(async (service: string) => {
      if (isMultimodalService(service)) {
        console.error(`✗ service "${service}" 属于多模态模型配置，不通过 auth 管理。`);
        console.error(multimodalRedirectHint(service));
        process.exit(1);
      }
      const key = await password({
        message: `输入 ${service} 的 API Key:`,
        mask: true,
      });
      await setKey(service, key);
      console.log(`✓ 已保存 (service: ${service})`);
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
      if (isMultimodalService(service)) {
        console.error(`✗ service "${service}" 属于多模态模型配置，不通过 auth 管理。`);
        console.error(multimodalRedirectHint(service));
        process.exit(1);
      }
      await unsetKey(service);
      console.log(`✓ 已删除 (service: ${service})`);
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
