# FilmFraylo macOS 运行包

提供 Apple Silicon（arm64）与 Intel（x64）两种 DMG，要求 macOS 13 或更新版本。每个包都自带相应架构的 Bun、Web、Server、MCP 和原生节点，不需要 Node.js、Bun、Nginx 或桌面 SDK。

手动安装时，打开对应 DMG，将 FilmFraylo.app 拖入 Applications 后再启动。不要直接从只读 DMG 中安装 Skill：安装器需要记录持久的应用路径。应用启动本地服务并在默认浏览器打开 http://127.0.0.1:3000。

数据保存在 `~/Library/Application Support/FilmFraylo/data`，与应用包分离。替换或移动应用不删除项目。没有 safillu Key 可以稍后配置，创建画布与文本节点；生成媒体才需要模型 Key。

## Codex 首次使用

推荐安装 GitHub Release 中的 filmFrayloSkills.zip。解压后将 filmfraylo 与 toonflow 两个目录放入 Codex 的 Skills 目录，调用 `$filmfraylo`。首次使用指引会选择 macOS 脚本，识别 Intel 或 Apple Silicon，下载对应 DMG、验证 SHA-256，并安装到 `~/Applications/FilmFraylo.app`（已有 `/Applications/FilmFraylo.app` 则复用）。

首次安装脚本使用系统自带工具，不要求用户预先安装 Bun 或 Python。GitHub 构建会填入真实仓库地址；仓库未发布时不会猜测下载地址。已有安装目录不自动覆盖。

```sh
sh /实际技能目录/filmfraylo/scripts/setupMac.sh --register
```

手动安装后的管理命令（可按实际安装路径替换）：

```sh
appRoot="/Applications/FilmFraylo.app/Contents/Resources"
"$appRoot/runtime/bun" "$appRoot/filmFraylo.js" install --register
"$appRoot/runtime/bun" "$appRoot/filmFraylo.js" stop
```

自定义 `--port` 或 `--data` 时，启动、安装与停止都使用同一组参数。关闭浏览器不会停止后台服务。

## 构建与限制

在对应架构的 Mac 运行 `bun install --frozen-lockfile` 后执行 `bun run package:mac`。GitHub Actions 分别使用原生 Apple Silicon 与 Intel runner 构建，生成 DMG、校验文件与来源信息。

当前未接入 Apple Developer ID 签名与公证，macOS 可能阻止打开；脚本不会关闭 Gatekeeper 或移除隔离属性。面向普通用户正式发布前，需要配置签名、公证并在真实 Mac 上验收。Windows 环境不能验证 DMG 挂载和 macOS 实际运行。
