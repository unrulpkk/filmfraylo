# WorkBuddy 首次使用

由本机 WorkBuddy 完成阅读、创作和工具调用，不需要 Codex、Claude Code 或额外插件。小说与素材保存在用户选择的 FilmFraylo 工作区。不要把 WorkBuddy 云端或手机会话当成本机执行环境。

## 安装与启动

用户可在 WorkBuddy「技能 → 添加技能 → 上传技能」导入 `filmFrayloWorkbuddy.zip`；这是单技能包，ZIP 根目录直接包含 SKILL.md。开发或本地安装也可将本 Skill 的 SKILL.md、agents、references、scripts 放在 `~/.workbuddy/skills/filmfraylo/`，不能只复制入口文档。同名 Skill 已存在时先比较版本，不覆盖用户定制内容。

用户在 WorkBuddy 说“使用 FilmFraylo，把这本小说.txt 制作成漫剧”即可触发；无需输入 Codex 的 `$filmfraylo`。首次先按 [运行方式与来源说明](harnesses.md#首次选择运行方式) 推荐桌面版、提供网页版选项并说明实际发布情况。以下命令默认桌面版，网页版显式追加 `-mode web` / `--mode web`。按所在 Skill 的真实路径执行：

```powershell
powershell -NoProfile -File "<本Skill目录>/scripts/setupWindows.ps1" -harness workbuddy
```

macOS：

```sh
sh "<本Skill目录>/scripts/setupMac.sh" --harness workbuddy
```

脚本会识别系统、从 GitHub Releases 下载对应成品并校验 SHA256、打开原生桌面窗口（web 模式才打开浏览器）、补齐官方 Toonflow MCP Skill，然后自动合并用户级 `~/.workbuddy/mcp.json` 中的 `mcpServers.filmfraylo`。无需另装 Bun、Node 或 Codex，也无需让用户手动复制 JSON。

Windows 桌面版使用 `~/.filmfraylo/desktop` 与 `~/.filmfraylo/desktopData`；Web 模式继续使用 `~/.filmfraylo/app` 与 `~/.filmfraylo/data`，避免 AppData 重定向。macOS 桌面版也默认使用 `~/.filmfraylo/desktopData`。已有其他位置的创作数据时按本机启动入口继续使用，不自动迁移或另起空项目。

此处是自定义 MCP 文件，不是 `settings.json`，也不是 `connectors/<账号>/mcp.json`；不要修改账号连接器文件、凭据、审批或沙箱设置。已有配置保留，修改前生成备份；相同配置重复运行不改文件，同名配置不同或已停用则报告冲突，不能强制替换。

已有 `references/localRuntime.md` 时先沿用其中命令启动原实例，避免另开空的数据目录；把启动输出 JSON 通过 stdin 传给 `scripts/connectHarness.mjs --harness workbuddy --app <实际成品资源目录> --skills <当前Skill父目录>`，由成品附带的 Bun 执行即可自动注册。开发用启动入口需要显式选择源码环境；不能猜测端口或 runtime 路径。

## 从安装接续创作

1. 输出 `registered: true` 和 `configPath` 只证明配置已保存。等待 WorkBuddy 加载 MCP，并调用实际出现的 `getAppState`。不要在脚本写完配置时就宣称画布已创建。
2. 如出现 WorkBuddy 的 MCP 信任/启用提示，指导用户完成原生确认；不写审批白名单、不切换完全访问权限。若当前对话未刷新工具，说明“FilmFraylo 已安装并配置，请在 MCP 页面重连 filmfraylo，或新建对话继续”，不要求重新填写 JSON，也不重复下载安装。
3. 桌面版使用应用窗口，Web 模式才在浏览器打开启动结果中的 `web`。通过原生 MCP 核对工作区，再创建或打开用户项目，按 [SKILL.md](../SKILL.md) 接续小说分析、人物、分集、分镜和节点配置。不默认跳到付费媒体生成。
4. 用户提供小说后，沿用该文件与已确认项目；工具未连接时可以读取小说和讨论创作方向，但不能声称已操作画布。
5. 首次启动直接进入项目首页，不填 safillu Key、不选择应用内聊天模型。WorkBuddy 使用自己的推理能力创作，通过 MCP 创建画布、节点和文件。到实际媒体生成时，才按 [Key 与充值引导](../SKILL.md#api-key-与充值引导) 在 FilmFraylo 设置中填写 Key；获取 Key 或充值入口为 https://api.safillu.com。

跨对话恢复靠工作区的 `productionState.md` 和真实节点状态，不能重复提交已完成或状态不明的生成任务。

## 分发

维护者执行 `source/` 下的 `bun run package:skills`，同时得到通用双技能 ZIP 和 WorkBuddy 单技能 ZIP，均附 SHA256。现有 GitHub Actions 会将这两种 ZIP 随版本标签发布到 Releases；本地生成包不会自动出现在已发布的旧版本中。应用始终使用正式 Release 成品，不要求普通用户编译源码。

依据：[WorkBuddy MCP 配置](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/MCP-Guide)、[WorkBuddy 技能安装](https://www.codebuddy.cn/docs/workbuddy/From-Beginner-to-Expert-Guide/Function-Description/Skills-Market)。
