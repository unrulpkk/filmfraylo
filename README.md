# FilmFraylo

<img src="app/docs/images/logo.png" alt="FilmFraylo" width="120" />

开源的小说转漫剧技能与本地画布应用。Codex 执行创作技能，通过 MCP 操作无限画布、节点与媒体生成；项目和素材保存在用户本地。

## 两部分源码

| 目录 | 内容 |
| --- | --- |
| [skill/filmfraylo](skill/filmfraylo) | Codex 创作技能、五个制作阶段参考资料，以及 Windows / macOS 首次安装脚本。一个 `$filmfraylo` 入口。 |
| [app](app) | 基于 Toonflow 定制的画布、Web、Server、官方 MCP、文件管理、媒体节点与打包源码。 |

两部分都在本仓库公开，适用 [MIT 许可](LICENSE)。`.github/` 仅存放自动构建流程。业务 Skill 只在 `skill/filmfraylo` 维护；应用构建时将它与原生 MCP Skill 一起放入运行包。

## 用户使用

从正式 [Release](https://github.com/unrulpkk/filmfraylo/releases) 获取 `filmFrayloSkills.zip`，将其中 `filmfraylo` 和 `toonflow` 两个文件夹安装到 Codex 技能目录，再调用 `$filmfraylo`。`toonflow` 是底层 MCP 操作说明，创作仍使用一个 FilmFraylo 入口。

也可以让 Codex 从本仓库的 `skill/filmfraylo` 路径安装开源技能。首次使用脚本按系统和架构下载对应运行包、校验并启动本地网页，再配置 MCP。自动下载需要仓库已有正式 Release；只有源码或 Actions 构建产物时尚不能自动下载。

没有 safillu Key 也能进入并创建画布；生成图片、视频或配音时再配置 Key。Mac 包尚未接入 Apple 签名与公证，详见 [Mac 说明](app/docs/macPackage.md)。

## 开发与构建

克隆整个仓库，需要 Bun 1.4.3。应用命令在 `app` 目录执行：

```sh
cd app
bun install --frozen-lockfile
bun run build:server
bun run start:filmFraylo
```

Windows 执行 `bun run package:windows`，Mac 执行 `bun run package:mac`，输出在 `app/dist/`；`bun run package:skills` 生成独立技能压缩包。

推送到 `main` 自动构建 Windows ZIP、Apple Silicon DMG、Intel DMG 和 Skill 包；也可手动运行 [Actions](https://github.com/unrulpkk/filmfraylo/actions)。推送 `v*` 标签会在构建成功后创建 Release 草稿。

详见 [应用说明](app/README.md)、[发布步骤](app/docs/githubRelease.md)。
