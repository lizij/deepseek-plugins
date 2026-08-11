import { Command, Option } from 'commander';
import { loadAllConfigs, missingConfigHint } from '@deepseek-plugins/shared/multimodal-config';
import {
  analyzeWithFallback,
  DEFAULT_PROMPT_BY_MODALITY,
  type Modality,
} from '@deepseek-plugins/vision-helper/vision';

interface RegisterOptions {
  /** 命令名，如 'vision' / 'audio' / 'pdf' */
  name: string;
  /** 模态类型 */
  modality: Modality;
  /** 命令描述 */
  description: string;
  /** 参数名（help 文本中展示），如 'image' / 'input' */
  argumentName: string;
  /** 参数描述 */
  argumentDesc: string;
  /** 是否支持 --detail 选项（仅图片） */
  supportDetail?: boolean;
  /** 失败时的错误前缀，如 '图片识别失败' */
  errorPrefix: string;
}

/**
 * 注册多模态分析命令（vision / audio / pdf 共用）。
 * 统一处理：加载配置 → 空检查 → 调用 analyzeWithFallback → 错误输出。
 */
export function registerMultimodalCommand(program: Command, opts: RegisterOptions): void {
  const cmd = program
    .command(opts.name)
    .description(opts.description)
    .argument(`<${opts.argumentName}>`, opts.argumentDesc)
    .option('-p, --prompt <text>', '提问内容', DEFAULT_PROMPT_BY_MODALITY[opts.modality]);

  if (opts.supportDetail) {
    cmd.addOption(
      new Option('-d, --detail <level>', '采样精度：low 更快更省 token，high 更精细')
        .choices(['low', 'high'])
        .default('high'),
    );
  }

  cmd.action(async (input: string, options: { prompt?: string; detail?: string }) => {
    const configs = await loadAllConfigs();
    if (configs.length === 0) {
      console.error(missingConfigHint());
      process.exit(1);
    }
    try {
      const text = await analyzeWithFallback(configs, opts.modality, {
        input,
        prompt: options.prompt,
        detail: options.detail as 'low' | 'high' | undefined,
      });
      process.stdout.write(text);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`${opts.errorPrefix}: ${msg}`);
      process.exit(1);
    }
  });
}
