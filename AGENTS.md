# AGENTS.md

本文件同时作为 Claude Code 的指令文件（仓库根 `CLAUDE.md` 为其软链）。所有在本仓库工作的 AI Agent 必须遵守以下约定。

## 项目介绍

deepseek-plugins 是一组围绕 DeepSeek API 的个人辅助工具集合，目标是为 `deepseek-v4-pro` / `deepseek-v4-flash` 等纯文本模型补充官方暂未提供的能力。所有功能通过统一的 `deepseek-plugin-cli` 命令管理。

包含以下工具：

- **vision-analyze-helper**：辅助识图工具，通过调用第三方视觉模型为 DeepSeek 等纯文本模型补充图片识别能力。
- **menubar**：原生 macOS 菜单栏应用，在菜单栏实时显示 DeepSeek API 账户余额等信息，无需第三方依赖。

目标用户：使用 DeepSeek API 进行日常开发的个人用户，尤其是需要识图能力和账户监控的开发者。

## 仓库结构

```
deepseek-plugins/
├── AGENTS.md                     # 本文件（= CLAUDE.md 软链目标）
├── package.json                  # monorepo 根（pnpm workspaces）
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── scripts/
│   ├── install.sh                # 一键安装/卸载脚本
│   └── env.sh                    # 临时将 release/ 加入 PATH
└── packages/
    ├── cli/                      # 统一 CLI 入口：deepseek-plugin-cli
    ├── shared/                   # 共享能力：API Key 本地安全存储
    ├── vision-analyze-helper/    # 辅助识图：视觉模型调用 + 跨 agent Skill
    └── menubar/                  # 通用菜单栏应用（Swift）
```

## 使用说明

### 前置依赖

| 依赖 | 版本/说明 | 用途 |
|------|-----------|------|
| Node.js | ≥ 20 | 运行时 |
| pnpm | 最新稳定版 | 包管理 |
| Xcode Command Line Tools | 可选 | 编译原生菜单栏应用（仅 macOS 需要） |

### 安装与构建

```bash
pnpm install
pnpm -r build
```

### 将 CLI 加入 PATH

```bash
# 临时（当前终端会话，使用 release/ 发布产物）
source scripts/env.sh

# 永久（写入 shell profile，固定指向 release/ 发布产物）
bash scripts/install.sh --path-only

# 或使用一键安装脚本（软链到 /usr/local/bin，需 root 权限）
bash scripts/install.sh

# 或安装到用户目录 ~/.local/bin（无需 root 权限）
bash scripts/install.sh --user
```

编译完成后，`release/` 目录下会生成 `deepseek-plugin-cli` 可执行单文件、`deepseek-plugin-skill/` 与 `deepseek-plugin-skill.zip`。

### 启用 shell 补全

CLI 内置 `completion` 子命令，无需安装额外文件。将以下一行加入 `~/.zshrc`（zsh）或 `~/.bashrc`（bash）后重新加载终端：

```bash
# zsh
source <(deepseek-plugin-cli completion zsh)

# bash
source <(deepseek-plugin-cli completion bash)
```


### 配置 API Key

#### DeepSeek API Key（余额查询用）

```bash
deepseek-plugin-cli auth set deepseek
```

#### 视觉模型 API Key 与配置（识图用）

```bash
# 设置 API Key（交互式输入，加密存储）
deepseek-plugin-cli auth set vision

# 配置 base_url 与 model
deepseek-plugin-cli vision config --base-url https://api.openai.com/v1 --model gpt-4o
```

#### 多模型容灾（可选）

支持配置多个备选视觉模型，主模型调用失败时自动切换：

```bash
# 添加备选模型
deepseek-plugin-cli vision fallback add --base-url https://api.anthropic.com/v1 --model claude-3-5-sonnet
# 设置备选模型的 API Key（注意索引从 0 开始）
deepseek-plugin-cli auth set vision.fallback.0

# 查看所有已配置模型
deepseek-plugin-cli vision fallback list

# 删除备选模型
deepseek-plugin-cli vision fallback remove 0
```

调用时按优先级顺序尝试：主模型 → fallback.0 → fallback.1 → …，任一成功即返回。

### 验证

```bash
# 验证 DeepSeek Key：查询余额
deepseek-plugin-cli balance

# 验证视觉模型 Key：分析测试图片
deepseek-plugin-cli vision /tmp/test.png
```

### 命令速查

```bash
deepseek-plugin-cli auth set <service>      # 设置 API Key（交互式，隐藏回显）
deepseek-plugin-cli auth list               # 列出已注册的 service
deepseek-plugin-cli auth unset <service>    # 删除 API Key
deepseek-plugin-cli vision <image> [-p <prompt>] [-d low|high]  # 识图（自动容灾切换）
deepseek-plugin-cli vision config [--base-url <url>] [--model <name>]  # 配置主视觉模型
deepseek-plugin-cli vision fallback add --base-url <url> --model <name>  # 添加备选视觉模型
deepseek-plugin-cli vision fallback list    # 列出所有视觉模型
deepseek-plugin-cli vision fallback remove <index>  # 删除备选模型
deepseek-plugin-cli balance [--json]        # 查询余额
deepseek-plugin-cli skill install           # 安装 Skill
deepseek-plugin-cli skill update            # 更新 Skill
deepseek-plugin-cli completion [zsh|bash]   # 生成 shell 补全脚本
deepseek-plugin-cli menubar [--build]       # 启动 macOS 菜单栏应用
```

