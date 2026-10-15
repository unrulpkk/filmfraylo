# FilmFraylo

<img src="source/docs/images/logo.png" alt="FilmFraylo" width="120" />

**让 AI Harness 成为你的影视创作搭档。**

FilmFraylo 将 Codex、Claude Code、Cursor、OpenCode、Gemini CLI 或 WorkBuddy 等 AI Harness 与影视创作画布连接起来。你通过对话表达创意，Harness 负责理解需求、规划与执行，FilmFraylo 提供组织分镜、生成视听素材和预览结果的可视化空间。

[开始使用](#开始使用) · [使用指南](source/docs/filmFraylo.md) · [下载](https://github.com/unrulpkk/filmfraylo/releases/latest)

## 为什么使用 FilmFraylo

### 让熟悉的 AI 助手参与制作

继续使用你已有的 AI 助手，通过对话推进创作。从“把这个想法写成短片剧本”到“修改这一场戏的镜头节奏”，都可以在同一个对话入口提出。助手能够操作画布、组织节点并调用媒体生成，让想法逐步成为可查看的成果。

### 创作结果看得见，也改得动

在无限画布中组织分镜、图片、视频和配音，查看素材之间的联系。你可以预览结果、调整节点，也可以让 AI 助手针对某个角色、场景或镜头继续修改。

### 从创意到镜头，衔接制作过程

创意构思、角色与场景设定、剧本、分镜和素材制作可以在同一个项目中推进。已确认的风格与设定可以在后续制作中继续使用，减少重复整理资料和反复交代背景。

### 按自己的节奏推进

可以从一句创意、已有剧本或参考素材开始，先制作一组镜头，再逐步完善。项目资料和素材保存在本地，便于查看、整理和接续创作。

## 能帮你完成什么

| 创作阶段 | 你会得到什么 |
| --- | --- |
| 构思方案 | 创作方向、内容结构与视觉风格 |
| 设定角色与场景 | 角色外观、声音设定与场景描述 |
| 编写剧本 | 场景安排、动作、对白与旁白 |
| 设计分镜 | 镜头顺序、景别、运镜与画布中的分镜结构 |
| 制作素材 | 生成并预览图片、视频和配音，按反馈继续调整 |

适合短片、短剧、漫剧、广告与概念影像的创作准备和素材制作，也可用于小说改编。你可以从当前需要的环节开始，让 AI 助手配合自己的创作方式。

## 开始使用

### 1. 安装创作技能

在 Codex 中发送：

```text
$skill-installer 请将 https://github.com/unrulpkk/filmfraylo 仓库根目录的 Skill 安装为 filmfraylo。
```

使用其他 AI 助手，可从 [下载页面](https://github.com/unrulpkk/filmfraylo/releases/latest) 获取 `filmFrayloSkills.zip`。WorkBuddy 用户使用 `filmFrayloWorkbuddy.zip`，按 [WorkBuddy 使用说明](references/workbuddy.md) 导入；其他助手见 [接入说明](references/harnesses.md)。

### 2. 打开画布，描述创意

安装后，在 Codex 中发送：

```text
$filmfraylo 请启动画布，我想做一支雨夜城市主题的科幻短片，先帮我构思视觉风格和故事大纲。
```

首次使用时，助手会引导你下载对应系统的应用并完成连接，无需自行编译。可选择 Windows、macOS 桌面版或本地网页版；操作画布时，请保持应用窗口或网页打开。

### 3. 从一个小目标开始

```text
根据已确认的方向，写一个约一分钟的短片剧本，再制作开场的六个分镜。
```

先检查剧本和分镜，再决定哪些镜头需要生成素材。更多示例见 [使用指南](source/docs/filmFraylo.md)。

## 使用前了解

- **文字创作与画布整理：** 使用你已有 AI 助手的能力，无需先配置 FilmFraylo 媒体服务 Key。
- **图片、视频与配音：** 生成时需要在 FilmFraylo 设置中配置 safillu API Key，相关费用以服务方为准。
- **运行方式：** 桌面版适合在独立窗口中制作；本地网页版适合在浏览器中使用画布。版本与平台支持以下载页面为准。

## 更多资料

[使用指南](source/docs/filmFraylo.md) · [Windows 安装说明](source/docs/windowsPackage.md) · [macOS 安装说明](source/docs/macPackage.md) · [开发文档](source/docs/development.md)

FilmFraylo 基于 Toonflow 开源项目定制，遵循 [MIT 许可](LICENSE)。
