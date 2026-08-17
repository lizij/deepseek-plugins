import { Command } from 'commander';
import { cp, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { getCurrentDir, fileExists, fail } from '../utils.js';

const currentDir = getCurrentDir();
const SKILL_NAME = 'deepseek-plugin-skill';
// 本地安装目标：当前工作目录下的 .trae/skills/
const TRAE_SKILL_DIR = join(process.cwd(), '.trae', 'skills', SKILL_NAME);
const TRAE_SKILL_FILE = join(TRAE_SKILL_DIR, 'SKILL.md');
const GLOBAL_SKILL_DIR = join(homedir(), '.agents', 'skills', SKILL_NAME);

// Skill 源目录候选：开发构建目录或 release 产物目录，取第一个存在者。
async function findSkillSourceDir(): Promise<string | null> {
  const candidates = [
    join(currentDir, '..', 'skill'), // packages/cli/dist -> packages/cli/skill
    join(currentDir, 'deepseek-plugin-skill'), // release/ -> release/deepseek-plugin-skill
  ];
  for (const dir of candidates) {
    if (await fileExists(join(dir, 'SKILL.md'))) return dir;
  }
  return null;
}

async function installSkill(targetDir: string) {
  const sourceDir = await findSkillSourceDir();
  if (!sourceDir) {
    fail('✗ 未找到源 Skill 目录，请先执行 pnpm -r build');
  }

  await mkdir(targetDir, { recursive: true });
  await cp(sourceDir, targetDir, { recursive: true });
  console.log(`  ✓ ${SKILL_NAME} -> ${targetDir}`);
}

export function registerSkill(program: Command) {
  const skill = program
    .command('skill')
    .description('Skill 安装与管理');

  skill
    .command('install')
    .description('安装 deepseek-plugin-skill')
    .option('--agent <agent>', '目标 Agent 类型 (trae/claude/all)', 'trae')
    .option('--global', '安装到全局 ~/.agents/skills/')
    .action(async (opts) => {
      console.log('==> 安装 Skill...');

      if (opts.global) {
        console.log('[全局安装]');
        await installSkill(GLOBAL_SKILL_DIR);
      } else {
        if (opts.agent === 'trae' || opts.agent === 'all') {
          console.log('[TRAE]');
          await installSkill(TRAE_SKILL_DIR);
        }
      }

      if (opts.agent === 'claude' || opts.agent === 'all') {
        console.log('[Claude Code]');
        console.log('  ✓ Claude Code 通过 AGENTS.md 自动加载，无需额外配置');
      }

      console.log('');
      console.log('安装完成。使用前请确保已配置:');
      console.log('  # DeepSeek API Key');
      console.log('  deepseek-plugin-cli auth set deepseek');
      console.log('');
      console.log('  # 多模态模型');
      console.log('  deepseek-plugin-cli multimodal set --base-url https://open.bigmodel.cn/api/paas/v4 --model glm-4.6v --api-key');
    });

  skill
    .command('update')
    .description('更新已安装的 Skill 到最新版本')
    .option('--agent <agent>', '目标 Agent 类型 (trae/claude/all)', 'trae')
    .action(async (opts) => {
      console.log('==> 更新 Skill...');

      if (opts.agent === 'trae' || opts.agent === 'all') {
        const exists = await fileExists(TRAE_SKILL_FILE);
        if (!exists) {
          console.log('[TRAE] Skill 未安装，请先执行 install');
        } else {
          console.log('[TRAE]');
          await installSkill(TRAE_SKILL_DIR);
        }
      }

      if (opts.agent === 'claude' || opts.agent === 'all') {
        console.log('[Claude Code]');
        console.log('  ✓ Claude Code 通过 AGENTS.md 自动加载，无需额外配置');
      }

      console.log('更新完成。');
    });
}
