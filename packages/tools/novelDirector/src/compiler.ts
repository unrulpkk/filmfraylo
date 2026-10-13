import type { Asset, Project, Shot } from "./schema";

export function getAsset(project: Project, id: string, kind?: Asset["kind"], parentId?: string): Asset {
  const asset = project.assets.find(item => item.id === id);
  if (!asset || (kind && asset.kind !== kind) || (parentId && asset.parentId !== parentId)) {
    throw new Error(`资产 ${id} 不存在，或类型/所属对象不匹配（${kind ?? "任意"} / ${parentId ?? "无"}）`);
  }
  return asset;
}

function sourceText(project: Project, span: { start: number; end: number }) {
  if (span.start >= span.end || span.end > project.sourceText.length) throw new Error("原文引用范围无效");
  return project.sourceText.slice(span.start, span.end);
}

export function validateAssets(project: Project) {
  const names = new Map<string, string>();
  const ids = new Set<string>();
  for (const asset of project.assets) {
    if (ids.has(asset.id)) throw new Error(`重复资产 ID：${asset.id}`);
    ids.add(asset.id);
    for (const entry of asset.evidence) {
      if (sourceText(project, entry) !== entry.quote) throw new Error(`资产 ${asset.id} 的 evidence 与原文不一致`);
    }
    const parentKind = asset.kind === "sceneState" ? "location" : ["appearance", "voice"].includes(asset.kind) ? "character" : undefined;
    if (parentKind) {
      if (!asset.parentId) throw new Error(`${asset.id} 缺少 parentId`);
      getAsset(project, asset.parentId, parentKind);
    } else if (asset.parentId) throw new Error(`${asset.kind} 不应设置 parentId`);
    if (asset.kind === "voice" && !asset.sampleText) throw new Error(`${asset.id} 缺少音色试听 sampleText`);
    if (asset.kind !== "voice" && asset.sampleText) throw new Error("只有 voice 可设置 sampleText");
    for (const name of new Set([asset.name, ...asset.aliases])) {
      const key = `${asset.kind}:${asset.parentId ?? ""}:${name.normalize("NFKC").toLowerCase().replace(/\s/g, "")}`;
      if (names.has(key)) throw new Error(`${asset.id} 与 ${names.get(key)} 同名或共用别名；请复用已有资产`);
      names.set(key, asset.id);
    }
  }
}

