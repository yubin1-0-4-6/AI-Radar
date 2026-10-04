/** 情报类别。free 与 leak 不互斥：一个泄露模型可能同时可免费跑。 */
export type IntelKind =
  | "model-release"
  | "model-free"
  | "leak-rumor"
  | "ecosystem"
  | "vendor";

export type SourceId =
  | "huggingface"
  | "openrouter"
  | "hackernews"
  | "reddit-localllama"
  | "reddit-singularity"
  | "anthropic"
  | "openai"
  | "google"
  | "qwen"
  | "deepseek"
  | "moonshot"
  | "zhipu"
  | "mistral"
  | "minimax"
  | "hf-blog"
  | "simonwillison"
  | "github";

export interface IntelItem {
  /** 全局稳定 ID：由 source + 原始链接/模型名派生 */
  id: string;
  kind: IntelKind;
  source: SourceId;
  sourceLabel: string;
  title: string;
  url: string;
  /** 原文摘要（英文原文保留，不做机翻） */
  summary?: string;
  author?: string;
  publishedAt: number;
  /** 泄漏类情报的可信度：0 传闻 / 1 有截图或权重 / 2 官方或多源印证 */
  confidence?: 0 | 1 | 2;
  /** 厂商 / 组织 */
  vendor?: string;
  /** 模型元信息 */
  model?: ModelMeta;
  /** 互动数据 */
  stats?: Record<string, number>;
  tags?: string[];
}

export interface ModelMeta {
  name: string;
  params?: string;
  contextLength?: number;
  license?: string;
  /** 开放权重下载 */
  openWeights?: boolean;
  /** 可在 OpenRouter 免费调用 */
  freeApi?: boolean;
  modality?: string[];
}

export interface SourceResult {
  source: SourceId;
  ok: boolean;
  count: number;
  ms: number;
  error?: string;
}

export interface FetchReport {
  items: IntelItem[];
  results: SourceResult[];
  ms: number;
}