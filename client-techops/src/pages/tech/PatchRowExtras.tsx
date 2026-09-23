// 技術資料 ②映像パッチ — 「増設」の印と、表の右に並ぶ欄（設計: docs/design/v4/tech-docs.md §6②「右パネル」）。
// 増設機材はパッチ番号を持たないので、行では機材名の右に薄い印を出し、
// 資料全体では「この資料の増設機材」「使うパッチ番号」「書き出しの書式」「系統」をここにまとめる。
import type { ReactNode } from "react";
import { Monitor } from "lucide-react";
import { StatValue } from "@gmo-onair/shared/src/client/ui/numbers";
import { patchRowLine } from "@gmo-onair/shared/src/tech/patchExport";
import type { TechPatchRow } from "@gmo-onair/shared/src/tech/types";
import { extraDevicesOf, groupRowsByLabel, patchNoStatsOf, type JackInfo } from "./patchDerive";

/** 端子盤の印（AV-1 など、多芯トランクの行き先。機材名の右に出す） */
export function TerminalTag() {
  return (
    <span className="shrink-0 rounded-badge bg-muted px-1.5 py-0.5 text-badge text-muted-foreground">端子盤</span>
  );
}

/** 増設機材の印（機材名の右に出す） */
export function ExtraTag() {
  return (
    <span className="shrink-0 rounded-badge bg-warning-surface px-1.5 py-0.5 text-badge text-warning">増設</span>
  );
}

function Card({ title, count, children }: { title: string; count?: number; children: ReactNode }) {
  return (
    <section className="rounded-card border border-border bg-card p-3.5">
      <div className="flex items-center gap-2">
        <h2 className="text-cardtitle text-foreground">{title}</h2>
        {count !== undefined && (
          <span className="num rounded-badge bg-warning-surface px-1.5 py-0.5 text-badge text-warning">{count}</span>
        )}
      </div>
      {children}
    </section>
  );
}

interface Props {
  rows: TechPatchRow[];
  jackIndex: Map<string, JackInfo>;
}

export function PatchRowExtras({ rows, jackIndex }: Props) {
  const extras = extraDevicesOf(rows);
  const stats = patchNoStatsOf(rows, jackIndex);
  const groups = groupRowsByLabel(rows);
  const sample = [...rows].sort((a, b) => a.sort_order - b.sort_order)[0];
  const panelPct = stats.total > 0 ? Math.round(((stats.total - stats.toExtra) / stats.total) * 1000) / 10 : 0;

  return (
    <div className="flex w-72 shrink-0 flex-col gap-3">
      <Card title="この資料の増設機材" count={extras.length}>
        {extras.length === 0 ? (
          <p className="mt-2 text-sub text-muted-foreground">
            まだありません。機材の候補の末尾にある「増設機材として手入力」で入力してください。
          </p>
        ) : (
          <ul className="mt-1">
            {extras.map((e) => (
              <li key={e.name} className="flex items-center gap-2 border-b border-border-faint py-2 last:border-b-0">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-badge bg-warning-surface">
                  <Monitor className="h-3 w-3 text-warning" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-list text-foreground">{e.name}</span>
                  <span className="block truncate text-sub-sm text-muted-foreground">{e.groups.join(" ・ ") || "系統なし"}</span>
                </span>
                <span className="num shrink-0 text-sub-sm text-muted-foreground">
                  {[e.outCount ? `OUT ${e.outCount}` : "", e.inCount ? `IN ${e.inCount}` : ""].filter(Boolean).join(" ・ ")}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="この資料で使うパッチ番号">
        <div className="mt-2 flex items-end gap-4">
          <span>
            <StatValue size="sm" className="block text-foreground">{stats.total}</StatValue>
            <span className="mt-0.5 block text-sub-sm text-muted-foreground">パッチ盤のパッチ番号</span>
          </span>
          <span>
            <StatValue size="sm" className="block text-warning">{stats.toExtra}</StatValue>
            <span className="mt-0.5 block text-sub-sm text-muted-foreground">うち増設機材へ</span>
          </span>
        </div>
        <div className="mt-2.5 flex h-2 overflow-hidden rounded-badge bg-muted">
          <span className="bg-primary" style={{ width: `${panelPct}%` }} />
          <span className="bg-warning" style={{ width: `${Math.max(0, 100 - panelPct)}%` }} />
        </div>
        <p className="num mt-2 text-sub-sm text-muted-foreground">
          {stats.byPanel.length === 0
            ? "まだパッチ番号を選んでいません。"
            : stats.byPanel.map((p) => `${p.panelName} が ${p.count}ch`).join(" ・ ")}
        </p>
      </Card>

      <Card title="書き出しの書式">
        <div className="num mt-2 rounded-note border border-border-faint bg-surface-subtle px-2.5 py-2 text-note text-foreground">
          {sample ? patchRowLine(sample) : "まだ行がありません。"}
        </div>
        <p className="mt-2 text-sub-sm text-muted-foreground">現場のパッチ表と同じ矢印の書式で書き出します。</p>
      </Card>

      <Card title="系統">
        {groups.length === 0 ? (
          <p className="mt-2 text-sub text-muted-foreground">まだ系統がありません。</p>
        ) : (
          <ul className="mt-1">
            {groups.map((g) => (
              <li key={g.label} className="flex items-center gap-2 py-1.5">
                <span className="min-w-0 flex-1 truncate text-list text-foreground">{g.label || "（名前なし）"}</span>
                <span className="num shrink-0 text-sub text-muted-foreground">{g.rows.length} 行</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
