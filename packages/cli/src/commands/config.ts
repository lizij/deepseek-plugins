import { Command } from 'commander';
import { input, confirm, password } from '@inquirer/prompts';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { getAllKeys, updateCredentials, setKey } from '@deepseek-plugins/shared';
import { setModel, addModel } from '@deepseek-plugins/shared/multimodal-config';

const STORAGE_KEY = 'multimodal.models';

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
        message: '是否配置多模态模型？（用于识图/音频/PDF/视频分析）',
        default: true,
      });
      if (wantVision) {
        const visionKey = await password({ message: '输入多模态模型 API Key:', mask: true });
        const baseUrl = await input({
          message: '输入多模态模型 API base URL（OpenAI 兼容）:',
          default: 'https://open.bigmodel.cn/api/paas/v4',
        });
        const model = await input({
          message: '输入多模态模型名称:',
          default: 'glm-4.6v',
        });
        await setModel(0, { baseUrl, model, apiKey: visionKey });
        console.log(`✓ 模型 #0 已配置: ${model} @ ${baseUrl}`);

        // 3. 更多模型
        let addMore = await confirm({
          message: '是否添加更多多模态模型？（按顺序依次尝试）',
          default: false,
        });
        while (addMore) {
          const fbKey = await password({ message: '输入模型 API Key:', mask: true });
          const fbBaseUrl = await input({ message: '输入模型 base URL:' });
          const fbModel = await input({ message: '输入模型名称:' });
          const idx = await addModel(fbBaseUrl, fbModel, fbKey);
          console.log(`✓ 模型 #${idx} 已添加: ${fbModel} @ ${fbBaseUrl}`);
          addMore = await confirm({ message: '继续添加模型？', default: false });
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

      const exportData: Record<string, unknown> = { ...allKeys };
      const rawModels = allKeys[STORAGE_KEY];
      if (rawModels) {
        try {
          exportData[STORAGE_KEY] = JSON.parse(rawModels);
        } catch {
          exportData[STORAGE_KEY] = rawModels;
        }
      }

      const data = JSON.stringify(exportData, null, 2);
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

      // 分离多模态模型配置与其他键
      const multimodalKeys: Record<string, string> = {};
      const otherKeys: Record<string, string> = {};
      for (const [k, v] of Object.entries(data)) {
        if (k === STORAGE_KEY) {
          multimodalKeys[k] = typeof v === 'string' ? v : JSON.stringify(v);
          continue;
        }
        if (typeof v !== 'string') continue;
        if (k === 'vision' || k.startsWith('vision.')) {
          multimodalKeys[k] = v;
        } else {
          otherKeys[k] = v;
        }
      }

      // 非多模态键直接写入
      if (Object.keys(otherKeys).length > 0) {
        await updateCredentials((creds) => {
          for (const [k, v] of Object.entries(otherKeys)) creds[k] = v;
        });
      }

      // 多模态模型配置：支持新格式（multimodal.models）和旧格式（vision.* 扁平键）
      if (Object.keys(multimodalKeys).length > 0) {
        await importMultimodalConfig(multimodalKeys);
      }

      console.log(`✓ 已导入 ${count} 项配置`);
    });
}

/**
 * 导入多模态模型配置。
 * 支持两种格式：
 * 1. 新格式：{ "multimodal.models": "[{...}]" } 直接写入
 * 2. 旧格式：vision / vision.base_url / vision.model / vision.fallback.N.* 转换为新格式
 */
async function importMultimodalConfig(keys: Record<string, string>): Promise<void> {
  // 新格式：直接使用 multimodal.models
  if (keys[STORAGE_KEY]) {
    await updateCredentials((creds) => {
      for (const k of Object.keys(creds)) {
        if (k === 'vision' || k.startsWith('vision.')) delete creds[k];
      }
      creds[STORAGE_KEY] = keys[STORAGE_KEY]!;
    });
    return;
  }

  // 旧格式：vision.* 扁平键 → 转换为 multimodal.models 数组
  const models: Array<{ base_url: string; model: string; api_key: string }> = [];

  const primaryApiKey = keys['vision'];
  const primaryBaseUrl = keys['vision.base_url'];
  const primaryModel = keys['vision.model'];
  if (primaryBaseUrl || primaryModel || primaryApiKey) {
    models.push({
      base_url: primaryBaseUrl ?? '',
      model: primaryModel ?? '',
      api_key: primaryApiKey ?? '',
    });
  }

  const fallbackIndices = new Set<number>();
  for (const k of Object.keys(keys)) {
    const m = k.match(/^vision\.fallback\.(\d+)(?:\.(base_url|model))?$/);
    if (m) fallbackIndices.add(parseInt(m[1]!, 10));
  }
  const sortedIndices = [...fallbackIndices].sort((a, b) => a - b);

  for (const origIdx of sortedIndices) {
    const baseUrl = keys[`vision.fallback.${origIdx}.base_url`];
    const model = keys[`vision.fallback.${origIdx}.model`];
    const apiKey = keys[`vision.fallback.${origIdx}`];
    if (!baseUrl && !model && !apiKey) continue;
    models.push({
      base_url: baseUrl ?? '',
      model: model ?? '',
      api_key: apiKey ?? '',
    });
  }

  await updateCredentials((creds) => {
    for (const k of Object.keys(creds)) {
      if (k === 'vision' || k.startsWith('vision.')) delete creds[k];
    }
    if (models.length > 0) {
      creds[STORAGE_KEY] = JSON.stringify(models);
    } else {
      delete creds[STORAGE_KEY];
    }
  });
}
