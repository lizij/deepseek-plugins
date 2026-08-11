import { Command } from 'commander';
import { loadAllConfigs, missingConfigHint } from '@deepseek-plugins/shared/multimodal-config';
import { analyzeWithFallback } from '@deepseek-plugins/vision-helper/vision';

const DEFAULT_PDF_PROMPT = '请详细描述这个 PDF 文档的内容。';

export function registerPdf(program: Command) {
  program
    .command('pdf')
    .description('调用多模态模型分析 PDF 文档，为纯文本模型补充文档理解能力')
    .argument('<input>', 'PDF 输入：本地文件路径、http(s) URL 或 data: base64 URI')
    .option('-p, --prompt <text>', '对 PDF 文档的提问内容', DEFAULT_PDF_PROMPT)
    .action(async (input: string, opts) => {
      const configs = await loadAllConfigs();
      if (configs.length === 0) {
        console.error(missingConfigHint());
        process.exit(1);
      }
      try {
        const text = await analyzeWithFallback(configs, 'pdf', {
          input,
          prompt: opts.prompt,
        });
        process.stdout.write(text);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`PDF 识别失败: ${msg}`);
        process.exit(1);
      }
    });
}
