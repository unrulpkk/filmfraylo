---
name: filmfraylo
description: 在本地 FilmFraylo 中由 Codex 执行小说转漫剧制作，检查或启动本地 Web，选择全书分析、角色档案、分集剧本、导演分镜或媒体生产阶段。仅用于 FilmFraylo 项目，不用于一般写作或源码开发。
---

# FilmFraylo 外部 Harness

Codex 负责阅读、推理、创作与工具执行。连接前读取同批安装的官方 [Toonflow MCP Skill](../toonflow/SKILL.md)；首次缺少依赖时先按下节安装。保持官方工具、工作区文件和节点契约；不调用 `runAgent`，不替换运行时，不直接写画布 JSON。

## 首次使用与系统识别

普通用户只安装 Skill，由本 Skill 下载已经编译好的应用成品。无需克隆 `source/`、安装开发依赖或执行源码构建；仓库源码用于查看与审查。没有正式 Release、对应平台附件缺失或下载失败时，报告具体原因，不自动改走源码安装。仅在用户明确要求源码开发或自编译时使用开发流程。

已有 `references/localRuntime.md` 时使用其中命令，不重复下载或迁移数据。没有本机运行入口时，按宿主系统选择安装脚本；不从浏览器 User-Agent 猜测系统，不下载其他平台的包：

- Windows：运行 `powershell -NoProfile -File <本Skill目录>/scripts/setupWindows.ps1 -register`，脚本确认 x64，下载 Windows ZIP。
- macOS：运行 `sh <本Skill目录>/scripts/setupMac.sh --register`，脚本自动识别 Intel / Apple Silicon（包括 Rosetta），下载对应 DMG。
- 其他系统、Windows ARM：说明当前发行包不支持，不套用 Windows 或 Mac 包。

脚本的 `-inspect` / `--inspect` 只显示系统、架构、下载文件和安装位置，不下载或启动。路径作为独立命令参数传入，含空格时正确引用。Codex CLI 不在 PATH 时可使用 `-codex` / `--codex` 指定实际 CLI 路径。

本仓库根目录就是 FilmFraylo Skill。应用制品只从 [GitHub Releases](https://github.com/unrulpkk/filmfraylo/releases/latest) 获取；不要使用 GitHub 自动生成的 Source code ZIP/TAR，也不要从 Actions 临时 artifact 下载。脚本读取 `references/releaseRepository.txt`，使用 `https://github.com/<repository>/releases/latest/download/<asset>`：Windows 对应 `filmFraylo-windows-x64.zip`，Mac 对应 `filmFraylo-macos-arm64.dmg` 或 `filmFraylo-macos-x64.dmg`，先校验同名 `.sha256` 再安装。

单独安装 Skill 也可使用同一 Release 的 `filmFrayloSkills.zip`，包含官方 MCP Skill 依赖。仓库地址为空时，使用用户提供或已验证的 GitHub 地址，以 `-repository owner/repo` / `--repository owner/repo` 传入；不能猜测下载源。不会覆盖已有应用或已修改的 Skill；安装冲突时保留现有内容，核对 Skill 与运行包版本。

安装后打开本地 Web，重新连接 MCP 再创作。macOS 如被系统安全提示阻止，交由用户处理，不自动关闭 Gatekeeper 或清除隔离属性。无模型 Key 可以进入画布，实际生成前再配置 safillu。

## 启动与定位

1. 先调用官方 MCP `getAppState`。工具缺失或服务离线时，若已存在安装器生成的 [本机启动入口](references/localRuntime.md)，执行其中命令数组；没有则执行上面的成品安装流程。仅当用户明确选择源码开发环境时，在应用根目录执行 `bun run install:filmFraylo`。
2. 启动脚本检查目标目录和端口，只启动缺失服务。输出包含网页地址、runtime 路径和Skill 安装状态；不读取或输出 runtime 中的 token。Skill 不会让本轮尚未注册的 MCP 工具自动出现，首次配置后需要重新连接 MCP。
3. 用浏览器打开脚本返回的 Web 地址并打开本地项目，再 `getAppState` 取得实际 connectionId、directory、canvasId。连接属于其他项目时使用官方 `openProject`，完成后刷新目标；不借用其他实例。
4. 通过 resources/list/read 发现当前 Toonflow 的 workflow 及需要的资料，尊重用户已修改版本。内置工作流的提问映射到 Codex 对话，创作和调用均由 Codex 完成。

## 选择当前阶段

这是一个 Skill 的五个制作阶段，不是五个独立 Skill。Codex 根据任务和 productionState.md 按需读取对应参考文档，已确认的成果直接接续；用户只需调用 $filmfraylo，无需切换入口。

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
