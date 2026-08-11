import { Command } from 'commander';
import { loadAllConfigs, missingConfigHint } from '@deepseek-plugins/shared/multimodal-config';
import { analyzeWithFallback } from '@deepseek-plugins/vision-helper/vision';

const DEFAULT_AUDIO_PROMPT = '请逐字转写（ASR）这段音频中所说的每一句话，原样输出文字内容，不要总结、不要翻译、不要补充说明。';

export function registerAudio(program: Command) {
  program
    .command('audio')
    .description('调用多模态模型分析音频，为纯文本模型补充语音识别能力')
    .argument('<input>', '音频输入：本地文件路径、http(s) URL 或 data: base64 URI')
    .option('-p, --prompt <text>', '对音频的提问内容', DEFAULT_AUDIO_PROMPT)
    .action(async (input: string, opts) => {
      const configs = await loadAllConfigs();
      if (configs.length === 0) {
        console.error(missingConfigHint());
        process.exit(1);
      }
      try {
        const text = await analyzeWithFallback(configs, 'audio', {
          input,
          prompt: opts.prompt,
        });
        process.stdout.write(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`音频识别失败: ${msg}`);
        process.exit(1);
      }
    });
}
