import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchAllIntel, SOURCES } from "./sources/index";
import type { FetchReport, IntelItem, IntelKind, SourceId } from "./types";
import { KIND_LABEL } from "./classify";
import { isTauri } from "./lib/http";
import {
  DEFAULT_SETTINGS,
  groupByKind,
  load,
  save,
  timeAgo,
  type Settings,
} from "./store";
import { notify, getAutostart, setAutostart, setTrayCount, updateTrayTooltip } from "./shell";
import { ItemCard } from "./ui/ItemCard";
import { Sidebar } from "./ui/Sidebar";
import { SettingsPanel } from "./ui/SettingsPanel";

type Filter = IntelKind | "all" | "starred";

const LABELS = new Map(SOURCES.map((s) => [s.source as string, s.label]));

export default function App() {
  const [state] = useState(load);
  const [settings, setSettings] = useState<Settings>(state.settings);
  const [items, setItems] = useState<IntelItem[]>([]);
  const [results, setResults] = useState<FetchReport["results"]>([]);
  const [read, setRead] = useState<Set<string>>(() => new Set(state.read));
  const [starred, setStarred] = useState<Set<string>>(() => new Set(state.starred));
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [lastFetch, setLastFetch] = useState(state.lastFetch);
  const [error, setError] = useState<string | null>(null);
  const [panel, setPanel] = useState(false);

  const readRef = useRef(read);
  readRef.current = read;
  const starredRef = useRef(starred);
  starredRef.current = starred;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const disabled = useMemo(() => new Set<SourceId>(settings.disabled), [settings.disabled]);

  const refresh = useCallback(
    async (silent = false) => {
      if (busy) return;
      setBusy(true);
      setError(null);
      try {
        const enabled = new Set(SOURCES.map((s) => s.source).filter((s) => !disabled.has(s)));
        const report = await fetchAllIntel({ enabled });
        const fresh = report.items.filter((i) => !readRef.current.has(i.id));

        setItems(report.items);
        setResults(report.results);
        setLastFetch(Date.now());

        const failed = report.results.filter((r) => !r.ok);
        if (failed.length) {
          setError(`${failed.length} 个源拉取失败：${failed.map((f) => LABELS.get(f.source) ?? f.source).join("、")}`);
        }

        if (fresh.length) {
          setTrayCount(fresh.length);
          if (!silent && settingsRef.current.notify) {
            const leaks = fresh.filter((i) => i.kind === "leak-rumor").length;
            void notify(
              `AI Radar · ${fresh.length} 条新情报`,
              leaks
                ? `含 ${leaks} 条泄漏 / 匿名内测线索：${fresh[0]!.title.slice(0, 60)}`
                : fresh[0]!.title.slice(0, 80),
            );
          }
        } else {
          setTrayCount(0);
        }
        void updateTrayTooltip(
          `AI Radar · ${fresh.length} 条新情报 · ${timeAgo(Date.now())}刷新`,
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [busy, disabled],
  );

  // 启动即拉取
  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 自动刷新
  useEffect(() => {
    if (!settings.autoRefreshMin) return;
    const id = setInterval(() => void refresh(true), settings.autoRefreshMin * 60_000);
    return () => clearInterval(id);
  }, [settings.autoRefreshMin, refresh]);

  // 窗口重新获得焦点时补一次
  useEffect(() => {
    const onFocus = () => {
      if (Date.now() - lastFetch > 10 * 60_000) void refresh(true);
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [lastFetch, refresh]);

  // 托盘菜单「立即刷新」由 Rust 侧 emit 过来
  useEffect(() => {
    if (!isTauri()) return;
    let dispose: (() => void) | undefined;
    let cancelled = false;
    void import("@tauri-apps/api/event").then(({ listen }) =>
      listen("radar://refresh", () => void refresh()).then((un) => {
        if (cancelled) un();
        else dispose = un;
      }),
    );
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [refresh]);

  // 快捷键：R 刷新 / / 搜索
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const inField = (e.target as HTMLElement)?.tagName === "INPUT";
      if (e.key === "r" && !inField && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        void refresh();
      }
      if (e.key === "/" && !inField) {
        e.preventDefault();
        (document.getElementById("q") as HTMLInputElement | null)?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [refresh]);

  // 开机自启：本地设置为准，启动时与系统实际状态对齐一次
  useEffect(() => {
    if (!isTauri()) return;
    void (async () => {
      const actual = await getAutostart();
      if (actual !== settings.autostart) {
        const now = await setAutostart(settings.autostart);
        if (now !== settings.autostart) patch({ autostart: now });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTauri()]);

  useEffect(() => {
    save({ settings, read: [...read], starred: [...starred], lastFetch });
  }, [settings, read, starred, lastFetch]);

  const patch = (p: Partial<Settings>) => setSettings((s) => ({ ...s, ...p }));

  const toggleRead = (id: string) =>
    setRead((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

  const toggleStar = (id: string) =>
    setStarred((s) => {
      const n = new Set(s);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });

/**
 * 全量视图的分类配额。GitHub / Reddit 天然更新量大且时间戳总是"现在"，
 * 不设配额会把真正要看的新模型、免费模型和泄漏线索全挤到第二屏。
 */
const ALL_VIEW_QUOTA: Partial<Record<IntelKind, number>> = {
  ecosystem: 20,
};

const visible = useMemo(() => {
  const q = query.trim().toLowerCase();
  let list = items.filter((i) => {
    if (filter === "starred" && !starred.has(i.id)) return false;
    if (filter !== "all" && filter !== "starred" && i.kind !== filter) return false;
    if (settings.unreadOnly && read.has(i.id) && !starred.has(i.id)) return false;
    if (
      q &&
      !`${i.title} ${i.summary ?? ""} ${i.vendor ?? ""} ${i.sourceLabel}`.toLowerCase().includes(q)
    )
      return false;
    return true;
  });
if (filter === "all" || filter === "starred") {
    for (const [k, arr] of groupByKind(list)) {
      const cap = ALL_VIEW_QUOTA[k] ?? settings.perKindLimit;
      if (arr.length > cap) {
        const keep = new Set(
          [...arr]
            .sort((a, b) => b.publishedAt - a.publishedAt)
            .slice(0, cap)
            .map((x) => x.id),
        );
        list = list.filter((i) => i.kind !== k || keep.has(i.id));
      }
    }
    list.sort((a, b) => b.publishedAt - a.publishedAt);
  }
  return list;
}, [items, filter, query, starred, read, settings.unreadOnly, settings.perKindLimit]);

  const counts = useMemo(() => {
    const m = new Map<IntelKind | "all", number>();
    for (const [k, arr] of groupByKind(items)) m.set(k, arr.length);
    return m;
  }, [items]);
  const unread = useMemo(
    () => items.filter((i) => !read.has(i.id)).length,
    [items, read],
  );
  const okCount = results.filter((r) => r.ok).length;

  return (
    <div className="app">
      <Sidebar
        counts={counts}
        total={items.length}
        unread={unread}
        active={filter}
        onSelect={setFilter}
        results={results}
        labels={LABELS}
        disabled={disabled}
        onToggleSource={(id) =>
          patch({
            disabled: disabled.has(id as SourceId)
              ? settings.disabled.filter((x) => x !== id)
              : [...settings.disabled, id as SourceId],
          })
        }
        onOpenSettings={() => setPanel(true)}
      />

      <main className="main">
        <header className="top">
          <div className="top__row">
            <h1 className="logo">
              AI<span>Radar</span>
            </h1>
            <input
              id="q"
              className="top__search"
              placeholder="搜索标题 / 厂商 / 摘要…  按 / 聚焦，R 刷新"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <button className="btn btn--primary" onClick={() => void refresh()} disabled={busy}>
              {busy ? "拉取中…" : "一键刷新"}
            </button>
          </div>
          <div className="top__status">
            {lastFetch ? `上次刷新 ${timeAgo(lastFetch)}` : "尚未刷新"}
            {results.length > 0 && ` · 源 ${okCount}/${results.length} 可用`}
            {items.length > 0 && ` · 共 ${items.length} 条`}
            {!isTauri() && <em> · 浏览器预览模式（无托盘/通知）</em>}
          </div>
          {error && <div className="top__err">{error}</div>}
        </header>

        {filter !== "all" && filter !== "starred" && (
          <div className="crumb">
            {KIND_LABEL[filter]}
            <button className="btn btn--icon" onClick={() => setFilter("all")}>
              ✕
            </button>
          </div>
        )}

        {busy && items.length === 0 && <div className="empty">正在扫描全球 AI 情报源…</div>}
        {!busy && visible.length === 0 && (
          <div className="empty">
            {items.length === 0 ? "还没有数据，点右上角「一键刷新」" : "当前筛选条件下没有内容"}
          </div>
        )}

        <div className="grid">
          {visible.map((i) => (
            <ItemCard
              key={i.id}
              item={i}
              isRead={read.has(i.id)}
              isStarred={starred.has(i.id)}
              onToggleRead={() => toggleRead(i.id)}
              onToggleStar={() => toggleStar(i.id)}
            />
          ))}
        </div>
      </main>

      <SettingsPanel
        open={panel}
        settings={settings}
        desktop={isTauri()}
        onClose={() => setPanel(false)}
        onChange={patch}
        onClearRead={() => setRead(new Set())}
        onClearAll={() => {
          setRead(new Set());
          setStarred(new Set());
          setItems([]);
          setResults([]);
          setLastFetch(0);
          setSettings(DEFAULT_SETTINGS);
          localStorage.removeItem("ai-radar.v1");
        }}
      />
    </div>
  );
}