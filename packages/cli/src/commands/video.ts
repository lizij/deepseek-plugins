import { Command } from 'commander';
import { registerMultimodalCommand } from './multimodal-command.js';

export function registerVideo(program: Command) {
  registerMultimodalCommand(program, {
    name: 'video',
    modality: 'video',
    description: '调用多模态模型分析视频内容（与 vision/audio/pdf 共享模型配置）',
    argumentName: 'video',
    argumentDesc: '视频路径或 URL',
    errorPrefix: '视频识别失败',
  });
}
