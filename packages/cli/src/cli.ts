import { Command } from 'commander';
import { registerAuth } from './commands/auth.js';
import { registerVision } from './commands/vision.js';
import { registerBalance } from './commands/balance.js';
import { registerSkill } from './commands/skill.js';
import { registerCompletion } from './commands/completion.js';
import { registerMenuBar } from './commands/menubar.js';
import { registerToken } from './commands/token.js';

const program = new Command();

program
  .name('deepseek-plugin-cli')
  .description('DeepSeek 插件统一管理工具：API Key 管理、视觉模型测试、余额查询、菜单栏应用、Skill 安装、Token 统计')
  .version('0.11.1');

registerAuth(program);
registerVision(program);
registerBalance(program);
registerSkill(program);
registerCompletion(program);
registerMenuBar(program);
registerToken(program);

program.parseAsync().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});