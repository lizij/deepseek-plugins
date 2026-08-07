import { Command } from 'commander';
import { spawn, execSync } from 'node:child_process';
import { access, constants } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platform, arch } from 'node:os';

// 兼容 CJS 和 ESM 的 __dirname
const currentDir = (() => {
  // @ts-ignore CJS global
  if (typeof __dirname !== 'undefined') return __dirname;
  return dirname(fileURLToPath(import.meta.url));
})();

// 菜单栏应用二进制候选路径：release/ 或开发构建目录
function menuBarBinCandidates(): string[] {
  return [
    join(currentDir, 'DeepSeekMenuBar'), // release/ -> release/DeepSeekMenuBar
    join(currentDir, '..', 'release', 'DeepSeekMenuBar'), // dist/ -> release/DeepSeekMenuBar
  ];
}

// Swift 源码候选路径
function swiftSourceCandidates(): string[] {
  return [
    join(currentDir, '..', '..', 'packages', 'menubar', 'macos', 'DeepSeekMenuBarApp.swift'),
    join(currentDir, '..', 'packages', 'menubar', 'macos', 'DeepSeekMenuBarApp.swift'),
  ];
}

function fileExists(path: string): Promise<boolean> {
  return new Promise((resolve) => {
    access(path, constants.F_OK, (err) => resolve(!err));
  });
}

// 编译 Swift 菜单栏应用
async function buildMenuBar(): Promise<string | null> {
  if (platform() !== 'darwin') {
    console.error('✗ 菜单栏应用仅支持 macOS');
    return null;
  }

  // 查找 swiftc
  try {
    execSync('which swiftc', { stdio: 'pipe' });
  } catch {
    console.error('✗ 未找到 swiftc，请安装 Xcode Command Line Tools: xcode-select --install');
    return null;
  }

  // 查找源码
  let src: string | null = null;
  for (const candidate of swiftSourceCandidates()) {
    if (await fileExists(candidate)) {
      src = candidate;
      break;
    }
  }
  if (!src) {
    console.error('✗ 未找到 Swift 源码，请从源码仓库运行或预先编译');
    return null;
  }

  // 输出到 release/ 或临时目录
  const outDir = join(currentDir, '..', 'release');
  const outPath = join(outDir, 'DeepSeekMenuBar');
  try {
    execSync(`mkdir -p "${outDir}" && swiftc "${src}" -o "${outPath}" -parse-as-library -framework SwiftUI -framework AppKit -framework Combine -target ${arch}-apple-macos13.0`, {
      stdio: 'pipe',
    });
    execSync(`chmod +x "${outPath}"`);
    console.log('✓ 菜单栏应用编译完成');
    return outPath;
  } catch (e) {
    console.error('✗ 编译失败:', (e as Error).message);
    return null;
  }
}

// 查找或编译菜单栏应用
async function resolveMenuBarBin(): Promise<string | null> {
  // 优先使用已编译的二进制
  for (const candidate of menuBarBinCandidates()) {
    if (await fileExists(candidate)) return candidate;
  }
  // 尝试编译
  return buildMenuBar();
}

export function registerMenuBar(program: Command) {
  program
    .command('menubar')
    .description('启动 macOS 菜单栏应用（显示余额，每 10 分钟刷新）')
    .option('--build', '强制重新编译菜单栏应用')
    .action(async (opts: { build?: boolean }) => {
      if (opts.build) {
        const bin = await buildMenuBar();
        if (!bin) process.exit(1);
        console.log(`✓ 编译完成: ${bin}`);
        return;
      }

      const bin = await resolveMenuBarBin();
      if (!bin) process.exit(1);

      // 启动菜单栏应用（detached，后台运行），传递 CLI 自身路径
      const cliPath = process.argv[1] || 'deepseek-plugin-cli';
      const child = spawn(bin, [cliPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      console.log('✓ 菜单栏应用已启动，查看 macOS 菜单栏右上角');
      console.log('  退出方式: 点击菜单栏图标 → 退出');
    });
}
