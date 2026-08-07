import { Command } from 'commander';
import { cp, access, mkdir } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { constants } from 'node:fs';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';

// 兼容 CJS 和 ESM 的 __dirname
const currentDir = (() => {
  // @ts-ignore CJS global
  if (typeof __dirname !== 'undefined') return __dirname;
  return dirname(fileURLToPath(import.meta.url));
})();
const PROJECT_ROOT = join(currentDir, '..', '..', '..');
const SKILL_SOURCE_DIR = join(PROJECT_ROOT, 'packages', 'cli', 'skill');
const SKILL_NAME = 'deepseek-plugin-skill';
const TRAE_SKILL_DIR = join(PROJECT_ROOT, '.trae', 'skills', SKILL_NAME);
const TRAE_SKILL_FILE = join(TRAE_SKILL_DIR, 'SKILL.md');
const GLOBAL_SKILL_DIR = join(homedir(), '.agents', 'skills', SKILL_NAME);

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function installSkill(targetDir: string) {
  const sourceExists = await fileExists(join(SKILL_SOURCE_DIR, 'SKILL.md'));
  if (!sourceExists) {
    console.error(`✗ 源 Skill 目录不存在或不完整: ${SKILL_SOURCE_DIR}`);
    console.error('  请先执行 pnpm -r build');
    process.exit(1);
  }

  await mkdir(targetDir, { recursive: true });
  await cp(SKILL_SOURCE_DIR, targetDir, { recursive: true });
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
      console.log('  # 视觉模型');
      console.log('  deepseek-plugin-cli auth set vision');
      console.log('  deepseek-plugin-cli vision config --base-url https://api.openai.com/v1 --model gpt-4o');
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