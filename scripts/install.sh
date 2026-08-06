#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

build() {
  echo "==> 构建项目..."
  cd "$PROJECT_DIR" && pnpm install && pnpm -r build
}

link_bin() {
  local src="$1"
  local name="$2"
  local target="/usr/local/bin/$name"
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
  link_bin "$PROJECT_DIR/packages/cli/dist/deepseek-plugin-cli" "deepseek-plugin-cli"
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
  echo "卸载完成。"
}

path_only() {
  echo "将以下内容添加到 ~/.zshrc 或 ~/.bash_profile:"
  echo ""
  echo "export PATH=\"$PROJECT_DIR/packages/cli/dist:\$PATH\""
}

case "${1:-}" in
  --uninstall) uninstall ;;
  --path-only) path_only ;;
  *) install ;;
esac