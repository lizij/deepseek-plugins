import { Command } from 'commander';

// zsh 补全脚本（通过 compdef 注册，source 后即可用）
const ZSH_COMPLETION = `# 由 deepseek-plugin-cli completion zsh 生成
_deepseek_services() {
  local -a services
  services=(
    'deepseek:DeepSeek 主 API Key'
    'vision:主视觉模型 API Key'
    'vision.base_url:主视觉模型 base URL'
    'vision.model:主视觉模型名称'
  )
  _describe 'service' services
}

_deepseek_auth() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a cmds
  cmds=(
    'set:设置 API Key（交互式输入）'
    'get:读取 API Key'
    'unset:删除 API Key'
    'list:列出已注册的 service'
  )
  _arguments -C \\
    '1:auth 子命令:->cmd' \\
    '*::参数:->args'
  case $state in
    cmd) _describe 'auth 子命令' cmds ;;
    args)
      case \${words[2]} in
        set|get|unset) _deepseek_services ;;
      esac
      ;;
  esac
}

_deepseek_vision_fallback() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a cmds
  cmds=(
    'add:添加备选视觉模型'
    'list:列出所有视觉模型'
    'remove:删除备选视觉模型'
  )
  _arguments -C \\
    '1:fallback 子命令:->cmd' \\
    '*::参数:->args'
  case $state in
    cmd) _describe 'fallback 子命令' cmds ;;
    args)
      case \${words[3]} in
        add)
          _arguments \\
            '--base-url[API base URL]:URL:' \\
            '--model[模型名称]:模型:'
          ;;
        remove) _message '请输入备选模型索引（从 0 开始）' ;;
      esac
      ;;
  esac
}

_deepseek_vision() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  _arguments -C \\
    '(-p --prompt)'{-p,--prompt}'[提问内容]:提示词:' \\
    '(-d --detail)'{-d,--detail}'[细节级别]:级别:(low high)' \\
    '1:vision 子命令或图片:->cmd' \\
    '*::参数:->args'
  case $state in
    cmd)
      _alternative \\
        'files:图片路径:_files' \\
        'commands:vision 子命令:(config fallback)'
      ;;
    args)
      case \${words[2]} in
        config)
          _arguments \\
            '--base-url[API base URL]:URL:' \\
            '--model[模型名称]:模型:'
          ;;
        fallback) _deepseek_vision_fallback ;;
      esac
      ;;
  esac
}

_deepseek_skill() {
  local -a cmds
  cmds=(
    'install:安装 Skill'
    'update:更新 Skill'
  )
  _describe 'skill 子命令' cmds
}

_deepseek_plugin_cli() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a subcmds
  subcmds=(
    'auth:管理 API Key'
    'vision:图片识别与视觉模型配置'
    'balance:查询 DeepSeek API 余额'
    'skill:安装与更新 Skill'
    'menubar:启动 macOS 菜单栏应用'
  )
  _arguments -C \\
    '(-h --help)'{-h,--help}'[显示帮助信息]' \\
    '(-V --version)'{-V,--version}'[显示版本号]' \\
    '1:子命令:->cmd' \\
    '*::参数:->args'
  case $state in
    cmd) _describe '子命令' subcmds ;;
    args)
      case \${words[2]} in
        auth) _deepseek_auth ;;
        vision) _deepseek_vision ;;
        balance) _arguments '--json[输出 JSON 格式]' ;;
        skill) _deepseek_skill ;;
      esac
      ;;
  esac
}

compdef _deepseek_plugin_cli deepseek-plugin-cli
`;

// bash 补全脚本
const BASH_COMPLETION = `# 由 deepseek-plugin-cli completion bash 生成
_deepseek_plugin_cli_completion() {
  local cur="\${COMP_WORDS[COMP_CWORD]}"
  local subcommands="auth vision balance skill menubar"
  local auth_cmds="set get unset list"
  local vision_cmds="config fallback"
  local fallback_cmds="add list remove"
  local skill_cmds="install update"
  local services="deepseek vision vision.base_url vision.model"

  case "\$COMP_CWORD" in
    1) COMPREPLY=( \$(compgen -W "\$subcommands --help --version" -- "\$cur") ) ;;
    2)
      case "\${COMP_WORDS[1]}" in
        auth) COMPREPLY=( \$(compgen -W "\$auth_cmds" -- "\$cur") ) ;;
        vision) COMPREPLY=( \$(compgen -W "\$vision_cmds -p -d" -- "\$cur") ) ;;
        skill) COMPREPLY=( \$(compgen -W "\$skill_cmds" -- "\$cur") ) ;;
      esac
      ;;
    3)
      case "\${COMP_WORDS[1]}" in
        auth)
          case "\${COMP_WORDS[2]}" in
            set|get|unset) COMPREPLY=( \$(compgen -W "\$services" -- "\$cur") ) ;;
          esac
          ;;
        vision)
          case "\${COMP_WORDS[2]}" in
            config) COMPREPLY=( \$(compgen -W "--base-url --model" -- "\$cur") ) ;;
            fallback) COMPREPLY=( \$(compgen -W "\$fallback_cmds" -- "\$cur") ) ;;
          esac
          ;;
      esac
      ;;
    4)
      case "\${COMP_WORDS[1]} \${COMP_WORDS[2]}" in
        "vision fallback")
          case "\${COMP_WORDS[3]}" in
            add) COMPREPLY=( \$(compgen -W "--base-url --model" -- "\$cur") ) ;;
          esac
          ;;
      esac
      ;;
  esac
}

complete -F _deepseek_plugin_cli_completion deepseek-plugin-cli
`;

export function registerCompletion(program: Command) {
  program
    .command('completion')
    .description('生成 shell 补全脚本（source <(deepseek-plugin-cli completion zsh) 启用）')
    .argument('[shell]', '目标 shell（zsh | bash）', 'zsh')
    .action((shell: string) => {
      if (shell === 'zsh') {
        console.log(ZSH_COMPLETION);
        return;
      }
      if (shell === 'bash') {
        console.log(BASH_COMPLETION);
        return;
      }
      console.error(`✗ 不支持的 shell: ${shell}（支持 zsh | bash）`);
      process.exit(1);
    });
}
