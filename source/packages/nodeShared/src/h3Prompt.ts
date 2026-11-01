import { z, type NodeHandle } from "@toonflow/nodes-scaffold/runtime";
import example from "./h3PromptExample.txt?raw";

export const h3Handles = [
  { id: "in", type: "target", dataType: "STRING", label: "文本输入" },
  { id: "text", type: "source", dataType: "STRING", label: "英文提示词输出" },
] satisfies NodeHandle[];

export const h3PairSchema = z.strictObject({ chinese: z.string().trim().min(1).max(24000), english: z.string().trim().min(1).max(24000) });
export type H3Pair = z.infer<typeof h3PairSchema>;
export type H3Result = H3Pair & { input: string; model: string };

// 对白是原文数据；只转换对白外的媒体引用，两个版本始终共用同一编号。
export function h3References(text: string, native = false) {
  const types = { picture: "图", audio: "音频", video: "视频" } as const;
  return text.split(/(<d>[\s\S]*?<\/d>)/gi).map((part, index) => index % 2 ? part : part
    .replace(/<\s*(picture|audio|video)\s*([1-9]\d*)\s*>|参考(图|音频|视频)\s*([1-9]\d*)/gi,
      (_match, kind: string | undefined, number: string | undefined, label: string, chineseNumber: string) => {
        const type = kind?.toLowerCase() as keyof typeof types | undefined;
        const media = type ?? (Object.keys(types) as (keyof typeof types)[]).find(key => types[key] === label)!;
        const id = number ?? chineseNumber;
        return native ? `<${media[0].toUpperCase()}${media.slice(1)} ${id}>` : `参考${types[media]}${id}`;
      })).join("");
}

export function readH3Pair(text: string): H3Pair {
  let json: unknown;
  try { json = JSON.parse(text.trim().replace(/^```(?:json)?\s*\n([\s\S]*?)\n```$/i, "$1")); }
  catch { throw new Error("DeepSeek 未返回有效的中英文提示词，请重试；原有内容已保留"); }
  const parsed = h3PairSchema.safeParse(json);
  if (!parsed.success) throw new Error("DeepSeek 返回的中英文提示词不完整，请重试");
  const pair = { chinese: h3References(parsed.data.chinese), english: h3References(parsed.data.english) };
  for (const value of [pair.chinese, pair.english]) {
    if (!/^detailed_description\s*:/im.test(value) && !/^integrated_multimodal_description\s*:/im.test(value)) {
      throw new Error("DeepSeek 未返回 H3 提示词字段，请重试");
    }
  }
  const references = (value: string) => [...new Set(h3References(value, true).match(/<(?:Picture|Audio|Video) [1-9]\d*>/g) ?? [])].sort().join("|");
  if (references(pair.chinese) !== references(pair.english)) throw new Error("中英文的参考素材编号不一致，请重试");
  const dialogue = (value: string) => (value.match(/<d>[\s\S]*?<\/d>/gi) ?? []).join("\n");
  if (dialogue(pair.chinese) !== dialogue(pair.english)) throw new Error("中英文的对白原文不一致，请重试");
  return pair;
}

export function h3SystemPrompt(planner: boolean) {
  return `You prepare MiniMax H3 video prompts for FilmFraylo. Return ONLY a JSON object with exactly two nonempty string fields: "chinese" and "english". No Markdown fences, commentary, or JSON outside this object.
Both strings are the SAME complete prompt in different narrative languages. chinese uses Chinese descriptions; english uses English descriptions. Keep H3 field names, S1/S2 identifiers, timestamps and <d> tags in their original syntax. Preserve spoken dialogue/lyrics and visible text in their ORIGINAL language and punctuation; never translate dialogue. Speakers are numbered in order of first actual speech. Put [Chinese] or the actual language inside <d>, actions and delivery outside.
${planner ? "Convert the user's natural-language intent into a clear, executable H3 prompt, following the supplied example's subject_definitions and detailed_description sections. Preserve explicit duration, shot order, dialogue, reference purposes and constraints. Do not invent reference media, new dialogue, or extra characters. If no subject needs defining, write subject_definitions: N/A. Do not silently impose the example's historical setting or 14-second duration on other stories." : "Translate and normalize the input into the two language versions. If it is already structured H3, preserve its section structure and meaning, timing, shot numbering and all dialogue exactly. Otherwise organize it into the example's subject_definitions and detailed_description sections. Do not expand the story or add invented assets, dialogue, shots or music."}
FilmFraylo media references MUST use 参考图1, 参考图2, 参考音频1, 参考视频1 (no spaces), in BOTH languages. The app deterministically renders native <Picture 1>, <Audio 1>, <Video 1> in a separate tab. Never renumber media or speakers. English text surrounding a reference remains English. Preserve <Subject 1> and S1, which are NOT media references. Only describe references explicitly present in the input; these nodes receive TEXT, not the actual media. Never claim to have inspected an image or listened to audio.
Match the following user-supplied H3 case's prompt organization and dialogue syntax. It is an example, not content to copy into unrelated requests:
${example}
If the input already uses another valid H3 format (e.g. integrated_multimodal_description / overall_soundscape / non_diegetic_music, or the six-field Ref2VA format), preserve that format. Never output chain of thought, placeholders or instructions to the user.`;
}
