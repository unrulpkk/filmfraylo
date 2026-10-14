# FilmFraylo

<img src="docs/images/logo.png" alt="FilmFraylo" width="120" />

本地小说与漫剧创作工具，保留无限画布、节点连线、工作区文件管理和图片、视频、音频生产能力。支持由 Codex 通过 MCP 操作画布，项目与素材保存在本地。

## 源码运行

需要 Bun 1.4.3。请克隆整个仓库，在本目录 `source/` 执行以下命令；构建会读取仓库根目录的 [SKILL.md](../SKILL.md)、`agents/`、`references/` 和 `scripts/`。

```sh
bun install --frozen-lockfile
bun run build:server
bun run start:filmFraylo
```

Docker Compose 同样在 `source/` 内运行 `docker compose up --build`；它以仓库根目录为构建上下文，包含根目录技能文件。

源码新安装默认数据目录为 `data/filmFraylo`；检测到旧 `data/myToonflow/settings.json` 时继续沿用旧目录。自定义端口或数据目录可使用 --port 和 --data。

安装 Codex Skill、MCP 和本地 Web 运行包说明见 [本地使用说明](docs/filmFraylo.md)。媒体供应商只开放 safillu。内部工作区包名和数据格式保留兼容，不影响已保存项目。

## Windows 成品与 GitHub 发布

运行包自带 Bun，解压后双击 `FilmFraylo.exe` 启动本地 Web。没有 Key 也能进入和使用画布，实际调用生成服务时再配置。

- [运行包使用说明](docs/windowsPackage.md)
- [提交源码、自动构建与发布步骤](docs/githubRelease.md)
- 本地打包：`bun run package:windows`

GitHub Actions 支持手动构建；推送 `v*` 版本标签会自动构建并发布到 Releases。压缩包附带 SHA-256 校验文件，公开仓库另提供构建来源证明。

## 许可

本项目基于 MIT 许可代码进行定制，原始版权与许可声明保留于 [LICENSE](LICENSE)。

## macOS 与首次使用

Windows 分发 ZIP，Apple Silicon 与 Intel Mac 分别分发 DMG。推送版本标签后，GitHub Actions 会构建三种包和 `filmFrayloSkills.zip`，统一发布到 Releases。用户安装 Skill 后，Codex 从 Releases 下载对应系统的成品；已有安装则直接启动。

源码技能指向 `unrulpkk/filmfraylo`，GitHub 构建会写入实际构建仓库地址；正式 Release 发布前不能自动下载。macOS 包继续使用本地 Web + Server，项目保存在用户数据目录；Mac 的实际构建与签名限制见 [macOS 说明](docs/macPackage.md)。
