# 提交源码与发布 Windows / macOS 包

## 分发约定

普通用户安装 Skill 后直接下载 Release 中已编译的对应平台成品；源码仓库用于公开审查和开发，不是用户首次使用必须下载的内容。应用包自带运行环境。成品放在 Release 附件中，不建立 Git 跟踪的二进制成品目录。

Actions 的 artifact 用于构建验收，不能代替 `releases/latest/download`。正式发布完成后，Skill 的自动下载入口才生效；未发布或附件缺失时不回退到源码编译。

## 仓库根目录

仓库根目录就是开源 Skill，包含 `SKILL.md`、`agents/`、`references/`、`scripts/`；应用源码放在 `source/`。`.github/workflows/releasePackages.yml` 位于仓库根目录；Actions 在 `source` 内运行构建命令，从 `source/dist/` 上传产物。请克隆完整仓库，构建只复制明确列出的根目录 Skill 文件，不会将应用源码打入技能压缩包。

`.gitignore` 排除 `.env`、数据目录、工作区、构建产物、依赖、日志和临时文件。请通过 Git 提交源码，不要把整个工作目录拖到网页上传。密钥不应写入源码。此项目的 Windows 本地 Web 构建无需私有桌面 SDK，也无需任何 safillu API Key。

```powershell
git init
git add .
git status
git commit -m "Prepare FilmFraylo Windows release"
git branch -M main
git remote add origin https://github.com/unrulpkk/filmfraylo.git
git push -u origin main
```

替换仓库地址为自己的地址。如仓库已有历史，沿用既有 Git 流程，不重复初始化或覆盖远程分支。

## 首次构建

推送到 `main` 后会自动构建，也可以在 GitHub 的 Actions 中选择 **Build FilmFraylo Packages → Run workflow**。这两种方式生成三份平台 artifact（windows-x64、macos-arm64、macos-x64），不发布 Release。下载后解开 artifact 包，里面是运行包 ZIP 或 DMG 与 `.sha256` 校验文件；Windows artifact 还包含首次使用的 Skill 包。

构建使用 Windows 2022 x64、macOS 15 Apple Silicon 与 macOS 15 Intel，固定 Bun 1.4.3，使用 `bun.lock` 的锁定依赖。所有 Action 固定到提交 SHA。锁文件的下载地址使用 npm 官方仓库，版本和完整性摘要保持锁定。修改依赖后，需要正常更新并提交锁文件，不在 CI 中跳过 `--frozen-lockfile`。

## 发布版本

```powershell
git tag v2.0.0
git push origin v2.0.0
```

标签触发三平台自动构建，全部完成后自动发布一份 Release。附件包含 Windows ZIP、两种架构的 macOS DMG、filmFrayloSkills.zip 和各自的 SHA-256 文件。正式标签如 `v2.0.0` 发布后可供 Skill 自动下载；带后缀的标签如 `v2.0.1-preview.1` 自动标为预发布，不进入正式 latest 下载入口。

不要在相同标签上替换源码。发布修复时使用新版本标签。已有同名 Release 时工作流不会覆盖附件，可从 Actions 下载产物处理失败原因后再发布。

构建只使用 GitHub 提供的 `GITHUB_TOKEN`，不需要保存个人访问令牌或模型密钥。仓库或组织需允许工作流创建 Release 及构建证明。公开仓库会生成 GitHub 构建来源证明；私有仓库跳过此步骤以避免计划限制。

## 核验下载包

```powershell
Get-FileHash .\filmFraylo-2.0.0-windows-x64.zip -Algorithm SHA256
gh attestation verify .\filmFraylo-2.0.0-windows-x64.zip --repo YOUR_ACCOUNT/YOUR_REPOSITORY
```

校验值应与 `.sha256` 相同。来源证明应指向本仓库和对应提交；包内 `buildInfo.json` 可用于定位构建日志。来源可追溯不等于逐字节可复现构建：时间戳、编译器与 ZIP 元数据可能导致自行构建的校验值不同。

## 本地构建

在 Windows x64 安装 Bun 1.4.3 后：

```powershell
cd source
bun install --frozen-lockfile
bun run package:windows
```

打包脚本调用原生全量 Web/Server 构建，附带运行时，并使用 Windows 的 .NET Framework C# 编译器生成小型 EXE 启动器。输出目录已存在时会拒绝覆盖；请换版本或自行备份旧目录。设置 `$env:appVersion = "2.0.1"` 可指定版本。

运行包只复制指定构建目录，不复制 `.env`、用户数据或工作区。新安装的数据默认保存到 `%LOCALAPPDATA%\FilmFraylo\data`；检测到旧 `%LOCALAPPDATA%\safillu\data\settings.json` 时沿用旧目录，升级时保留。

相关依据：[GitHub Actions 构建产物](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)、[Bun 官方 Action](https://bun.sh/guides/runtime/cicd)、[GitHub 构建来源证明](https://github.com/actions/attest)。

本地验证范围见 [Windows 验证记录](windowsValidation.md)。

## 首次使用自动匹配系统

源码 Skill 的 `references/releaseRepository.txt` 指向 `unrulpkk/filmfraylo`。GitHub 构建优先把 `GITHUB_REPOSITORY` 写入发行包中的 Skill，fork 后构建会使用 fork 自己的仓库地址；源码直接安装时需相应修改该文件或传入 `-repository` / `--repository`。

用户安装 Release 的 `filmFrayloSkills.zip` 后调用 `$filmfraylo`，首次使用选择对应系统脚本；脚本读取真实仓库地址，只下载当前系统和架构的文件，并校验 SHA-256。没有运行环境时先安装对应包，已有本机运行入口则直接复用。

Release 除带版本号的包，还提供内容相同的稳定文件名，供首次使用脚本通过 `releases/latest/download` 读取：

| 系统 | 稳定下载文件 |
| --- | --- |
| Windows x64 | filmFraylo-windows-x64.zip |
| Apple Silicon Mac | filmFraylo-macos-arm64.dmg |
| Intel Mac | filmFraylo-macos-x64.dmg |

必须发布正式 Release 后自动下载才可用；草稿与预发布不会作为首次安装的 latest。失败时保留下载与错误信息，不猜测其他仓库或降级到错误架构。

Mac 包说明见 [macOS 运行包](macPackage.md)。当前尚未接入 Apple 签名与公证，也尚未在真实 Mac 验证；DMG 的构建和运行结果应以实际 Mac / GitHub 执行为准。
