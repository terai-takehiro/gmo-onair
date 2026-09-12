// 差し込みブロックの中身（`linked/*.tsx`）が共通で使う、ごく小さな防御的ヘルパー。
//
// ⚠️ resolvers（server 側）はまだこのファイルを書いている時点で実装されていない。
// `data` の実際の形を仮定せず、文字列・数値・配列を防御的に扱い、無い項目は出さない
// （担当分担のメモどおり — Integrate フェーズで実際の形に型を締める前提）。
import type { ReactNode } from "react";

/** 複数のキー候補を順に試し、最初に見つかった文字列・数値を文字列で返す。無ければ空文字 */
export function pick(obj: Record<string, unknown> | null | undefined, ...keys: string[]): string {
  if (!obj) return "";
  for (const k of keys) {
    const v = obj[k];
    if (typeof v === "string" && v.trim() !== "") return v;
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
    if (typeof v === "boolean") return v ? "はい" : "いいえ";
  }
  return "";
}

/** 値が配列でなければ空配列にする（各要素はプレーンオブジェクトのものだけ残す） */
export function asRecordArray(v: unknown): Record<string, unknown>[] {
  return Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === "object") : [];
}

/** `data` がプレーンオブジェクトならそのまま、そうでなければ空オブジェクト */
export function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** 「まだ何も無い」の共通表示。個別の文言だけ呼び出し側が決める */
export function LinkedEmpty({ text }: { text: string }): ReactNode {
  return (
    <div className="flex h-full w-full items-center justify-center p-2 text-center text-sub-sm text-muted-foreground">
      {text}
    </div>
  );
}

export interface Grid {
  columns: string[];
  /** 文字列のほか `<DateRange>` 等のセルも置ける（期間の桁ぞろえのため） */
  rows: ReactNode[][];
}

/** 表形式の差し込みブロックの共通描画。§6-5-1「表は既定で等幅」— `.font-number` を当てる */
export function LinkedGrid({ grid }: { grid: Grid }): ReactNode {
  return (
    <div className="h-full w-full overflow-auto p-1">
      <table className="font-number w-full border-collapse text-[10px] leading-tight">
        <thead>
          <tr>
            {grid.columns.map((c) => (
              <th key={c} className="whitespace-nowrap border-b border-border px-1 py-0.5 text-left font-medium text-muted-foreground">
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {grid.rows.map((row, i) => (
            <tr key={i} className="border-b border-border/60 align-top">
              {row.map((cell, j) => (
                <td key={j} className="px-1 py-0.5 text-foreground">
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