export function validateShots(project: Project) {
  const locations = new Map<string, Shot>();
  const characters = new Map<string, Shot["cast"][number]>();
  const ids = new Set<string>();
  let previous: Shot | undefined;
  for (const shot of project.shots) {
    const fail = (message: string): never => { throw new Error(`${shot.id}：${message}`); };
    if (ids.has(shot.id)) fail("分镜 ID 重复");
    ids.add(shot.id);
    sourceText(project, shot.source);
    if (shot.duration > project.maxShotSeconds) fail(`时长超过项目上限 ${project.maxShotSeconds} 秒，需拆镜`);
    getAsset(project, shot.locationId, "location");
    getAsset(project, shot.sceneStateId, "sceneState", shot.locationId);
    if (previous && previous.source.start > shot.source.start && !shot.continuityNote) fail("原文顺序倒退；闪回需说明依据");
    if (previous && previous.locationId !== shot.locationId && !shot.continuityNote) fail("切换地点/返场需说明转场关系");
    const lastLocation = locations.get(shot.locationId);
    if (lastLocation && (lastLocation.sceneStateId !== shot.sceneStateId || lastLocation.exitState !== shot.entryState) && !shot.continuityNote) {
      fail(`与该地点上一镜 ${lastLocation.id} 的场景状态或出入状态不一致；需沿用或说明变化依据`);
    }
    const castIds = new Set<string>();
    for (const cast of shot.cast) {
      if (castIds.has(cast.characterId)) fail("同一角色重复出现于 cast");
      castIds.add(cast.characterId);
      getAsset(project, cast.characterId, "character");
      getAsset(project, cast.appearanceId, "appearance", cast.characterId);
      if (cast.voiceId) getAsset(project, cast.voiceId, "voice", cast.characterId);
      const last = characters.get(cast.characterId);
      if (last && (last.appearanceId !== cast.appearanceId || last.exitState !== cast.entryState || (last.voiceId && cast.voiceId && last.voiceId !== cast.voiceId)) && !shot.continuityNote) {
        fail(`角色 ${cast.characterId} 的服装、音色或持物/伤情状态变化缺少说明`);
      }
      characters.set(cast.characterId, { ...cast, voiceId: cast.voiceId ?? last?.voiceId });
    }
    let beatEnd = 0;
    for (const beat of shot.beats) {
      if (beat.start !== beatEnd || beat.end <= beat.start || beat.end > shot.duration) fail("动作节拍必须连续覆盖镜头且不重叠");
      beatEnd = beat.end;
    }
    if (beatEnd !== shot.duration) fail("动作节拍没有覆盖完整时长");
    let dialogueEnd = 0;
    for (const line of shot.dialogue) {
      const cast = shot.cast.find(item => item.characterId === line.speakerId);
      if (!cast?.voiceId) fail(`说话者 ${line.speakerId} 必须在 cast 中并绑定 voiceId`);
      if (sourceText(project, line.source) !== line.text || line.source.start < shot.source.start || line.source.end > shot.source.end) fail("对白必须逐字对应本镜原文范围");
      if (line.start < dialogueEnd || line.end <= line.start || line.end > shot.duration) fail("对白时间重叠、逆序或超出时长；请拆镜");
      const syllables = [...line.text.replace(/[\p{P}\p{Z}\s]/gu, "")].length;
      if (syllables / project.speechCharsPerSecond + 0.4 > line.end - line.start) fail("对白按项目语速预算无法说完（含0.4秒停顿），请拆镜或延长");
      dialogueEnd = line.end;
    }
    locations.set(shot.locationId, shot);
    previous = shot;
  }
}

function describe(asset: Asset) {
  return `${asset.name}（${asset.id}）：${asset.locks.join("；")}。统一补充设计：${asset.design}`;
}

export function assetPrompt(project: Project, asset: Asset) {
  const parent = asset.parentId ? getAsset(project, asset.parentId) : undefined;
  const template = {
    character: "单人身份定妆肖像，头肩构图，平视，中性表情，清晰五官及发际线，柔和均匀照明，中性背景。",
    appearance: "单人完整全身服装定妆照，头脚完整、自然站姿，清晰衣料、鞋和随身道具，中性背景，身份严格沿用人物设定。",
    location: "无人场景空间母版，广角平视建立镜头，完整交代出入口和地标之间的空间关系、尺度、材质。",
    sceneState: "同一地点的无人场景状态参考，严格保留空间母版的几何、地标、材质与布局；只应用本状态定义的时间、天气、灯光和道具状态。",
    voice: "固定角色音色，用自然中性语气试听；保持稳定音域、音质、口音和语速，不表演本次剧情情绪。",
  }[asset.kind];
  const description = [project.style, parent ? describe(parent) : "", describe(asset), template].filter(Boolean).join("\n");
  return {
    assetId: asset.id,
    label: `novel:${project.projectId}:asset:${asset.id}`,
    mediaType: asset.kind === "voice" ? "audio" : "image",
    preferredModel: asset.kind === "voice" ? "Qwen3-TTS-VoiceDesign" : "Z-Image-Base",
    prompt: asset.kind === "voice" ? asset.sampleText! : `${description}\n单幅图像，不拼贴、不制作多视图参考板，无文字、水印及额外人物。`,
    ...(asset.kind === "voice" ? { voicePrompt: `${parent ? describe(parent) : ""}\n${describe(asset)}\n${template}` } : {}),
    ...(asset.kind !== "voice" ? { ratio: asset.kind === "character" ? "1:1" : asset.kind === "appearance" ? "3:4" : "16:9" } : {}),
    parentReference: parent?.reference ?? null,
    modelNote: "先查模型能力；parentReference 仅在模型支持参考输入时传入，否则用锁定描述生成并人工核对。",
  };
}

