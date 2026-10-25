# 跟进 Toonflow 上游更新

FilmFraylo 的应用位于 `source/`，根目录维护 FilmFraylo Skill、安装脚本和发布流程。不要把 Toonflow 的整个目录覆盖过来，也不要让客户端直接下载 Toonflow 的安装包。

维护入口为根目录的 `scripts/syncUpstream.ts`，需要 Git 2.38+，以及 Node.js 22.14+ 或 Bun。它只调用 Git，不需要先安装应用依赖，不会自动发布或改写用户数据。

## 基线与定制如何保留

`scripts/upstream.json` 记录官方仓库、默认分支和**已经整合的完整提交 SHA**。本次从原始导入提交 `ff6d4e9` 和上游历史逐文件比对，重建初始基线为 `2c7fb257affb65777110fe4c6e60cd3c09187d9b`：原始导入的 850 个文件中有 655 个与该提交完全相同，在现有上游历史中匹配最多；当前 `source/` 有 637 个文件与它完全相同。原仓库没有记录导入来源，因此这是根据代码重建的基线，首次升级须重点人工复核。

每次升级用三份源码合并：上次基线、当前 FilmFraylo、目标 Toonflow。上游没有修改的定制继续保留；双方修改同一段代码、删除对方修改过的文件或修改同一个二进制资源时，由 Git 报冲突。不会自动用“全部保留本地”或“全部采用上游”解决冲突。

脚本将上游根目录映射到 `source/`，保留 FilmFraylo 根目录内容。它在独立 Git 工作树的 `update/toonflow-<SHA前12位>` 分支中合并，原工作树和原分支不会被切换或覆盖。历史里会留下基线快照、关联基线的提交和实际合并提交，供后续追溯；不会重写已有历史。

## 一次升级的操作

在 FilmFraylo 仓库根目录执行，先查看已提交源码相对上游的变化：

```sh
node --experimental-strip-types scripts/syncUpstream.ts plan
# 也可以指定上游 tag 或完整 SHA
node --experimental-strip-types scripts/syncUpstream.ts plan <上游tag或SHA>
```

`plan` 只抓取 Git 对象并列出变更和与定制重叠的文件，不改变分支、索引或源码。重叠列表用于安排复核，不能代替实际合并或功能验收。

提交好当前工作后，准备更新。建议把 `plan` 输出的目标完整 SHA 传给 `prepare`，避免检查期间上游分支又推进：

```sh
node --experimental-strip-types scripts/syncUpstream.ts prepare <目标完整SHA>
```

脚本要求工作树干净，拒绝降级及不包含当前基线的分支。默认从官方仓库抓取，也可在 `plan` / `prepare` 后加 `--repository ../Toonflow-app` 使用本地上游克隆；仍会验证目标包含锁定基线，不会把此临时路径写进配置。

进入输出的独立工作树目录后：

1. `git status` 查看冲突，逐文件解决并 `git add <文件>`。冲突时脚本返回非零退出码，合并现场保留。
2. 对照下一节复核品牌、模型网关、节点和发布行为，包括没有文本冲突的新功能。
3. 进入 `source/` 按锁定版本准备 Bun、执行 `bun install --frozen-lockfile`，再显式执行受影响包已有的 `typecheck`、构建及人工验证。如果依赖有冲突，先合并 `package.json`，通过 `bun install` 重建锁文件并审阅差异。路由变更后在 `source/apps/server` 执行 `bun run routes`。构建或安装环境失败时保留现场修复，不推进基线。
4. 把审阅后的源码改动全部 `git add`，回到**该独立工作树根目录**完成合并：

```sh
node --experimental-strip-types scripts/syncUpstream.ts finish
```

`finish` 要求冲突已解决、改动已暂存、没有残留冲突标记及未跟踪文件，且仍处于本次合并中；随后更新基线并创建合并提交。它不会替代人工验收，也不自动安装依赖或执行构建。不要提前手动 `git commit`，也不要手改基线来消除冲突。

