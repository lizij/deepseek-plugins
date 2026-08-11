import { Command } from 'commander';
import { version } from '../package.json';
import { runAsDaemon } from './gui/service.js';
import { registerAuth } from './commands/auth.js';
import { registerVision } from './commands/vision.js';
import { registerMultimodal } from './commands/multimodal.js';
import { registerAudio } from './commands/audio.js';
import { registerPdf } from './commands/pdf.js';
import { registerBalance } from './commands/balance.js';
import { registerSkill } from './commands/skill.js';
import { registerCompletion } from './commands/completion.js';
import { registerMenuBar } from './commands/menubar.js';
import { registerToken } from './commands/token.js';
import { registerGui } from './commands/gui.js';
import { registerService } from './commands/service.js';

// 隐藏入口：作为后台共享服务常驻运行（由 gui/menubar 命令以 detached 方式 spawn）
if (process.argv[2] === '__daemon') {
  runAsDaemon().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
  // runAsDaemon 内部常驻不退出，此处不再继续解析命令
} else {
  const program = new Command();

  program
    .name('deepseek-plugin-cli')
    .description('DeepSeek 插件统一管理工具：API Key 管理、多模态模型配置、识图/音频/PDF、余额查询、菜单栏应用、Skill 安装、Token 统计')
    .version(version);

  registerAuth(program);
  registerVision(program);
  registerMultimodal(program);
  registerAudio(program);
  registerPdf(program);
  registerBalance(program);
  registerSkill(program);
  registerCompletion(program);
  registerMenuBar(program);
  registerToken(program);
  registerGui(program);
  registerService(program);

  program.parseAsync().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}