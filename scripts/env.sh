#!/bin/bash
# 将 release/ 目录临时加入当前终端 PATH（仅当前会话生效）
# 用法: source scripts/env.sh

# 兼容 bash / zsh 的脚本所在目录解析
if [ -n "${BASH_SOURCE:-}" ]; then
  _src="${BASH_SOURCE[0]}"
else
  _src="${(%):-%x}"
fi
SCRIPT_DIR="$(cd "$(dirname "$_src")" && pwd)"
RELEASE_DIR="$(cd "$SCRIPT_DIR/../release" && pwd)"

if [ ! -f "$RELEASE_DIR/deepseek-plugin-cli" ]; then
  echo "✗ 未找到 release/deepseek-plugin-cli，请先执行 pnpm -r build"
  return 1 2>/dev/null || exit 1
fi

case ":$PATH:" in
  *":$RELEASE_DIR:"*) ;;
  *) export PATH="$RELEASE_DIR:$PATH" ;;
esac
echo "✓ 已临时加入 PATH（仅当前终端生效）: $RELEASE_DIR"
