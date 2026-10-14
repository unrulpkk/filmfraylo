import conf from "conf";
import { mkdirSync, realpathSync } from "@toonflow/file";
import { resolve } from "node:path";
import safillu from "@toonflow/providers/language/safillu";
import type { RemoteTeam } from "@/utils/teams";
import type { A2aSettings } from "@/agent/a2a/settings";
import type { desktopUpdateAttempt } from "@/types/desktop";
import type { MobileLinkConfig } from "@/utils/mobileLink";

const autoInstallProviders = [safillu];
const dataDirectory = process.env.TOONFLOW_DATA_DIR ?? resolve(import.meta.dirname, "../../../../../data");
mkdirSync(dataDirectory, { recursive: true });
const configDirectory = realpathSync(dataDirectory);
process.env.TOONFLOW_DATA_DIR = configDirectory;

const config = new conf<{ settings: Record<string, unknown>; disabledSkills: string[]; toolConfigs: Record<string, Record<string, unknown>>; nodeConfigs: Record<string, Record<string, unknown>>; extConfigs: Record<string, Record<string, unknown>>; remoteConnections: Record<string, RemoteTeam>; a2a: A2aSettings; desktopUpdateAttempt: desktopUpdateAttempt; mobileLink: MobileLinkConfig }>({
  cwd: configDirectory,
  configName: "settings",
  configFileMode: 0o600,
  watch: true,
});

export function removeLegacySettings(settings: Record<string, unknown>) {
  let changed = false;
  // ACT: 只清理已废弃字段，保留其他设置和插件配置。
  for (const [record, key] of [[settings, "developerConfirmed"], [settings.general, "systemPrompt"], [settings.stores, "toonflow.developer"]] as const) {
    if (record && typeof record === "object" && !Array.isArray(record) && Object.hasOwn(record, key)) {
      Reflect.deleteProperty(record, key);
      changed = true;
    }
  }
  return changed;
}

const settings = config.get("settings", {});
if (removeLegacySettings(settings)) config.set("settings", settings);

// ACT: 仅初始化尚未配置的文本供应商；已有列表（包括用户清空的列表）保持原样。
if (!config.has("settings.customProviders")) {
  config.set("settings.customProviders", autoInstallProviders.map(({ id, label, icon, version, apiUrl, protocol, models }) =>
    ({ id, label, icon, version, apiUrl, protocol, models, apiKey: "" })));
}

// ACT: 环境变量仅补首次配置；后续以用户在设置中保存的密钥为准。
const safilluKey = process.env.SAFILLU_API_KEY?.trim();
if (safilluKey && !config.get("settings", {}).safilluEnvironmentConfigured) {
  const current = config.get("settings", {});
  const providers = Array.isArray(current.customProviders) ? current.customProviders as { id: string; apiKey?: string }[] : [];
  const existing = providers.find(provider => provider.id === safillu.id);
  if (!existing || !existing.apiKey) {
    const { id, label, version, apiUrl, protocol, models } = safillu;
    current.customProviders = [{ id, label, version, apiUrl, protocol, models, apiKey: safilluKey }, ...providers.filter(provider => provider.id !== id)];
  }
  const configs = (current.mediaProviderConfigs ?? {}) as Record<string, Record<string, unknown>>;
  if (!configs.safillu?.apiKey) current.mediaProviderConfigs = { ...configs, safillu: { ...configs.safillu, apiKey: safilluKey, baseUrl: "https://api.safillu.com" } };
  current.safilluEnvironmentConfigured = true;
  config.set("settings", current);
}

export default config;
