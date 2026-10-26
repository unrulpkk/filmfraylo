# 客户端更新

用户可以说“更新 FilmFraylo，保留我的项目和配置”。本流程更新 Windows x64、macOS Intel / Apple Silicon 桌面程序；本地网页版仍沿用原启动方式，不用桌面包覆盖。模型列表同步无需重启，新增调用协议需要升级客户端；只更新 Skill 不会改变已安装应用。

## 从旧版本接入

2.0.7 起，桌面客户端在启动时自动检查本产品的 GitHub 正式发布；有新版本时设置入口显示提示。用户可在「设置 → 关于 → 版本更新」点击「下载更新」，下载期间继续创作，完成后保存工作并选择「重启并更新」。下载和解压校验在后台完成，不强制中断工作；程序重启后核对目标版本，保留原项目、配置与旧程序备份。完整安装包和应用内更新包由同一标签构建发布。

2.0.5 / 2.0.6 的关于页没有此入口，需先用下面的 Skill 更新流程升级一次到 2.0.7 或更高正式版。只同步模型不会升级客户端，也不必为了后续每次应用更新重新下载整个 Skill。

2.0.3 等旧版的首次安装脚本会跳过已安装程序。先安装正式 Release 中包含 `scripts/updateClient.js` 的完整新版 Skill 包：WorkBuddy 使用 `filmFrayloWorkbuddy.zip`，其他宿主使用 `filmFrayloSkills.zip`。核对同版 SHA256；保留用户修改的 Skill 和 `references/localRuntime.md`，有冲突时比较合并，不静默覆盖。只有 main 源码更新、没有正式包时，明确说明升级入口尚未发布，不让用户反复运行旧安装命令。

更新前从本机启动入口、现有 MCP 配置和实际安装确定 **程序位置与原数据目录**。Windows 标准安装为 `~/.filmfraylo/desktop`，macOS 为 `~/Applications/FilmFraylo.app` 或已有的 `/Applications/FilmFraylo.app`；不能因为默认路径不存在就另装一份。通过 MCP 配置 `--runtime` 路径的父目录或本机启动命令的 `--data` 获取实际数据目录，不回显 runtime 的 token 或设置中的 Key。存在多个实例时先确认用户要更新哪一个。

## 检查与准备

以下路径替换为真实安装路径；宿主参数沿用当前 Harness。检查不启动应用、不下载程序、不修改 MCP：

```powershell
powershell -NoProfile -File "<Skill目录>/scripts/setupWindows.ps1" -update check -installation "<桌面安装目录>" -harness workbuddy
```

```sh
sh "<Skill目录>/scripts/setupMac.sh" --update check --installation "<FilmFraylo.app路径>" --harness codex
```

读取实际 `currentVersion`、`latestVersion`、`status`、`releaseUrl`。`upToDate` 就结束，不降级；版本源访问失败不等于已是最新版。向用户说明目标版本和 Release 中与其相关的改动，不展示内部实现日志。用户只要求“检查更新”时到此为止；已要求升级则继续准备下载。

将 `check` 改为 `prepare`，并加 `-version <latestVersion>` / `--version <latestVersion>`，固定本次版本。下载可断点续传，完成后校验同版 SHA256，返回 `prepared`。下载期间用户可继续创作。此步骤不关闭应用，不更新 Skill，不改 MCP。

## 重启安装

下载完成后核对正在运行的生成任务及保存状态，记录当前项目和画布以便恢复；保存须成功再继续。有生成任务时默认等待完成，未知状态不能当作已结束。向用户提供“现在重启更新”与“稍后”；已有明确的重启授权则沿用，不重复确认。仅授权下载或升级、尚未说明现在可以中断工作时，安装前确认重启。稍后就停止在 `prepared`，不后台安装或定时重启。

断开宿主的 filmfraylo MCP 连接，防止其持有旧程序或自动拉起旧实例，再运行：

```powershell
powershell -NoProfile -File "<Skill目录>/scripts/setupWindows.ps1" -update apply -version "<已准备版本>" -installation "<桌面安装目录>" -dataDirectory "<原数据目录>" -restart
```

```sh
sh "<Skill目录>/scripts/setupMac.sh" --update apply --version "<已准备版本>" --installation "<FilmFraylo.app路径>" --data-directory "<原数据目录>" --restart
```

脚本重新核对 Release、SHA256、包内产品、版本与架构，再请求正常退出。应用拒绝退出、MCP 仍占用或系统安全提示阻止启动时如实处理，不强杀进程、关闭防护或反复启动。程序安装路径不变；只替换程序，项目、素材及数据目录不删除。旧程序保存在输出的 `backup`，不立即清理。

成功返回 `updated` 及真实 `runtime`、`mcpDirectory` 和 `data`；这只证明应用和 MCP 服务启动，不证明当前宿主已经重连。恢复 filmfraylo MCP 后调用 `getAppState`，确认原项目与画布；需要时用原生工具重新打开之前的项目和画布。不要承诺宿主工具一定自动刷新。端口变化导致 runtime 路径不同时，备份配置并仅更新 filmfraylo 条目，不改其他服务；通常原路径可继续使用。不得把更新完成当作授权重做已有生成任务。

## 失败与恢复

- 下载或校验失败：旧程序不变，保留断点文件；校验失败按输出定位损坏的单个下载文件，重新获取，不能跳过校验。
- 安装或启动检查失败：脚本尝试恢复旧程序。新版进程无法正常退出时停止恢复，输出备份路径，避免移动正在使用的文件；不要声称已经回滚成功。
- 中断留下锁文件：先核对锁记录中的安装路径及 PID，确认升级进程已退出，再移除这个锁文件；不递归删除更新目录。
- 回滚只恢复程序。数据目录保持原位，不承诺撤销新版已发生的数据迁移；重要作品应沿用用户自己的备份习惯。
- macOS 目录无写入权限或 Gatekeeper 阻止启动时，说明系统提示并由用户处理，不自动提权或清除隔离属性。

此入口当前从 GitHub 正式 Release 下载；不自动切换到未核实的镜像、Actions 临时制品或源码构建。
