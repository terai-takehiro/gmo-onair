// schedule.day（当日の流れ）・schedule.loadInOut（搬入出）の中身描画（段C）。
//
// 資料メモにあるとおり、resolver は MCP `get_day_schedule`（DayScheduleResult）と
// 同じ形（columns/items）で読む想定だが、まだ実装されていないため型は断定せず、
// キーが無い・型が違っても崩れないよう防御的に読む。schedule.loadInOut は
// サーバー側でタイトル一致（「搬入」「搬出」）まで絞り込んで渡ってくる前提
// （v1 の制約。分の一致で絞れないため）— ここでは受け取った行をそのまま出すだけ。
import { asRecord, asRecordArray, pick, LinkedEmpty, LinkedGrid, type Grid } from "./sharedLinkedContent";

interface Props {
  blockKey: "schedule.day" | "schedule.loadInOut";
  data: unknown;
  options: Record<string, unknown>;
}

function minToText(v: unknown): string {
  if (typeof v !== "number" || !Number.isFinite(v)) return "";
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeStrToMin(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{1,2}:\d{2}$/.test(v)) return null;
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
}

export default function ScheduleLinkedContent({ blockKey, data, options }: Props) {
  const obj = asRecord(data);
  const columns = asRecordArray(obj.columns);
  const items = asRecordArray(obj.items);
  const columnLabel = new Map(columns.map((c) => [pick(c, "id"), pick(c, "label") || pick(c, "roomName", "room_name")]));

  // 「時間帯」（options.startTime/endTime）で絞る。schedule.day だけが持つ設定（未指定なら全件）
  const startFilter = timeStrToMin(options.startTime);
  const endFilter = timeStrToMin(options.endTime);
  const filtered = items.filter((it) => {
    const startMin = typeof it.startMin === "number" ? it.startMin : typeof it.start_min === "number" ? (it.start_min as number) : null;
    if (startMin == null || (startFilter == null && endFilter == null)) return true;
    if (startFilter != null && startMin < startFilter) return false;
    if (endFilter != null && startMin > endFilter) return false;
    return true;
  });

  if (filtered.length === 0) {
    return <LinkedEmpty text={blockKey === "schedule.loadInOut" ? "搬入・搬出の予定はありません" : "予定はありません"} />;
  }

  const grid: Grid = {
    columns: ["時間", "列", "項目", "担当"],
    rows: filtered.map((it) => {
      const start = pick(it, "startText", "start_text") || minToText(it.startMin ?? it.start_min);
      const end = pick(it, "endText", "end_text") || minToText(it.endMin ?? it.end_min);
      const col = columnLabel.get(pick(it, "columnId", "column_id")) ?? "";
      // 日付の期間ではなく時刻の範囲なので <DateRange> の対象外（ApplyTemplateDialog.tsx と同じ扱い）
      const time = end ? `${start}〜${end}` : start; // ui-tokens-ok
      return [time, col, pick(it, "title"), pick(it, "assignee")];
    }),
  };
  return <LinkedGrid grid={grid} />;
}
