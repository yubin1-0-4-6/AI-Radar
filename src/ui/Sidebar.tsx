import type { IntelKind, SourceResult } from "../types";
import { KIND_LABEL } from "../classify";

export interface Props {
  counts: Map<IntelKind | "all", number>;
  total: number;
  unread: number;
  active: IntelKind | "all" | "starred";
  onSelect: (k: IntelKind | "all" | "starred") => void;
  results: SourceResult[];
  labels: Map<string, string>;
  disabled: Set<string>;
  onToggleSource: (id: string) => void;
  onOpenSettings: () => void;
}

const ORDER: IntelKind[] = [
  "leak-rumor",
  "model-free",
  "model-release",
  "vendor",
  "ecosystem",
];

const DOT: Record<IntelKind, string> = {
  "leak-rumor": "#fb7185",
  "model-free": "#34d399",
  "model-release": "#38bdf8",
  vendor: "#fbbf24",
  ecosystem: "#94a3b8",
};

export function Sidebar(p: Props) {
  return (
    <aside className="side">
      <nav className="side__nav">
        <button
          className={`nav${p.active === "all" ? " nav--on" : ""}`}
          onClick={() => p.onSelect("all")}
        >
          <span>全部情报</span>
          <b>{p.total}</b>
        </button>
        <button
          className={`nav${p.active === "starred" ? " nav--on" : ""}`}
          onClick={() => p.onSelect("starred")}
        >
          <span>我的收藏</span>
        </button>
        <div className="nav__div" />
        {ORDER.map((k) => (
          <button
            key={k}
            className={`nav${p.active === k ? " nav--on" : ""}`}
            onClick={() => p.onSelect(k)}
          >
            <span>
              <i className="dot" style={{ background: DOT[k] }} />
              {KIND_LABEL[k]}
            </span>
            <b>{p.counts.get(k) ?? 0}</b>
          </button>
        ))}
      </nav>

      <div className="side__block">
        <h4>
          数据源 <em>{p.disabled.size ? `已停用 ${p.disabled.size}` : `全部 ${p.results.length}`}</em>
        </h4>
        <ul className="srcs">
          {p.results.map((r) => {
            const id = String(r.source);
            const off = p.disabled.has(id);
            return (
              <li key={id} className={off ? "src src--off" : "src"}>
                <button
                  className="src__name"
                  onClick={() => p.onToggleSource(id)}
                  title={off ? "点击启用" : "点击停用"}
                >
                  <i className={`src__led${r.ok ? (off ? " src__led--off" : "") : " src__led--bad"}`} />
                  {p.labels.get(id) ?? id}
                </button>
                <span className="src__n">
                  {r.ok ? r.count : <em title={r.error}>失败</em>}
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <footer className="side__foot">
        <button className="btn btn--ghost" onClick={p.onOpenSettings}>
          设置
        </button>
        <span className="side__hint">未读 {p.unread}</span>
      </footer>
    </aside>
  );
}