/// <reference path="./types.d.ts" />

import { product } from "@toonflow/product";
import tfRouterLanguage from "./src/language/tfRouter";
import deepSeek from "./src/language/deepSeek";
import safilluLanguage from "./src/language/safillu";
import safilluMedia from "./src/media/safillu";

export type Provider = ProviderDefinition;
export type ProviderPrice = NonNullable<Awaited<ReturnType<NonNullable<Provider["getPrice"]>>>>;
export type ProviderPriceRequest = Parameters<NonNullable<Provider["getPrice"]>>[0];
export type ProviderPriceReference = NonNullable<ProviderPriceRequest["images"]>[number];
export type ProviderBalance = Awaited<ReturnType<NonNullable<Provider["getBalance"]>>>;
export type ProviderTools = ProviderContext["tool"];
export type AudioConvertOptions = Parameters<ProviderTools["audio"]["convert"]>[1];
export type { FfmpegFactory, FfmpegCommand } from "@toonflow/ffmpeg/types";

export const languageProviders = [safilluLanguage, tfRouterLanguage, deepSeek] as const;
export const mediaProviders = [safilluMedia] as const;

export const defaultLanguageProviders = languageProviders.filter(provider => provider.id === product.gateway.id)
  .map(provider => ({ ...provider, apiUrl: `${product.gateway.baseUrl.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1` }));