export function compileShot(project: Project, shot: Shot) {
  const location = getAsset(project, shot.locationId);
  const state = getAsset(project, shot.sceneStateId);
  // 空间母版通过状态图继承；视频固定使用状态图，避免母版与昼夜图同时输入互相冲突。
  const images = [state, ...shot.cast.flatMap(cast => [getAsset(project, cast.characterId), getAsset(project, cast.appearanceId)])];
  const speakers = new Set(shot.dialogue.map(line => line.speakerId));
  const voices = shot.cast.filter(cast => speakers.has(cast.characterId)).map(cast => getAsset(project, cast.voiceId!));
  const assets = [...images, ...voices];
  const blockers = assets.filter(asset => !asset.reference).map(asset => `缺少参考素材：${asset.id}（${asset.name}）`);
  if (!location.reference) blockers.push(`缺少空间母版：${location.id}；先生成母版再核对场景状态图`);
  if (images.length > 9 || voices.length > 3 || assets.length > 12) blockers.push("超出 MiniMax H3 9图/3音频/合计12素材限制，需拆镜");
  const references = assets.map((asset, index) => ({
    assetId: asset.id,
    role: asset.kind,
    name: asset.name,
    input: index < images.length ? `图片${index + 1}` : `音频${index - images.length + 1}`,
    ...(asset.reference ?? {}),
  }));
  const sections = [
    `【整体】${project.style}。单镜${shot.duration}秒，画幅16:9。`,
    `【固定空间】${describe(location)}`,
    `【本次场景状态】${describe(state)}`,
    `【参考输入顺序】${references.map(ref => `${ref.input}=${ref.name}（${ref.role}，${ref.assetId}）`).join("；")}。场景参考约束空间；角色肖像约束身份；服装参考约束穿着；音频只约束对应说话者音色。`,
    `【角色】${shot.cast.length ? shot.cast.map(cast => `${describe(getAsset(project, cast.characterId))}\n${describe(getAsset(project, cast.appearanceId))}\n站位：${cast.position}；进入状态：${cast.entryState}；离开状态：${cast.exitState}`).join("\n") : "空镜，无人物"}`,
    `【摄影】景别：${shot.framing}；机位与运动：${shot.camera}；轴线与方向：${shot.axis}`,
    `【衔接】起始：${shot.entryState}；结束：${shot.exitState}；${shot.continuityNote || "延续已登记的空间与人物状态"}`,
    `【动作节拍】${shot.beats.map(beat => `${beat.start}–${beat.end}秒：${beat.action}`).join("\n")}`,
    `【对白】${shot.dialogue.length ? shot.dialogue.map(line => `${line.start}–${line.end}秒，${getAsset(project, line.speakerId).name}：“${line.text}”`).join("\n") : "无对白，不添加旁白"}`,
    `【声音】${shot.sound}${voices.length ? `\n固定音色：${voices.map(describe).join("\n")}` : ""}`,
    "【约束】保持身份、衣着、道具和场景几何连续；不增加对白、人物、字幕、水印或额外剧情；不把角色参考背景带入场景。",
  ];
  return {
    shotId: shot.id,
    label: `novel:${project.projectId}:shot:${shot.id}`,
    source: shot.source,
    prompt: sections.join("\n\n"),
    references,
    blockers,
    ready: blockers.length === 0,
    settings: { duration: shot.duration, ratio: "16:9", resolution: "1080P", generateAudio: true, mode: ["imageReference:9", "videoReference:3", "audioReference:3"] },
  };
}
