import { Command } from 'commander';
import { input, confirm, password } from '@inquirer/prompts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getAllKeys, updateCredentials } from '@deepseek-plugins/shared';
import { setPrimaryConfig, addFallbackConfig } from '@deepseek-plugins/shared/multimodal-config';

/** 配置管理命令：init（交互式向导）、export（导出）、import（导入）。 */
export function registerConfig(program: Command) {
  const config = program
    .command('config')
    .description('配置管理：交互式初始化向导、导出/导入配置（跨机器迁移）');

  // config init — 交互式配置向导
  config
    .command('init')
    .description('交互式初始化向导，引导完成 DeepSeek Key 和多模态模型配置')
    .action(async () => {
      console.log('');
      console.log('🚀 DeepSeek Plugins 配置向导');
      console.log('─'.repeat(50));
      console.log('将引导你完成必要的配置，也可随时跳过不需要的项。');
      console.log('');

      // 1. DeepSeek API Key
      const wantDeepSeek = await confirm({
        message: '是否配置 DeepSeek API Key？（用于余额查询）',
        default: true,
      });
      if (wantDeepSeek) {
        const key = await password({ message: '输入 DeepSeek API Key:', mask: true });
        await updateCredentials((creds) => { creds['deepseek'] = key; });
        console.log('✓ DeepSeek API Key 已保存');
      }
      console.log('');

      // 2. 多模态模型
      const wantVision = await confirm({
        message: '是否配置多模态模型？（用于识图/音频/PDF 分析）',
        default: true,
      });
      if (wantVision) {
        const visionKey = await password({ message: '输入多模态模型 API Key:', mask: true });
        await updateCredentials((creds) => { creds['vision'] = visionKey; });

        const baseUrl = await input({
          message: '输入多模态模型 API base URL（OpenAI 兼容）:',
          default: 'https://api.openai.com/v1',
        });
        const model = await input({
          message: '输入多模态模型名称:',
          default: 'gpt-4o',
        });
        await setPrimaryConfig({ baseUrl, model });
        console.log(`✓ 主模型已配置: ${model} @ ${baseUrl}`);

        // 3. 备选模型
        let addMore = await confirm({
          message: '是否添加备选多模态模型？（用于容灾切换）',
          default: false,
        });
        while (addMore) {
          const fbKey = await password({ message: '输入备选模型 API Key:', mask: true });
          const fbBaseUrl = await input({ message: '输入备选模型 base URL:' });
          const fbModel = await input({ message: '输入备选模型名称:' });
          const idx = await addFallbackConfig(fbBaseUrl, fbModel);
          await updateCredentials((creds) => { creds[`vision.fallback.${idx}`] = fbKey; });
          console.log(`✓ 备选模型 #${idx} 已添加: ${fbModel} @ ${fbBaseUrl}`);
          addMore = await confirm({ message: '继续添加备选模型？', default: false });
        }
      }
      console.log('');

      console.log('─'.repeat(50));
      console.log('✅ 配置完成！建议运行以下命令验证：');
      console.log('   deepseek-plugin-cli doctor');
      console.log('');
    });

  // config export — 导出所有配置为明文 JSON（用于跨机器迁移）
  config
    .command('export <file>')
    .description('导出所有配置为明文 JSON 文件（包含 API Key，请勿提交到仓库）')
    .action(async (file: string) => {
      if (existsSync(file)) {
        const overwrite = await confirm({ message: `文件 ${file} 已存在，是否覆盖？`, default: false });
        if (!overwrite) {
          console.log('已取消');
          return;
        }
      }

      const allKeys = await getAllKeys();
      if (Object.keys(allKeys).length === 0) {
        console.error('当前没有任何配置可导出');
        process.exit(1);
      }

      const data = JSON.stringify(allKeys, null, 2);
      writeFileSync(file, data, { mode: 0o600 });
      console.log(`✓ 已导出 ${Object.keys(allKeys).length} 项配置到 ${file}`);
      console.log('⚠ 该文件包含明文 API Key，请勿提交到代码仓库或分享给他人');
    });

  // config import — 从明文 JSON 导入配置
  config
    .command('import <file>')
    .description('从 JSON 文件导入配置（将覆盖已有的同名 service）')
    .action(async (file: string) => {
      if (!existsSync(file)) {
        console.error(`文件不存在: ${file}`);
        process.exit(1);
      }

      let data: Record<string, string>;
      try {
        data = JSON.parse(readFileSync(file, 'utf-8'));
      } catch {
        console.error('文件解析失败，请确保是有效的 JSON 文件');
        process.exit(1);
      }

      if (typeof data !== 'object' || data === null) {
        console.error('JSON 根节点必须是对象');
        process.exit(1);
      }

      const count = Object.keys(data).length;
      const proceed = await confirm({
        message: `即将导入 ${count} 项配置，已有的同名 service 将被覆盖，是否继续？`,
        default: true,
      });
      if (!proceed) {
        console.log('已取消');
        return;
      }

      await updateCredentials((creds) => {
        for (const [k, v] of Object.entries(data)) {
          if (typeof v === 'string') creds[k] = v;
        }
      });
      console.log(`✓ 已导入 ${count} 项配置`);
    });
}
