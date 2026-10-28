import { resolveMode, validateInput } from "./constraints";
import { modeReferences } from "./references";
import { promptFormatError, readPlan, renderPrompt, validateOutput, validatePlan } from "./format";
import { h3WritingRules, modelPrompt } from "./rules";
import type { PromptInput, PromptState } from "./types";

export type TextCompletion = (request: { prompt: string; systemPrompt: string; signal?: AbortSignal }) => Promise<string>;

export async function generateIntoState(state: PromptState, input: PromptInput, complete: TextCompletion, options: { signal?: AbortSignal; refine?: boolean; phase?: (phase: "generating" | "repairing") => void } = {}) {
  const diagnostics = validateInput(input);
  const errors = diagnostics.filter(item => item.level === "error");
  if (errors.length) throw new Error(errors.map(item => item.message).join("；"));
  const mode = resolveMode(input);
  const references = modeReferences(mode, input.references);
  const before = state.output;
  const request = modelPrompt(input, mode, references, options.refine ? before : "", state.subjectIds);
  options.signal?.throwIfAborted();
  options.phase?.("generating");
  let raw = await complete({ prompt: request, systemPrompt: h3WritingRules, signal: options.signal });
  for (let attempt = 0; attempt < 2; attempt++) {
    options.signal?.throwIfAborted();
    try {
      const plan = readPlan(raw);
      const warnings = validatePlan(plan, input, mode, references);
      const result = renderPrompt(plan, input, mode, references, state.subjectIds);
      const outputIssues = validateOutput(result.output, input, mode, references);
      const outputErrors = outputIssues.filter(issue => issue.level === "error");
      if (outputErrors.length) throw new promptFormatError(outputErrors.map(issue => issue.message));
      options.signal?.throwIfAborted();
      if (state.output !== before) throw new Error("生成期间提示词已被修改，未覆盖当前编辑内容");
      // 只在完整校验成功后提交结果；失败、取消和单次修复失败都保留原提示词。
      Object.assign(state, { output: result.output, subjectIds: result.subjectIds, plan, resolvedMode: mode,
        diagnostics: [...diagnostics, ...warnings, ...outputIssues] });
      return { output: state.output, mode, diagnostics: state.diagnostics };
    } catch (error) {
      if (!(error instanceof promptFormatError) || attempt === 1) throw error;
      options.signal?.throwIfAborted();
      options.phase?.("repairing");
      raw = await complete({ systemPrompt: h3WritingRules, prompt: JSON.stringify({ originalRequest: request, previousPlan: raw, formatErrors: error.issues,
        instruction: "Repair structural/format errors once. Preserve user intent, complete dialogue, reference identities, and all unaffected content. Return corrected JSON only; do not invent semantic changes." }), signal: options.signal });
    }
  }
  throw new Error("未获得可用提示词，原结果已保留");
}
