import { createHash } from "node:crypto";
import { extname } from "node:path";
import { z } from "zod";
import type { ToolContext, ToolPlugin } from "@toonflow/tools-scaffold/runtime";
import { assetPrompt, compileShot, getAsset, validateAssets, validateShots } from "./compiler";
import { projectSchema, referenceSchema, requestSchema, type Asset, type Project } from "./schema";

// 宿主单进程内串行读改写；revision 防止不同对话把旧快照覆盖回来。
const pending = new Map<string, Promise<unknown>>();
const configSchema = z.strictObject({});
const hash = (content: string | Buffer) => createHash("sha256").update(content).digest("hex");

async function inspectReference(context: ToolContext, path: string, kind: Asset["kind"]) {
  const stat = await context.files.stat(path);
  if (!stat.isFile() || stat.size === 0 || stat.size > 100 * 1024 * 1024) throw new Error("素材必须是非空文件且不超过100 MB");
  const bytes = await context.files.readFile(path);
  let mimeType: string | null;
  if (kind === "voice") {
    const header = bytes.subarray(0, 12).toString("ascii");
    mimeType = header.startsWith("ID3") || (bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0 && extname(path).toLowerCase() === ".mp3") ? "audio/mpeg"
      : header.startsWith("RIFF") && header.slice(8) === "WAVE" ? "audio/wav"
      : header.startsWith("OggS") ? "audio/ogg" : header.startsWith("fLaC") ? "audio/flac" : null;
  } else {
    mimeType = await context.files.detectImageMimeType(path);
  }
  return referenceSchema.parse({ path, mimeType, sha256: hash(bytes) });
}

function paginate<T>(items: T[], offset: number, limit: number) {
  const results = items.slice(offset, offset + limit);
  return { items: results, total: items.length, nextOffset: offset + results.length < items.length ? offset + results.length : null };
}

function coverage(project: Project) {
  let coveredUntil = 0;
  let coveredCharacters = 0;
  const gaps: { start: number; end: number }[] = [];
  for (const span of project.shots.map(shot => shot.source).sort((a, b) => a.start - b.start)) {
    if (span.start > coveredUntil && gaps.length < 8) gaps.push({ start: coveredUntil, end: span.start });
    coveredCharacters += Math.max(0, span.end - Math.max(coveredUntil, span.start));
    coveredUntil = Math.max(coveredUntil, span.end);
  }
  if (coveredUntil < project.sourceText.length && gaps.length < 8) gaps.push({ start: coveredUntil, end: project.sourceText.length });
  return { coveredCharacters, sourceCharacters: project.sourceText.length, firstUncoveredRanges: gaps, note: "仅统计引用区间，不代表区间内事件已完整改编；用户指定范围外可保留未覆盖。" };
}