### 接入 Agent

#### TRAE

确保 `deepseek-plugin-cli` 在 PATH 中，视觉模型配置已通过 CLI 完成。Skill 已配置在 `.trae/skills/deepseek-plugin-skill/SKILL.md`。

#### Claude Code

确保 `deepseek-plugin-cli` 在 PATH 中，视觉模型配置已通过 CLI 完成。

#### 其他 Agent

只要 agent 支持执行 shell 命令，即可通过 `deepseek-plugin-cli vision` 调用识图能力。只需确保：

1. `deepseek-plugin-cli` 在 PATH 中
2. 视觉模型配置已通过 `deepseek-plugin-cli vision config` 完成
3. API Key 已通过 `deepseek-plugin-cli auth set vision` 完成

## 部署说明

### 原生菜单栏应用（推荐）

通过 CLI 子命令启动原生 macOS 菜单栏应用，无需安装 SwiftBar 等第三方依赖：

```bash
# 启动菜单栏应用（自动编译，菜单栏显示余额，每 10 分钟刷新）
deepseek-plugin-cli menubar

# 强制重新编译
deepseek-plugin-cli menubar --build
```

菜单栏图标为 🐳 emoji，点击下拉菜单显示：
- **总额**：点击跳转 usage 页面
- **可用状态**：显示账户是否可用（绿色=可用 / 红色=不可用）
- **刷新**：点击手动刷新余额和可用状态
- **退出**：关闭菜单栏应用

余额和可用状态每 10 分钟自动刷新一次。

也可通过命令行查询余额：

```bash
deepseek-plugin-cli balance
```

### 识图工具

```bash
deepseek-plugin-cli vision <图片路径|URL|base64> [-p "提问内容"] [-d low|high]
```

## 开发规范

- Commit message：`feat: [简述]` / `fix: [简述]` / `chore: [简述]`，正文附 Summary。
- 改动完成后禁止直接 `git commit` / `git push`，须等待用户确认后手动执行。
- 代码风格：函数保持原子性，核心逻辑不耦合外部状态校验；API 注释简洁（一两句说明功能），避免描述实现细节。
- 文档/方案禁止包含本地绝对路径、真实 ID 等敏感信息，统一使用相对路径。

### Version 自更新规则

版本号格式为 `major.minor.patch`（三位数字），从 `0.0.1` 开始自增。每次改动后必须同步更新以下三处版本号：

- `packages/cli/package.json` — `version` 字段
- `packages/cli/src/cli.ts` — `.version()` 调用
- `packages/cli/skill/SKILL.md` — `metadata.version` 字段

升级规则：

| 变更类型 | 升级位 | 示例 |
|---------|--------|------|
| 重大功能新增、更新或删除 | major | 0.0.1 → 1.0.0 |
| 普通功能新增或修改较多 | minor | 0.0.1 → 0.1.0 |
| 常规文档整理、bug 修复 | patch | 0.0.1 → 0.0.2 |

## 🔒 API Key 安全红线（强制）

DeepSeek API Key 及任何第三方视觉模型 Key 属于敏感凭据，**绝对禁止**：

1. 提交到远端仓库（`.gitignore` 已强制排除相关文件）。
2. 写入日志、错误堆栈、调试输出。
3. 出现在进程命令行参数（`ps` 可见）或 shell history。
4. 落盘为明文文件（如 `.env`、`config.json`）。

**唯一允许的存储方式**：通过 `deepseek-plugin-cli auth` 子命令管理，凭据加密存储于 `~/.deepseek-plugins/credentials.enc`（AES-256-GCM 加密，密钥由机器指纹派生）：

```bash
deepseek-plugin-cli auth set <service>     # 交互式输入（隐藏回显）
deepseek-plugin-cli auth get <service>     # 读取（输出到 stdout，谨慎使用）
deepseek-plugin-cli auth unset <service>   # 删除
deepseek-plugin-cli auth list              # 列出已注册 service 名（不显示值）
```

所有包读取 Key 必须通过 `@deepseek-plugins/shared` 的 `getKey(service)`，禁止自行读取环境变量或文件。已知 service：

- `deepseek` — DeepSeek 主 API Key
- `vision` — 主视觉模型 API Key
- `vision.base_url` — 主视觉模型 API base URL
- `vision.model` — 主视觉模型名称
- `vision.fallback.<N>` — 备选视觉模型 N 的 API Key
- `vision.fallback.<N>.base_url` — 备选视觉模型 N 的 base URL
- `vision.fallback.<N>.model` — 备选视觉模型 N 的名称