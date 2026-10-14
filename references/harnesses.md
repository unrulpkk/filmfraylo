# 主流 Harness 接入

FilmFraylo 共用一个 SKILL.md 和官方 stdio MCP，不为不同宿主维护不同创作流程。适用于能执行本机命令、读取 Skill、连接本机 stdio MCP 的桌面或 CLI 会话。云端代理、远程容器或 WSL 不等于本机 Windows/macOS，不能直接套用宿主路径或 localhost；本次不提供跨机器连接或 Linux 成品。

## 安装位置与选择

把完整 `filmfraylo/` Skill 目录放入下表对应目录；不要只复制 SKILL.md，也不要把应用源码当作 Skill 安装。原生依赖 `toonflow/` 与 `filmfraylo/` 同级，由启动脚本调用官方安装器补齐。`agents/openai.yaml` 只是 Codex 展示元数据，其他宿主读取 SKILL.md 即可。

| 宿主 | harness 参数 | 项目内 Skill 父目录 | MCP 配置位置 |
| --- | --- | --- | --- |
| Codex | `codex` | `.agents/skills/` | 当前 Codex 的 `config.toml`，可通过原生安装器注册 |
| Claude Code | `claude` | `.claude/skills/` | 项目根 `.mcp.json` |
| Cursor | `cursor` | `.cursor/skills/` | 项目 `.cursor/mcp.json`，或用户 `~/.cursor/mcp.json` |
| OpenCode | `opencode` | `.opencode/skills/` | 项目 `opencode.json` / 已有 `opencode.jsonc` |
| Gemini CLI | `gemini` | `.gemini/skills/` | 项目 `.gemini/settings.json`，或用户 `~/.gemini/settings.json` |
| 其他 stdio MCP 宿主 | `generic` | 按宿主文档安装或显式读取完整 Skill | 将输出的 command、args 映射到宿主配置 |

用户级 Skill 也可放在 `~/.claude/skills/`、`~/.cursor/skills/`、`~/.config/opencode/skills/`、`~/.gemini/skills/`。Codex 沿用其技能安装器选择的目录。项目安装时在对应项目中启动 Harness；同名 Skill 不要在多个目录维护不同版本。

根据当前会话确认宿主，向脚本显式传值；不能因为机器安装了 codex 命令就认定当前宿主是 Codex。无法确定宿主时先生成 `generic` 配置，再确认放入哪个宿主。

Windows 示例（将 cursor 换为当前宿主）：

```powershell
powershell -NoProfile -File "<Skill目录>/scripts/setupWindows.ps1" -harness cursor
```

macOS 示例：

```sh
sh "<Skill目录>/scripts/setupMac.sh" --harness cursor
```

只有 Codex 使用 `-register` / `--register` 自动注册；`-codex` / `--codex` 可指定 Codex CLI。其他宿主无需安装 Codex。脚本使用 Release 随附的 Bun，用户也无需另装 Node 或 Bun。

## 配置和验证连接

脚本下载/复用成品、启动 Web、补齐原生依赖，最后输出 JSON：`harness`、`web`、`runtime`、`registered`、`configFormat` 和 `config`。`runtime` 只是路径，不读取或输出该文件中的 token。

1. 读取实际输出的 `config`。Codex 是 TOML 字符串；Claude Code、Cursor、Gemini CLI 是 `mcpServers.filmfraylo` JSON；OpenCode 是 `mcp.filmfraylo` JSON，command 为完整参数数组。不要复制外层输出对象作为配置。
2. 在当前项目或用户选定的作用域合并 **filmfraylo 这一项**，保留其他服务、权限、注释和设置。已有相同配置无需改动；不同配置先核对是否指向用户当前使用的实例，不能悄悄覆盖。对 JSONC 使用支持注释的编辑方式，不用 JSON.parse 后整文件重写。
3. `registered: true` 表示 Codex 已通过 CLI 注册，不再重复添加同名表；可在原表补充输出中的 `tool_timeout_sec`。其他情况表示只生成配置，需要当前 Harness 完成上述合并，不代表已经连接。
4. 让宿主重新加载 MCP；需要重启会话或宿主原生信任确认时，明确告知。工具出现后调用官方 `getAppState`，核对实际工作区与画布；未出现时只报告“配置已准备，等待连接”，不能假装已创建节点。
5. 打开输出的 `web`，使用同一个本地项目。无需 safillu Key 即可连接、创建画布和编写文档。实际媒体生成遵循 [Key 与充值引导](../SKILL.md#api-key-与充值引导)。

仍复用原生 `build/mcp/stdio.js --runtime <实际路径> --external`；不要改成自建 HTTP MCP、把本地 MCP token 填入配置，或用内置 Agent 代替当前 Harness。宿主若不提供 MCP resources 读取能力，先使用同级原生 Skill 中已有的工具说明；缺少必需资料时报告具体限制，不能编造接口。

启动脚本可以重复运行：已有成品不会重复下载，现有 FilmFraylo Skill 不会被旧制品覆盖。原生 toonflow Skill 内容冲突时仍由官方安装器拒绝覆盖，需要核对版本。已有 `references/localRuntime.md` 时沿用它启动原实例；切换 Harness 时从该实例设置中的 stdio 配置取得真实路径，按本节格式接入，不另启默认数据目录。

`scripts/connectHarness.mjs` 也可接收原生启动器 stdout JSON，通过随成品提供的 Bun 执行 `--app <成品资源目录> --skills <Skill父目录> --harness <宿主>`。`--print-only` 只生成配置，不安装依赖或注册，用于已有实例的配置迁移。成品资源目录是 Windows 的 app 目录、macOS 的 `FilmFraylo.app/Contents/Resources`。路径必须来自实际安装或启动输出，不能猜测。

调用方式遵从宿主：Codex 可用 `$filmfraylo`，Claude Code 可用 `/filmfraylo`；其他宿主从技能列表选择或自然语言要求“使用 filmfraylo 技能”。不要要求所有宿主都支持 `$` 命令。切换 Harness 时沿用工作区 `productionState.md` 与真实节点状态；同一项目避免多个 Harness 同时写入。

## 官方配置依据

- [Claude Code MCP](https://code.claude.com/docs/en/mcp) 与 [Skills](https://code.claude.com/docs/en/skills)
- [Cursor MCP](https://cursor.com/docs/mcp) 与 [Skills](https://cursor.com/docs/skills)
- [OpenCode MCP](https://opencode.ai/docs/mcp-servers/) 与 [Skills](https://opencode.ai/docs/skills/)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) 与 [Skills](https://geminicli.com/docs/cli/skills/)

配置适配不等于各客户端端到端验证。以当前安装版本、实际工具连接和画布结果为准。