async function compile(context: ToolContext, project: Project, shots: Project["shots"]) {
  const failures = new Map<string, string>();
  const usedIds = new Set(shots.flatMap(shot => [shot.locationId, shot.sceneStateId, ...shot.cast.flatMap(cast =>
    [cast.characterId, cast.appearanceId, ...(shot.dialogue.some(line => line.speakerId === cast.characterId) && cast.voiceId ? [cast.voiceId] : [])]) ]));
  for (const id of usedIds) {
    const asset = getAsset(project, id);
    if (!asset.reference) continue;
    try {
      const current = await inspectReference(context, asset.reference.path, asset.kind);
      if (current.sha256 !== asset.reference.sha256) failures.set(id, `素材 ${id} 文件已被替换；恢复原文件或新建资产并修订分镜`);
    } catch (error) {
      failures.set(id, `素材 ${id} 无法读取：${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return shots.map(shot => {
    const result = compileShot(project, shot);
    for (const id of new Set([shot.locationId, ...result.references.map(ref => ref.assetId)])) {
      const failure = failures.get(id);
      if (failure) result.blockers.push(failure);
    }
    result.ready = result.blockers.length === 0;
    return result;
  });
}

async function execute(context: ToolContext, request: z.infer<typeof requestSchema>, signal?: AbortSignal) {
  const { files } = context;
  const path = `novelDirector/${request.projectId}.json`;
  signal?.throwIfAborted();
  if (request.action === "create") {
    const stat = await files.stat(request.sourcePath);
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) throw new Error("小说需为不超过32 MB的 UTF-8 文本文件");
    const sourceText = new TextDecoder("utf-8", { fatal: true }).decode(await files.readFile(request.sourcePath));
    if (sourceText.includes("\u0000")) throw new Error("小说不是有效的纯文本，请先转为 UTF-8 TXT");
    const project = projectSchema.parse({
      version: 1, projectId: request.projectId, revision: 0, sourcePath: request.sourcePath, sourceText,
      sourceHash: hash(sourceText), style: request.style, maxShotSeconds: request.maxShotSeconds,
      speechCharsPerSecond: request.speechCharsPerSecond, assets: [], shots: [],
    });
    await files.mkdir("novelDirector", true);
    signal?.throwIfAborted();
    await files.writeFile(path, JSON.stringify(project, null, 2), true);
    return { path, revision: 0, sourceCharacters: sourceText.length, next: "source 分页读取原文，然后 addAssets" };
  }
  // ACT: 单项目原子快照，上限32 MB原文/2万镜；更大项目按卷拆分，避免另建数据库和事务层。
  const project = projectSchema.parse(JSON.parse((await files.readFile(path)).toString("utf8")));
  if (project.projectId !== request.projectId || hash(project.sourceText) !== project.sourceHash) throw new Error("项目 ID 或冻结原文摘要不匹配，请恢复未被外部修改的项目文件");
  if ("revision" in request && request.revision !== project.revision) throw new Error(`revision 冲突：当前 ${project.revision}，请重新 inspect/read 后合并`);
  validateAssets(project);
  validateShots(project);
  const revision = project.revision;
  switch (request.action) {
    case "inspect": return {
      revision, path, style: project.style, maxShotSeconds: project.maxShotSeconds, speechCharsPerSecond: project.speechCharsPerSecond,
      assetCount: project.assets.length, shotCount: project.shots.length, boundReferenceCount: project.assets.filter(asset => asset.reference).length,
      recentShots: project.shots.slice(-8).map(shot => ({ id: shot.id, source: shot.source, locationId: shot.locationId, sceneStateId: shot.sceneStateId })),
      coverage: coverage(project), next: "readAssets/readShots 分页查已有 ID；source 按偏移读取；不要重建已有角色和地点",
    };
    case "source": {
      const end = Math.min(request.offset + request.length, project.sourceText.length);
      if (request.offset > end) throw new Error("offset 超出原文长度");
      return { revision, start: request.offset, end, text: project.sourceText.slice(request.offset, end), total: project.sourceText.length, nextOffset: end < project.sourceText.length ? end : null };
    }
    case "readAssets": {
      const assets = project.assets.filter(asset => (!request.kind || asset.kind === request.kind) && (!request.ids || request.ids.includes(asset.id)));
      const page = paginate(assets, request.offset, request.limit);
      return { revision, ...page, items: page.items.map(asset => {
        const locationShot = asset.kind === "location" ? project.shots.findLast(shot => shot.locationId === asset.id) : undefined;
        const characterShot = asset.kind === "character" ? project.shots.findLast(shot => shot.cast.some(cast => cast.characterId === asset.id)) : undefined;
        return {
          ...asset,
          ...(asset.kind === "location" ? { lastLocationShot: locationShot ? {
            id: locationShot.id, sceneStateId: locationShot.sceneStateId, exitState: locationShot.exitState, axis: locationShot.axis,
          } : null } : {}),
          ...(asset.kind === "character" ? { lastCharacterShot: characterShot ? {
            id: characterShot.id, locationId: characterShot.locationId, ...characterShot.cast.find(cast => cast.characterId === asset.id),
          } : null } : {}),
        };
      }) };
    }
    case "readShots": return { revision, ...paginate(project.shots.filter(shot => !request.ids || request.ids.includes(shot.id)), request.offset, request.limit) };
    case "assetPrompt": return { revision, ...assetPrompt(project, getAsset(project, request.assetId)) };
    case "compile": {
      const page = paginate(project.shots, request.offset, request.limit);
      return { revision, ...page, items: await compile(context, project, page.items) };
    }
    case "export": {
      const exportPath = `novelDirector/${project.projectId}Export${revision}.json`;
      const result = {
        projectId: project.projectId, revision, sourcePath: project.sourcePath, sourceHash: project.sourceHash,
        style: project.style, assets: project.assets, assetPrompts: project.assets.map(asset => assetPrompt(project, asset)),
        shots: await compile(context, project, project.shots), coverage: coverage(project),
      };
      signal?.throwIfAborted();
      await files.writeFile(exportPath, JSON.stringify(result, null, 2), true);
      return { revision, path: exportPath, shots: result.shots.length, ready: result.shots.filter(shot => shot.ready).length,
        blocked: result.shots.filter(shot => !shot.ready).length, note: "导出不触发媒体生成；文件存在时不覆盖" };
    }
    case "addAssets": {
      project.assets.push(...request.assets);
      validateAssets(project);
      break;
    }
    case "bindReference": {
      const asset = getAsset(project, request.assetId);
      if (asset.reference) throw new Error("资产引用已锁定；要替换请新建资产 ID 并修订分镜，不覆盖旧引用");
      if (asset.kind === "sceneState" && !getAsset(project, asset.parentId!).reference) throw new Error("请先绑定地点空间母版，再生成/核对并绑定场景状态图");
      if (asset.kind === "appearance" && !getAsset(project, asset.parentId!).reference) throw new Error("请先绑定角色肖像，再核对并绑定服装定妆图");
      asset.reference = await inspectReference(context, request.path, asset.kind);
      break;
    }
    case "saveShots": {
      if (new Set(request.shots.map(shot => shot.id)).size !== request.shots.length) throw new Error("本批分镜 ID 不能重复");
      for (const shot of request.shots) {
        const index = project.shots.findIndex(item => item.id === shot.id);
        if (index < 0) project.shots.push(shot);
        else project.shots[index] = shot;
      }
      validateShots(project);
      break;
    }
  }
  project.revision++;
  projectSchema.parse(project);
  signal?.throwIfAborted();
  await files.writeFile(path, JSON.stringify(project, null, 2));
  return { revision: project.revision, path, assetCount: project.assets.length, shotCount: project.shots.length };
}

const plugin: ToolPlugin = {
  validateConfig: config => configSchema.parse(config),
  createTools(context) {
    return [{
      name: "novelDirector",
      label: "小说连续性导演",
      description: "小说转分镜的持久制作台账。create 从工作区 UTF-8 TXT 冻结原文；inspect 查看进度/revision；source 分页读原文（UTF-16偏移，end不包含）；readAssets/readShots 分页查设定及最近状态；addAssets 登记不可覆盖的角色/服装/音色/地点/场景状态，evidence.quote 必须逐字对应原文；assetPrompt 编译单幅角色/场景或音色提示词；bindReference 绑定真实素材并锁定摘要；saveShots 每批最多8镜，校验原文对白、时间和返场状态，按ID追加或修订；compile 分页编译 MiniMax H3 提示词和有序参考清单，缺素材/超限返回 blockers；export 新建当前revision的JSON清单。写入须带最新revision。只管理计划和引用，不调用生成模型。",
      promptSnippet: "长篇小说制作先建立可复用的角色、音色、场景资产，再编译分镜，跨章节返场复用固定空间。",
      parameters: z.toJSONSchema(requestSchema, { io: "input", target: "draft-07" }),
      executionMode: "sequential",
      async execute(_id, params, signal) {
        const request = requestSchema.parse(params);
        const resolved = await context.resolvePath(`novelDirector/${request.projectId}.json`);
        const key = process.platform === "win32" ? resolved.toLowerCase() : resolved;
        const before = pending.get(key) ?? Promise.resolve();
        const operation = before.catch(() => {}).then(() => execute(context, request, signal));
        pending.set(key, operation);
        try {
          const result = await operation;
          return { content: [{ type: "text", text: JSON.stringify(result) }], details: result };
        } finally {
          if (pending.get(key) === operation) pending.delete(key);
        }
      },
    }];
  },
};

export default plugin;
