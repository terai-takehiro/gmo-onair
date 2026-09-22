// 技術資料の紙面1枚（④書き出しの画面プレビューと PDF の両方が使う共通の見た目）。
// 設計: docs/design/v4/tech-docs.md §8-1（紙は矢印表記・スタッフはメンバー表と同じ形）、
// モック `docs/design/v4/mockups/native/tech-docs/Print.dc.html`。
//
// 会場図面の `VenuePrintSheet.tsx` と同じ作法で、CSS の mm 単位で組む（画面表示の縮小は
// 呼び出し側が `transform: scale()` で行う）。**用紙は A4 横 297×210mm、版面は 267×186mm**
// （左右 15mm・上下 12mm の余白）。
//
// 行が増えたら**2枚目に流す**（高さを固定しない）。`minHeight` だけを用紙1枚分にしてあるので、
// 30 行ほどまでは1枚に収まり、それを超えると自然に伸びる（印刷時は @page で切れる）。
import { groupPatchRows } from "@gmo-onair/shared/src/tech/patchExport";
import { roleOrder } from "@gmo-onair/shared/src/tech/roles";
import type { TechPatchRow, TechStaffRow } from "@gmo-onair/shared/src/tech/types";

const PAD_X_MM = 15;
const PAD_Y_MM = 12;
const INK = "#1a1d24";
const SUB = "#5d6470";
const FAINT = "#9aa1ab";
const LINE = "#e6e9ed";
const PRIMARY = "#005bac";
const SHEET_FONT = "'LINE Seed JP','Noto Sans JP',-apple-system,'Hiragino Sans','BIZ UDPGothic','Meiryo',sans-serif";

const WEEKDAY = ["日", "月", "火", "水", "木", "金", "土"];

/** `2026-10-15` → `10/15（木）`。読めない値はそのまま返す */
export function techDayLabel(date: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return date;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (Number.isNaN(d.getTime())) return date;
  return `${Number(m[2])}/${Number(m[3])}（${WEEKDAY[d.getUTCDay()]}）`;
}

export interface TechStaffPrintDay {
  date: string;
  label: string;
  count: number;
  roles: { role: string; people: { name: string; company: string }[] }[];
}

/**
 * 技術スタッフを「作業日 → 役職（`roleOrder`）→ 行の並び」でまとめる。
 * 名前の入っていない行は紙に出さない（画面で足しただけの空行）。
 */
export function buildStaffPrintDays(rows: TechStaffRow[]): TechStaffPrintDay[] {
  const days: TechStaffPrintDay[] = [];
  const sorted = [...rows]
    .filter((r) => r.person_name.trim() !== "")
    .sort((a, b) => a.work_date.localeCompare(b.work_date) || roleOrder(a.role) - roleOrder(b.role) || a.sort_order - b.sort_order);
  for (const r of sorted) {
    let day = days.find((d) => d.date === r.work_date);
    if (!day) {
      day = { date: r.work_date, label: techDayLabel(r.work_date), count: 0, roles: [] };
      days.push(day);
    }
    let group = day.roles.find((x) => x.role === r.role);
    if (!group) {
      group = { role: r.role, people: [] };
      day.roles.push(group);
    }
    group.people.push({ name: r.person_name, company: r.company_name });
    day.count += 1;
  }
  return days;
}

export interface TechDocPrintSheetProps {
  paperWidthMm: number;
  paperHeightMm: number;
  docNo: string | null;
  rev: number;
  status: "draft" | "fixed";
  title: string;
  /** 案件名（または番組名）。無ければ空文字 */
  ownerName: string;
  /** 管理番号（GLS番号）。無ければ null */
  ownerNo: string | null;
  /** 本番日・会場など1行の添え書き */
  ownerSub: string | null;
  /** 「発行 2026/10/10」の日付 */
  dateLabel: string;
  patchRows: TechPatchRow[];
  staffRows: TechStaffRow[];
  showPatch: boolean;
  showStaff: boolean;
}

