---
name: filmfraylo
description: 由 Codex、Claude Code、Cursor、OpenCode、Gemini CLI 或 WorkBuddy 等外部 Harness 在 FilmFraylo 完成影视创作、剧本、分镜与媒体生产，并协助安装、检查和升级本地客户端。用于 FilmFraylo 项目及客户端维护，不用于一般写作或源码开发。
---

# FilmFraylo 外部 Harness

用户要求检查更新、升级客户端或更新 FilmFraylo 时，先读取 [客户端更新](references/clientUpdates.md)。客户端更新、Skill 更新和模型列表同步是不同操作；不要用重新运行首次安装替代升级，也不要为检查版本启动创作流程。

当前外部 Harness 负责阅读、推理、创作与工具执行。连接前读取同批安装的官方 [Toonflow MCP Skill](../toonflow/SKILL.md)；首次缺少依赖时先按下节安装。保持官方工具、工作区文件和节点契约；不调用 `runAgent`，不替换运行时，不直接写画布 JSON。

首次安装、切换宿主或 MCP 工具不可用时，先读取 [Harness 接入](references/harnesses.md)，确认当前宿主的 Skill 目录、配置格式和重连方式。同一 Skill 支持 Codex、Claude Code、Cursor、OpenCode、Gemini CLI、WorkBuddy；其他客户端可用标准 stdio MCP 配置，但需确认其本机执行能力。

WorkBuddy 用户先读取 [WorkBuddy 首次使用](references/workbuddy.md)，按自动注册流程完成接入。

## 首次使用与系统识别

