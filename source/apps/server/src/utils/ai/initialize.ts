import { mediaProviders, type Provider } from "@toonflow/providers";
import tfRouter from "@toonflow/providers/language/tfRouter";
import tfRouterMedia from "@toonflow/providers/media/tfRouter";
import safillu from "@toonflow/providers/language/safillu";
import safilluMedia from "@toonflow/providers/media/safillu";
import conf from "@/utils/conf";
import { fetchProviderModels } from "@/utils/ai/models";
import { getMediaProviderApiKey, refreshMediaProviderModels } from "@/utils/media/provider";

let initialization: Promise<void> | undefined;

function normalizeApiKey(value: unknown) {
  return typeof value === "string" ? value.trim().replace(/^Bearer(?:\s+|$)/i, "").trim() : "";
}

function getLanguageProvider(settings: Record<string, unknown>) {
  const providers = settings.customProviders;
  if (!Array.isArray(providers)) return;
  return providers.find(item => [safillu, tfRouter].some(builtin => typeof item?.id === "string" && item.id.toLowerCase() === builtin.id.toLowerCase()
    && typeof item.apiUrl === "string" && URL.canParse(item.apiUrl) && new URL(item.apiUrl).origin === new URL(builtin.apiUrl).origin));
}

async function refreshLanguageModels(previousSettings?: Record<string, unknown>) {
  const provider = getLanguageProvider(conf.get("settings", {}));
  const apiKey = normalizeApiKey(provider?.apiKey);
  const previous = previousSettings && getLanguageProvider(previousSettings);
  if (!apiKey || (previous && apiKey === normalizeApiKey(previous.apiKey) && previous.apiUrl === provider.apiUrl && previous.protocol === provider.protocol)) return;
  const models = await fetchProviderModels({ apiUrl: provider.apiUrl, protocol: provider.protocol, apiKey });
  if (!models.length) throw new Error("未获取到文本模型，保留原有列表");
  const current = conf.get("settings.customProviders");
  if (!Array.isArray(current)) return;
  const index = current.findIndex(item => item?.id === provider.id && item.apiUrl === provider.apiUrl
    && item.protocol === provider.protocol && item.apiKey === provider.apiKey);
  if (index === -1) return;
  const providers = current.map((item, itemIndex) => itemIndex === index ? { ...item, models } : item);
  conf.set("settings.customProviders", providers);
  return providers;
}

async function refreshMediaModels(previousSettings: Record<string, unknown> | undefined, errors: string[]) {
  const builtin = (mediaProviders as readonly Provider[]).find(provider => provider.id === safilluMedia.id || provider.id === tfRouterMedia.id);
  if (!builtin) return;
  const apiKey = getMediaProviderApiKey(builtin.id);
  const configs = previousSettings?.mediaProviderConfigs as Record<string, { apiKey?: unknown; baseUrl?: unknown }> | undefined;
  const baseUrl = conf.get(`settings.mediaProviderConfigs.${builtin.id}.baseUrl`);
  if (!apiKey || (previousSettings && apiKey === normalizeApiKey(configs?.[builtin.id]?.apiKey) && baseUrl === configs?.[builtin.id]?.baseUrl)) return;
  let provider: Awaited<ReturnType<typeof refreshMediaProviderModels>> | undefined;
  // ACT: 同一供应商文件按类型串行保存，避免多个刷新读取相同版本后互相冲突。
  const types: (ModelType | undefined)[] = builtin.id === safilluMedia.id ? [undefined] : ["video", "image", "audio"];
  for (const type of types) {
    if (getMediaProviderApiKey(builtin.id) !== apiKey) break;
    try { provider = await refreshMediaProviderModels(`${builtin.id}.ts`, undefined, type, apiKey); }
    catch (error) {
      if (getMediaProviderApiKey(builtin.id) !== apiKey) break;
      errors.push(`${builtin.label} 媒体模型更新失败：${error instanceof Error ? error.message : "未知错误"}`);
    }
  }
  return provider;
}

export async function refreshProviderModels(previousSettings?: Record<string, unknown>) {
  const errors: string[] = [];
  const [language, media] = await Promise.allSettled([refreshLanguageModels(previousSettings), refreshMediaModels(previousSettings, errors)]);
  for (const [result, label] of [[language, "文本"], [media, "媒体"]] as const) {
    if (result.status === "rejected") errors.push(`${label}模型更新失败：${result.reason instanceof Error ? result.reason.message : "未知错误"}`);
  }
  return {
    ...(language.status === "fulfilled" && language.value ? { customProviders: conf.get("settings.customProviders") as typeof language.value } : {}),
    ...(media.status === "fulfilled" && media.value ? { mediaProvider: media.value } : {}),
    ...(media.status === "fulfilled" && media.value?.modelSyncWarnings.length ? { modelRefreshWarnings: media.value.modelSyncWarnings } : {}),
    ...(errors.length ? { modelRefreshErrors: errors } : {}),
  };
}

export default function initializeProviderModels() {
  // ACT: 每个进程启动时仅尝试一次；失败保留已有模型，下次启动再更新。
  return initialization ??= refreshProviderModels().then(result => {
    result.modelRefreshErrors?.forEach(error => console.warn(error));
    result.modelRefreshWarnings?.forEach(warning => console.warn(warning));
  });
}
