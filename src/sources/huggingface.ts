import { getJson } from "../lib/http";
import { uid } from "../lib/dedupe";
import { guessVendor, judgeLeak } from "../classify";
import type { IntelItem, ModelMeta } from "../types";

interface HFModel {
  id: string;
  author?: string;
  likes?: number;
  downloads?: number;
  createdAt?: string;
  lastModified?: string;
  pipeline_tag?: string;
  tags?: string[];
}

const MODALITY: [RegExp, string][] = [
  [/\btext-generation\b/, "文本生成"],
  [/\btext-to-image\b/, "文生图"],
  [/\btext-to-video\b/, "文生视频"],
  [/\btext-to-speech\b/, "语音合成"],
  [/\bautomatic-speech-recognition\b/, "语音识别"],
  [/\bimage-text-to-text\b/, "多模态"],
  [/\bimage-to-text\b/, "图像理解"],
  [/\bfeature-extraction\b/, "向量/嵌入"],
  [/\btext-to-3d\b/, "3D 生成"],
  [/\btext-to-sql\b/, "Text2SQL"],
];

const sizeToParams = (id: string): string | undefined => {
  const m = id.match(/(\d+(?:\.\d+)?)\s*[bB](?![a-z])/);
  return m ? `${m[1]}B` : undefined;
};

const meta = (m: HFModel): ModelMeta => ({
  name: m.id,
  params: sizeToParams(m.id),
  license: m.tags?.find((t) => t.startsWith("license:"))?.slice(8),
  openWeights: m.tags?.some((t) => ["safetensors", "gguf", "pytorch", "onnx"].includes(t)),
  modality: MODALITY.filter(([re]) => m.tags?.some((t) => re.test(t))).map(([, label]) => label),
});

/**
 * "匿名内测"在公开渠道唯一可验证的痕迹：未正式发布的权重被传到模型仓库。
 * 注意别把 dev / test 之类的词算进来——那是数据集与训练切分的命名惯例，不是未发布信号。
 */
const UNRELEASED_HINT =
  /(^|[-_.\s])(ngl|nightly|internal|alpha|canary|sneak|leak|leaked|codename|preview|unsupported|unreleased|confidential|imminent)([-_.\s]|$)/i;

function anonymousVerdict(m: HFModel): { hit: boolean; reason?: string } {
  const tags = m.tags ?? [];
  if (tags.some((t) => t === "ngl")) return { hit: true, reason: "带 ngl 标签（not-for-general-release）" };
  if (UNRELEASED_HINT.test(m.id)) return { hit: true, reason: "仓库名含未发布/内部版本标记" };
  const base = tags.find((t) => t.startsWith("base_model:"));
  if (base && UNRELEASED_HINT.test(base.slice(11))) {
    return { hit: true, reason: `基于未发布底座 ${base.slice(11)}` };
  }
  return { hit: false };
}

function toItem(m: HFModel, trending: boolean, now: number): IntelItem {
  const ts = Date.parse(m.lastModified || m.createdAt || "") || now;
  const text = `${m.id} ${(m.tags ?? []).join(" ")}`;
  const anon = anonymousVerdict(m);
  const leak = anon.hit ? ({ isLeak: true, confidence: 1 } as const) : judgeLeak(text);
  return {
    id: uid("hf", m.id),
    kind: leak.isLeak ? "leak-rumor" : "model-release",
    source: "huggingface",
    sourceLabel: trending ? "HF 热门模型" : "HF 新模型",
    title: m.id,
    url: `https://huggingface.co/${m.id}`,
    summary:
      anon.reason ||
      (m.tags ?? []).filter((t) => !t.startsWith("region:")).slice(0, 8).join(" · ") ||
      undefined,
    author: m.author,
    publishedAt: ts,
    confidence: leak.isLeak ? leak.confidence : undefined,
    vendor: guessVendor(m.id),
    model: meta(m),
    stats: { likes: m.likes ?? 0, downloads: m.downloads ?? 0 },
    tags: anon.hit ? ["未发布权重"] : [trending ? "热门" : "新发布"],
  };
}

/**
 * 两个视角：
 * 1) trendingScore 排序 —— 今天社区真正在用的模型
 * 2) createdAt 倒序大扫描 + 本地热度过滤 —— 刚上传但已经有动静的新模型
 */
export async function fetchHuggingFace(): Promise<IntelItem[]> {
  const [trending, fresh] = await Promise.all([
    getJson<HFModel[]>(
      "https://huggingface.co/api/models?sort=trendingScore&direction=-1&limit=40&full=true",
      { timeoutMs: 25000 },
    ),
    getJson<HFModel[]>(
      "https://huggingface.co/api/models?sort=createdAt&direction=-1&limit=500&full=true",
      { timeoutMs: 30000 },
    ),
  ]);

  const now = Date.now();
  // 未发布权重优先上榜：这是"匿名内测"唯一可验证的公开痕迹
  const suspects = fresh.filter((m) => anonymousVerdict(m).hit).slice(0, 20);
  const notable = fresh
    .filter((m) => !anonymousVerdict(m).hit && ((m.likes ?? 0) >= 2 || (m.downloads ?? 0) >= 300))
    .sort(
      (a, b) =>
        (b.downloads ?? 0) / 100 + (b.likes ?? 0) * 5 -
        ((a.downloads ?? 0) / 100 + (a.likes ?? 0) * 5),
    )
    .slice(0, 30);

  return [
    ...suspects.map((m) => toItem(m, false, now)),
    ...trending.slice(0, 20).map((m) => toItem(m, true, now)),
    ...notable.map((m) => toItem(m, false, now)),
  ];
}