首次下载安装前，按 [运行方式与来源说明](references/harnesses.md#首次选择运行方式) 向用户提供两个选项：**桌面版（推荐，Windows EXE / macOS App）**、**本地网页版**，说明源码地址、构建提交号、SHA256 校验和未签名提示。已有明确选择时直接沿用，不反复询问；用户要求“推荐方案”时优先桌面版。先核实对应 Release 是否有真正的桌面成品，不能把打开浏览器的 EXE 启动器称为桌面版，也不能在桌面版缺失时悄悄改用网页版。

普通用户只安装 Skill，由本 Skill 下载已经编译好的应用成品。无需克隆 `source/`、安装开发依赖或执行源码构建；仓库源码用于查看与审查。没有正式 Release、对应平台附件缺失或下载失败时，报告具体原因，不自动改走源码安装。仅在用户明确要求源码开发或自编译时使用开发流程。

已有 `references/localRuntime.md` 时使用其中命令，不重复下载或迁移数据；该入口必须与用户选择的运行方式一致。以下脚本默认使用真正桌面版；用户选择网页版时显式传入 `-mode web` / `--mode web`，不隐式降级。按宿主系统选择，不从浏览器 User-Agent 猜测系统，不下载其他平台的包：

- Windows：运行 `powershell -NoProfile -File <本Skill目录>/scripts/setupWindows.ps1 -harness <宿主>`，脚本确认 x64，下载 Windows ZIP。
- macOS：运行 `sh <本Skill目录>/scripts/setupMac.sh --harness <宿主>`，脚本自动识别 Intel / Apple Silicon（包括 Rosetta），下载对应 DMG。
- 其他系统、Windows ARM：说明当前发行包不支持，不套用 Windows 或 Mac 包。

宿主参数为 `codex`、`claude`、`cursor`、`opencode`、`gemini`、`workbuddy` 或 `generic`；省略时默认为 Codex。六种宿主默认自动配置 MCP，只有 Codex 使用 Codex CLI；其他宿主合并用户级配置、保留无关内容和注释、拒绝覆盖同名冲突。generic 仅生成配置。`-register` / `--register` 保留兼容旧调用。脚本的 `-inspect` / `--inspect` 只显示系统、架构、下载文件、宿主和安装位置，不下载或启动。路径作为独立命令参数传入，含空格时正确引用。Codex CLI 不在 PATH 时可使用 `-codex` / `--codex` 指定实际 CLI 路径。

本仓库根目录就是 FilmFraylo Skill。应用制品只从 [GitHub Releases](https://github.com/unrulpkk/filmfraylo/releases/latest) 获取；不要使用 Source code ZIP/TAR 或 Actions 临时 artifact。脚本读取 `references/releaseRepository.txt`，先解析正式 Release 并固定到该版本：桌面包为 `filmFraylo-desktop-windows-x64.zip`、`filmFraylo-desktop-macos-arm64.dmg` 或 `filmFraylo-desktop-macos-x64.dmg`；网页版把文件名中的 `desktop` 换为 `web`。先校验同名 `.sha256` 再安装；旧 Release 缺少新附件时明确报告，不拿旧 Web EXE 替代桌面版。

单独安装 Skill 也可使用同一 Release 的 `filmFrayloSkills.zip`，包含官方 MCP Skill 依赖。仓库地址为空时，使用用户提供或已验证的 GitHub 地址，以 `-repository owner/repo` / `--repository owner/repo` 传入；不能猜测下载源。不会覆盖已有应用或已修改的 Skill；安装冲突时保留现有内容，核对 Skill 与运行包版本。

网页版安装后打开本地 Web，重新连接 MCP 再创作；桌面版在应用窗口中操作画布。遇到系统安全提示时说明实际情况，不自动关闭系统防护或清除隔离属性；SHA256 不能替代代码签名或保证软件无风险。首次使用须在客户端配置 API Key 和语言模型；已保存配置的用户无需重复填写。

## API Key 与充值引导

官网及充值入口统一使用 https://api.safillu.com。需要获取 Key 或充值时提供可点击链接；未核实具体页面路径时只使用该首页，不猜测登录、令牌或支付页面地址。

- 首次启动引导用户在客户端填写 Safillu API Key，或通过「添加私有提供商」配置带 Key 的语言模型，再进入项目首页。不要跳过引导或代填虚构 Key。内置输入框始终保留，用户可以独立使用 FilmFraylo；通过本 Skill 创作时，由当前 Harness 规划并操作 MCP 画布。
- 首次准备调用图片、视频或配音模型时，若未配置 Key，引导用户在官网获取 API Key，再到本地 FilmFraylo「设置 → 媒体模型 → safillu → 编辑模型」填写 API Key 并保存。默认服务地址为 `https://api.safillu.com`。未配置时保留已有文件和画布，继续可独立完成的文字工作，不阻塞整个创作流程。
- Key 由用户直接填入本地网页，不要求粘贴到聊天里，不回显 Key，也不把它写入剧本、画布文本、日志或 productionState.md。检查状态时优先使用不返回密钥的模型或配置状态接口。
- 只有供应商明确返回余额或额度不足时才引导到官网充值；认证失败先检查 Key 和权限，网络错误、限流或模型不可用按真实错误处理，不一律要求充值。不编造余额、套餐、价格或预计费用。
- 充值金额与支付由用户在官网自行完成。用户确认已配置或已充值后，先核对现有任务状态，再继续已授权且尚未完成的生成；保留节点及结果，不重复提交。没有可用的免费验证接口时，不用付费生成偷偷测试 Key。

需要 Key 时可提示：

> 接下来生成图片、视频或配音需要 safillu API Key。请到 [safillu 官网](https://api.safillu.com) 获取 Key，在本地 FilmFraylo 的「设置 → 媒体模型 → safillu → 编辑模型」中填写并保存。如果账户余额不足，可在同一网站充值。请直接在网页填写 Key，无需发给我；完成后告诉我，我们继续当前任务。

## 启动与定位

1. 先调用官方 MCP `getAppState`。工具缺失或服务离线时，若已存在安装器生成的 [本机启动入口](references/localRuntime.md)，执行其中命令数组；没有则执行上面的成品安装流程。仅当用户明确选择源码开发环境时，在应用根目录执行 `bun run install:filmFraylo`。
2. 启动脚本检查目标目录和端口，只启动缺失服务。输出包含网页地址、runtime 路径和Skill 安装状态；不读取或输出 runtime 中的 token。Skill 不会让本轮尚未注册的 MCP 工具自动出现，首次配置后需要重新连接 MCP。
3. 网页版用浏览器打开脚本返回的 Web 地址；桌面版使用应用窗口，不额外打开浏览器。首次使用由用户在客户端完成 Key 配置，已配置则直接进入项目首页。调用 `getAppState` 定位连接；新项目先通过宿主文件能力创建用户指定的本地目录，再使用官方 `openProject` 打开该目录。使用 `addCanvas` 和工作区文件工具准备画布与文件，再刷新实际 connectionId、directory、canvasId；不借用其他实例，不直接写画布 JSON。
4. 宿主支持时，通过 resources/list/read 发现当前 Toonflow 的 workflow 及需要的资料，尊重用户已修改版本；缺少 resources 能力时按 Harness 接入说明处理。内置工作流的提问映射到当前宿主对话，创作和调用均由当前 Harness 完成。

## 选择当前阶段

视频制作先通过官方应用操作 `listMediaProviders` 读取当前供应商列表，筛选 `type: "video"`；已有目标节点时再用 `getNodeTools` 和节点的 `node:getConfig` 核对当前可选模型及模式、时长、分辨率和声音能力。按官方 MCP Skill 先发现操作 schema，不猜测调用参数。模型出现在列表中不代表 Key、余额或调用权限已验证；读取失败或未配置时报告实际缺项，不用记忆中的型号补选项。用户已指定的模型先核实；未指定时，只从实际支持本次输入与规格的模型中推荐或询问，有唯一匹配项时说明选择并沿用现有授权。**模型确认后才进入对应提示词规则；workflow 中的 Seedance PART A 仅适用于已选择 Seedance 的任务，不能把所有视频任务默认归为 Seedance 或预设询问“2.0 还是 2.5”。**

这是一个 Skill 的五个制作阶段，不是五个独立 Skill。当前 Harness 根据任务和 productionState.md 按需读取对应参考文档，已确认的成果直接接续；用户只需调用 filmfraylo 技能，无需切换入口。调用语法使用当前宿主支持的方式。

| 任务 | 阶段参考 | 主要交付 |
| --- | --- | --- |
| 全书结构、伏笔、改编可行性 | [novelAnalysis](references/novelAnalysis.md) | 阅读覆盖表、事件因果与改编建议 |
| 角色关系与视觉、声音一致性 | [characterProfiles](references/characterProfiles.md) | 角色档案与关系、版本状态 |
| 小说改编分集剧本 | [episodeScripts](references/episodeScripts.md) | 分集表、逐场剧本与改编对照 |
| 导演分镜与连续性 | [directorShots](references/directorShots.md) | 可拍摄镜头表与画布结构 |
| 图片、视频与配音 | [mediaProduction](references/mediaProduction.md) | 本地素材、真实节点输出和预览验收 |

## 本地成果与恢复

项目资料统一通过官方 workspaceFiles、文本文件工具和文档工具保存在 target.directory。沿用用户目录；新项目可使用 source、analysis、characters、episodes、storyboards、assets/generated。原文不覆盖，已采用素材保留；不另建文件 API 或全局素材副本系统。

维护一个 `productionState.md`，记录：原文版本与已读范围、阶段、分集/角色/镜头 ID、真实画布/节点 ID、已确认选择、生成任务状态、输出相对路径、验收结果及下一步。只记录实际发生的内容，不能把规划当结果。恢复时先核对实时节点和文件，再决定继续；超时不能证明任务未提交，不自动重生。

采用稳定业务编号 C001、E001、E001S001 等，记录它们与真实节点 UUID 的映射，不用编号冒充节点 ID。原著事实、推断和改编新增明确区分；未知信息保持未知。纯文字要求不强制创建节点；已获批的范围继续执行，不逐节点索要确认。
