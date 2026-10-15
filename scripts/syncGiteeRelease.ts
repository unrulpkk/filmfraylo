import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";

type Provider = "github" | "gitee";
type Attachment = { id: number; name: string; size: number; digest?: string };
type Release = { id: number; tag_name: string; name: string; body: string | null; draft?: boolean; prerelease: boolean };

const githubRepository = process.env.GITHUB_REPOSITORY ?? "";
const giteeRepository = process.env.GITEE_REPOSITORY ?? "";
const tag = process.env.RELEASE_TAG ?? "";
const tokens = { github: process.env.GITHUB_TOKEN, gitee: process.env.GITEE_TOKEN };
const bases = { github: "https://api.github.com", gitee: "https://gitee.com/api/v5" };
const githubPath = `/repos/${githubRepository}`;
const giteePath = `/repos/${giteeRepository}`;

async function request(provider: Provider, path: string, options: RequestInit = {}, optional = false): Promise<Response> {
  const sourceUrl = new URL(`${bases[provider]}${path}`);
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${tokens[provider]}`);
  headers.set("User-Agent", "FilmFraylo-Release-Sync");
  if (!headers.has("Accept")) headers.set("Accept", "application/json");
  const attempts = !options.method || options.method === "GET" ? 3 : 1;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      let url = sourceUrl;
      const redirectHeaders = new Headers(headers);
      const signal = AbortSignal.timeout(15 * 60 * 1000);
      for (let redirect = 0; redirect <= 5; redirect++) {
        const response = await fetch(url, { ...options, headers: redirectHeaders, redirect: "manual", signal });
        if ([301, 302, 303, 307, 308].includes(response.status)) {
          await response.body?.cancel();
          if (options.method && options.method !== "GET") throw new Error(`${provider}: refused a redirected write request`);
          const location = response.headers.get("location");
          if (!location) throw new Error(`${provider}: missing download redirect`);
          const next = new URL(location, url);
          if (next.protocol !== "https:" || next.username || next.password) throw new Error(`${provider}: unsafe download redirect`);
          if (next.origin !== url.origin) redirectHeaders.delete("Authorization");
          url = next;
          continue;
        }
        if (response.ok || (optional && response.status === 404)) return response;
        await response.body?.cancel();
        if (attempt < attempts && (response.status === 429 || response.status >= 500)) break;
        throw new Error(`${provider}: HTTP ${response.status} for ${path}`);
      }
    } catch (error) {
      if (attempt === attempts) throw error;
    }
    await new Promise(resolve => setTimeout(resolve, attempt * 2000));
  }
  throw new Error(`${provider}: download redirects exceeded the limit`);
}

async function json<T>(provider: Provider, path: string, options?: RequestInit): Promise<T> {
  return (await request(provider, path, options)).json() as Promise<T>;
}

async function attachments(provider: Provider, path: string): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (let page = 1; ; page++) {
    const entries = await json<Attachment[]>(provider, `${path}?per_page=100&page=${page}`);
    if (!Array.isArray(entries)) throw new Error(`${provider}: invalid attachment list`);
    for (const entry of entries) {
      if (!Number.isSafeInteger(entry.id) || entry.id <= 0 || typeof entry.name !== "string"
        || !/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(entry.name) || !Number.isSafeInteger(entry.size) || entry.size < 0) {
        throw new Error(`${provider}: invalid attachment metadata`);
      }
      if (result.some(existing => existing.name === entry.name)) throw new Error(`${provider}: duplicate attachment ${entry.name}`);
      result.push(entry);
    }
    if (entries.length < 100) return result;
  }
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function download(provider: Provider, path: string, asset: Attachment): Promise<Uint8Array<ArrayBuffer>> {
  console.log(`Downloading ${provider}: ${asset.name} (${asset.size} bytes)`);
  const response = await request(provider, path, { headers: { Accept: "application/octet-stream" } });
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength !== asset.size) throw new Error(`${provider}: incomplete download of ${asset.name}`);
  if (asset.digest && asset.digest !== `sha256:${sha256(bytes)}`) throw new Error(`${provider}: digest mismatch for ${asset.name}`);
  return bytes;
}

function git(args: string[]): string {
  const result = spawnSync("git", args, {
    encoding: "utf8", shell: false, timeout: 10 * 60 * 1000,
    env: { ...process.env, GIT_TERMINAL_PROMPT: "0" },
  });
  if (result.error || result.status !== 0) throw new Error("Git tag synchronization failed. Check repository access, token repo scope and tag conflicts.");
  return result.stdout.trim();
}

function upload(path: string, asset: Attachment, bytes: Uint8Array): Attachment {
  // curl provides transfer progress and aborts stalled uploads without retrying uncertain writes.
  const result = spawnSync("curl", ["--fail", "--show-error", "--connect-timeout", "30", "--max-time", "900",
    "--speed-limit", "1024", "--speed-time", "60", "--header", `Authorization: Bearer ${tokens.gitee}`,
    "--form", `file=@-;filename=${asset.name};type=application/octet-stream`, `${bases.gitee}${path}`], {
    input: bytes, encoding: "utf8", shell: false, timeout: 16 * 60 * 1000,
    maxBuffer: 1024 * 1024, stdio: ["pipe", "pipe", "inherit"],
  });
  if (result.error || result.status !== 0) throw new Error(`Gitee upload failed for ${asset.name} (curl exit ${result.status}); rerun to reconcile completed attachments`);
  return JSON.parse(result.stdout) as Attachment;
}

function syncTag(commit: string) {
  const ref = `refs/tags/${tag}`;
  if (git(["rev-parse", `${ref}^{commit}`]) !== commit) throw new Error("Local tag does not match the GitHub Release commit");
  const remote = `https://gitee.com/${giteeRepository}.git`;
  // Token stays in the environment; neither the URL nor command arguments contain its value.
  const auth = ["-c", "credential.helper=", "-c", 'credential.helper=!f() { printf "username=oauth2\\npassword=%s\\n" "$GITEE_TOKEN"; }; f'];
  const refs = git([...auth, "ls-remote", remote, ref, `${ref}^{}`]).split("\n").filter(Boolean);
  if (refs.length) {
    const target = refs.find(line => line.endsWith(`${ref}^{}`)) ?? refs.find(line => line.endsWith(`\t${ref}`));
    if (target?.split(/\s+/)[0] !== commit) throw new Error(`Gitee tag ${tag} points to a different commit; nothing was overwritten`);
    return;
  }
  git([...auth, "push", remote, `${ref}:${ref}`]);
  console.log(`Synchronized tag ${tag} at ${commit}`);
}

