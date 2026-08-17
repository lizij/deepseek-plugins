import { Command } from 'commander';
import { spawn, execSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { platform, arch, tmpdir } from 'node:os';
import { getCurrentDir, fileExists, fail } from '../utils.js';
import { isMenuBarRunning, writeMenuBarPid, ensureServiceRunning } from '../gui/service.js';
import menuBarSwiftSource from '../../../menubar/macos/DeepSeekMenuBarApp.swift';

const currentDir = getCurrentDir();

// 菜单栏应用二进制候选路径：release/ 或开发构建目录
function menuBarBinCandidates(): string[] {
  return [
    join(currentDir, 'DeepSeekMenuBar'), // release/ -> release/DeepSeekMenuBar
    join(currentDir, '..', 'release', 'DeepSeekMenuBar'), // dist/ -> release/DeepSeekMenuBar
  ];
}

// 编译 Swift 菜单栏应用（Swift 源码内嵌于 CLI 单文件，解出到临时目录编译）
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

  const outDir = mkdtempSync(join(tmpdir(), 'deepseek-menubar-'));
  const srcPath = join(outDir, 'DeepSeekMenuBarApp.swift');
  writeFileSync(srcPath, menuBarSwiftSource);
  const outPath = join(outDir, 'DeepSeekMenuBar');
  try {
    // swiftc -target 使用 x86_64 / arm64，而 os.arch() 返回 x64 / arm64，需映射
    const cpu = arch();
    const swiftArch = cpu === 'x64' ? 'x86_64' : cpu;
    execSync(`swiftc "${srcPath}" -o "${outPath}" -parse-as-library -framework SwiftUI -framework AppKit -framework Combine -target ${swiftArch}-apple-macos13.0`, {
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
        if (!bin) fail('菜单栏应用编译失败');
        console.log(`✓ 编译完成: ${bin}`);
        return;
      }

      const bin = await resolveMenuBarBin();
      if (!bin) fail('菜单栏应用启动失败');

      // 单例检查：已有 menubar 存活则跳过
      if (isMenuBarRunning()) {
        console.log('✓ 菜单栏应用已在运行，无需重复启动');
        return;
      }

      // 启动共享后台服务（供「打开配置界面」使用），失败不阻塞 menubar 启动
      const cliPath = process.argv[1] || 'deepseek-plugin-cli';
      try {
        await ensureServiceRunning(cliPath);
      } catch (e) {
        console.warn(`⚠ 后台服务启动失败: ${e instanceof Error ? e.message : String(e)}`);
      }

      // 启动菜单栏应用（detached，后台运行），传递 CLI 自身路径
      const child = spawn(bin, [cliPath], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      writeMenuBarPid(child.pid ?? 0);
      console.log('✓ 菜单栏应用已启动，查看 macOS 菜单栏右上角');
      console.log('  退出方式: 点击菜单栏图标 → 退出');
    });
}
