# FilmFraylo 本地 Web 发行版

目标链路：Codex → 自定义 Skill → 官方 Toonflow MCP（`--external`）→ 原生 Web 画布 → 工作区素材与预览。

## 已有能力与复用边界

| 能力 | 原生实现 | 本次处理 |
| --- | --- | --- |
| MCP HTTP/stdio、外部 Harness | packages/mcp，stdio `--external` | 原样复用，隐藏并拒绝 runAgent |
| 官方 Skill、动态技能资源 | packages/mcp/skills/toonflow、packages/skills、server/utils/mcp/resources | 原样复用，补充一个 FilmFraylo Skill，内含五个阶段参考文档 |
| 无限画布、节点、连线 | apps/web，packages/nodes，packages/tools/canvas | 原样复用 |
| 图片/视频/配音与本地保存 | server/utils/media/generation | 原样复用，服务默认 assets/generated，原生节点保存到 assets/节点ID |
| 文件和媒体预览、视频 Range | web/lib/workspaceFiles、server/routes/workspaces/files、utils/fileHttp | 原样复用 |
| Web + Server 构建 | server/scripts/buildStandalone.ts、build.ts | 分发脚本调用原生构建 |
| 内置 Agent | 原生运行时 | 保留；FilmFraylo 新配置 externalHarness=true 默认收起侧栏 |

只新增启动安装入口、分发封装及专业工作流；独立 Server 增加可选 TOONFLOW_PORT / TOONFLOW_HOST，默认仍为原行为。FilmFraylo 启动器固定回环监听。未创建桌面客户端、替代 MCP、画布或文件系统。

## 一个 Skill，五个制作阶段

唯一自定义入口是 `$filmfraylo`。全书分析、角色档案、分集剧本、导演分镜和媒体生产放在该 Skill 的 references 中，由 Codex 按需读取，不作为独立 Skill 注册。官方 `toonflow` Skill 原样保留为 MCP 使用依赖。旧版 Skill 升级前，先把旧入口备份移出 Skills 发现目录，再运行 install；安装器仍拒绝覆盖不同内容。

## 源码运行

需要 Bun 1.3.14 或更新版本，先安装源码依赖并运行原生构建：

```sh
bun install --frozen-lockfile
bun run build:server
bun run start:filmFraylo
bun run install:filmFraylo
```

源码新安装默认数据目录为应用根目录 `data/filmFraylo`，已有 `data/myToonflow/settings.json` 时继续沿用旧目录，Web 为 http://127.0.0.1:3000。启动脚本后台运行服务器，日志在数据目录 server.log；重复 start 复用目标实例。可传 `--port 3010 --data <绝对路径>`，后续安装时使用同一组参数。原生 MCP 自动处理独立端口冲突，安装器读取实际 runtime 路径。

启动输出检测FilmFraylo Skill 是否安装。install 默认写入 `$CODEX_HOME/skills` 或 `~/.codex/skills`，输出无凭证的 Codex TOML；加 `--register` 才调用原生安装器注册 MCP，可用 `--codex` 指定 CLI。已有不同 Skill 拒绝覆盖，先备份迁移或使用 `--skills <目录>`；自选目录需由 Harness 加载。使用官方安装器生成的 `--external` 配置，保留 `tool_timeout_sec = 1800`。

打开输出的 Web 地址，在原生主页打开/创建本地项目（独立 Server 沿用原生限制，位于所选数据目录的 workspaces 内）；首次聊天模型配置可选择“稍后配置”。重新连接 MCP 并开始 Codex 对话：

```text
$filmfraylo 分析当前工作区 source 里的小说，先交付全书分析和角色档案，不生成媒体。
```

图片、视频和配音供应商仍在 Toonflow 设置中配置；无需配置聊天模型。Skill 中的本机启动命令由安装器生成，移动发行目录后应重新安装并更新 MCP 配置。Skill 不能动态添加当前 Codex 对话未加载的 MCP 工具。

已有数据目录保持原设置，不会自动覆写凭证；若 MCP 未启用会提示使用原生设置开启。停止服务时根据该数据目录 runtime 的 pid 停止对应进程；不要停止其他 Toonflow 实例。

## 分发

```sh
bun run package:filmFraylo
```

产物位于 dist/filmFraylo时间戳.tar.gz，解压后需要本机 Bun，无需安装源码依赖。Windows 运行 start.cmd，macOS/Linux 运行 `sh start.sh`，或 `bun filmFraylo.js start`。运行 `bun filmFraylo.js install` 安装 FilmFraylo Skill 及官方依赖。首次启动才生成 data；分发包不复制源码 data、.env、API 密钥或个人项目。所有项目内容保存在所选数据目录的 workspaces 中。仅 Windows 完成本次运行测试，其他平台沿用原生启动路径但未实测。

打包保留原版 MIT 许可，第三方库沿用原生构建依赖。Bun 是运行环境，不包含 EXE 桌面客户端。完整安装器、运行包与实际网页测试结果见同目录 filmFrayloValidation.md。
