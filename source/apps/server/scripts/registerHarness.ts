import { existsSync, mkdir, readFile, writeFile, writeAtomic } from "@toonflow/file";
import { parseExpression } from "@babel/parser";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";

// Preserve JSONC comments and unrelated settings by inserting only the missing property.
export function mergeConfig(text: string, group: string, entry: Record<string, unknown>) {
  let current: any;
  let tree: any;
  try { current = Bun.JSON5.parse(text); tree = parseExpression(text); }
  catch { throw new Error("Invalid host configuration; existing file was preserved."); }
  if (!current || Array.isArray(current) || typeof current !== "object" || tree.type !== "ObjectExpression") throw new Error("Expected a configuration object.");
  function property(object: any, name: string) {
    const matches = object.properties.filter((p: any) => p.type === "ObjectProperty" && (p.key.value ?? p.key.name) === name);
    if (matches.length > 1) throw new Error("Duplicate configuration keys; resolve them before setup.");
    return matches[0];
  }
  const section = property(tree, group);
  if (section && section.value.type !== "ObjectExpression") throw new Error("MCP configuration must be an object.");
  if (section && property(section.value, "filmfraylo")) {
    const old = current[group].filmfraylo;
    if (old?.disabled === true || old?.enabled === false || Object.keys(entry).some(key => JSON.stringify(old?.[key]) !== JSON.stringify(entry[key]))) {
      throw new Error("filmfraylo configuration differs or is disabled; existing entry was preserved. Select the intended instance before updating it.");
    }
    return text;
  }
  const object = section ? section.value : tree;
  const value = JSON.stringify(section ? entry : { filmfraylo: entry }, null, 2);
  const addition = `\n${JSON.stringify(section ? "filmfraylo" : group)}: ${value}\n`;
  let result = text.slice(0, object.end - 1) + addition + text.slice(object.end - 1);
  const last = object.properties.at(-1);
  if (last && !text.slice(last.end, object.end - 1).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\r\n]*/g, "").includes(",")) {
    result = result.slice(0, last.end) + "," + result.slice(last.end);
  }
  Bun.JSON5.parse(result);
  return result;
}

async function main() {
  const { values } = parseArgs({ options: { harness: { type: "string" } } });
  const host = values.harness;
  const paths: Record<string, string> = {
    claude: process.env.CLAUDE_CONFIG_DIR ? resolve(process.env.CLAUDE_CONFIG_DIR, ".claude.json") : resolve(homedir(), ".claude.json"),
    cursor: resolve(homedir(), ".cursor/mcp.json"),
    gemini: resolve(homedir(), ".gemini/settings.json"),
    opencode: resolve(process.env.XDG_CONFIG_HOME || resolve(homedir(), ".config"), "opencode/opencode.json"),
  };
  if (!host || !paths[host]) throw new Error("Unsupported harness registration.");
  let target = paths[host]!;
  if (host === "opencode") {
    if (process.env.OPENCODE_CONFIG) target = resolve(process.env.OPENCODE_CONFIG);
    else if (existsSync(target + "c")) {
      if (existsSync(target)) throw new Error("Both opencode.json and opencode.jsonc exist; choose the effective configuration manually.");
      target += "c";
    }
  }
  const incoming = JSON.parse(await Bun.stdin.text());
  const group = host === "opencode" ? "mcp" : "mcpServers";
  const entry = incoming[group]?.filmfraylo;
  if (!entry || typeof entry !== "object") throw new Error("Missing filmfraylo entry.");
  const exists = existsSync(target);
  const original = exists ? await readFile(target, "utf8") : "{}";
  const updated = mergeConfig(original, group, entry);
  if (updated !== original) {
    await mkdir(dirname(target), { recursive: true });
    if (exists) {
      await writeFile(`${target}.filmFraylo-${crypto.randomUUID()}.bak`, original, { flag: "wx", mode: 0o600 });
      if (await readFile(target, "utf8") !== original) throw new Error("Host configuration changed during setup. Retry after it finishes saving.");
      await writeAtomic(target, updated, { mode: 0o600 });
    } else await writeFile(target, updated, { flag: "wx", mode: 0o600 });
  }
  console.log(target);
}
if (import.meta.main) main().catch(error => { console.error(error.message); process.exitCode = 1; });
