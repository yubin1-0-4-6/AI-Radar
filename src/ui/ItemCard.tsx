import type { IntelItem, IntelKind } from "../types";
import { CONFIDENCE_LABEL, KIND_LABEL } from "../classify";
import { fmtNum, timeAgo } from "../store";
import { openExternal } from "../shell";

const KIND_STYLE: Record<IntelKind, { dot: string; label: string }> = {
  "model-release": { dot: "#38bdf8", label: KIND_LABEL["model-release"] },
  "model-free": { dot: "#34d399", label: KIND_LABEL["model-free"] },
  "leak-rumor": { dot: "#fb7185", label: KIND_LABEL["leak-rumor"] },
  ecosystem: { dot: "#94a3b8", label: KIND_LABEL.ecosystem },
  vendor: { dot: "#fbbf24", label: KIND_LABEL.vendor },
};

export interface Props {
  item: IntelItem;
  isRead: boolean;
  isStarred: boolean;
  onToggleRead: () => void;
  onToggleStar: () => void;
}

export function ItemCard({ item, isRead, isStarred, onToggleRead, onToggleStar }: Props) {
  const s = KIND_STYLE[item.kind];
  const m = item.model;

  return (
    <article className={`card${isRead ? " card--read" : ""}`} onClick={onToggleRead}>
      <header className="card__head">
        <span className="card__kind">
          <i style={{ background: s.dot }} />
          {s.label}
        </span>
        {item.confidence !== undefined && item.kind === "leak-rumor" && (
          <span className={`card__conf card__conf--${item.confidence}`}>
            {CONFIDENCE_LABEL[item.confidence]}
          </span>
        )}
        {item.vendor && <span className="card__vendor">{item.vendor}</span>}
        <time className="card__time">{timeAgo(item.publishedAt)}</time>
      </header>

      <h3 className="card__title">{item.title}</h3>
      {item.summary && <p className="card__summary">{item.summary}</p>}

      {(m || item.tags?.length || item.stats) && (
        <div className="card__meta">
          {m?.params && <span>{m.params}</span>}
          {m?.contextLength && <span>{Math.round(m.contextLength / 1000)}k 上下文</span>}
          {m?.openWeights && <span>开放权重</span>}
          {m?.freeApi && <span>免费 API</span>}
          {m?.license && <span>{m.license}</span>}
          {m?.modality?.slice(0, 2).map((x) => (
            <span key={x}>{x}</span>
          ))}
          {item.stats?.downloads ? <span>↓ {fmtNum(item.stats.downloads)}</span> : null}
          {item.stats?.likes ? <span>♥ {fmtNum(item.stats.likes)}</span> : null}
          {item.stats?.points ? <span>▲ {item.stats.points}</span> : null}
          {item.stats?.stars ? <span>★ {fmtNum(item.stats.stars)}</span> : null}
          {item.tags?.map((t) => (
            <span key={t} className="card__tag">
              {t}
            </span>
          ))}
        </div>
      )}

      <footer className="card__foot">
        <span className="card__source">{item.sourceLabel}</span>
        <div className="card__actions">
          <button
            className={`btn btn--icon${isStarred ? " btn--on" : ""}`}
            title={isStarred ? "取消收藏" : "收藏"}
            onClick={(e) => {
              e.stopPropagation();
              onToggleStar();
            }}
          >
            {isStarred ? "★" : "☆"}
          </button>
          <button
            className="btn btn--go"
            onClick={(e) => {
              e.stopPropagation();
              void openExternal(item.url);
            }}
          >
            打开原文 ↗
          </button>
        </div>
      </footer>
    </article>
  );
}