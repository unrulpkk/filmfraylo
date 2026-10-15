import { lstat, mkdir, open, readFile, readdir, realpath, rename, unlink, writeAtomic } from "@toonflow/file";
import { file } from "@toonflow/file/bun";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { homedir } from "node:os";
import { parseArgs } from "node:util";

const { values } = parseArgs({ options: {
  action: { type: "string", default: "check" }, installation: { type: "string" }, repository: { type: "string" },
  platform: { type: "string" }, version: { type: "string" }, data: { type: "string" }, restart: { type: "boolean", default: false },
} });
const windows = process.platform === "win32";
const powershell = join(process.env.SystemRoot || "C:/Windows", "System32/WindowsPowerShell/v1.0/powershell.exe");

async function run(command: string, args: string[], env: Record<string, string> = {}) {
  return new Promise<string>((done, reject) => {
    // Environment keys are case-insensitive on Windows; inherited duplicates can break process creation.
    const environment = Object.fromEntries(Object.entries(process.env).filter(([, value]) => value !== undefined)
      .map(([key, value]) => [windows ? key.toUpperCase() : key, value]));
    const child = spawn(command, args, { env: { ...environment, ...env }, windowsHide: true, stdio: ["ignore", "pipe", "inherit"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    child.on("error", reject);
    child.on("close", code => code === 0 ? done(output.trim()) : reject(new Error(`${command} 退出码 ${code}，请查看上方错误`)));
  });
}

async function exists(path: string) {
  try { await lstat(path); return true; }
  catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return false; throw error; }
}

function within(parent: string, path: string) {
  const part = relative(parent, path);
  return part !== ".." && !part.startsWith(`..${sep}`) && !isAbsolute(part);
}

function version(value: unknown) {
  if (typeof value !== "string" || !/^\d+\.\d+\.\d+$/.test(value)) throw new Error("仅支持正式版本号，例如 2.0.4");
  const parts = value.split(".").map(Number);
  if (parts.some(part => !Number.isSafeInteger(part))) throw new Error("版本号无效");
  return parts;
}

async function buildInfo(program: string) {
  const info = JSON.parse(await readFile(join(program, windows ? "Resources/app/buildInfo.json" : "Contents/Resources/app/buildInfo.json"), "utf8"));
  if (info.product !== "FilmFraylo" || info.mode !== "desktop" || info.platform !== values.platform) throw new Error("程序的产品、运行方式或架构不匹配");
  version(info.version);
  return info as { version: string; repository?: string; commit?: string };
}

async function json(url: string) {
  const response = await fetch(url, { headers: { Accept: "application/vnd.github+json" }, signal: AbortSignal.timeout(30000), redirect: "error" });
  if (!response.ok) throw new Error(`读取正式版本失败（HTTP ${response.status}），现有应用保持不变`);
  return response.json();
}

async function digest(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of file(path).stream()) hash.update(chunk);
  return hash.digest("hex");
}

async function applicationProcesses(program: string): Promise<number[]> {
  if (windows) {
    const output = await run(powershell, ["-NoProfile", "-NonInteractive", "-Command",
      '$ErrorActionPreference="Stop"; @(Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:FILMFRAYLO_PROGRAM + "\\", [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $_.ProcessId }) | ConvertTo-Json -Compress'],
    { FILMFRAYLO_PROGRAM: program });
    const pids = output ? JSON.parse(output) : [];
    return Array.isArray(pids) ? pids : [pids];
  }
  const output = await run("/bin/ps", ["-axo", "pid=,comm="]);
  return output.split("\n").flatMap(line => {
    const match = /^\s*(\d+)\s+(.+)$/.exec(line);
    return match?.[2]?.startsWith(`${program}/`) ? [Number(match[1])] : [];
  });
}

async function closeApplication(program: string) {
  if (!(await applicationProcesses(program)).length) return;
  if (windows) {
    await run(powershell, ["-NoProfile", "-NonInteractive", "-Command",
      '$ErrorActionPreference="Stop"; Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.StartsWith($env:FILMFRAYLO_PROGRAM + "\\", [StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { $process = Get-Process -Id $_.ProcessId -ErrorAction SilentlyContinue; if ($process -and $process.MainWindowHandle -ne 0) { [void]$process.CloseMainWindow() } }'],
    { FILMFRAYLO_PROGRAM: program });
  } else {
    // Only ask this installation to quit. A cancelled quit or an active MCP process blocks replacement.
    await run("/usr/bin/osascript", ["-e", 'on run argv\ntell application (item 1 of argv) to quit\nend run', program]);
  }
  for (let attempt = 0; attempt < 30; attempt++) {
    if (!(await applicationProcesses(program)).length) return;
    await new Promise(done => setTimeout(done, 1000));
  }
  throw new Error("应用或 MCP 仍在使用程序。请保存并退出 FilmFraylo、断开 filmfraylo MCP 后重试；没有强制结束进程");
}

async function startApplication(program: string, data: string) {
  const runtime = join(program, windows ? "bin/bun.exe" : "Contents/MacOS/bun");
  const entry = join(program, windows ? "Resources/app/desktopHarness.js" : "Contents/Resources/app/desktopHarness.js");
  const state = JSON.parse(await run(runtime, [entry, "--data", data]));
  if (state.mode !== "desktop" || !isAbsolute(state.runtime) || !isAbsolute(state.mcpDirectory)
    || !within(program, state.mcpDirectory) || await realpath(state.data) !== await realpath(data)) {
    throw new Error("新版启动状态与原安装或数据目录不匹配");
  }
  return state;
}

async function main() {
  if (!["check", "prepare", "apply"].includes(values.action) || !values.installation || !values.repository) throw new Error("需要 action、installation 和 repository");
  if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(values.repository)) throw new Error("仓库地址无效");
  if (!(windows && values.platform === "windows-x64") && !(process.platform === "darwin" && ["macos-arm64", "macos-x64"].includes(values.platform ?? ""))) throw new Error("不支持此系统或架构");
  if (values.action === "apply" && (!values.restart || !values.version || !values.data || !isAbsolute(values.data))) throw new Error("安装前须确认重启，并指定准备好的版本号和原数据目录（--restart --version --data）");
  const installation = await realpath(values.installation);
  const program = windows ? join(installation, "app") : installation;
  if ((await lstat(program)).isSymbolicLink()) throw new Error("程序目录为符号链接，请使用实际安装路径");
  const current = await buildInfo(program);
  if (current.repository && current.repository !== values.repository) throw new Error("更新仓库与已安装应用不一致，请先核实来源");
  const tag = values.version ? `v${values.version}` : "";
  if (values.version) version(values.version);
  const release = await json(`https://api.github.com/repos/${values.repository}/releases/${tag ? `tags/${tag}` : "latest"}`) as {
    tag_name: string; draft: boolean; prerelease: boolean; assets: { name: string; size: number }[];
  };
  if (release.draft || release.prerelease || !/^v\d+\.\d+\.\d+$/.test(release.tag_name) || (tag && release.tag_name !== tag)) throw new Error("目标不是指定的正式 Release");
  const nextVersion = release.tag_name.slice(1);
  const next = version(nextVersion), previous = version(current.version);
  const difference = next.map((part, index) => part - previous[index]!).find(value => value !== 0) ?? 0;
  const releaseUrl = `https://github.com/${values.repository}/releases/tag/${release.tag_name}`;
  const base = { currentVersion: current.version, latestVersion: nextVersion, installation, releaseUrl };
  if (difference <= 0) { console.log(JSON.stringify({ ...base, status: "upToDate" })); return; }
  const asset = `filmFraylo-desktop-${values.platform}.${windows ? "zip" : "dmg"}`;
  const attachment = release.assets.filter(item => item.name === asset);
  if (attachment.length !== 1 || !release.assets.some(item => item.name === `${asset}.sha256`)) throw new Error("此版本的安装包或 SHA256 尚未发布完整，请稍后再试");
  if (values.action === "check") { console.log(JSON.stringify({ ...base, status: "updateAvailable", asset, downloadBytes: attachment[0]!.size })); return; }
  const cache = join(homedir(), ".filmfraylo", "updates", values.platform!, nextVersion);
  await mkdir(cache, { recursive: true });
  // ACT: A crash leaves the lock for explicit inspection; never risk two updaters replacing one installation.
  const lockPath = join(homedir(), ".filmfraylo", "updates", `${createHash("sha256").update(windows ? installation.toLowerCase() : installation).digest("hex")}.lock`);
  let lock;
  try { lock = await open(lockPath, "wx"); }
  catch { throw new Error(`更新目录已锁定：${lockPath}。确认没有其他升级进程后再移除此锁文件`); }
  let mounted: string | undefined;
  try {
    await lock.writeFile(JSON.stringify({ pid: process.pid, installation, version: nextVersion }));
    const archive = join(cache, asset);
    const url = `https://github.com/${values.repository}/releases/download/${release.tag_name}/${asset}`;
    const checksum = await fetch(`${url}.sha256`, { signal: AbortSignal.timeout(30000) });
    if (!checksum.ok) throw new Error(`获取校验文件失败（HTTP ${checksum.status}）`);
    const line = (await checksum.text()).trim().split(/\s+/);
    if (line.length !== 2 || !/^[a-fA-F0-9]{64}$/.test(line[0]!) || line[1] !== asset) throw new Error("校验文件格式或文件名不匹配");
    const expected = line[0]!.toLowerCase();
    if (values.action === "prepare") {
      const valid = await exists(archive) && await digest(archive) === expected;
      if (!valid) {
        // Preserve partial downloads; never overwrite them with an error page or another version.
        console.error(`正在下载 ${nextVersion}，可继续使用客户端；下载中断后重跑 prepare 将续传。`);
        await run(windows ? "curl.exe" : "/usr/bin/curl", ["--fail", "--location", "--proto", "=https", "--proto-redir", "=https", "--connect-timeout", "20", "--speed-time", "60", "--speed-limit", "1024", "--retry", "3", "--continue-at", "-", "--output", archive, url]);
      }
      if (await digest(archive) !== expected) throw new Error(`下载校验失败，未安装。请移除损坏的下载文件后重试：${archive}`);
      await writeAtomic(join(cache, "prepared.json"), JSON.stringify({ version: nextVersion, sha256: expected, repository: values.repository, asset }));
      console.log(JSON.stringify({ ...base, status: "prepared", sha256: expected, restartRequired: true }));
      return;
    }
    const prepared = JSON.parse(await readFile(join(cache, "prepared.json"), "utf8"));
    if (prepared.repository !== values.repository || prepared.version !== nextVersion || prepared.asset !== asset || prepared.sha256 !== expected || await digest(archive) !== expected) throw new Error("准备好的安装包已变化，请重新 prepare 并确认版本");
    const data = await realpath(values.data!);
    if (within(program, data)) throw new Error("数据位于程序目录内，不能安全替换；请先确认实际数据目录");
    const runtimePath = join(data, "desktopRuntime.json");
    if (await exists(runtimePath)) {
      const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
      const resources = join(program, windows ? "Resources" : "Contents/Resources");
      if (await realpath(runtime.resources) !== await realpath(resources)) throw new Error("数据目录属于另一套安装，请按本机启动入口指定 --data");
    }
    const transaction = crypto.randomUUID();
    const staged = join(dirname(program), `filmFrayloStage${transaction}`);
    const backup = join(dirname(program), `filmFrayloBackup${transaction}${windows ? "" : ".app"}`);
    let replacement: string;
    if (windows) {
      await run(powershell, ["-NoProfile", "-NonInteractive", "-Command", `
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip=[IO.Compression.ZipFile]::OpenRead($env:FILMFRAYLO_ARCHIVE)
try { foreach ($entry in $zip.Entries) {
  $target=[IO.Path]::GetFullPath((Join-Path $env:FILMFRAYLO_STAGE $entry.FullName))
  if ($entry.FullName.Contains(':') -or !$target.StartsWith($env:FILMFRAYLO_STAGE + '\\', [StringComparison]::OrdinalIgnoreCase) -or (($entry.ExternalAttributes -shr 16) -band 0xF000) -eq 0xA000) { throw 'Unsafe archive entry' }
} } finally { $zip.Dispose() }
Expand-Archive -LiteralPath $env:FILMFRAYLO_ARCHIVE -DestinationPath $env:FILMFRAYLO_STAGE
`], { FILMFRAYLO_ARCHIVE: archive, FILMFRAYLO_STAGE: staged });
      const entries = await readdir(staged);
      if (entries.length !== 1) throw new Error("安装包目录结构无效");
      replacement = join(staged, entries[0]!, "app");
    } else {
      mounted = join(cache, `mounted${transaction}`);
      await mkdir(mounted);
      await run("/usr/bin/hdiutil", ["attach", archive, "-nobrowse", "-readonly", "-mountpoint", mounted]);
      replacement = staged;
      await run("/usr/bin/ditto", [join(mounted, "FilmFraylo.app"), replacement]);
    }
    const candidate = await buildInfo(replacement);
    if (candidate.version !== nextVersion || candidate.repository !== values.repository) throw new Error("包内版本或仓库与 Release 不匹配，未关闭应用");
    // All rename targets are resolved siblings of the original program; user data stays outside them.
    for (const path of [staged, backup, replacement]) {
      if (!within(dirname(program), resolve(path)) || resolve(path) === dirname(program)) throw new Error("更新路径越界");
    }
    await closeApplication(program);
    if ((await applicationProcesses(program)).length) throw new Error("程序重新启动，请断开 MCP 后重试安装");
    if (await exists(runtimePath)) {
      const runtime = JSON.parse(await readFile(runtimePath, "utf8"));
      if (Number.isInteger(runtime.pid) && runtime.pid > 0) {
        let alive = true;
        try { process.kill(runtime.pid, 0); }
        catch (error) { if ((error as NodeJS.ErrnoException).code === "ESRCH") alive = false; else throw error; }
        if (alive) throw new Error("原数据目录的桌面进程仍在运行，未替换程序");
      }
    }
    await rename(program, backup);
    let activated = false;
    try {
      await rename(replacement, program);
      activated = true;
      const state = await startApplication(program, data);
      console.log(JSON.stringify({ ...base, status: "updated", backup, data, ...state, next: "重新连接 filmfraylo MCP，再调用 getAppState；不要重复提交已有生成任务" }));
    } catch (error) {
      if (activated) {
        await closeApplication(program).catch(() => {});
        if ((await applicationProcesses(program)).length) throw new Error(`新版未通过启动检查且仍在运行；旧程序保存在 ${backup}。请退出后恢复，不要再次安装。原因：${String(error)}`);
        await rename(program, join(dirname(program), `filmFrayloFailed${transaction}${windows ? "" : ".app"}`));
      }
      await rename(backup, program);
      let restored = false;
      try { await startApplication(program, data); restored = true; } catch { /* Keep restored program and untouched data available for manual launch. */ }
      throw new Error(`更新失败，旧程序已恢复${restored ? "并启动" : "，请手动启动"}；数据未删除。${String(error)}`);
    }
  } finally {
    if (mounted) await run("/usr/bin/hdiutil", ["detach", mounted]).catch(error => console.error(String(error)));
    await lock.close();
    await unlink(lockPath);
  }
}

main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
