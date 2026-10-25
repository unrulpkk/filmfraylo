# 主流 Harness 接入

FilmFraylo 共用一个 SKILL.md 和官方 stdio MCP，不为不同宿主维护不同创作流程。适用于能执行本机命令、读取 Skill、连接本机 stdio MCP 的桌面或 CLI 会话。云端代理、远程容器或 WSL 不等于本机 Windows/macOS，不能直接套用宿主路径或 localhost；本次不提供跨机器连接或 Linux 成品。

## 首次选择运行方式

首次下载前检测本机系统与架构，并检查 [正式 Releases](https://github.com/unrulpkk/filmfraylo/releases/latest) 的附件和说明。向用户展示实际可用性，推荐顺序为桌面版、网页版：

| 选择 | 用户体验 | 需要说明 |
| --- | --- | --- |
| 桌面版（推荐） | 独立应用窗口，画布和本地服务一起启动；Windows 使用 EXE，macOS 使用 App / DMG | 需有对应系统的真正桌面制品；未签名版本可能遇到系统安全提示 |
| 本地网页版 | 本地服务运行，浏览器中使用画布 | 同样需要下载本地运行包；关闭网页不会停止服务，按运行包说明停止 |

两种方式首次启动均需在客户端配置 API Key 和语言模型，已保存配置则直接进入项目首页。内置输入框保留，可独立使用；六种 Harness 也可通过原生 MCP 创建画布、节点和本地文件，使用自身的推理能力完成创作。媒体生成使用已配置的供应商 Key。项目与素材保存在本地。网页方式仍会执行本地程序，不能宣称它无需信任下载内容或能绕过系统限制。

首次提示示例（仅在两种成品都已发布时使用）：

> 建议使用 FilmFraylo 桌面版：Windows 下载 EXE 成品，画布和服务集成在一个应用里；也可以选择浏览器中使用的本地网页版。技能和应用的[源码公开](https://github.com/unrulpkk/filmfraylo)，下载前会核对 Release，下载后会校验 SHA256。未签名版本可能出现系统安全提示；源码公开和校验通过不代表绝对安全。你希望使用「桌面版（推荐）」还是「本地网页版」？

macOS 将提示中的 Windows EXE 换为对应架构的 App / DMG。用户已明确选择或要求推荐方案时不重复提问。把已选方式记入现有项目的 productionState.md（已有项目时），后续沿用；尚未选项目时沿用当前对话，不为记录偏好另建项目或配置系统。

安装脚本默认 `desktop`，下载 `filmFraylo-desktop-<平台>.zip/dmg`，启动原有 Electrobun 桌面窗口。选择网页版传 `-mode web` / `--mode web`，下载 `filmFraylo-web-<平台>.zip/dmg`，直接使用随包 Bun 启动服务。Windows Web 包不再包含 EXE 浏览器启动器。新版工作流需发布新标签后才会提供这些附件；若 Release 缺少所选包，明确报告未发布，不用旧版启动器替代。

Windows 桌面安装在 `~/.filmfraylo/desktop`，新版便携包双击最外层 `filmFraylo.exe` 启动，保留旁边的 `app` 和 `data` 文件夹；旧包入口仍为 `app/bin/launcher.exe`。macOS 安装到 `~/Applications/FilmFraylo.app`，已有系统 Applications 安装则复用。新版 Windows 便携包使用自身 `data` 目录；旧版和 macOS 默认使用 `~/.filmfraylo/desktopData`，已有安装目录旁 data/settings.json 时保持原目录。启动输出含 `mode: desktop`、实际 MCP 目录和 runtime 路径，不需要浏览器页面。Windows 需要系统 WebView2；缺少时引导安装微软官方运行环境，不换用浏览器冒充桌面。

桌面和 Web 数据目录独立；切换方式先停止旧服务，再由用户选择原工作区，不自动迁移或并发写入同一项目。脚本不会覆盖已有不同的 MCP 配置；用户已明确选择切换时，Harness 备份并仅更新 filmfraylo 条目，不改其他服务和权限。已有桌面实例会复用，不另开 Web 服务。

## 源码、构建与 SHA256

安装前提供所选版本的 Release 链接、实际附件名称、对应源码和校验文件链接。选择 Release 后，应用和同名 `.sha256` 应来自同一版本；比较 SHA256 通过后才解压或执行，校验缺失或失败时报告错误，不跳过校验。

- **源码**：[公开仓库](https://github.com/unrulpkk/filmfraylo)，应用在 `source/`，技能在根目录。按 Release 标签或制品 `buildInfo.json` 中的 `commit` 查看对应版本，不能拿不断变化的 main 代替发行源码；没有提交号时如实说明无法定位。
- **构建来源**：`buildInfo.json` 记录版本、提交号、仓库和 Actions runId。它是追溯信息，不是独立证明；发布了 GitHub 构建来源证明时，可用 `gh attestation verify <下载的制品> --repo unrulpkk/filmfraylo` 核验。普通用户不必为此另装 gh；没有核验时不能声称已验证证明。
- **SHA256**：确认下载文件与该版本公布的摘要一致。当前 `.sha256` 校验的是完整 ZIP / DMG，不是里面单独的 EXE；不能把 ZIP 摘要说成 EXE 摘要。SHA256 本身不能证明二进制与源码完全对应，也不能证明没有恶意代码或漏洞。
- **系统提示**：当前打包未配置 Windows 代码签名或 Apple 签名、公证，可能被提醒或阻止。让用户根据来源自行决定，不能承诺“不会报毒”，不能关闭 Defender、SmartScreen 或 Gatekeeper。

Windows 手动查看完整下载包的摘要：

```powershell
Get-FileHash -LiteralPath ".\filmFraylo-desktop-windows-x64.zip" -Algorithm SHA256
Get-Content -LiteralPath ".\filmFraylo-desktop-windows-x64.zip.sha256"
```

比较两者的 64 位十六进制摘要，文件名替换为实际下载附件。启动脚本已自动比较，无需普通用户重复操作。macOS 可用 `shasum -a 256 <实际下载的DMG路径>` 与同名 `.sha256` 比较。

依据：[微软 SmartScreen 说明](https://learn.microsoft.com/en-us/windows/apps/package-and-deploy/smartscreen-reputation)、[GitHub 构建来源证明](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations)。

## 安装位置与选择

下方命令默认桌面版；网页版显式追加 `-mode web` / `--mode web`。

把完整 `filmfraylo/` Skill 目录放入下表对应目录；不要只复制 SKILL.md，也不要把应用源码当作 Skill 安装。原生依赖 `toonflow/` 与 `filmfraylo/` 同级，由启动脚本调用官方安装器补齐。`agents/openai.yaml` 只是 Codex 展示元数据，其他宿主读取 SKILL.md 即可。

| 宿主 | harness 参数 | 项目内 Skill 父目录 | MCP 配置位置 |
| --- | --- | --- | --- |
| Codex | `codex` | `.agents/skills/` | 当前 Codex 的 `config.toml`，可通过原生安装器注册 |
| Claude Code | `claude` | `.claude/skills/` | 自动合并用户 `~/.claude.json`，尊重 CLAUDE_CONFIG_DIR |
| Cursor | `cursor` | `.cursor/skills/` | 自动合并用户 `~/.cursor/mcp.json` |
| OpenCode | `opencode` | `.opencode/skills/` | 自动合并用户 `~/.config/opencode/opencode.json(c)`，尊重 XDG_CONFIG_HOME / OPENCODE_CONFIG |
| Gemini CLI | `gemini` | `.gemini/skills/` | 自动合并用户 `~/.gemini/settings.json` |
| WorkBuddy | `workbuddy` | `.workbuddy/skills/` | 自动合并用户 `~/.workbuddy/mcp.json`，详见 [首次使用](workbuddy.md) |
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

六种宿主默认自动注册，无需额外开关；Codex 使用 CLI，`-codex` / `--codex` 可指定 CLI 路径，其他宿主合并用户级配置。保留 JSONC 注释和其他条目，同名不同配置不覆盖。项目级配置可能覆盖用户级配置，连接不符时检查当前项目，不擅自删除覆盖项。脚本使用 Release 随附的 Bun，其他宿主无需安装 Codex，用户无需另装 Node 或 Bun。

## 配置和验证连接

脚本下载/复用成品、启动所选桌面或 Web、补齐原生依赖，最后输出 JSON：`harness`、`mode`、`web`、`runtime`、`registered`、`configFormat` 和 `config`。`runtime` 只是路径，不输出该文件中的 token。

1. 读取实际输出的 `config`。Codex 是 TOML 字符串；Claude Code、Cursor、Gemini CLI 是 `mcpServers.filmfraylo` JSON；OpenCode 是 `mcp.filmfraylo` JSON，command 为完整参数数组。不要复制外层输出对象作为配置。
2. 在当前项目或用户选定的作用域合并 **filmfraylo 这一项**，保留其他服务、权限、注释和设置。已有相同配置无需改动；不同配置先核对是否指向用户当前使用的实例，不能悄悄覆盖。对 JSONC 使用支持注释的编辑方式，不用 JSON.parse 后整文件重写。
3. `registered: true` 表示 Codex 已通过 CLI 注册，或其他受支持宿主已将配置合并到 `configPath`，不要重复添加。Codex 可在原表补充输出中的 `tool_timeout_sec`。generic 或 print-only 仅生成配置，需要当前 Harness 完成合并；注册成功仍不代表已经连接。
4. 让宿主重新加载 MCP；需要重启会话或宿主原生信任确认时，明确告知。工具出现后调用官方 `getAppState`，核对实际工作区与画布；未出现时只报告“配置已准备，等待连接”，不能假装已创建节点。
5. 桌面版使用应用窗口；只有 Web 模式才在浏览器打开输出的 `web`。首次使用由用户在客户端完成 Key 配置，再调用 `getAppState`；需要新项目时用宿主文件能力创建用户指定目录，再调用 `openProject`。通过 `addCanvas`、节点工具和工作区文件工具创建成果；实际媒体生成遵循 [Key 与充值引导](../SKILL.md#api-key-与充值引导)。

仍复用原生 `build/mcp/stdio.js --runtime <实际路径> --external`；不要改成自建 HTTP MCP、把本地 MCP token 填入配置，或用内置 Agent 代替当前 Harness。宿主若不提供 MCP resources 读取能力，先使用同级原生 Skill 中已有的工具说明；缺少必需资料时报告具体限制，不能编造接口。

启动脚本可以重复运行：已有成品不会重复下载，现有 FilmFraylo Skill 不会被旧制品覆盖。原生 toonflow Skill 内容冲突时仍由官方安装器拒绝覆盖，需要核对版本。已有 `references/localRuntime.md` 时沿用它启动原实例；切换 Harness 时从该实例设置中的 stdio 配置取得真实路径，按本节格式接入，不另启默认数据目录。

`scripts/connectHarness.mjs` 也可接收原生启动器 stdout JSON，通过随成品提供的 Bun 执行 `--app <成品资源目录> --skills <Skill父目录> --harness <宿主>`。`--print-only` 只生成配置，不安装依赖或注册。Web 成品资源目录是 Windows 的 app 目录、macOS 的 `FilmFrayloWeb.app/Contents/Resources`；桌面由启动输出的 `mcpDirectory` 指定实际 MCP 位置，不套用 Web 路径。路径必须来自实际安装或启动输出，不能猜测。

调用方式遵从宿主：Codex 可用 `$filmfraylo`，Claude Code 可用 `/filmfraylo`；其他宿主从技能列表选择或自然语言要求“使用 filmfraylo 技能”。不要要求所有宿主都支持 `$` 命令。切换 Harness 时沿用工作区 `productionState.md` 与真实节点状态；同一项目避免多个 Harness 同时写入。

## 官方配置依据

- [Claude Code MCP](https://code.claude.com/docs/en/mcp) 与 [Skills](https://code.claude.com/docs/en/skills)
- [Cursor MCP](https://cursor.com/docs/mcp) 与 [Skills](https://cursor.com/docs/skills)
- [OpenCode MCP](https://opencode.ai/docs/mcp-servers/) 与 [Skills](https://opencode.ai/docs/skills/)
- [Gemini CLI MCP](https://geminicli.com/docs/tools/mcp-server/) 与 [Skills](https://geminicli.com/docs/cli/skills/)
- [WorkBuddy MCP](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide) 与 [技能安装](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)

配置适配不等于各客户端端到端验证。以当前安装版本、实际工具连接和画布结果为准。
