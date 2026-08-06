# Vision Analyze Helper — 接入说明

## 快速开始

```bash
# 1. 构建
pnpm install && pnpm -r build

# 2. 配置视觉模型 Key（交互式输入，存入 macOS Keychain）
deepseek-plugin-cli auth set vision

# 3. 配置 base_url 与 model（存入 Keychain）
deepseek-plugin-cli vision config --base-url https://api.openai.com/v1 --model gpt-4o

# 4. 加入 PATH
export PATH="$PWD/packages/cli/dist:$PATH"
# 或一键安装: bash scripts/install.sh
```

## 核心资产

| 文件 | 用途 |
|------|------|
| `skill/SKILL.md` | 跨 agent 通用指令，描述路由规则与调用方式 |
| `.trae/skills/vision-analyze-helper/SKILL.md` | TRAE 专用 Skill 配置（含 frontmatter） |
| `packages/cli/dist/cli.js` | 统一 CLI 入口 `deepseek-plugin-cli` |

## 各 agent 接入

### TRAE
Skill 已配置在 `.trae/skills/vision-analyze-helper/SKILL.md`，TRAE 启动后自动加载。agent 读取 frontmatter description 后按路由规则自主决策。

### Claude Code
将 `skill/SKILL.md` 内容追加到项目根 `CLAUDE.md`，或放入 `.claude/commands/vision-analyze-helper.md`。Claude 读取后在用 DeepSeek 后端时自主调用 CLI。

### Cursor
将 `skill/SKILL.md` 内容放入 `.cursorrules` 或 `.cursor/rules/vision-analyze-helper.mdc`。

### 通用 agent（OpenCode / Aider / 等）
将 `skill/SKILL.md` 作为系统指令注入。只要 agent 能执行 shell 命令并读取 stdout 即可接入。

## 路由机制

不依赖协议层，靠 Skill 指令实现**模型层路由**：

1. agent 加载 Skill 指令
2. 收到图片相关请求时，agent 元模型按指令判断当前后端模型是否支持图片
3. 支持 → 直接处理；不支持 → 调用 `deepseek-plugin-cli vision`
4. CLI stdout 作为图片描述返回给用户

## 配置管理

所有视觉模型配置均通过 CLI 存入 macOS Keychain，无需设置环境变量：

| 配置项 | CLI 命令 |
|--------|----------|
| API Key | `deepseek-plugin-cli auth set vision` |
| base_url | `deepseek-plugin-cli vision config --base-url <url>` |
| model | `deepseek-plugin-cli vision config --model <name>` |

## 安全

- API Key / 配置仅存 macOS Keychain，不落盘、不入 git、不进日志
- 通过 `deepseek-plugin-cli auth` 和 `deepseek-plugin-cli vision config` 命令管理，禁止手工设置环境变量