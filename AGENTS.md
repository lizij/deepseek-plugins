# AGENTS.md

本文件同时作为 Claude Code 的指令文件（仓库根 `CLAUDE.md` 为其软链）。所有在本仓库工作的 AI Agent 必须遵守以下约定。

## 项目介绍

deepseek-plugins 是一组围绕 DeepSeek API 的个人辅助工具集合，目标是为 `deepseek-v4-pro` / `deepseek-v4-flash` 等纯文本模型补充官方暂未提供的能力。所有功能通过统一的 `deepseek-plugin-cli` 命令管理。

包含以下工具：

- **vision-helper**：辅助多模态工具，通过调用第三方多模态模型为 DeepSeek 等纯文本模型补充图片/音频/PDF 识别能力。
- **menubar**：原生 macOS 菜单栏应用，在菜单栏实时显示 DeepSeek API 账户余额和 Token 用量等信息，无需第三方依赖。
- **token-counter**：Token 用量统计工具，扫描本地 agent 日志（Claude Code / Codex / Cursor / opencode），按 30 分钟桶聚合 token 消耗。

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
    ├── shared/                   # 共享能力：API Key 本地安全存储 + 余额查询
    ├── vision-helper/             # 辅助多模态：图片/音频/PDF 模型调用 + 跨 agent Skill
    ├── token-counter/            # Token 用量统计：扫描 agent 日志并按桶聚合
    └── menubar/                  # 通用菜单栏应用（Swift）
```

## 使用说明

### 前置依赖

| 依赖 | 版本/说明 | 用途 |
|------|-----------|------|
| Node.js | ≥ 22.5 | 运行时 |
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

#### 模型来源（余额/使用量/模型列表查询用）

```bash
# 查看已支持的供应商
deepseek-plugin-cli source providers

# 配置第一个来源（DeepSeek 官方）
deepseek-plugin-cli source add --type deepseek --id deepseek --api-key
```

#### 视觉模型配置（识图用）

```bash
# 配置第一个模型（索引 0，base_url / model / API Key 一步完成，API Key 交互式隐藏输入）
deepseek-plugin-cli multimodal set --base-url https://open.bigmodel.cn/api/paas/v4 --model glm-4.6v --api-key
```

#### 多模型容灾（可选）

支持配置多个视觉模型，按数组顺序依次尝试，任一成功即返回：

```bash
# 添加模型到末尾（含 API Key）
deepseek-plugin-cli multimodal add --base-url https://api.anthropic.com/v1 --model claude-3-5-sonnet --api-key

# 查看所有已配置模型
deepseek-plugin-cli multimodal list

# 更新指定索引模型（base_url / model / API Key）
deepseek-plugin-cli multimodal update 0 --model claude-3-5-haiku

# 调整模型优先级
deepseek-plugin-cli multimodal move 0 up

# 删除指定索引模型
deepseek-plugin-cli multimodal remove 0
```

调用时按数组顺序依次尝试：#0 → #1 → #2 → …，任一成功即返回。

### 验证

```bash
# 验证来源 Key：查询余额
deepseek-plugin-cli balance

