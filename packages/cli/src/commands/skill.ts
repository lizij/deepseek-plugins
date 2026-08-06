import { Command } from 'commander';
import { readFile, mkdir, access, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { constants } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..', '..');
const SKILL_SOURCE = join(PROJECT_ROOT, 'packages', 'vision-analyze-helper', 'skill', 'SKILL.md');
const TRAE_SKILL_DIR = join(PROJECT_ROOT, '.trae', 'skills', 'vision-analyze-helper');
const TRAE_SKILL_FILE = join(TRAE_SKILL_DIR, 'SKILL.md');

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function installSkill(targetDir: string, skillName: string) {
  const targetFile = join(targetDir, skillName, 'SKILL.md');
  await mkdir(dirname(targetFile), { recursive: true });

  const sourceExists = await fileExists(SKILL_SOURCE);
  if (!sourceExists) {
    console.error(`✗ 源 Skill 文件不存在: ${SKILL_SOURCE}`);
    console.error('  请先执行 pnpm -r build');
    process.exit(1);
  }

  const content = await readFile(SKILL_SOURCE, 'utf-8');
  await writeFile(targetFile, content, 'utf-8');
  console.log(`  ✓ ${skillName} -> ${targetFile}`);
}

export function registerSkill(program: Command) {
  const skill = program
    .command('skill')
    .description('Skill 安装与管理');

  skill
    .command('install')
    .description('安装 vision-analyze-helper Skill 到当前项目')
    .option('--agent <agent>', '目标 Agent 类型 (trae/claude/all)', 'trae')
    .action(async (opts) => {
      console.log('==> 安装 Skill...');

      if (opts.agent === 'trae' || opts.agent === 'all') {
        console.log('[TRAE]');
        await installSkill(join(PROJECT_ROOT, '.trae', 'skills'), 'vision-analyze-helper');
      }

      if (opts.agent === 'claude' || opts.agent === 'all') {
        console.log('[Claude Code]');
        // Claude Code 通过 CLAUDE.md / AGENTS.md 加载，无需额外操作
        console.log('  ✓ Claude Code 通过 AGENTS.md 自动加载，无需额外配置');
      }

      console.log('');
      console.log('安装完成。使用前请确保已配置视觉模型:');
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
          await installSkill(join(PROJECT_ROOT, '.trae', 'skills'), 'vision-analyze-helper');
        }
      }

      if (opts.agent === 'claude' || opts.agent === 'all') {
        console.log('[Claude Code]');
        console.log('  ✓ Claude Code 通过 AGENTS.md 自动加载，无需额外操作');
      }

      console.log('更新完成。');
    });
}