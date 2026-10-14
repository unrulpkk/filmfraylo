# FilmFraylo Windows 运行包

需要 Windows 10/11 x64。完整解压到普通目录，双击 **FilmFraylo.exe**：启动本地服务后自动打开浏览器。运行包自带 Bun，不需要安装 Node.js、Bun、Nginx 或下载源码。

首次无 safillu Key 时选择“稍后配置”。Codex 可通过 MCP 创建画布、编写文本、配置节点；实际调用模型生成媒体才需要 Key。设置里的“媒体模型”提供 safillu 的 API Key 配置。

默认网址为 http://127.0.0.1:3000，默认数据目录为 `%LOCALAPPDATA%\FilmFraylo\data`。若旧版 `%LOCALAPPDATA%\safillu\data` 已有 settings.json，自动沿用旧目录；也可用 `--data` 明确指定。项目、素材和设置保存在数据目录，关闭网页不会停止本地服务。双击 `stop.cmd` 停止服务；停止后再更换程序文件。备份或迁移时请保留整个数据目录。

## Codex 接入

在已安装 Codex 的电脑上运行 `installSkills.cmd`，安装当前创作 Skill 和官方 MCP Skill，并输出 MCP 配置。创作入口为 `$filmfraylo`，一个入口包含五个阶段。MCP 注册名称为 `filmfraylo`。首次只安装 Skill 时，可运行其 scripts/setupWindows.ps1 自动识别 Windows x64、下载并校验 Release 运行包；GitHub 构建会写入实际仓库地址。

如需脚本调用 Codex CLI 自动注册 MCP，在终端执行：

```powershell
.\installSkills.cmd --register
```

Codex CLI 不在 PATH 时，追加 `--codex "完整的 codex.exe 路径"`。安装后重新连接 MCP。安装器不会覆盖用户已修改的 Skill；发生冲突时使用 `--skills` 指定另一目录，或先备份旧版本。用户依旧需要自己的 Codex 使用权限。

## 自定义启动

```powershell
.\FilmFraylo.exe start --port 3010 --data "D:\filmFrayloData" --open
.\runtime\bun.exe .\filmFraylo.js install --port 3010 --data "D:\filmFrayloData" --register
.\runtime\bun.exe .\filmFraylo.js stop --port 3010 --data "D:\filmFrayloData"
```

自定义后，启动、安装 MCP 和停止都使用相同端口与数据目录。路径有空格时保留引号。多版本安装建议先停止旧版本，再在相同程序位置解压新版本；移动程序位置后重新生成 MCP 配置。

## 来源与数据

`buildInfo.json` 记录应用版本、Bun 版本和 GitHub 构建提交号；本地构建的提交号可能为空。`license.txt` 保留原始许可，`thirdPartyNotices.txt` 包含 Bun 及依赖许可。

项目保存于本地。使用生成服务时，会向供应商发送对应提示词和参考素材；原有匿名使用数据设置位于“设置 → 隐私”。生成结果下载到本地工作区。FFmpeg 可在插件管理中按需安装，不包含在本包中。

当前 EXE 没有配置 Windows 代码签名证书。来源证明用于核验构建来源，不等同于 Windows 代码签名。