# 验证视觉模型 Key：分析测试图片
deepseek-plugin-cli vision /tmp/test.png
```

### 命令速查

```bash
deepseek-plugin-cli auth set <service>      # 设置 API Key（交互式，隐藏回显）
deepseek-plugin-cli auth list               # 列出已注册的 service
deepseek-plugin-cli auth unset <service>    # 删除 API Key
deepseek-plugin-cli source providers        # 列出已支持的供应商及其功能
deepseek-plugin-cli source list             # 列出所有已配置的来源
deepseek-plugin-cli source add --type <type> --id <id> [--name <name>] [--base-url <url>] [--features <list>] --api-key  # 新增来源
deepseek-plugin-cli source update <id> [--name <name>] [--api-key] [--base-url <url>] [--features <list>]  # 更新来源
deepseek-plugin-cli source remove <id>      # 删除来源
deepseek-plugin-cli source move <id> <up|down>  # 调整来源优先级
deepseek-plugin-cli source features <id>    # 查看来源启用的功能
deepseek-plugin-cli vision <image> [-p <prompt>] [-d low|high]  # 识图（自动容灾切换）
deepseek-plugin-cli multimodal list                              # 列出所有多模态模型（按调用优先级排列）
deepseek-plugin-cli multimodal set [--base-url <url>] [--model <name>] [--api-key]  # 设置第一个模型（索引 0）
deepseek-plugin-cli multimodal add --base-url <url> --model <name> [--api-key]      # 添加模型到末尾
deepseek-plugin-cli multimodal update <index> [--base-url <url>] [--model <name>] [--api-key]  # 更新指定索引模型
deepseek-plugin-cli multimodal remove <index>                    # 删除指定索引模型
deepseek-plugin-cli multimodal move <index> <up|down>            # 调整模型优先级
deepseek-plugin-cli audio <input> [-p <prompt>]  # 音频转写（ASR，自动容灾切换）
deepseek-plugin-cli pdf <input> [-p <prompt>]    # PDF 文档理解（自动容灾切换）
deepseek-plugin-cli balance [--source <id>] [--json]  # 查询余额（多来源）
deepseek-plugin-cli usage [--source <id>] [--json]    # 查询使用量（多来源）
deepseek-plugin-cli models [--source <id>] [--json]   # 查询可用模型列表（多来源）
deepseek-plugin-cli token scan [--json]     # 扫描 agent 日志聚合 token 用量
deepseek-plugin-cli token today [--json]    # 今日 token 汇总（含按 Agent/Model 拆分）
deepseek-plugin-cli token buckets [-n N]    # 查看最近 N 个桶数据
deepseek-plugin-cli token report [--days N] # 按日用量报告
deepseek-plugin-cli token clear             # 清空所有 token 数据
deepseek-plugin-cli skill install           # 安装 Skill
deepseek-plugin-cli skill update            # 更新 Skill
deepseek-plugin-cli completion [zsh|bash]   # 生成 shell 补全脚本
deepseek-plugin-cli menubar [--build]       # 启动 macOS 菜单栏应用
deepseek-plugin-cli gui [--no-open]  # 启动/复用后台服务并打开图形化配置界面（管理来源 / 多模态模型 / Token 用量，后台常驻）
deepseek-plugin-cli service status    # 查看后台服务运行状态
deepseek-plugin-cli service stop      # 终止后台服务
deepseek-plugin-cli doctor            # 环境自检（Node 版本 / 来源 / 模型配置 / 网络连通性）
deepseek-plugin-cli config init       # 交互式配置向导（引导设置来源和多模态模型）
deepseek-plugin-cli config export <file>  # 导出所有配置为明文 JSON（跨机器迁移用）
deepseek-plugin-cli config import <file>  # 从 JSON 文件导入配置
```

### 接入 Agent

#### 支持的 Agent 平台

| 平台 | 多模态调用 | Token 统计 | 接入方式 |
|------|-----------|-----------|---------|
| Claude Code | ✅ | ✅ | AGENTS.md 自动加载，无需额外配置 |
| TRAE | ✅ | ✅ | `skill install --agent trae` 安装 Skill |
| Codex | ✅ | ✅ | 确保 CLI 在 PATH 中即可（Token 统计自动扫描 `~/.codex/logs/`） |
| Cursor | ✅ | ✅ | 确保 CLI 在 PATH 中即可（Token 统计自动扫描 Cursor 日志目录） |
| opencode | ✅ | ✅ | 确保 CLI 在 PATH 中即可（Token 统计自动扫描 `opencode.db`） |
| 其他 Agent | ✅ | — | 任何支持执行 shell 命令的 agent，确保 CLI 在 PATH 中即可 |

#### TRAE

确保 `deepseek-plugin-cli` 在 PATH 中，视觉模型配置已通过 CLI 完成。Skill 已配置在 `.trae/skills/deepseek-plugin-skill/SKILL.md`。

#### Claude Code

确保 `deepseek-plugin-cli` 在 PATH 中，视觉模型配置已通过 CLI 完成。

#### Codex / Cursor / opencode

这些平台无需安装 Skill，只要 `deepseek-plugin-cli` 在 PATH 中，即可在对话中通过 shell 命令调用多模态能力。Token 统计会自动扫描对应平台的日志目录：

- **Codex**：`~/.codex/logs/` 或 `~/.config/codex/logs/`
- **Cursor**：`~/Library/Application Support/Cursor/logs/`
- **opencode**：`~/.local/share/opencode/opencode.db`（依赖内置 `node:sqlite`，Node 22.5–22.12 需 `--experimental-sqlite` 或升级至 22.13+，否则读取失败时会输出一次性警告）

#### 其他 Agent

只要 agent 支持执行 shell 命令，即可通过 `deepseek-plugin-cli vision` 调用识图能力。只需确保：

1. `deepseek-plugin-cli` 在 PATH 中
2. 多模态模型配置已通过 `deepseek-plugin-cli multimodal set` 完成（含 API Key）

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
- **打开配置界面**：启动/复用后台服务并在浏览器打开图形化配置页面（管理 API Key / 多模态模型 / Token 用量）
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
- `multimodal.models` — 多模态模型配置数组（JSON 字符串，每个元素含 base_url / model / api_key），按数组顺序依次尝试调用