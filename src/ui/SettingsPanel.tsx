import { useEffect, useRef, useState } from "react";
import type { Settings } from "../store";

export interface Props {
  open: boolean;
  settings: Settings;
  onClose: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onClearRead: () => void;
  onClearAll: () => void;
  desktop: boolean;
}

const REFRESH = [0, 15, 30, 60, 180];

export function SettingsPanel({ open, settings, onClose, onChange, onClearRead, onClearAll, desktop }: Props) {
  const [confirm, setConfirm] = useState<null | "read" | "all">(null);
  const first = useRef(true);

  useEffect(() => {
    if (open) setConfirm(null);
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <div className="mask" onClick={onClose} />
      <section className="panel" role="dialog" aria-label="设置">
        <header className="panel__head">
          <h2>设置</h2>
          <button className="btn btn--icon" onClick={onClose} aria-label="关闭">
            ✕
          </button>
        </header>

        <label className="row">
          <span>
            开机自动启动
            <em>
              {desktop ? "开机后静默进托盘，不弹窗口" : "仅桌面版支持"}
            </em>
          </span>
          <input
            type="checkbox"
            checked={settings.autostart}
            disabled={!desktop}
            onChange={(e) => onChange({ autostart: e.target.checked })}
          />
        </label>

        <label className="row">
          <span>
            自动刷新
            <em>后台定时拉取全部情报源</em>
          </span>
          <select
            value={settings.autoRefreshMin}
            onChange={(e) => onChange({ autoRefreshMin: Number(e.target.value) })}
          >
            {REFRESH.map((m) => (
              <option key={m} value={m}>
                {m === 0 ? "关闭" : `每 ${m} 分钟`}
              </option>
            ))}
          </select>
        </label>

        <label className="row">
          <span>
            新情报桌面通知
            <em>仅在有未读新条目时提醒，不做逐条轰炸</em>
          </span>
          <input
            type="checkbox"
            checked={settings.notify}
            disabled={!desktop}
            onChange={(e) => onChange({ notify: e.target.checked })}
          />
        </label>

        <label className="row">
          <span>
            默认只看未读
            <em>点击卡片即标记为已读</em>
          </span>
          <input
            type="checkbox"
            checked={settings.unreadOnly}
            onChange={(e) => onChange({ unreadOnly: e.target.checked })}
          />
        </label>

        <label className="row">
          <span>
            单类展示上限
            <em>避免某一类刷屏</em>
          </span>
          <select
            value={settings.perKindLimit}
            onChange={(e) => onChange({ perKindLimit: Number(e.target.value) })}
          >
            {[20, 40, 60, 100, 200].map((n) => (
              <option key={n} value={n}>
                {n} 条
              </option>
            ))}
          </select>
        </label>

        <div className="panel__danger">
          <button
            className="btn btn--ghost"
            onClick={() => {
              if (first.current || confirm === "read") {
                onClearRead();
                setConfirm(null);
              } else setConfirm("read");
            }}
            onBlur={() => setConfirm(null)}
          >
            {confirm === "read" ? "再点一次确认清空已读" : "清空已读记录"}
          </button>
          <button
            className="btn btn--danger"
            onClick={() => {
              if (first.current || confirm === "all") {
                onClearAll();
                setConfirm(null);
              } else setConfirm("all");
            }}
            onBlur={() => setConfirm(null)}
          >
            {confirm === "all" ? "再点一次确认重置全部" : "重置全部本地数据"}
          </button>
        </div>

        <p className="panel__note">
          <b>怎么用：</b>点「一键刷新」抓取全部情报源 → 左侧按分类筛选 →
          点卡片标记已读、点「打开原文」跳到出处。
          <br />
          关闭窗口不会退出，程序留在系统托盘；<b>左键点托盘图标</b>唤出窗口，
          <b>右键托盘图标</b>可以打开 / 立即刷新 / 退出。
          <br />
          快捷键：<b>R</b> 刷新 · <b>/</b> 聚焦搜索框 · <b>Esc</b> 关闭设置。
          <br />
          数据全部在本地缓存，不上传任何内容。
          <br />
          泄漏与匿名内测线索来自公开社区痕迹与媒体报道，<b>非厂商官方确认</b>，可信度已在卡片上标注。
        </p>
      </section>
    </>
  );
}