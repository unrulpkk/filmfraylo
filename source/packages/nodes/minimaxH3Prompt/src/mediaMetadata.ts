import type { BrowserFfmpegFactory } from "@toonflow/nodes-scaffold/runtime";
import type { PromptReference } from "./types";

// 复用宿主 ffprobe，只读容器元数据；不播放、转写或分析音频内容。
export async function readMediaDuration(ffmpeg: BrowserFfmpegFactory, reference: PromptReference, signal?: AbortSignal) {
  if (!reference.media || reference.kind === "IMAGE") throw new Error("没有可读取时长的音视频素材");
  const combined = AbortSignal.any([AbortSignal.timeout(15000), ...(signal ? [signal] : [])]);
  combined.throwIfAborted();
  const command = ffmpeg(reference.media.url);
  return new Promise<number>((resolve, reject) => {
    const cancel = () => { command.kill(); reject(signal?.aborted ? signal.reason : new Error("素材时长读取超时，请手动填写真实时长")); };
    combined.addEventListener("abort", cancel, { once: true });
    command.ffprobe((error, data) => {
      combined.removeEventListener("abort", cancel);
      if (combined.aborted) { reject(combined.reason); return; }
      if (error) { reject(new Error("无法读取素材时长，请手动填写真实时长", { cause: error })); return; }
      const duration = Number(data.format.duration ?? data.streams.find(stream => stream.codec_type === reference.kind.toLowerCase())?.duration);
      if (!Number.isFinite(duration) || duration <= 0) reject(new Error("素材未提供有效时长，请手动填写真实时长"));
      else resolve(duration);
    });
  });
}