回到原工作树，审阅同步分支后合入：

```sh
git diff HEAD...update/toonflow-<SHA前12位> -- source/ scripts/upstream.json
git merge --ff-only update/toonflow-<SHA前12位>
```

若原分支期间有新提交，先正常合并同步分支并重新复核、验证；`--ff-only` 会拒绝覆盖这些新工作。合入后按现有 FilmFraylo 发布流程设置自有版本、构建及发布，客户端继续从 FilmFraylo 的发布渠道升级。

## 每次升级重点复核

| 定制 | 主要位置 | 复核内容 |
| --- | --- | --- |
| 名称与图形 | `source/packages/assets/`、`packages/startup/`、`packages/i18n/src/locales/`、`apps/web/src/pages/home/`、`apps/web/src/components/settings/panels/about.vue` | 新页面、新文案和新图标也使用 FilmFraylo；保留 MIT 归属。内部 `@toonflow/*`、画布字段和 MCP 契约保留兼容名称。 |
| safillu 网关 | `source/packages/providers/src/language/safillu.ts`、`media/safillu.ts`、`source/apps/server/src/utils/conf/index.ts`、`utils/media/` | 默认提供方、域名、Key 配置、模型同步、请求参数、轮询及媒体结果处理。上游新增模型能力须适配后才向用户开放。 |
| 引导和渠道 | `source/apps/web/src/stores/settings.ts`、`components/settings/`、`pages/home/` | 保留首次 Key 配置要求、隐藏渠道及开发者入口的既有行为。 |
| 媒体节点与预置内容 | `source/packages/nodes/`、`source/packages/nodeShared/`、`source/packages/teams/`、`source/packages/skills/` | 保留预置节点和 safillu 模型参数、参考素材、结果输出与画布兼容性，同时接入需要的上游新能力。 |
| 构建、更新与数据 | 根目录 `.github/workflows/`、`scripts/`、`references/`、`source/electrobun.config.ts`、`apps/desktop/`、`apps/server/scripts/` | 安装包身份、下载源、更新源仍为 FilmFraylo，数据目录与旧配置兼容迁移有效。上游 `package.json`、Bun 与原生依赖变化还须同步审阅 FilmFraylo CI。 |

表中省略了部分重复的 `source/` 前缀，各路径相对应用根目录理解。Git 能识别文本冲突，无法判断新增按钮是否暴露上游品牌、模型协议是否改变等语义问题；即使合并干净也需要复核这些位置。具体品牌约定见 [品牌说明](filmFrayloBrand.md)。

## 放弃、清理与回退

在同步工作树中执行 `git merge --abort` 放弃尚未完成的合并；原分支未受影响。确认没有需要保留的改动后，回到原工作树，使用 Git 清理输出的目录和同步分支：

```sh
git worktree remove <同步工作树的绝对路径>
git branch -D update/toonflow-<SHA前12位>
```

同一目标已有同步分支时，脚本会拒绝覆盖。继续原现场，或按上述步骤清理后重新准备。工作树默认位于仓库旁的 `<仓库名>Update<SHA前8位>` 目录，缩短 Windows 依赖路径。先确定工作树位置再安装依赖；移动已安装依赖的工作树后应重新安装，避免绝对连接仍指向旧位置。清理使用 Git 工作树命令，不需要手工递归删除目录。

已经合入但需要回退时，用 `git revert -m 1 <实际合并提交SHA>` 回退应用变更及同提交内的基线，然后重新验证、发布 FilmFraylo。不要只改基线、直接重置主分支或回退用户数据。

FilmFraylo 2.0.3 已实际整合上游 `30139c931e80476caa718b31684b86383c6e83ce`，具体冲突处理、定制边界及验证范围见[升级记录](upstreamUpgrade.md)。`scripts/upstream.json` 始终记录实际已整合的基线。
