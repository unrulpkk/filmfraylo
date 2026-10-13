# FilmFraylo Windows 验证记录

验证日期：2026-10-14。

- Web 与 Server 现有 typecheck 均通过；Bun 1.4.3 全量原生构建与 Windows 打包成功。
- 新名称 package.json 与 bun.lock 在独立依赖目录执行 frozen-lockfile 安装通过，无依赖变更。
- Skill 元数据校验通过；包内只包含 filmfraylo 与官方 toonflow 两个入口，没有旧创作 Skill 残留。
- 解压包中的 FilmFraylo.exe 启动成功，支持中文、空格数据路径；无模型 Key 可点击“稍后配置”进入。
- 包内 Bun + MCP 实际打开工作区、创建画布、添加文本节点并设置内容；8 种节点类型可读，网页呈现正确，无浏览器错误。
- 媒体模型仍为 safillu 的 4 个模型，供应商 ID、域名和配置保持不变。
- 包内安装器安装 filmfraylo 成功，所有 Skill 文件与源码逐字节一致，本地启动引用已生成。
- EXE 停止对应临时服务成功，未停止常用的 3010 服务。
- 常用实例沿用旧数据目录，首页和浏览器标题为 FilmFraylo，原项目可打开。旧图片 HTTP 200、879991 字节；视频 Range 206，浏览器读取 1344×768、4.458 秒并完整播放，无播放错误。
- 运行 ZIP 完整性与 SHA-256 校验通过；不含数据、.env、旧创作 Skill；包含 FilmFraylo.exe、新 Skill、Bun 和第三方许可。
- 本项目已安装 `$filmfraylo`，MCP 注册名为 filmfraylo，保留 1800 秒工具超时；旧项目 Skill 已备份到本地忽略目录。

GitHub 云端工作流需要提交仓库后实际运行；本地构建不等于已完成 GitHub Actions 验证。EXE 没有 Windows 代码签名。本次没有重新调用收费生成接口，未修改现有素材内容。

## 三平台打包与首次安装更新（2026-10-14）

- 增加 macOS arm64 / x64 DMG 构建脚本，复用 Web、Server、MCP、原生节点和运行包资源复制逻辑。
- GitHub 工作流使用 Windows、Apple Silicon Mac、Intel Mac 三种 runner；全部完成后创建一个 Release 草稿，并提供首次安装需要的稳定下载文件名。
- Server typecheck（包括打包与启动脚本）通过；PowerShell 语法解析、macOS Shell 语法检查、Skill 元数据校验、工作流 YAML 解析通过。
- Windows 首次使用脚本在真实宿主上识别为 windows-x64，并选择 filmFraylo-windows-x64.zip；inspect 模式未下载或启动程序。
- Windows 全量构建、EXE 打包、独立 Skills ZIP 构建通过。ZIP CRC 完整性通过，包内两种首次安装脚本与源码一致。
- 新增的 macOS 默认数据目录与浏览器启动分支尚未在真实 Mac 执行；DMG 尚未在 Windows 生成或挂载，不把语法与类型检查当作 Mac 功能验证。
- 仓库尚未创建或发布，真实 GitHub 首次下载与 SHA-256 下载校验链路尚未执行。
- 自动审批拒绝了本次更新后启动 EXE、检查网页、停止服务的验证命令，只返回策略拦截；因此本次新增修改后的 EXE 运行验证未完成。上文运行结果属于品牌更名前后已经完成的上一轮验证。

Mac 正式面向普通用户分发前仍需 Apple Developer ID 签名、公证与真机验收。系统识别和下载脚本不会关闭安全保护。
