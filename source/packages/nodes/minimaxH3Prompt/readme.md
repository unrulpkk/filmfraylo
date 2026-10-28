# MiniMax H3 Prompt Generator

FilmFraylo 独立画布节点，版本 1.0.0，标识 `minimaxH3Prompt`。使用宿主已配置的文本 AI 将任意合理的视频创作需求转换为 H3 英文提示词；对白、歌词和画面文字保留原文。只生成提示词，不生成视频，不保存 Key 或自建模型接口。

## 使用

1. 在 FilmFraylo 画布的节点菜单中添加 **MiniMax H3 Prompt Generator**。
2. 输入需求，或将文本节点的 `STRING` 输出连接本节点 `in`。同一端口也接收多个 `IMAGE`、`VIDEO`、`AUDIO`。
3. 在“素材用途与首尾帧”中明确每个素材的作用。普通参考图不会自动变成首帧。角色绑定填写角色原名或稳定主体 key，多个角色以逗号分隔；一个素材可支持多个主体。
4. 选择已有文本 AI、时长、画幅，生成提示词。结果可直接编辑、复制或下载；编辑立即同步 `text` 的 `STRING` 输出。填写补充要求后可优化当前编辑结果。
5. 将 `text` 输出连接视频生成节点的文本输入。**图片、音视频仍需另外连接下游节点，并按本节点显示的各类标签顺序排列；STRING 只传提示词，不转发素材。**

## 模式和格式

| 模式 | 素材条件 |
| --- | --- |
| T2VA | 无媒体参考 |
| I2VA | 一张明确标为实际首帧的图片 |
| FL2VA | 实际首帧和实际尾帧各一张 |
| L2VA | 一张明确标为实际尾帧的图片 |
| Ref2VA | 一个或多个普通图片、视频、音频参考 |

支持自动判断或手动选择。不兼容的组合在请求模型前报错。Base 输出官方三段结构及首尾帧对齐指令；Ref2VA 输出官方六段结构。可选“实战增强”仅用于 Ref2VA，明确增加**非官方** `scale_and_continuity`，可选择保留 `retention_analysis`。

素材按真实来源绑定，图片、视频、音频独立编号；调整连线顺序和重新生成保持已有素材映射。移除素材后当前标签会压紧，防止引用不存在的附件序号。主体 key 和编号保存于节点数据。声音编号按目标视频第一次实际发声的顺序分配。

## 校验与限制

- H3 官方时长 4–15 秒；最多 9 图、3 视频、3 音频，混合最多 12 个；单个音视频 2–15 秒，各类别总时长最多 15 秒。可选下游视频模型进一步按其公开能力收紧，不以模型 ID 白名单过滤。
- 复用宿主 FFmpeg/FFprobe 读取音视频容器时长；宿主尚未安装该可选依赖或无法探测时，可在素材卡中手填真实时长。音频只保留标签、用途和角色绑定，**不会发送给文本 AI 识别、转写或假称听过内容**。
- 视觉分析默认关闭；启用后仅将图片/视频交给宿主文本 AI，能否识别取决于所选模型与渠道。关闭时未知外观不补写，用户应描述素材作用。
- 空的可选字段不强制补内容，未要求台词或配乐时不添加。结构化对白行会逐字校验；自由文本台词、创意冲突和场景物理合理性仍需人工核对。警告不自动删改长台词。语义质量取决于文本模型，程序无法形式化证明任意创意结果完全符合意图。
- 格式问题最多自动修复一次；语义校验不通过、模型失败、取消均保留原输出。输入变化会取消正在生成的请求。保存画布保留参数、映射和当前编辑结果。

## 构建与安装

在包含 Bun 工作区依赖的 `source` 安装依赖后进入本目录：

```sh
bun run typecheck
bun test
bun run build
```

产物：`source/build/nodes/minimaxH3Prompt.umd.js`。在 FilmFraylo“资源管理 → 节点”导入 UMD 文件；也可使用宿主公开的 `installNode` 应用操作安装，安装后确认节点启用。无需修改宿主核心或重新构建客户端。支持相同节点脚手架公共接口的后续宿主版本；上游若改变公共插件 API，仍需重新验证并构建。

规则、约束、参考映射、渲染和生成引擎分别维护于 `src/rules.ts`、`constraints.ts`、`references.ts`、`format.ts`、`generation.ts`；测试仅覆盖本插件，使用 Bun 自带测试能力。

## 规范来源

实现参考 MiniMax 官方 [H3 Prompt Writing Skill](https://github.com/MiniMax-AI/MiniMax-H3/tree/main/skills/h3-prompt-writing)、[Base 指南](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/base-en.txt)、[Ref 指南](https://github.com/MiniMax-AI/MiniMax-H3/blob/main/skills/h3-prompt-writing/references/ref-en.txt)，于 2026-10-28 核对；增强字段为本插件自定义。技术包名保留上游 `@toonflow`，软件对外名称为 FilmFraylo。
