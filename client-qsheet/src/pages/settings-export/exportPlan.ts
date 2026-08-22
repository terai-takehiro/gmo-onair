// 「Excel を書き出す」ダイアログの**判定と文言だけ**を集めた場所（画面を描かない）。
//
// ⚠️ **なぜ切り出したか**（監査 2026-08-22）
// ここの判定は**画面を見ても間違いに気づけない**類のものばかりで、実際に
//   ・見出しだけの見本を「見本」と呼んでいたため、**12台ぶん打ち込んだつもりで
//     中身が1行も入っていない Excel**が落ちてきても誰も気づけなかった
//   ・灰色（Excel に出ない台）を1件ずつ並べていたため、ENC が10台あると
//     **赤（現地で必ず弾かれるもの）が10行の灰色に埋もれて見えなかった**
// という事故が起きている。だから判定は React から離して `shared/tests/` で固定する
// （`shared/tests/deviceExportDialog.test.ts`）。
import type { PreflightIssue, PreviewSheet } from '@/lib/deviceSettingsApi';

export type Sheet = 'recording' | 'streaming';

/** シートの名前は**サーバーの `buildSheetSpecs` が付ける名前**と一字一句同じにする（突き合わせの鍵） */
export const RECORDING_SHEET_NAME = '収録設定';
export const STREAMING_SHEET_NAME = '配信設定';
export const GUIDE_SHEET_NAME = '入力ガイド';

/**
 * 選べるシート。説明文はモック（`mockups/tech-settings/Export.dc.html` の
 * `renderVals()` の `defs`）の文言をそのまま持ってきている。
 */
export const SHEET_DEFS: { key: Sheet; sheetName: string; label: string; desc: string }[] = [
  {
    key: 'recording',
    sheetName: RECORDING_SHEET_NAME,
    label: '収録設定',
    desc: 'HyperDeck 12台。デッキ／解像度／コーデック／音声ch／収録先／ファイル名',
  },
  {
    key: 'streaming',
    sheetName: STREAMING_SHEET_NAME,
    label: '配信設定',
    desc: 'ENC ごとの配信先。セッション名・プロトコル・宛先・キーほか',
  },
];

/**
 * 入力ガイドの説明。
 *
 * ⚠️ **モックでは3つ目のトグルだったが、外せる形にはしない。**
 * サーバーの `buildSheetSpecs` が「入力ガイドは常に付ける」（#279 §4-4）と決めており、
 * `?sheets=` も `recording` / `streaming` しか受け取らない。**外せるように見せると
 * 「外したのに入っている」**という、いちばん質の悪い食い違いになる。
 * いまは「必ず付きます」と書いて、中身の見本だけ他と同じように出す。
 */
export const GUIDE_SHEET_DESC =
  '決まりごとの説明。現地では読まれませんが、表を触る人のために必ず付けます';

/** 灰色（Excel に出ないもの）を1行にまとめたもの */
export interface GrayGroup {
  code: string;
  /** 「配信先が無いエンコーダー: ENC3, ENC5, ENC7（3台）」の1行 */
  text: string;
  count: number;
}

/**
 * 同じ理由の灰色は**1行にまとめる**。
 *
 * ⚠️ サーバーは ENC1〜10 のうち配信先が無い台を**1台につき1件**返す（`NO_DESTINATION`）。
 * 配信先を2台にしか作っていない普通の日でも8行並び、その下にある赤・橙が押し出されて
 * 見えなくなっていた。**赤・橙はまとめない** — 1件ずつ理由が違い、どれを直すかを
 * 選ぶのは人だから。灰色だけは「出ない」という結果が同じなのでまとめてよい。
 */
const GRAY_LABELS: Record<string, { label: string; unit: string }> = {
  NO_DESTINATION: { label: '配信先が無いエンコーダー', unit: '台' },
  UNKNOWN_ENCODER: { label: '想定外の ENC 番号', unit: '台' },
  DECK_SKIPPED: { label: '使わないと決めたデッキ', unit: '台' },
};

export function groupGray(gray: PreflightIssue[]): GrayGroup[] {
  const order: string[] = [];
  const byCode = new Map<string, PreflightIssue[]>();
  for (const issue of gray) {
    if (!byCode.has(issue.code)) {
      byCode.set(issue.code, []);
      order.push(issue.code);
    }
    byCode.get(issue.code)!.push(issue);
  }
  return order.map((code) => {
    const items = byCode.get(code)!;
    // 知らない code が増えても黙って消えないよう、そのときは元の文をラベルに使う
    const known = GRAY_LABELS[code];
    const label = known?.label ?? items[0].message;
    const unit = known?.unit ?? '件';
    const wheres = items.map((i) => i.where).join(', ');
    return { code, count: items.length, text: `${label}: ${wheres}（${items.length}${unit}）` };
  });
}

/**
 * 見本に出すシートを選ぶ。
 *
 * ⚠️ 本来はサーバーが `?sheets=` を見て必要なシートだけ返すが、**選択を変えた直後の
 * 一瞬は前の結果が残る**（点検を引き直している最中）。そのとき「外したはずのシートの見本」が
 * 出たままだと、外したのか外れていないのか読み手には区別が付かない。画面側でも同じ条件で
 * 絞って、**古い結果でも選択と食い違わない**ようにする。入力ガイドは常に付く。
 */
export function visiblePreviewSheets(preview: PreviewSheet[], sheets: Sheet[]): PreviewSheet[] {
  const wanted = new Set<string>([GUIDE_SHEET_NAME]);
  for (const def of SHEET_DEFS) if (sheets.includes(def.key)) wanted.add(def.sheetName);
  return preview.filter((s) => wanted.has(s.name));
}

/**
 * 何枚目のシートかを返す（選んだ順ではなく**サーバーが並べる順**）。
 * 現地の Assistant は**1枚目しか読まない**ので、どれが1枚目かは必ず画面に出す。
 */
export function sheetPosition(preview: PreviewSheet[], name: string): number | null {
  const i = preview.findIndex((s) => s.name === name);
  return i < 0 ? null : i + 1;
}
