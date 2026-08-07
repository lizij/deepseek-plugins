import { Command } from 'commander';
import { registerAuth } from './commands/auth.js';
import { registerVision } from './commands/vision.js';
import { registerBalance } from './commands/balance.js';
import { registerSkill } from './commands/skill.js';

const program = new Command();

program
  .name('deepseek-plugin-cli')
  .description('DeepSeek 插件统一管理工具：API Key 管理、视觉模型测试、余额查询、Skill 安装')
  .version('0.2.2');

registerAuth(program);
registerVision(program);
registerBalance(program);
registerSkill(program);

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});