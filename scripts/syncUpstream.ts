import { spawnSync } from "node:child_process";
import { basename, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import upstream from "./upstream.json" with { type: "json" };

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const lockPath = "scripts/upstream.json";
const args = process.argv.slice(2);
const command = args.shift() ?? "help";

function git(args: string[], cwd = root, input?: string, allowed = [0]) {
  const result = spawnSync("git", args, {
    cwd, input, encoding: "utf8", maxBuffer: 32 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.error) throw result.error;
  if (result.status === null || !allowed.includes(result.status)) {
    throw new Error(result.stderr.trim() || result.stdout.trim() || `git ${args[0]} 失败`);
  }
  return { code: result.status, output: result.stdout.trimEnd(), error: result.stderr.trimEnd() };
}

function output(args: string[], cwd = root, input?: string) {
  return git(args, cwd, input).output;
}

function clean(cwd = root) {
  if (output(["status", "--porcelain", "--untracked-files=all"], cwd)) {
    throw new Error("请先提交或使用 git stash 保存当前改动（包含未跟踪文件），再执行此操作。");
  }
  for (const state of ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "REBASE_HEAD"]) {
    if (git(["rev-parse", "--verify", "--quiet", state], cwd, undefined, [0, 1]).code === 0) {
      throw new Error(`请先结束当前 Git 操作：${state}`);
    }
  }
}

function commit(tree: string, parents: string[], message: string) {
  return output([
    "-c", "user.name=FilmFraylo Upstream Sync", "-c", "user.email=upstream@filmfraylo.local",
    "commit-tree", tree, ...parents.flatMap(parent => ["-p", parent]),
  ], root, `${message}\n`);
}

function mappedTree(head: string, source: string) {
  const entries = output(["ls-tree", head]).split("\n");
  const sourceTree = output(["rev-parse", `${source}^{tree}`]);
  if (!entries.some(entry => entry.endsWith("\tsource"))) throw new Error("当前提交缺少 source/。");
  return output(["mktree"], root, `${entries.map(entry => entry.endsWith("\tsource")
    ? `040000 tree ${sourceTree}\tsource` : entry).join("\n")}\n`);
}

function writeLock(value: typeof upstream) {
  // Git 负责工作树与索引的事务；维护入口不依赖尚未安装的应用工作区包。
  const blob = output(["hash-object", "-w", "--stdin"], root, `${JSON.stringify(value, null, 2)}\n`);
  output(["update-index", "--add", "--cacheinfo", `100644,${blob},${lockPath}`]);
  output(["checkout-index", "--force", "--", lockPath]);
}

function pending() {
  const branch = output(["symbolic-ref", "--quiet", "--short", "HEAD"]);
  const key = `branch.${branch}.filmFrayloUpstream`;
  const raw = output(["config", "--local", "--get", key]);
  const value = JSON.parse(raw) as { base: string; target: string; incoming: string; anchor: string };
  if (![value.base, value.target, value.incoming, value.anchor].every(sha => /^[a-f0-9]{40}$/.test(sha))) {
    throw new Error("同步分支元数据无效。");
  }
  return { ...value, branch, key };
}

function finish() {
  if (args.length) throw new Error("finish 不接受参数；请在同步工作树执行。");
  const state = pending();
  if (state.base !== upstream.baseCommit || output(["rev-parse", "HEAD"]) !== state.anchor
    || output(["rev-parse", "MERGE_HEAD"]) !== state.incoming) {
    throw new Error("当前分支与待完成的上游合并不一致；请勿手动提交合并或修改基线。");
  }
  if (output(["diff", "--name-only", "--diff-filter=U"])) throw new Error("仍有未解决的合并冲突。");
  output(["diff", "--exit-code"]);
  output(["-c", "core.whitespace=blank-at-eol,blank-at-eof,space-before-tab,cr-at-eol", "diff", "--cached", "--check"]);
  if (output(["ls-files", "--others", "--exclude-standard"])) throw new Error("请先处理未跟踪文件。");
  if (output(["diff", "--cached", "--name-only", "--", ".", ":(exclude)source"])) {
    throw new Error("同步合并只能修改 source/；请先还原根目录文件的改动。");
  }
  try {
    writeLock({ ...upstream, baseCommit: state.target });
    output(["commit", "-m", `Merge Toonflow ${state.target.slice(0, 12)} into FilmFraylo`]);
  } catch (error) {
    // 保留节点等合并结果，撤回基线以便修复 Git 身份或提交钩子后重试。
    writeLock(upstream);
    throw error;
  }
  output(["config", "--local", "--unset", state.key]);
  console.log(`已完成上游合并并记录基线 ${state.target}。\n回到原工作树，审阅后执行：git merge --ff-only ${state.branch}`);
}

function sync() {
  let repository = upstream.repository;
  let ref = upstream.branch;
  let hasRef = false;
  while (args.length) {
    const arg = args.shift()!;
    if (arg === "--repository") {
      const value = args.shift();
      if (!value || value.startsWith("-")) throw new Error("--repository 需要仓库 URL 或本地路径。");
      repository = value;
    } else if (!arg.startsWith("-") && !hasRef) {
      ref = arg;
      hasRef = true;
    } else throw new Error(`未知参数：${arg}`);
  }
  if (!/^[a-f0-9]{40}$/.test(upstream.baseCommit)) throw new Error("上游基线必须是完整提交 SHA。");
  if (command === "prepare") clean();
  // ACT: 每次只接收一个明确 ref；不导入上游的发布流程，也不执行上游脚本。
  if (git(["cat-file", "-e", `${upstream.baseCommit}^{commit}`], root, undefined, [0, 1, 128]).code !== 0) {
    output(["fetch", "--no-tags", repository, upstream.baseCommit]);
  }
  output(["fetch", "--no-tags", repository, ref]);
  const target = output(["rev-parse", "FETCH_HEAD^{commit}"]);
  if (git(["merge-base", "--is-ancestor", upstream.baseCommit, target], root, undefined, [0, 1]).code !== 0) {
    throw new Error("目标提交不包含当前上游基线；拒绝降级或合并无关分支。");
  }
  if (target === upstream.baseCommit) {
    console.log(`已经处于上游基线 ${target}，无需同步。`);
    return;
  }
  const head = output(["rev-parse", "HEAD"]);
  const upstreamFiles = output(["diff", "--name-only", "-z", upstream.baseCommit, target]).split("\0").filter(Boolean);
  const customFiles = new Set(output(["diff", "--name-only", "-z", `${upstream.baseCommit}^{tree}`, `${head}:source`]).split("\0").filter(Boolean));
  const overlap = upstreamFiles.filter(path => customFiles.has(path));
  console.log(`上游：${upstream.baseCommit} → ${target}\n上游变更 ${upstreamFiles.length} 个文件；与现有定制重叠 ${overlap.length} 个文件。`);
  if (overlap.length) console.log(`重点复核（重叠不一定产生文本冲突）：\n${overlap.map(path => `  source/${path}`).join("\n")}`);
  if (command === "plan") return;

  // 将上游的根映射到 source/，根目录 Skill、发布配置等始终来自 FilmFraylo。
  const base = commit(mappedTree(head, upstream.baseCommit), [upstream.baseCommit], `Toonflow baseline ${upstream.baseCommit}`);
  const incoming = commit(mappedTree(head, target), [base, target], `Toonflow source ${target}`);
  const anchor = commit(output(["rev-parse", `${head}^{tree}`]), [head, base], `Record Toonflow merge base ${upstream.baseCommit}`);
  const branch = `update/toonflow-${target.slice(0, 12)}`;
  // Windows 依赖路径较深；工作树放在仓库旁，避免再叠加 .git/upstreamWorktrees。
  const directory = resolve(dirname(root), `${basename(root)}Update${target.slice(0, 8)}`);
  output(["worktree", "add", "-b", branch, directory, anchor]);
  output(["config", "--local", `branch.${branch}.filmFrayloUpstream`, JSON.stringify({ base: upstream.baseCommit, target, incoming, anchor })]);
  console.log(`\n同步分支：${branch}\n独立工作树：${directory}`);
  const merged = git(["merge", "--no-commit", "--no-ff", incoming], directory, undefined, [0, 1, 128]);
  if (merged.output) console.log(merged.output);
  if (merged.error) console.log(merged.error);
  console.log(`\n进入该工作树，处理冲突并 git add，完成品牌、网关、节点复核与构建后执行：\nnode --experimental-strip-types scripts/syncUpstream.ts finish\n放弃本次同步：git merge --abort（在该工作树执行）。`);
  if (merged.code !== 0) process.exitCode = merged.code;
}

try {
  if (command === "plan" || command === "prepare") sync();
  else if (command === "finish") finish();
  else if (command === "help" || command === "--help") {
    console.log("用法（Node >= 22.14 或 Bun）：\n  node --experimental-strip-types scripts/syncUpstream.ts plan [ref] [--repository URL或路径]\n  node --experimental-strip-types scripts/syncUpstream.ts prepare [ref] [--repository URL或路径]\n  node --experimental-strip-types scripts/syncUpstream.ts finish\n说明见 source/docs/upstreamSync.md。");
  } else throw new Error(`未知命令：${command}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
