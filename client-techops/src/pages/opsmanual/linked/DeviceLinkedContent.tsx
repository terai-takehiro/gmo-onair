// recording.list（収録の一覧）・streaming.list（配信先の一覧）・streaming.webMeeting
// （WEB会議）・rental.list（借りる機材）・equipment.lending（持ち出す機材）の中身描画（段C）。
// 表形式のミニアプリ差し込みブロックをまとめて扱う（`defaultTabular: true` が多いため）。
//
// ⚠️ 秘密の伏せ字化は resolver 側の仕事（§7-2）— ここは resolver が返した文字列を
// そのまま出すだけで、平文/伏せ字の判断はしない（二重に伏せない・誤って平文を隠さない）。
import { asRecord, asRecordArray, pick, LinkedEmpty, LinkedGrid, type Grid } from "./sharedLinkedContent";
import { DateRange } from "@gmo-onair/shared/src/client/ui/dateRange";
import type { ManualLinkedBlockKey } from "@gmo-onair/shared/src/production/manualBlocks";

type DeviceBlockKey = Extract<
  ManualLinkedBlockKey,
  "recording.list" | "streaming.list" | "streaming.webMeeting" | "rental.list" | "equipment.lending"
>;

interface Props {
  blockKey: DeviceBlockKey;
  data: unknown;
}

function recordingGrid(data: unknown): Grid {
  const decks = asRecordArray(asRecord(data).decks);
  return {
    columns: ["デッキ", "形式", "コーデック", "保存先"],
    rows: decks.map((d) => [
      pick(d, "label", "deckId", "deck_id"),
      pick(d, "videoFormat", "video_format"),
      pick(d, "codec"),
      pick(d, "slot", "filePrefix", "file_prefix"),
    ]),
  };
}

function streamingListGrid(data: unknown): Grid {
  const dests = asRecordArray(asRecord(data).destinations);
  return {
    columns: ["ENC", "セッション名", "方式", "行き先", "鍵"],
    rows: dests.map((d) => {
      // resolver が `reveal` を通していれば平文の `streamKey` が、そうでなければ
      // `streamKeyMasked`（既存の伏せ字の作法）が来る想定。どちらもそのまま出す
      const key = pick(d, "streamKey", "stream_key") || pick(d, "streamKeyMasked", "stream_key_masked");
      return [pick(d, "encoderId", "encoder_id"), pick(d, "name"), pick(d, "protocol"), pick(d, "url"), key];
    }),
  };
}

function webMeetingGrid(data: unknown): Grid {
  const meetings = asRecordArray(asRecord(data).meetings);
  return {
    columns: ["ツール", "URL", "入室ID", "パスコード"],
    rows: meetings.map((m) => [
      pick(m, "tool") || pick(m, "toolOther", "tool_other"),
      pick(m, "url"),
      pick(m, "joinId", "join_id"),
      pick(m, "passcode"),
    ]),
  };
}

function rentalGrid(data: unknown): Grid {
  const groups = asRecordArray(asRecord(data).groups);
  const lines = groups.flatMap((g) => asRecordArray(g.lines).map((line) => ({ ...line, company: line.company ?? g.company })));
  return {
    columns: ["会社", "品目", "数量", "受渡し"],
    rows: lines.map((l) => {
      const start = pick(l, "startDate", "start_date");
      const end = pick(l, "endDate", "end_date");
      return [
        pick(l, "company"),
        pick(l, "itemName", "item_name"),
        pick(l, "quantity"),
        <DateRange key="range" start={start || null} end={end || null} short />,
      ];
    }),
  };
}

function equipmentGrid(data: unknown): Grid {
  const rows = asRecordArray(Array.isArray(data) ? data : asRecord(data).rows ?? asRecord(data).lendings);
  return {
    columns: ["機材", "持出者", "貸出日", "返却期限"],
    rows: rows.map((r) => [
      pick(r, "equipmentName", "equipment_name"),
      pick(r, "borrowerName", "borrower_name"),
      pick(r, "lentAt", "lent_at"),
      pick(r, "dueDate", "due_date"),
    ]),
  };
}

const EMPTY_TEXT: Record<DeviceBlockKey, string> = {
  "recording.list": "収録の一覧がありません",
  "streaming.list": "配信先の一覧がありません",
  "streaming.webMeeting": "WEB会議の情報がありません",
  "rental.list": "借りる機材がありません",
  "equipment.lending": "持ち出す機材がありません",
};

function buildGrid(blockKey: DeviceBlockKey, data: unknown): Grid {
  switch (blockKey) {
    case "recording.list":
      return recordingGrid(data);
    case "streaming.list":
      return streamingListGrid(data);
    case "streaming.webMeeting":
      return webMeetingGrid(data);
    case "rental.list":
      return rentalGrid(data);
    case "equipment.lending":
      return equipmentGrid(data);
  }
}

export default function DeviceLinkedContent({ blockKey, data }: Props) {
  const grid = buildGrid(blockKey, data);
  if (grid.rows.length === 0) return <LinkedEmpty text={EMPTY_TEXT[blockKey]} />;
  return <LinkedGrid grid={grid} />;
}
