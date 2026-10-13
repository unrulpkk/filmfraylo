/// <reference path="./types.d.ts" />

import tfRouterLanguage from "./src/language/tfRouter";
import deepSeek from "./src/language/deepSeek";
import safilluLanguage from "./src/language/safillu";
import safilluMedia from "./src/media/safillu";

export type Provider = ProviderDefinition;
export type ProviderTools = ProviderContext["tool"];
export type AudioConvertOptions = Parameters<ProviderTools["audio"]["convert"]>[1];
export type { FfmpegFactory, FfmpegCommand } from "@toonflow/ffmpeg/types";

export const languageProviders = [safilluLanguage, tfRouterLanguage, deepSeek] as const;
export const mediaProviders = [safilluMedia] as const;
