import { Command } from 'commander';

// zsh 补全脚本（通过 compdef 注册，source 后即可用）
const ZSH_COMPLETION = `# 由 deepseek-plugin-cli completion zsh 生成
_deepseek_services() {
  local -a services
  services=(
    'deepseek:DeepSeek 主 API Key'
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

_deepseek_source() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a cmds
  cmds=(
    'providers:列出已支持的供应商'
    'list:列出所有已配置的来源'
    'add:新增来源'
    'update:更新来源'
    'remove:删除来源'
    'move:调整来源优先级'
    'features:查看来源启用的功能'
  )
  _arguments -C \\
    '1:source 子命令:->cmd' \\
    '*::参数:->args'
  case $state in
    cmd) _describe 'source 子命令' cmds ;;
  esac
}

_deepseek_multimodal() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a cmds
  cmds=(
    'list:列出所有多模态模型'
    'set:设置第一个模型（索引 0）'
    'add:添加模型到末尾'
    'update:更新指定索引模型'
    'remove:删除指定索引模型'
    'move:调整模型优先级'
  )
  _arguments -C \\
    '1:multimodal 子命令:->cmd' \\
    '*::参数:->args'
  case $state in
    cmd) _describe 'multimodal 子命令' cmds ;;
    args)
      case \${words[2]} in
        set)
          _arguments \\
            '--base-url[API base URL]:URL:' \\
            '--model[模型名称]:模型:' \\
            '--api-key[交互式设置 API Key]'
          ;;
        add)
          _arguments \\
            '--base-url[API base URL]:URL:' \\
            '--model[模型名称]:模型:' \\
            '--api-key[交互式设置 API Key]'
          ;;
        update)
          _arguments \\
            '1:模型索引:' \\
            '--base-url[API base URL]:URL:' \\
            '--model[模型名称]:模型:' \\
            '--api-key[交互式设置 API Key]'
          ;;
        remove) _message '请输入模型索引（从 0 开始）' ;;
        move)
          _arguments \\
            '1:模型索引:' \\
            '2:方向:(up down)'
          ;;
      esac
      ;;
  esac
}

_deepseek_vision() {
  _arguments -C \\
    '(-p --prompt)'{-p,--prompt}'[提问内容]:提示词:' \\
    '(-d --detail)'{-d,--detail}'[细节级别]:级别:(low high)' \\
    '1:图片路径:_files'
}

_deepseek_audio() {
  _arguments -C \\
    '(-p --prompt)'{-p,--prompt}'[提问内容]:提示词:' \\
    '1:音频文件:_files'
}

_deepseek_pdf() {
  _arguments -C \\
    '(-p --prompt)'{-p,--prompt}'[提问内容]:提示词:' \\
    '1:PDF 文件:_files -g "*.pdf"'
}

_deepseek_video() {
  _arguments -C \\
    '(-p --prompt)'{-p,--prompt}'[提问内容]:提示词:' \\
    '1:视频文件:_files -g "*.mp4 *.mov *.avi *.mkv *.webm"'
}

_deepseek_skill() {
  local -a cmds
  cmds=(
    'install:安装 Skill'
    'update:更新 Skill'
  )
  _describe 'skill 子命令' cmds
}

_deepseek_token() {
  local -a cmds
  cmds=(
    'scan:扫描 agent 日志并聚合 token 用量'
    'today:显示今日 token 用量汇总'
    'buckets:查看最近的 token 桶数据'
    'report:生成按日用量报告'
    'clear:清空所有 token 数据'
  )
  _describe 'token 子命令' cmds
}

_deepseek_plugin_cli() {
  local curcontext="$curcontext" state line
  typeset -A opt_args
  local -a subcmds
  subcmds=(
    'auth:管理 API Key'
    'source:管理模型来源'
    'vision:图片识别（辅助识图）'
    'multimodal:多模态模型配置管理'
    'audio:音频转写（ASR）'
    'pdf:PDF 文档理解'
    'video:视频内容理解'
    'balance:查询账户余额（多来源）'
    'usage:查询使用量（多来源）'
    'models:查询可用模型列表（多来源）'
    'skill:安装与更新 Skill'
    'menubar:启动 macOS 菜单栏应用'
    'token:Token 用量统计'
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
        source) _deepseek_source ;;
        vision) _deepseek_vision ;;
        multimodal) _deepseek_multimodal ;;
        audio) _deepseek_audio ;;
        pdf) _deepseek_pdf ;;
        video) _deepseek_video ;;
        balance) _arguments '--source[指定来源]:source: --json[输出 JSON 格式]' ;;
        usage) _arguments '--source[指定来源]:source: --json[输出 JSON 格式]' ;;
        models) _arguments '--source[指定来源]:source: --json[输出 JSON 格式]' ;;
        skill) _deepseek_skill ;;
        token) _deepseek_token ;;
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
  local subcommands="auth source vision multimodal audio pdf video balance usage models skill menubar token"
  local auth_cmds="set get unset list"
  local source_cmds="providers list add update remove move features"
  local multimodal_cmds="list set add update remove move"
  local skill_cmds="install update"
  local token_cmds="scan today buckets report clear"
  local services="deepseek"

  case "\$COMP_CWORD" in
    1) COMPREPLY=( \$(compgen -W "\$subcommands --help --version" -- "\$cur") ) ;;
    2)
      case "\${COMP_WORDS[1]}" in
        auth) COMPREPLY=( \$(compgen -W "\$auth_cmds" -- "\$cur") ) ;;
        source) COMPREPLY=( \$(compgen -W "\$source_cmds" -- "\$cur") ) ;;
        vision) COMPREPLY=( \$(compgen -W "-p --prompt -d --detail" -- "\$cur") ) ;;
        multimodal) COMPREPLY=( \$(compgen -W "\$multimodal_cmds" -- "\$cur") ) ;;
        audio) COMPREPLY=( \$(compgen -W "-p --prompt" -- "\$cur") ) ;;
        pdf) COMPREPLY=( \$(compgen -W "-p --prompt" -- "\$cur") ) ;;
        video) COMPREPLY=( \$(compgen -W "-p --prompt" -- "\$cur") ) ;;
        balance) COMPREPLY=( \$(compgen -W "--source --json" -- "\$cur") ) ;;
        usage) COMPREPLY=( \$(compgen -W "--source --json" -- "\$cur") ) ;;
        models) COMPREPLY=( \$(compgen -W "--source --json" -- "\$cur") ) ;;
        skill) COMPREPLY=( \$(compgen -W "\$skill_cmds" -- "\$cur") ) ;;
        token) COMPREPLY=( \$(compgen -W "\$token_cmds" -- "\$cur") ) ;;
      esac
      ;;
    3)
      case "\${COMP_WORDS[1]}" in
        auth)
          case "\${COMP_WORDS[2]}" in
            set|get|unset) COMPREPLY=( \$(compgen -W "\$services" -- "\$cur") ) ;;
          esac
          ;;
        source)
          case "\${COMP_WORDS[2]}" in
            add) COMPREPLY=( \$(compgen -W "--type --id --name --base-url --features --api-key" -- "\$cur") ) ;;
            update) COMPREPLY=( \$(compgen -W "--name --base-url --features --api-key" -- "\$cur") ) ;;
            move) COMPREPLY=( \$(compgen -W "up down" -- "\$cur") ) ;;
          esac
          ;;
        multimodal)
          case "\${COMP_WORDS[2]}" in
            set|add) COMPREPLY=( \$(compgen -W "--base-url --model --api-key" -- "\$cur") ) ;;
            update) COMPREPLY=( \$(compgen -W "--base-url --model --api-key" -- "\$cur") ) ;;
            move) COMPREPLY=( \$(compgen -W "up down" -- "\$cur") ) ;;
          esac
          ;;
      esac
      ;;
    4)
      case "\${COMP_WORDS[1]} \${COMP_WORDS[2]}" in
        "multimodal move") COMPREPLY=( \$(compgen -W "up down" -- "\$cur") ) ;;
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
