import type { IntelKind } from "./types";

/**
 * 泄漏 / 匿名内测线索识别。
 * 现实约束：不存在"全球匿名内测模型"的权威接口，本模块只做社区线索的信号聚合，
 * confidence 字段明确标注可信度，UI 必须把它展示给用户，不能当成官方发布渲染。
 */

/** 强信号：有证据（权重、截图、多源印证） */
const STRONG = [
  "weights dumped", "dumped weights", "weights found", "unpack the weights", "unpacked",
  "leaked weights", "leaked model", "model leak", "leaked checkpoint", "leaked on huggingface",
  "datamined", "data mined", "datamine", "data mining", "reverse engineered model",
  "teardown", "orphan checkpoint", "unlabeled checkpoint", "found the base model",
  "权重", "泄漏", "泄露", "被抓包", "逆向",
];

/** 中信号：说法明确但未证实 */
const MEDIUM = [
  "leak", "leaked", "leaking", "rumor", "rumour", "alleged", "allegedly", "claimed",
  "speculation", "speculative", "unconfirmed", "purported", "insider", "insiders say",
  "unreleased", "pre-release", "prerelease", "internal build", "internal version",
  "codename", "under the hood model", "shadow model", "before launch", "before release",
  "not yet announced", "not announced", "still in testing", "early access",
  "anonymous account", "anonymous", "anon", "3am release", "3am upload", "3am drop",
  "匿名", "内测", "未发布", "内部", "公测", "灰度", "小范围内测", "传闻", "据传", "疑似",
];

/** 弱信号：只表示"在测试 / 受限可用"，不足以单独判定为泄漏线索 */
const WEAK = [
  "research preview", "limited preview", "private preview", "internal preview",
  "early access program", "in beta", "internal beta", "closed beta",
  "unannounced model", "restricted access", "invite only", "invite-only",
];

export interface LeakVerdict {
  isLeak: boolean;
  confidence: 0 | 1 | 2;
}

export function judgeLeak(text: string): LeakVerdict {
  const t = text.toLowerCase();
  const hit = (list: string[]) => list.some((k) => t.includes(k));
  if (hit(STRONG)) return { isLeak: true, confidence: 2 };
  if (hit(MEDIUM)) return { isLeak: true, confidence: 1 };
  if (hit(WEAK)) return { isLeak: true, confidence: 0 };
  return { isLeak: false, confidence: 0 };
}

/** 免费可用信号。中文的"免费"单独出现毫无意义（免费咨询/免费版游戏），
 *  必须与模型语境共现才算。OpenRouter 的定价为 0 是权威判定，不走这里。 */
const FREE_EN = [
  "free tier", "free to use", "free api", "for free", "no credit card",
  "free inference", "free access", "free credits", "free endpoint",
];
const FREE_ZH = ["免费", "0 元", "零成本", "白嫖"];
const MODEL_TERM =
  /\b(model|llm|api|inference|weights|endpoint|gpt|token|chatbot|agent)\b|模型|大模型|权重|推理|接口|调用/i;

export const judgeFree = (text: string): boolean => {
  const t = text.toLowerCase();
  if (FREE_EN.some((k) => t.includes(k))) return true;
  return FREE_ZH.some((k) => t.includes(k)) && MODEL_TERM.test(t);
};

const RELEASE_HINTS = [
  "released", "releases", "release", "launches", "launch", "introducing",
  "announcing", "announced", "now available", "general availability", "ga ",
  "shipping", "debut", "open-sourced", "open weights",
  "发布", "上线", "开源", "正式推出", "宣布",
];

export const judgeRelease = (text: string): boolean => {
  const t = text.toLowerCase();
  return RELEASE_HINTS.some((k) => t.includes(k));
};

const VENDORS: [string, string[]][] = [
  ["OpenAI", ["openai", "gpt-", "gpt5", "gpt-5", "o1", "o3", "o4", "chatgpt", "codex", "sora"]],
  ["Anthropic", ["anthropic", "claude", "sonnet", "opus", "haiku"]],
  ["Google", ["google", "gemini", "deepmind", "gemma", "veo", "imagen"]],
  ["Meta", ["meta ai", "llama", "llama4", "llama3"]],
  ["xAI", ["xai", "grok"]],
  ["Mistral", ["mistral", "mixtral", "magistral", "devstral", "codestral"]],
  ["DeepSeek", ["deepseek"]],
  ["Qwen", ["qwen", "通义", "阿里"]],
  ["Moonshot", ["moonshot", "kimi"]],
  ["Zhipu", ["zhipu", "glm", "智谱"]],
  ["MiniMax", ["minimax", "海螺"]],
  ["ByteDance", ["bytedance", "doubao", "seed llm", "豆包"]],
  ["Tencent", ["tencent", "hunyuan", "混元"]],
  ["Alibaba", ["alibaba", "阿里"]],
  ["Nous", ["nous research", "hermes"]],
  ["Cohere", ["cohere", "command r"]],
  ["AI21", ["ai21", "jamba"]],
  ["Amazon", ["amazon", "nova", "bedrock"]],
  ["Microsoft", ["microsoft", "phi-", "phi4"]],
  ["Stability", ["stability", "stable diffusion"]],
  ["NVIDIA", ["nvidia", "nemotron"]],
];

export function guessVendor(text: string): string | undefined {
  const t = text.toLowerCase();
  let best: string | undefined;
  let bestLen = 0;
  for (const [vendor, keys] of VENDORS) {
    for (const k of keys) {
      if (t.includes(k) && k.length > bestLen) {
        best = vendor;
        bestLen = k.length;
      }
    }
  }
  return best;
}

export const KIND_LABEL: Record<IntelKind, string> = {
  "model-release": "新模型",
  "model-free": "免费可用",
  "leak-rumor": "泄漏·匿名内测",
  ecosystem: "生态·社区",
  vendor: "官方发布",
};

export const CONFIDENCE_LABEL: Record<0 | 1 | 2, string> = {
  0: "仅在测试/受限",
  1: "有说法·未证实",
  2: "有证据·多源印证",
};