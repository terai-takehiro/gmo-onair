// ⑤ パッチ盤 `/techops/tech-panels` の「盤の絵」だけ（担当 C4）。
// 設計: docs/design/v4/tech-docs.md §6 ⑤・モック `mockups/native/tech-docs/Panel.dc.html`。
// A段・B段（TRK盤は1段だけ）を横に並べ、機材名が入っている番号を塗る。
// 押すと親（TechPanelsPage）へ選んだ番号を伝える — 表の該当行への移動は親が行う。
import { cn } from "@gmo-onair/shared/src/client/utils";
import type { PatchJack, PatchJackRow, PatchPanel } from "@gmo-onair/shared/src/tech/types";
import { panelHundreds } from "@gmo-onair/shared/src/tech/patchNo";

export interface TechPanelBoardSelection {
  jackNo: number;
  jackRow: PatchJackRow;
}

/** 盤の絵・番号の表が共通で使う「裸の番号」（段を含まない）。TRK盤は `TRK12` の形 */
export function panelJackLabel(panel: PatchPanel, n: number): string {
  if (panel.kind === "trunk") return `TRK${n}`;
  const hundreds = panelHundreds(panel.name) ?? 0;
  return String(hundreds * 100 + n);
}

export function TechPanelBoard({
  panel,
  jacks,
  selected,
  onSelect,
}: {
  panel: PatchPanel;
  jacks: PatchJack[];
  selected: TechPanelBoardSelection | null;
  onSelect: (selection: TechPanelBoardSelection) => void;
}) {
  const filled = new Set(
    jacks.filter((j) => j.device_name !== "").map((j) => `${j.jack_no}-${j.jack_row}`),
  );
  const per = panel.jack_count === 48 ? 24 : 16;
  const blockCount = Math.ceil(panel.jack_count / per);
  const rowKeys: { key: PatchJackRow; label: string }[] =
    panel.kind === "trunk" ? [{ key: "A", label: "TRK" }] : [{ key: "A", label: "A" }, { key: "B", label: "B" }];

  return (
    <div className="rounded-card border border-border bg-card p-3">
      <div className="flex h-[26px] items-center gap-2">
        <span className="font-number text-cardtitle text-foreground">{panel.name}</span>
        <span className="font-number rounded-badge-xs bg-primary-surface px-1.5 text-badge font-bold text-primary">
          {panel.model}
        </span>
        <span className="flex-1" />
        <span className="flex items-center gap-1.5 text-note text-muted-foreground">
          <span className="h-[11px] w-[11px] rounded-badge-xs border border-primary-border bg-primary-surface" />
          使用中
        </span>
        <span className="flex items-center gap-1.5 text-note text-muted-foreground">
          <span className="h-[11px] w-[11px] rounded-badge-xs border border-border bg-card" />
          空き
        </span>
        <span className="flex items-center gap-1.5 text-note font-bold text-primary">
          <span className="h-[11px] w-[11px] rounded-badge-xs bg-primary" />
          選択中
        </span>
      </div>
      <p className="mt-0.5 text-note leading-relaxed text-muted-foreground">
        {panel.kind === "trunk"
          ? `TRK1〜${panel.jack_count} の多芯トランク。AV エリア分配箱へ送ります`
          : "A段＝送り出し（OUT）・B段＝受け（IN）・同じ番号の A と B はつながっています"}
      </p>

      {Array.from({ length: blockCount }).map((_, b) => {
        const from = b * per + 1;
        const to = Math.min((b + 1) * per, panel.jack_count);
        const nums: number[] = [];
        for (let n = from; n <= to; n++) nums.push(n);
        return (
          <div key={b} className={b === 0 ? "mt-2" : "mt-2.5"}>
            <div className="font-number h-3.5 text-note font-bold text-muted-foreground">
              {panelJackLabel(panel, from)} 〜 {panelJackLabel(panel, to)}
            </div>
            <div className="flex items-center gap-0.5 pl-6" style={{ height: 12 }}>
              {nums.map((n) => (
                <span key={n} className="font-number w-5 shrink-0 text-center text-[8.5px] text-muted-foreground">
                  {n}
                </span>
              ))}
            </div>
            {rowKeys.map((rk) => (
              <div key={rk.key} className="mt-0.5 flex items-center gap-0.5">
                <span
                  className={cn(
                    "font-number w-[22px] shrink-0 text-[10px] font-bold",
                    rk.key === "A" ? "text-primary" : "text-success",
                  )}
                >
                  {rk.label}
                </span>
                {nums.map((n) => {
                  const isFilled = filled.has(`${n}-${rk.key}`);
                  const isSel = selected != null && selected.jackNo === n && selected.jackRow === rk.key;
                  return (
                    <button
                      key={n}
                      type="button"
                      onClick={() => onSelect({ jackNo: n, jackRow: rk.key })}
                      aria-label={`${panelJackLabel(panel, n)}${panel.kind === "trunk" ? "" : rk.key} ${isFilled ? "使用中" : "空き"}`}
                      className={cn(
                        "h-5 w-5 shrink-0 rounded-badge-xs border transition-colors",
                        isSel
                          ? "border-primary bg-primary"
                          : isFilled
                            ? "border-primary-border bg-primary-surface hover:border-primary-border-strong"
                            : "border-border bg-card hover:border-primary-border-strong",
                      )}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        );
      })}
    </div>
  );
}
