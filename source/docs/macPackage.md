# FilmFraylo macOS Web 运行包

提供 Apple Silicon（arm64）与 Intel（x64）两种 DMG，要求 macOS 13 或更新版本。每个包都自带相应架构的 Bun、Web、Server、MCP 和原生节点，不需要 Node.js、Bun、Nginx 或桌面 SDK。

此包是可选网页版，真正桌面版见 desktopPackage.md。手动安装时，打开 Web DMG，将 FilmFrayloWeb.app 拖入 Applications 后再启动。不要直接从只读 DMG 中安装 Skill：安装器需要记录持久的应用路径。Web 应用启动本地服务并在默认浏览器打开 http://127.0.0.1:3000。

数据保存在 `~/Library/Application Support/FilmFraylo/data`，与应用包分离。替换或移动应用不删除项目。首次使用须配置 API Key 和语言模型，已保存的配置无需重复填写。内置输入框保留，可独立创作或通过外部 Harness 操作画布。

## Codex 首次使用

安装 GitHub Release 中的 filmFrayloSkills.zip 后调用技能。首次默认选择桌面版；需要网页版时明确传 `--mode web`，脚本识别 Intel 或 Apple Silicon，下载 Web DMG、验证 SHA-256，安装到 `~/Applications/FilmFrayloWeb.app`（已有 `/Applications/FilmFrayloWeb.app` 则复用）。

首次安装脚本使用系统自带工具，不要求用户预先安装 Bun 或 Python。GitHub 构建会填入真实仓库地址；仓库未发布时不会猜测下载地址。已有安装目录不自动覆盖。

```sh
sh /实际技能目录/filmfraylo/scripts/setupMac.sh --mode web --harness codex
```

手动安装后的管理命令（可按实际安装路径替换）：

```sh
appRoot="/Applications/FilmFrayloWeb.app/Contents/Resources"
"$appRoot/runtime/bun" "$appRoot/filmFraylo.js" install --register
"$appRoot/runtime/bun" "$appRoot/filmFraylo.js" stop
```

自定义 `--port` 或 `--data` 时，启动、安装与停止都使用同一组参数。关闭浏览器不会停止后台服务。

## 构建与限制

在对应架构的 Mac 运行 `bun install --frozen-lockfile` 后执行 `bun run package:mac`。GitHub Actions 分别使用原生 Apple Silicon 与 Intel runner 构建，生成 DMG、校验文件与来源信息。

当前未接入 Apple Developer ID 签名与公证，macOS 可能阻止打开；脚本不会关闭 Gatekeeper 或移除隔离属性。面向普通用户正式发布前，需要配置签名、公证并在真实 Mac 上验收。Windows 环境不能验证 DMG 挂载和 macOS 实际运行。
