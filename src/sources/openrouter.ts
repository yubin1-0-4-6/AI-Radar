import { getJson } from "../lib/http";
import { uid } from "../lib/dedupe";
import { guessVendor } from "../classify";
import type { IntelItem } from "../types";

interface ORModel {
  id: string;
  name: string;
  created?: number;
  description?: string;
  context_length?: number;
  architecture?: { input_modalities?: string[]; modality?: string[] };
  pricing?: { prompt?: string; completion?: string };
  top_provider?: { context_length?: number };
}

/** 真正的"免费"：prompt 与 completion 定价都为 0。 */
function isFree(m: ORModel): boolean {
  return m.pricing?.prompt === "0" && m.pricing?.completion === "0";
}

/**
 * OpenRouter /models 一次返回全部模型（约 470 个），
 * 这里按"免费 + 最新发布"两条线切出来。
 */
export async function fetchOpenRouter(): Promise<IntelItem[]> {
  const res = await getJson<{ data: ORModel[] }>("https://openrouter.ai/api/v1/models", {
    timeoutMs: 30000,
  });
  const all = res.data ?? [];
  const free = all.filter(isFree);
  const recent = [...all]
    .filter((m) => !isFree(m))
    .sort((a, b) => (b.created ?? 0) - (a.created ?? 0))
    .slice(0, 15);

  const toItem = (m: ORModel, tag: string): IntelItem => ({
    id: uid("or", m.id),
    kind: "model-free",
    source: "openrouter",
    sourceLabel: "OpenRouter",
    title: `${m.name || m.id}${tag === "免费" ? " · 可免费调用" : ""}`,
    url: `https://openrouter.ai/${m.id}`,
    summary: m.description?.slice(0, 300) || undefined,
    publishedAt: (m.created ?? 0) * 1000 || Date.now(),
    vendor: guessVendor(m.id),
    model: {
      name: m.id,
      contextLength: m.top_provider?.context_length ?? m.context_length,
      freeApi: isFree(m),
      openWeights: !!m.architecture,
      modality: [
        ...new Set([...(m.architecture?.input_modalities ?? []), ...(m.architecture?.modality ?? [])]),
      ],
    },
    tags: [tag],
  });

  return [...free.map((m) => toItem(m, "免费")), ...recent.map((m) => toItem(m, "新上架"))];
}