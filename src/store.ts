import type { IntelItem, IntelKind, SourceId } from "./types";

const KEY = "ai-radar.v1";

export interface Settings {
  /** 自动刷新间隔（分钟），0 = 关闭 */
  autoRefreshMin: number;
  /** 开机自启（托盘常驻） */
  autostart: boolean;
  /** 关闭的源 */
  disabled: SourceId[];
  /** 新情报弹桌面通知 */
  notify: boolean;
  /** 只看未读 */
  unreadOnly: boolean;
  /** 每类最多展示条数 */
  perKindLimit: number;
}

export interface Persisted {
  settings: Settings;
  read: string[];
  starred: string[];
  lastFetch: number;
}

export const DEFAULT_SETTINGS: Settings = {
  autoRefreshMin: 30,
  autostart: true,
  disabled: [],
  notify: true,
  unreadOnly: false,
  perKindLimit: 60,
};

const EMPTY: Persisted = {
  settings: DEFAULT_SETTINGS,
  read: [],
  starred: [],
  lastFetch: 0,
};

export function load(): Persisted {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const p = JSON.parse(raw) as Partial<Persisted>;
    return {
      settings: { ...DEFAULT_SETTINGS, ...(p.settings ?? {}) },
      read: p.read ?? [],
      starred: p.starred ?? [],
      lastFetch: p.lastFetch ?? 0,
    };
  } catch {
    return EMPTY;
  }
}

export function save(state: Persisted): void {
  try {
    // 只保留最近 3000 条已读记录，避免无限膨胀
    localStorage.setItem(
      KEY,
      JSON.stringify({ ...state, read: state.read.slice(-3000), starred: state.starred }),
    );
  } catch {
    /* 隐私模式下写不进去，忽略 */
  }
}

/** 找出本次拉取里"上次没见过"的条目，用于标记未读与桌面通知 */
export function freshItems(items: IntelItem[], known: ReadonlySet<string>): IntelItem[] {
  return items.filter((i) => !known.has(i.id));
}

export const groupByKind = (items: IntelItem[]): Map<IntelKind, IntelItem[]> => {
  const m = new Map<IntelKind, IntelItem[]>();
  for (const i of items) {
    const arr = m.get(i.kind);
    if (arr) arr.push(i);
    else m.set(i.kind, [i]);
  }
  return m;
};

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return "刚刚";
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  const d = Math.floor(s / 86400);
  if (d < 30) return `${d} 天前`;
  return new Date(ts).toLocaleDateString("zh-CN");
}

export const fmtNum = (n: number): string =>
  n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n);