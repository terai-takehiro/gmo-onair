// 運営マニュアル — 書き出し設定パネル（段D・production-manual.md §6⑤
// 「書き出しの設定は 範囲／表紙／目次／ページ番号／「◯月◯日時点」／色を使わない の6つ」）。
//
// `ManualExportSettings`／`ManualExportRange`／`selectPagesInRange` は print-document 担当の
// `ManualPrintDocument.tsx` 側が正（Integrate 済み・両者で同じ実装を1つ使う——プレビュー・
// 出す前の検査・インクの目安（この画面側）と、実際に刷る本体（あちら側）が別の絞り込み
// ロジックを持つと、範囲を指定したときに「検査は通ったのに刷ったら違うページだった」が
// 起こりうるため）。フィールド名はこのファイルが先に決めた綴り（「時点」＝`showAsOf`・
// 「ページ番号」＝`pageNumbers`）にあちら側を合わせてもらってある。
import { Switch } from "@gmo-onair/shared/src/client/ui/switch";
import { cn } from "@/lib/utils";
import {
  selectPagesInRange,
  type ManualExportRange,
  type ManualExportSettings,
} from "./ManualPrintDocument";

export type { ManualExportRange, ManualExportSettings };
export { selectPagesInRange };

export function defaultManualExportSettings(pageCount: number): ManualExportSettings {
  const count = Math.max(1, pageCount);
  return {
    range: { mode: "all", from: 1, to: count },
    cover: true,
    toc: true,
    pageNumbers: true,
    showAsOf: true,
    grayscale: false,
  };
}

function clampPage(n: number, pageCount: number): number {
  if (!Number.isFinite(n)) return 1;
  return Math.min(Math.max(1, Math.round(n)), Math.max(1, pageCount));
}

const SEGMENT_BTN =
  "min-h-tap rounded-control px-3 py-1 text-sub-sm font-medium transition-colors";
const NUM_INPUT = "w-16 rounded border border-input bg-background px-2 py-1 text-sub-sm text-foreground";

interface Props {
  settings: ManualExportSettings;
  onChange: (next: ManualExportSettings) => void;
  /** 冊子の総ページ数（表紙・目次を含まない、紙面そのものの枚数） */
  pageCount: number;
}

export default function ManualExportSettingsPanel({ settings, onChange, pageCount }: Props) {
  const patch = (p: Partial<ManualExportSettings>) => onChange({ ...settings, ...p });
  const patchRange = (p: Partial<ManualExportRange>) => {
    const next = { ...settings.range, ...p };
    // from > to になったら、動かした側にもう一方を追従させる（打ち直しの往復をさせない）
    if ("from" in p && next.from > next.to) next.to = next.from;
    if ("to" in p && next.to < next.from) next.from = next.to;
    patch({ range: next });
  };

  return (
    <div className="flex flex-col gap-4 rounded-card border border-border bg-card p-4">
      <div>
        <h2 className="text-sub-sm font-medium text-foreground">書き出す範囲</h2>
        <div className="mt-2 inline-flex items-center gap-1 rounded-control border border-border bg-muted/30 p-0.5">
          <button
            type="button"
            onClick={() => patch({ range: { ...settings.range, mode: "all" } })}
            className={cn(SEGMENT_BTN, settings.range.mode === "all" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            全ページ
          </button>
          <button
            type="button"
            onClick={() => patch({ range: { ...settings.range, mode: "range" } })}
            className={cn(SEGMENT_BTN, settings.range.mode === "range" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
          >
            ページ指定
          </button>
        </div>

        {settings.range.mode === "range" && (
          <div className="mt-2 flex items-center gap-2 text-sub-sm text-muted-foreground">
            <input
              type="number"
              min={1}
              max={pageCount}
              value={settings.range.from}
              onChange={(e) => patchRange({ from: clampPage(Number(e.target.value), pageCount) })}
              className={NUM_INPUT}
              aria-label="開始ページ"
            />
            <span>〜</span>
            <input
              type="number"
              min={1}
              max={pageCount}
              value={settings.range.to}
              onChange={(e) => patchRange({ to: clampPage(Number(e.target.value), pageCount) })}
              className={NUM_INPUT}
              aria-label="終了ページ"
            />
            <span>/ 全{pageCount}ページ</span>
          </div>
        )}
      </div>

      <div className="flex flex-col gap-3 border-t border-border pt-3">
        <ToggleRow
          label="表紙"
          description="題・資料番号・案件名（または番組名）・対象日を1枚目に付けます。"
          checked={settings.cover}
          onChange={(v) => patch({ cover: v })}
        />
        <ToggleRow
          label="目次"
          description="章が設定されたページを一覧にして付けます。"
          checked={settings.toc}
          onChange={(v) => patch({ toc: v })}
        />
        <ToggleRow
          label="ページ番号"
          description="柱に「5 / 12」のように出します。"
          checked={settings.pageNumbers}
          onChange={(v) => patch({ pageNumbers: v })}
        />
        <ToggleRow
          label="時点の表示"
          description="柱に書き出した日時を出します。"
          checked={settings.showAsOf}
          onChange={(v) => patch({ showAsOf: v })}
        />
        <ToggleRow
          label="白黒で刷る"
          description="色をすべてグレーに落として書き出します。"
          checked={settings.grayscale}
          onChange={(v) => patch({ grayscale: v })}
        />
      </div>
    </div>
  );
}

function ToggleRow({
  label,
  description,
  checked,
  onChange,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="flex flex-col gap-0.5">
        <span className="text-sub-sm font-medium text-foreground">{label}</span>
        <span className="text-sub-sm text-muted-foreground">{description}</span>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} className="mt-0.5 shrink-0" />
    </div>
  );
}
