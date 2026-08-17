import { Command } from 'commander';
import { version } from '../package.json';
import { runAsDaemon } from './gui/service.js';
import { registerAuth } from './commands/auth.js';
import { registerVision } from './commands/vision.js';
import { registerMultimodal } from './commands/multimodal.js';
import { registerAudio } from './commands/audio.js';
import { registerPdf } from './commands/pdf.js';
import { registerVideo } from './commands/video.js';
import { registerBalance } from './commands/balance.js';
import { registerSkill } from './commands/skill.js';
import { registerCompletion } from './commands/completion.js';
import { registerMenuBar } from './commands/menubar.js';
import { registerToken } from './commands/token.js';
import { registerGui } from './commands/gui.js';
import { registerService } from './commands/service.js';
import { registerDoctor } from './commands/doctor.js';
import { registerConfig } from './commands/config.js';

// Node.js 版本检查（双重保险：banner 的 sh 层已检查，此处覆盖直接用 node 执行的情况）
const _nodeVer = process.versions.node.split('.').map(Number);
const _nodeMajor = _nodeVer[0] ?? 0;
const _nodeMinor = _nodeVer[1] ?? 0;
if (_nodeMajor < 22 || (_nodeMajor === 22 && _nodeMinor < 5)) {
  console.error(`❌ Node.js 版本过低（当前 v${process.version}），需要 22.5+，请升级后重试`);
  process.exit(1);
}

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
  registerVideo(program);
  registerBalance(program);
  registerSkill(program);
  registerCompletion(program);
  registerMenuBar(program);
  registerToken(program);
  registerGui(program);
  registerService(program);
  registerDoctor(program);
  registerConfig(program);

  program.parseAsync().catch((err: unknown) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}