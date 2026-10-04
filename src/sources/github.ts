import { getJson } from "../lib/http";
import { clip } from "../lib/xml";
import { uid } from "../lib/dedupe";
import { judgeLeak } from "../classify";
import type { IntelItem } from "../types";

interface Repo {
  full_name: string;
  description?: string | null;
  html_url: string;
  stargazers_count?: number;
  forks_count?: number;
  pushed_at?: string;
  created_at?: string;
  open_issues_count?: number;
  topics?: string[];
}

/**
 * 近期出现的 AI 开源项目。
 * 时间戳取仓库创建时间而不是最近提交时间：否则任何老仓库只要今天推了一次 commit
 * 就会顶到"最新"，把真正的新模型挤下去。
 */
const TOPICS = ["llm", "llm-inference", "fine-tuning", "local-llm"] as const;
const MAX_AGE_DAYS = 120;
const PER_TOPIC = 10;

async function search(topic: string, since: string): Promise<Repo[]> {
  // created:> 交给 GitHub 服务端过滤，再按 stars 排 —— 否则拿回来的是一堆老仓库
  const q = encodeURIComponent(`topic:${topic} stars:>300 created:>${since}`);
  const res = await getJson<{ items: Repo[] }>(
    `https://api.github.com/search/repositories?q=${q}&sort=stars&order=desc&per_page=${PER_TOPIC * 2}`,
    { timeoutMs: 25000 },
  );
  return (res.items ?? []).slice(0, PER_TOPIC);
}

export async function fetchGitHub(): Promise<IntelItem[]> {
  const since = new Date(Date.now() - MAX_AGE_DAYS * 86400e3).toISOString().slice(0, 10);
  const settled = await Promise.allSettled(TOPICS.map((t) => search(t, since)));
  const errs = settled
    .filter((s) => s.status === "rejected")
    .map((s) => String(s.reason?.message ?? s.reason));
  const repos = settled.flatMap((s) => (s.status === "fulfilled" ? s.value : []));
  if (!repos.length && errs.length) throw new Error(errs.join("; "));

  return repos.map((r) => {
    const text = `${r.full_name} ${r.description ?? ""} ${(r.topics ?? []).join(" ")}`;
    const leak = judgeLeak(text);
    return {
      id: uid("gh", r.full_name),
      kind: leak.isLeak ? ("leak-rumor" as const) : ("ecosystem" as const),
      source: "github",
      sourceLabel: "GitHub",
      title: r.full_name,
      url: r.html_url,
      summary: clip(r.description ?? "", 240) || undefined,
      publishedAt: Date.parse(r.created_at ?? "") || Date.now(),
      confidence: leak.isLeak ? leak.confidence : undefined,
      stats: {
        stars: r.stargazers_count ?? 0,
        forks: r.forks_count ?? 0,
        issues: r.open_issues_count ?? 0,
      },
      tags: [...(r.topics ?? []).slice(0, 3), "新项目"],
    } satisfies IntelItem;
  });
}