import { createToolConfig } from "@toonflow/tools-scaffold";
import { directorPrompt } from "./src/prompt";

await createToolConfig({
  name: "novelDirector",
  displayName: "小说连续性导演",
  description: "小说 TXT 转角色、音色、场景资产和分镜。持久保存设定，锁定返场空间，编译 Z-Image / Qwen3 / MiniMax H3 提示词并检查连续性。",
  author: "Local",
  github: "",
  prompt: directorPrompt,
  configRules: [],
}, import.meta.url);
