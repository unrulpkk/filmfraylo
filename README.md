# FilmFraylo Skill

<img src="source/docs/images/logo.png" alt="FilmFraylo" width="120" />

让 Codex、Claude Code、Cursor、OpenCode 或 Gemini CLI 阅读小说、编写剧本和分镜，并通过原生 MCP 操作本地无限画布、图片、视频与配音节点。用户安装同一个 Skill 后，由 Skill 从 GitHub Releases 下载对应系统的成品并启动；无需编译应用源码。

## 安装与使用

Codex 用户可发送：

```text
$skill-installer 请将 https://github.com/unrulpkk/filmfraylo
仓库根目录的 Skill 安装为 filmfraylo。
```

也可从 [Releases](https://github.com/unrulpkk/filmfraylo/releases/latest) 下载 `filmFrayloSkills.zip`，其中包含 `filmfraylo` 创作技能与 `toonflow` 底层 MCP 操作说明。独立技能包不包含应用源码。

安装后调用：

```text
$filmfraylo 请启动本地画布，用我提供的小说.txt开始创作。
```

其他 Harness 的技能目录和接入方式见 [接入说明](references/harnesses.md)。启动脚本支持 `-harness`（Windows）或 `--harness`（macOS），可选 `codex`、`claude`、`cursor`、`opencode`、`gemini`、`generic`，输出对应 MCP 配置。只有 Codex 的 `-register` / `--register` 调用 Codex CLI；其他宿主不依赖 Codex。

当前 Harness 检测系统 → 从 Releases 下载并校验对应制品 → 启动本地网页 → 合并 MCP 配置 → 重连并读取小说、操作画布。只有一个 filmfraylo 创作入口，包含全书分析、角色档案、分集剧本、导演分镜、媒体生产五个阶段。配置生成成功不代表客户端已连接，需通过 `getAppState` 确认。

没有 safillu Key 也能进入并创建画布；实际生成媒体时再配置。项目和素材保存在本地。未发布正式 Release 或下载失败时，Skill 会报告原因，不改为安装依赖和编译源码。

## 成品下载

编译好的制品由 GitHub Actions 发布到 [Releases](https://github.com/unrulpkk/filmfraylo/releases)。Skill 只下载本机对应的一种应用包及其 `.sha256` 校验文件：

| 系统 | Release 附件 |
| --- | --- |
| Windows x64 | `filmFraylo-windows-x64.zip`（含 EXE 启动器） |
| Apple Silicon Mac | `filmFraylo-macos-arm64.dmg` |
| Intel Mac | `filmFraylo-macos-x64.dmg` |
| 单独安装技能 | `filmFrayloSkills.zip` |

应用包自带运行环境。GitHub 自动生成的 **Source code** ZIP/TAR 是源码，不是可运行成品。当前未配置 Windows 代码签名及 Apple 签名、公证；Mac 的安装限制见 [说明](source/docs/macPackage.md)。

## 仓库结构

```text
filmfraylo/
├── SKILL.md       # 各 Harness 共用的技能入口
├── agents/        # 技能展示配置
├── references/    # 五阶段专业方法和 Release 地址
├── scripts/       # 系统检测、成品下载和启动
├── source/        # 本地画布、Web、Server、MCP 与节点源码
└── .github/       # 自动构建及 Release 发布流程
```

技能和应用均开源，供使用者审查，适用 [MIT 许可](LICENSE)。成品包含记录对应提交的 `buildInfo.json`，公开仓库构建还生成来源证明。源码不参与普通用户的安装和运行流程。

开发者克隆完整仓库后，在 `source/` 使用 Bun 1.4.3：

```sh
cd source
bun install --frozen-lockfile
bun run build:server
bun run start:filmFraylo
```

推送 `main` 可验证三平台构建；推送 `v*` 标签将在构建成功后自动发布 Release。正式标签提供 Skill 使用的 latest 下载；带后缀标签自动发布为预发布版。详见 [应用说明](source/README.md) 与 [发布步骤](source/docs/githubRelease.md)。
