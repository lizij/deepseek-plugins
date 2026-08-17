import { Command } from 'commander';
import { registerMultimodalCommand } from './multimodal-command.js';

export function registerAudio(program: Command) {
  registerMultimodalCommand(program, {
    name: 'audio',
    modality: 'audio',
    description: '调用多模态模型分析音频，为纯文本模型补充语音识别能力（与 vision/pdf/video 共享模型配置）',
    argumentName: 'input',
    argumentDesc: '音频输入：本地文件路径、http(s) URL 或 data: base64 URI',
    errorPrefix: '音频识别失败',
  });
}