export default function TechDocPrintSheet({
  paperWidthMm,
  paperHeightMm,
  docNo,
  rev,
  status,
  title,
  ownerName,
  ownerNo,
  ownerSub,
  dateLabel,
  patchRows,
  staffRows,
  showPatch,
  showStaff,
}: TechDocPrintSheetProps) {
  const groups = groupPatchRows(patchRows);
  const days = buildStaffPrintDays(staffRows);
  const extraCount = patchRows.filter((r) => r.from_is_extra || r.to_is_extra).length;
  const staffCount = days.reduce((n, d) => n + d.count, 0);
  const both = showPatch && showStaff;

  return (
    <div
      style={{
        width: `${paperWidthMm}mm`,
        minHeight: `${paperHeightMm}mm`,
        padding: `${PAD_Y_MM}mm ${PAD_X_MM}mm`,
        background: "#fff",
        color: INK,
        boxSizing: "border-box",
        display: "flex",
        flexDirection: "column",
        fontFamily: SHEET_FONT,
      }}
    >
      {/* 見出し（資料番号・版・名前と、右に案件名・日付・発行元） */}
      <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "8mm", paddingBottom: "3mm", borderBottom: `0.6mm solid ${PRIMARY}` }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "2.5mm" }}>
            <span style={{ border: `0.3mm solid ${PRIMARY}`, color: PRIMARY, fontSize: "9pt", fontWeight: 800, padding: "0.4mm 2mm" }}>技術資料</span>
            <span style={{ fontSize: "9pt", fontWeight: 700, color: SUB }}>
              {docNo ?? "（資料番号なし）"}
              {rev > 0 && ` ・ 第${rev}版`}
              {status === "draft" && " ・ 下書き"}
            </span>
          </div>
          <div style={{ marginTop: "2mm", fontSize: "20pt", fontWeight: 800, lineHeight: 1.15 }}>{title || "（無題）"}</div>
        </div>
        <div style={{ flexShrink: 0, textAlign: "right" }}>
          <div style={{ fontSize: "11pt", fontWeight: 800 }}>{ownerName || "—"}</div>
          <div style={{ marginTop: "1mm", fontSize: "9.5pt", color: SUB }}>{[ownerNo, ownerSub].filter(Boolean).join(" ・ ") || " "}</div>
          <div style={{ marginTop: "0.8mm", fontSize: "8.5pt", color: FAINT }}>発行 {dateLabel} ・ GMOグローバルスタジオ</div>
        </div>
      </div>

      {/* 本文2段（左＝映像パッチ・右＝技術スタッフ） */}
      <div style={{ marginTop: "4mm", display: "flex", alignItems: "flex-start", gap: "8mm", flex: 1 }}>
        {showPatch && (
          <section style={{ width: both ? "58%" : "100%", flexShrink: 0 }}>
            <SectionHead title="映像パッチ" note={`${patchRows.length}行${extraCount > 0 ? ` ・ 増設機材 ${extraCount}` : ""}`} />
            {groups.length === 0 && <EmptyLine text="行がありません" />}
            {groups.map((g, gi) => (
              <div key={`${g.label}-${gi}`} style={{ marginTop: "2.5mm", breakInside: "avoid" }}>
                {g.label && (
                  <div style={{ borderBottom: `0.3mm solid ${INK}`, paddingBottom: "0.6mm", fontSize: "10pt", fontWeight: 800 }}>〈{g.label}〉</div>
                )}
                {g.lines.map((line, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "baseline", gap: "1.5mm", borderBottom: `0.2mm solid ${LINE}`, padding: "0.9mm 0" }}>
                    <span style={{ width: "4mm", flexShrink: 0, textAlign: "right", fontSize: "7.5pt", color: FAINT }}>{i + 1}</span>
                    <span style={{ minWidth: 0, flex: 1, fontSize: "10pt", lineHeight: 1.35 }}>{line}</span>
                  </div>
                ))}
              </div>
            ))}
            <div style={{ marginTop: "2mm", fontSize: "7.5pt", lineHeight: 1.6, color: SUB }}>
              ［ ］の中がパッチ番号。A段＝送り・B段＝受け。増設機材に番号はありません。
            </div>
          </section>
        )}

        {showStaff && (
          <section style={{ width: both ? "42%" : "100%", flexShrink: 0 }}>
            <SectionHead title="技術スタッフ" note={`${staffCount}人 ・ メンバー表より`} />
            {days.length === 0 && <EmptyLine text="行がありません" />}
            <div style={{ display: "flex", flexWrap: "wrap", gap: "2mm 6mm" }}>
              {days.map((d) => (
                <div key={d.date} style={{ flex: "1 1 46mm", minWidth: "46mm", breakInside: "avoid" }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: `0.3mm solid ${INK}`, paddingBottom: "0.6mm", marginTop: "2.5mm" }}>
                    <span style={{ fontSize: "10pt", fontWeight: 800 }}>{d.label}</span>
                    <span style={{ fontSize: "8pt", color: SUB }}>{d.count}人</span>
                  </div>
                  {d.roles.map((r, ri) => (
                    <div key={`${r.role}-${ri}`}>
                      <div style={{ marginTop: "1.4mm", fontSize: "9.5pt", fontWeight: 800, color: PRIMARY }}>{r.role || "（役職なし）"}</div>
                      {r.people.map((p, pi) => (
                        <div key={pi} style={{ display: "flex", alignItems: "baseline", gap: "1.5mm", borderBottom: `0.2mm solid ${LINE}`, padding: "0.5mm 0 0.5mm 2mm" }}>
                          <span style={{ minWidth: 0, flex: 1, fontSize: "10.5pt", fontWeight: 700 }}>{p.name}</span>
                          <span style={{ flexShrink: 0, fontSize: "8pt", color: SUB }}>{p.company}</span>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </section>
        )}

        {!showPatch && !showStaff && (
          <section style={{ flex: 1, textAlign: "center", padding: "20mm 0", fontSize: "11pt", color: FAINT }}>
            出す内容を選ぶと、ここに表示されます
          </section>
        )}
      </div>

      {/* 用紙の下端 */}
      <div style={{ marginTop: "4mm", display: "flex", alignItems: "center", borderTop: `0.2mm solid ${LINE}`, paddingTop: "1.8mm", fontSize: "8pt", color: FAINT }}>
        <span>{[ownerName, ownerNo].filter(Boolean).join(" ・ ")}</span>
        <span style={{ flex: 1 }} />
        <span>GMO ONAiR ・ 技術資料</span>
      </div>
    </div>
  );
}

function SectionHead({ title, note }: { title: string; note: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", gap: "2.5mm" }}>
      <span style={{ fontSize: "14pt", fontWeight: 800 }}>{title}</span>
      <span style={{ fontSize: "8.5pt", color: SUB }}>{note}</span>
    </div>
  );
}

function EmptyLine({ text }: { text: string }) {
  return <div style={{ marginTop: "2.5mm", fontSize: "9pt", color: FAINT }}>{text}</div>;
}