async function main() {
  for (const repository of [githubRepository, giteeRepository]) {
    if (!/^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/.test(repository)) throw new Error("Set GITHUB_REPOSITORY and GITEE_REPOSITORY to owner/repo");
  }
  if (!/^v\d+\.\d+\.\d+(?:-[a-zA-Z0-9.]+)?$/.test(tag)) throw new Error("RELEASE_TAG must be a version such as v2.0.2");
  if (!tokens.github || !tokens.gitee) throw new Error("GITHUB_TOKEN and the GITEE_TOKEN Actions secret are required");
  const release = await json<Release>("github", `${githubPath}/releases/tags/${tag}`);
  if (release.draft || release.tag_name !== tag || !Number.isSafeInteger(release.id)) throw new Error("Expected a published GitHub Release");
  const commit = await json<{ sha: string }>("github", `${githubPath}/commits/${tag}`);
  if (!/^[a-f0-9]{40}$/.test(commit.sha)) throw new Error("Invalid release commit");
  const assets = await attachments("github", `${githubPath}/releases/${release.id}/assets`);
  const byName = new Map(assets.map(asset => [asset.name, asset]));
  const required = ["filmFrayloSkills.zip", "filmFrayloWorkbuddy.zip"];
  for (const mode of ["desktop", "web"]) {
    for (const platform of ["windows-x64.zip", "macos-arm64.dmg", "macos-x64.dmg"]) required.push(`filmFraylo-${mode}-${platform}`);
  }
  for (const name of required) {
    if (!byName.has(name) || !byName.has(`${name}.sha256`)) throw new Error(`GitHub Release is incomplete: missing ${name} or its SHA256 file`);
  }
  const hashes = new Map<string, string>();
  const checksumBytes = new Map<string, Uint8Array<ArrayBuffer>>();
  for (const asset of assets) {
    if (!/\.(zip|dmg|exe)(\.sha256)?$/.test(asset.name)) throw new Error(`Unsupported release attachment: ${asset.name}`);
    if (!asset.name.endsWith(".sha256")) continue;
    if (asset.size > 4096) throw new Error(`Invalid SHA256 file size: ${asset.name}`);
    const bytes = await download("github", `${githubPath}/releases/assets/${asset.id}`, asset);
    const match = /^([a-fA-F0-9]{64})\s+\*?([^\r\n]+)$/.exec(new TextDecoder().decode(bytes).trim());
    const name = asset.name.slice(0, -7);
    if (!match || match[2] !== name || !byName.has(name)) throw new Error(`Invalid SHA256 file: ${asset.name}`);
    hashes.set(name, match[1]!.toLowerCase());
    hashes.set(asset.name, sha256(bytes));
    checksumBytes.set(asset.name, bytes);
  }
  for (const asset of assets) {
    if (!hashes.has(asset.name)) throw new Error(`Missing SHA256 for ${asset.name}`);
    if (asset.digest && asset.digest !== `sha256:${hashes.get(asset.name)}`) throw new Error(`GitHub SHA256 metadata disagrees for ${asset.name}`);
  }
  console.log(`GitHub ${tag}: ${assets.length} attachments ready; commit ${commit.sha}`);
  syncTag(commit.sha);
  const existingResponse = await request("gitee", `${giteePath}/releases/tags/${tag}`, {}, true);
  let mirror = existingResponse.status === 404 ? null : await existingResponse.json() as Release | null;
  if (existingResponse.status === 404) await existingResponse.body?.cancel();
  if (mirror === null) {
    mirror = await json<Release>("gitee", `${giteePath}/releases`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag_name: tag, target_commitish: commit.sha, name: release.name || tag,
        body: `${release.body ?? ""}\n\nSource: https://github.com/${githubRepository}/releases/tag/${tag}\nCommit: ${commit.sha}`,
        prerelease: release.prerelease }),
    });
  }
  if (!mirror || !Number.isSafeInteger(mirror.id) || mirror.id <= 0 || mirror.tag_name !== tag) throw new Error("Invalid Gitee Release response");
  const attachmentPath = `${giteePath}/releases/${mirror.id}/attach_files`;
  const existing = new Map((await attachments("gitee", attachmentPath)).map(asset => [asset.name, asset]));
  let uploaded = 0;
  for (const asset of [...assets].sort((left, right) => left.size - right.size)) {
    const expected = hashes.get(asset.name)!;
    let target = existing.get(asset.name);
    if (target && target.size !== asset.size) throw new Error(`Gitee attachment conflicts: ${asset.name}; existing file preserved`);
    if (!target) {
      const bytes = checksumBytes.get(asset.name) ?? await download("github", `${githubPath}/releases/assets/${asset.id}`, asset);
      if (sha256(bytes) !== expected) throw new Error(`GitHub checksum mismatch: ${asset.name}`);
      console.log(`Uploading Gitee: ${asset.name} (${asset.size} bytes)`);
      target = upload(attachmentPath, asset, bytes);
      if (!Number.isSafeInteger(target.id) || target.id <= 0 || target.name !== asset.name || target.size !== asset.size) {
        throw new Error(`Unexpected Gitee upload response for ${asset.name}; rerun to reconcile the attachment list`);
      }
      uploaded++;
    }
    const mirrored = await download("gitee", `${attachmentPath}/${target.id}/download`, target);
    if (sha256(mirrored) !== expected) throw new Error(`Gitee checksum mismatch: ${asset.name}; existing file preserved`);
    console.log(`Verified ${asset.name}: ${expected}`);
  }
  console.log(`Synchronized ${tag}: uploaded ${uploaded}, verified ${assets.length}/${assets.length} attachments. https://gitee.com/${giteeRepository}/releases/tag/${tag}`);
}

main().catch(error => {
  // Do not print response bodies, signed download URLs or request headers containing credentials.
  let message = error instanceof Error ? error.message : "Release synchronization failed";
  for (const token of Object.values(tokens)) if (token) message = message.replaceAll(token, "[redacted]");
  console.error(message);
  process.exitCode = 1;
});
