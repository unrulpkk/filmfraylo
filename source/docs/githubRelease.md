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

2.0.7 起，Release 同时包含各平台的原生 `stable-*-update.json` 更新清单、对应 `.tar.zst` 程序包及 SHA256 文件。桌面端默认使用本产品 GitHub `releases/latest/download`，启动自动检查，在「设置 → 关于」后台下载并由用户选择重启安装。程序身份和构建信息在 SDK 归档及签名前写入，完整 ZIP / DMG 与原生更新使用同一份程序。发布时必须保留这些附件，只有 ZIP / DMG 无法供应用内更新使用。

```powershell
git tag v2.0.0
git push origin v2.0.0
```

标签触发三平台自动构建，全部完成后自动发布一份 Release。附件包含 Windows ZIP、两种架构的 macOS DMG、filmFrayloSkills.zip 和各自的 SHA-256 文件。正式标签如 `v2.0.0` 发布后可供 Skill 自动下载；带后缀的标签如 `v2.0.1-preview.1` 自动标为预发布，不进入正式 latest 下载入口。

不要在相同标签上替换源码。发布修复时使用新版本标签。已有同名 Release 时工作流不会覆盖附件，可从 Actions 下载产物处理失败原因后再发布。

构建只使用 GitHub 提供的 `GITHUB_TOKEN`，不需要保存个人访问令牌或模型密钥。仓库或组织需允许工作流创建 Release 及构建证明。公开仓库会生成 GitHub 构建来源证明；私有仓库跳过此步骤以避免计划限制。

## 同步到 Gitee

GitHub Release 发布并上传完所有平台附件后，自动调用独立工作流 `Sync FilmFraylo Release to Gitee`，同步到 [fengshaochen/filmfraylo](https://gitee.com/fengshaochen/filmfraylo)。仅推送 `main` 的构建不会触发发布或同步。

仓库 Actions Secrets 需要配置 `GITEE_TOKEN`，令牌须有目标仓库的 `repo` 访问权限。GitHub 下载使用工作流自带的只读 Token。同步先推送该版本的 Git 标签及其对应提交，不修改 Gitee 分支，不强制覆盖已有标签，然后创建同版本 Release，保留正式版或预发布属性。

附件直接复制 GitHub 发布的 ZIP、DMG、EXE 和 `.sha256` 原文件，不重新打包。上传后重新下载 Gitee 附件核对 SHA256；同名附件只有内容一致才跳过，内容不同则报错并保留原文件。执行结果在同步任务日志中逐项列出。

每个安装包和它的校验文件由一个独立任务同步，最多四个任务并行。单文件上传最多等待两小时，连续一分钟低于 1 KB/s 会报错；每个附件任务上限三小时。跨境网络较慢时，整个同步可能持续数小时，只有所有附件任务通过才表示完整同步成功。一个附件失败不会取消其他附件的同步，可单独重跑失败任务。

补同步旧版本或恢复中断的上传：在 Actions 中打开 **Sync FilmFraylo Release to Gitee → Run workflow**，使用 `main` 分支，填写已存在的 GitHub Release 标签，例如 `v2.0.2`。脚本会核对已有附件，只上传缺失的部分。GitHub 发布成功而 Gitee 同步失败时，单独重跑同步工作流即可，无需重新构建安装包。

同步要求 GitHub Release 已包含桌面版、Web 版三个平台的稳定文件名，以及两个 Skill 包和各自的校验文件；缺少附件时不会创建 Gitee Release。本功能只同步发布产物，Skill 的自动下载地址仍使用 GitHub。

## 核验下载包

```powershell
Get-FileHash .\filmFraylo-desktop-windows-x64.zip -Algorithm SHA256
gh attestation verify .\filmFraylo-desktop-windows-x64.zip --repo unrulpkk/filmfraylo
```

校验值应与 `.sha256` 相同。来源证明应指向本仓库和对应提交；包内 `buildInfo.json` 可用于定位构建日志。来源可追溯不等于逐字节可复现构建：时间戳、编译器与 ZIP 元数据可能导致自行构建的校验值不同。

## 本地构建

在 Windows x64 安装 Bun 1.4.3 后：

```powershell
cd source
bun install --frozen-lockfile
bun run package:desktopRelease
bun run package:windows
```

`package:desktopRelease` 复用原生 Electrobun 桌面构建，Windows ZIP 内的 `app/bin/launcher.exe` 打开独立窗口，macOS 生成真正 App 的 DMG。`package:windows` / `package:mac` 另行构建可选 Web 包；Windows Web 包使用 start.cmd，不再生成浏览器 EXE 启动器。输出目录已存在时拒绝覆盖，请换版本或保留旧目录。Mac 需先执行 `bun packages/startup/scripts/buildMac.ts`；Intel 还需在 `compat/macIntel` 安装锁定依赖，再显式运行 `bun compat/macIntel/prepareNative.ts` 准备最低支持 macOS 13 的原生 SDK。GitHub Actions 已包含这些步骤。

运行包只复制指定构建目录，不复制 `.env`、用户数据或工作区。Skill 安装的桌面版默认将数据保存到 `~/.filmfraylo/desktopData`；检测到安装目录旁已有 `data/settings.json` 时沿用。Web 版遵从其启动入口保存的数据目录。用户工作区独立于安装目录，升级时保留。

相关依据：[GitHub Actions 构建产物](https://docs.github.com/en/actions/concepts/workflows-and-actions/workflow-artifacts)、[Bun 官方 Action](https://bun.sh/guides/runtime/cicd)、[GitHub 构建来源证明](https://github.com/actions/attest)。

本地验证范围见 [Windows 验证记录](windowsValidation.md)。

## 首次使用自动匹配系统

源码 Skill 的 `references/releaseRepository.txt` 指向 `unrulpkk/filmfraylo`。GitHub 构建优先把 `GITHUB_REPOSITORY` 写入发行包中的 Skill，fork 后构建会使用 fork 自己的仓库地址；源码直接安装时需相应修改该文件或传入 `-repository` / `--repository`。

用户安装 Release 的 `filmFrayloSkills.zip` 后调用 `$filmfraylo`，首次使用选择对应系统脚本；脚本读取真实仓库地址，只下载当前系统和架构的文件，并校验 SHA-256。没有运行环境时先安装对应包，已有本机运行入口则直接复用。

Release 除带版本号的包，还提供内容相同的稳定文件名，供首次使用脚本通过 `releases/latest/download` 读取：

| 系统 | 稳定下载文件 |
| --- | --- |
| Windows x64 桌面 | filmFraylo-desktop-windows-x64.zip |
| Apple Silicon Mac 桌面 | filmFraylo-desktop-macos-arm64.dmg |
| Intel Mac 桌面 | filmFraylo-desktop-macos-x64.dmg |
| 可选 Web 包 | 上述文件名的 desktop 换为 web |

必须发布正式 Release 后自动下载才可用；草稿与预发布不会作为首次安装的 latest。失败时保留下载与错误信息，不猜测其他仓库或降级到错误架构。

Mac 包说明见 [macOS 运行包](macPackage.md)。当前尚未接入 Apple 签名与公证，也尚未在真实 Mac 验证；DMG 的构建和运行结果应以实际 Mac / GitHub 执行为准。
