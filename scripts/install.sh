#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

build() {
  if ! command -v node >/dev/null 2>&1; then
    echo "❌ 未检测到 Node.js。构建需要 Node.js 20+，请安装：https://nodejs.org" >&2
    exit 1
  fi
  local node_major
  node_major=$(node -p "parseInt(process.versions.node.split('.')[0])")
  if [ "$node_major" -lt 20 ]; then
    echo "❌ Node.js 版本过低（当前 v$(node -v)），构建需要 20+，请升级后重试" >&2
    exit 1
  fi
  echo "==> 构建项目..."
  cd "$PROJECT_DIR" && pnpm install && pnpm -r build
}

# 固定使用 release/ 发布产物
cli_bin() {
  echo "$PROJECT_DIR/release/deepseek-plugin-cli"
}

# 用户级安装目录（无需 root 权限）
USER_BIN_DIR="$HOME/.local/bin"

link_bin() {
  local src="$1"
  local name="$2"
  local bin_dir="${3:-/usr/local/bin}"
  local target="$bin_dir/$name"
  if [ -L "$target" ]; then
    rm "$target"
  fi
  ln -s "$src" "$target"
  echo "  ✓ $name -> $target"
}

install() {
  build
  echo "==> 安装 CLI 到 /usr/local/bin..."
  mkdir -p /usr/local/bin
  link_bin "$(cli_bin)" "deepseek-plugin-cli"
  echo ""
  echo "安装完成。现在可以直接使用:"
  echo "  deepseek-plugin-cli auth set deepseek"
  echo "  deepseek-plugin-cli vision image.png"
  echo "  deepseek-plugin-cli balance"
  echo "  deepseek-plugin-cli skill install"
}

install_user() {
  build
  echo "==> 安装 CLI 到 $USER_BIN_DIR..."
  mkdir -p "$USER_BIN_DIR"
  link_bin "$(cli_bin)" "deepseek-plugin-cli" "$USER_BIN_DIR"
  case ":$PATH:" in
    *":$USER_BIN_DIR:"*) ;;
    *)
      echo ""
      echo "⚠ $USER_BIN_DIR 不在 PATH 中，请将其加入 shell profile："
      echo "   echo 'export PATH=\"$USER_BIN_DIR:\$PATH\"' >> ~/.zshrc"
      ;;
  esac
  echo ""
  echo "安装完成。现在可以直接使用:"
  echo "  deepseek-plugin-cli auth set deepseek"
  echo "  deepseek-plugin-cli vision image.png"
  echo "  deepseek-plugin-cli balance"
  echo "  deepseek-plugin-cli skill install"
}

uninstall() {
  echo "==> 卸载 CLI..."
  rm -f /usr/local/bin/deepseek-plugin-cli
  rm -f "$USER_BIN_DIR/deepseek-plugin-cli"
  echo "卸载完成。"
}

path_only() {
  local bin_dir="$(dirname "$(cli_bin)")"
  echo "将以下内容添加到 ~/.zshrc 或 ~/.bash_profile:"
  echo ""
  echo "export PATH=\"$bin_dir:\$PATH\""
  echo ""
  echo "临时生效（仅当前终端）：source scripts/env.sh"
}

case "${1:-}" in
  --uninstall) uninstall ;;
  --path-only) path_only ;;
  --user) install_user ;;
  *) install ;;
esac