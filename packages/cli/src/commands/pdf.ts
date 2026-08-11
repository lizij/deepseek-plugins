import { Command } from 'commander';
import { registerMultimodalCommand } from './multimodal-command.js';

export function registerPdf(program: Command) {
  registerMultimodalCommand(program, {
    name: 'pdf',
    modality: 'pdf',
    description: '调用多模态模型分析 PDF 文档，为纯文本模型补充文档理解能力',
    argumentName: 'input',
    argumentDesc: 'PDF 输入：本地文件路径、http(s) URL 或 data: base64 URI',
    errorPrefix: 'PDF 识别失败',
  });
}
