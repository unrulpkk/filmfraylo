# H3 格式与约束

## 模式选择

| 模式 | 输入条件 | 规划方向 |
| --- | --- | --- |
| T2VA | 无媒体素材 | 根据文字组织视听过程 |
| I2VA | 一张明确作为实际首帧的图片 | 保留开场构图，再向后发展 |
| FL2VA | 明确首帧与尾帧各一张 | 写清两帧之间的自然变化 |
| L2VA | 一张明确作为实际尾帧的图片 | 从合理前态收敛到目标结束画面 |
| Ref2VA | 作为内容/属性/声音参考的图片、视频、音频 | 定义每份素材实际负责的内容 |

普通图片不自动触发 I2VA；仅有尾帧不伪装成首帧。Base 不混入额外素材。首尾帧与其它参考并用时须核对实际通道是否支持；通道只支持参考模式时不能承诺像素级首尾锁定。素材数量、角色和手动模式冲突时指出具体冲突，不忽略素材继续生成。

官方通用边界：目标 4–15 秒；图片最多 9 张，视频最多 3 段，音频最多 3 段，混合总计最多 12 个文件。每段视频/音频 2–15 秒，视频总时长及音频总时长分别不超过 15 秒。网关可进一步收紧；分辨率、整数时长档、画幅、单图/首尾帧/混合参考、是否支持原生声音，以当前模型实际能力为准。不要把某个渠道的限制或未经核实的 7000 字符上限当作所有 H3 模型的硬限制。

时长未知时先用宿主可用的元数据能力读取或请用户提供真实时长；元数据不等于识别媒体内容。仅写通用 prompt、无法读取实时渠道能力时说明“渠道能力未核验”，保留通用规划，不虚构可执行配置。

## Base 输出

严格依次使用：
1. integrated_multimodal_description
2. overall_soundscape
3. non_diegetic_music

T2VA 直接从字段开始。I2VA 首行固定：
```text
For the target video, at 0.00 seconds into the target video, <Picture 1> (from [Shot 1]) is fully referenced.
```

FL2VA 首行固定：
```text
How the reference pictures align with the target video — Picture 1 (from Shot 1) aligns with the 0.00-second mark of the target video; Picture 2 (from Shot N) aligns with the S.SS-second mark of the target video.
```

L2VA 首行固定：
```text
How the reference pictures align with the target video — <Picture 1> (from [Shot N]) aligns with the S.SS-second mark of the target video.
```

N 必须替换为实际最终镜头编号，S.SS 替换为有效总时长且保留两位小数；对齐行与字段间空一行。FL2VA 按首帧、尾帧确定 Picture 1/2 的实际素材顺序，不能只改文字编号。不要把尾帧默认写成属于 Shot 1；单镜头时最终镜头确实可以是 Shot 1。

I2VA 的开场承接首帧；FL2VA 重点写中间运动而非重复两张静态描述，默认保持连续，仅用户明确需要时切镜；L2VA 必须描述实际到达尾帧的过程。不要把示例中的 N、S.SS 等模板变量留在交付文本。

## 官方 Ref2VA 输出

开始撰写 Ref2VA 成品前读取 [English final output contract](refFormat.md)，按其中英文规则直接交付，不将下列中文字段释义当作成品语言或内容。

严格依次使用：
1. subject_definitions：素材用途、可复用主体与必要的明确声音绑定。
2. summary：以真实任务类型方括号开头，简要描述目标与参考关系。
3. retention_analysis：逐项说明实际保留、变化、属性迁移或信号复用。
4. detailed_description：按播放顺序写真实画面、动作、运镜、声音和参考生效点。
5. overall_soundscape：跨片段的环境声、物理声和非语言声音。
6. non_diegetic_music：明确要求的非画内配乐；未要求时 N/A。

summary 的任务类型按用途选 reference generation、keyframe completion、video editing、video continuation、audio reuse、audio reference，多种用 + 连接。参考视频只提供运镜不自动成为 video editing；直接编辑/续接原视频时才使用对应类型。信号复制与风格/音色参考不同。

## 时间、对白和声音

- 开头 [Shot 1] 不附切镜时间；后续写 [Shot N] At MM:SS.mmm, ...，编号连续、切点严格递增，全部落在目标时长内。最终状态与总时长精确对应；不添加结尾之后的新动作。
- 运镜写入英文自然句，说明必要的方向、幅度与速度；平移机身和原地摇镜不是同一种运动。只因景别变化不必切镜。
- 说话者以首次实际发声顺序编号 (S1)、(S2)；始终未发声的角色不编号。声音身份、动作和语气写在 <d> 外，块内只放 [Language] 与用户的原始台词/歌词。保留每个原字与标点。
- 画外音用 says in an off-screen voiceover，随该段明确对应可见角色嘴唇保持闭合；不凭空要求其它没有对白的角色全程闭嘴、禁止呼吸或限制正常表情。
- 同一句跨切镜时在接续处用 <scenetrans> 并说明声音不断；仅当原定视频确实截断声音时用 <cutoff>。不能为了短时长擅自截断用户完整台词。
- 画面必须出现的文字用英文双引号包住原文，不翻译或改写。
- 环境声与同步声按明确场景合理安排，不强加未要求的声源；overall_soundscape 只有用户明确要求整片完全静音才用 N/A。未要求配乐时 non_diegetic_music 用 N/A；画内乐器/收音机声音属于时间线。
- 拟声、动作声音、对白、画内音乐与背景配乐不能混为一项，也不机械重复同一句台词。
