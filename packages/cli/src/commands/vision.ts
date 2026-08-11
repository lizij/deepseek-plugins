import { Command } from 'commander';
import { registerMultimodalCommand } from './multimodal-command.js';

export function registerVision(program: Command) {
  registerMultimodalCommand(program, {
    name: 'vision',
    modality: 'image',
    description: '调用多模态模型分析图片，为纯文本模型补充识图能力（与 audio/pdf 共享模型配置）',
    argumentName: 'image',
    argumentDesc: '图片路径、URL 或 base64',
    supportDetail: true,
    errorPrefix: '图片识别失败',
  });
}
