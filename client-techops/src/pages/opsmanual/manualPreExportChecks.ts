// 運営マニュアル — 出す前の検査（段D・production-manual.md §6⑤「出す前の検査」）。
//
// 書き出しボタンを押す前に6種の検査結果を画面に出す（4種＝§6⑤の表。残る2種は
// 体制図ブロック向けに足した「名前の無い階層・人」（production-manual-orgchart.md §7）と
// 「中身が入りきらないかもしれない体制図」）。**止めない**——
// 呼び出し側はこの結果を見せた上で「このまま書き出す」を必ず押せるようにする
// （§6⑤「止めはしない」）。DOM を一切測定しない純粋関数。
import type {
  ManualBlock,
  ManualFreeBlock,
  ManualOrgChartContent,
  ManualPage,
} from "@gmo-onair/shared/src/opsmanual/types";
import { PAGE_HEIGHT_MM, PAGE_WIDTH_MM } from "@gmo-onair/shared/src/opsmanual/types";
import type { ManualResolveEntry } from "@/lib/manualResolveApi";

export interface ManualPreExportIssue {
  pageId: string;
  pageTitle: string;
  blockId: string;
}

export interface ManualPreExportChecks {
  /** 紙からはみ出すブロック */
  overflowing: ManualPreExportIssue[];
  /** 中身が空のブロック */
  emptyBlocks: ManualPreExportIssue[];
  /** 元の資料が消えたブロック（差し込みブロックのみ） */
  missingSource: ManualPreExportIssue[];
  /** 差し込み元が変わったまま（確定済み＝ `link.frozen` があるブロックのみ。
   *  段Dでは `frozen` が常に null のためこの配列は常に空になる ——
   *  それが正しい挙動。段Eで `frozen` が入るようになった瞬間に効き始める） */
  staleSource: ManualPreExportIssue[];
  /** 名前の無い階層・名前の無い人が残っている体制図ブロック
   *  （production-manual-orgchart.md §7。**人が0人のチームは対象外**） */
  unnamedOrgEntries: ManualPreExportIssue[];
  /** 中身がブロックの高さに入りきらない**かもしれない**体制図ブロック。
   *  粗い見積り（`estimateOrgChartHeightMm`）なので「必ず切れる」とは言わない */
  orgChartMayOverflow: ManualPreExportIssue[];
}

/**
 * 紙からはみ出すブロックの判定（§6⑤の表の1つ目）。`ManualPrintDocument.tsx` の
 * プレビュー画面（出す前の検査の視覚表現・赤い斜線）も同じ判定を使う（Integrate:
 * この関数1つが正——検査の一覧とプレビューのハイライトで判定がずれないようにする）。
 *
 * ⚠️ 回転は無視した外接矩形（x/y/w/h）で判定する。回転を考慮した厳密な判定
 * （回転後の実際の頂点座標から外接矩形を求め直す）は今回の範囲外の割り切り
 * ——段Dの設計判断どおり。
 */
export function isOverflowingManualBlock(block: ManualBlock): boolean {
  return block.x < 0 || block.y < 0 || block.x + block.w > PAGE_WIDTH_MM || block.y + block.h > PAGE_HEIGHT_MM;
}

/**
 * 自由ブロックの「空」判定。種類ごとに定義が違う（設計判断の「5. 出す前の検査」の
 * とおり）。図形には「空」の概念が無いので対象外（常に false）。
 */
function isFreeBlockEmpty(block: ManualFreeBlock): boolean {
  switch (block.free.type) {
    case "text":
      return block.free.content.text.trim() === "";
    case "image":
      return block.free.content.url.trim() === "";
    case "table":
      return block.free.content.rows.every((row) => row.every((cell) => cell.trim() === ""));
    case "qr":
      return block.free.content.value.trim() === "";
    case "shape":
      return false;
    case "orgchart":
      return isOrgChartEmpty(block.free.content);
    default:
      return false;
  }
}

/** 前後の空白を除いて中身が無いか（体制図は任意の欄が多いので `undefined` も空として扱う） */
function isBlankText(value: string | undefined): boolean {
  return (value ?? "").trim() === "";
}

/**
 * 体制図の「空」判定（production-manual-orgchart.md §3）。表ブロックの「全セルが空文字なら空」と
 * 同じ考え方で、**紙に出る文字が1つも無ければ空**とする（階層の名前・チーム名・チームの所属・
 * 人のどの欄も空）。置いた直後の「名前の無い階層が1つだけ」（§5-1）はこれに当たる。
 */
function isOrgChartEmpty(content: ManualOrgChartContent): boolean {
  return content.tiers.every(
    (tier) =>
      isBlankText(tier.label) &&
      tier.boxes.every(
        (box) =>
          isBlankText(box.label) &&
          isBlankText(box.org) &&
          box.people.every(
            (person) =>
              isBlankText(person.name) &&
              isBlankText(person.role) &&
              isBlankText(person.org) &&
              isBlankText(person.phone) &&
              isBlankText(person.email) &&
              isBlankText(person.badge),
          ),
      ),
  );
}

/**
 * 体制図に「名前の無い階層」「名前の無い人」が残っているか（production-manual-orgchart.md §7）。
 *
 * ⚠️ **人が0人のチームは対象外**。「音声 ── 調整中」のように人が決まっていないチームを
 * 意図して紙に出せる、というのが体制図の設計（§3-1）なので、空のチームを不備として数えない。
 * チーム名が空なだけのチームも数えない（§7 が挙げているのは階層と人の2つだけ）。
 */
function hasUnnamedOrgEntry(content: ManualOrgChartContent): boolean {
  return content.tiers.some(
    (tier) => isBlankText(tier.label) || tier.boxes.some((box) => box.people.some((person) => isBlankText(person.name))),
  );
}

// ── 体制図が入りきらないかもしれない（外部レビュー・P2） ──────────────────────
//
// キャンバス側（`blocks/OrgChartBlockContent.tsx` の根）は `overflow-auto`、印刷側
// （`ManualPrintDocument.tsx` の `PrintBlock`）は `overflow: hidden`。人を足していくと
// **キャンバスではスクロールで見えるのに、紙では下の人が黙って消える**。`isOverflowingManualBlock`
// はブロックの外形（x/y/w/h）と紙しか見ないので、この事故は検査にも出てこなかった。
//
// **DOM を測らない方針は保ったまま**、実装の文字サイズから逆算した粗い容量の見積りを足し、
// 「紙からはみ出すブロック」と同じ並び（＝出す前の検査の一覧）に別の1本として合流させる。
// ⚠️ 既存の `overflowing` に混ぜないのは、①こちらは「必ず切れる」ではなく「かもしれない」で
// 確度が違う ②`ManualPrintDocument.tsx` の赤い斜線は `isOverflowingManualBlock` と
// 1対1（混ぜるとハッチの出ない行が一覧に並ぶ）——の2点。

/** CSS の mm ⇄ px（96px/inch。`ManualPreviewPage.tsx` の `MM_TO_PX` と同じ換算・§8-3） */
const PX_PER_MM = 96 / 25.4;

/**
 * 行の高さの係数。`--line-height-jp`（`shared/src/client/tokens.css`）の 1.75。
 * 体制図の文字は `text-[10px]` のような Tailwind の任意値＝**font-size しか指定しない**ので、
 * 行間は body から継承する。スマホ幅の 1.6 上書き（`tokens-v4.css` の
 * `@media (max-width: 1023px)`）は A4横（297mm ≒ 1122px）には当たらない。
 */
const LINE_HEIGHT_JP = 1.75;

/**
 * 階層の見出し1本ぶん（px）。`OrgChartBlockContent.tsx` の
 * `text-[10.5px] font-extrabold` の1行 ＋ `mb-1`(4px)。
 */
const TIER_HEADER_PX = 10.5 * LINE_HEIGHT_JP + 4;

/** 階層のあいだの縦罫 `h-4`(16px)。縦罫を切ってあるときは詰め物の `h-2`(8px) */
const TIER_GAP_PX = 16;
const TIER_GAP_NO_CONNECTOR_PX = 8;

/**
 * チーム1枚の「人の行以外」ぶん（px）。`orgchart/OrgChartTeamBox.tsx` の
 * 枠 `border`(1+1) ＋ 見出し（`text-[10px]` の1行 ＋ `py-0.5`(2+2) ＋ `border-b`(1)）
 * ＋ 中身の `pt-0.5`(2) と `pb-1`(4)。
 */
const TEAM_CHROME_PX = 1 + 1 + (10 * LINE_HEIGHT_JP + 2 + 2 + 1) + 2 + 4;

/** 人1行（px）。`text-[10px]` の1行 ＋ `py-px`(1+1) */
const PERSON_ROW_PX = 10 * LINE_HEIGHT_JP + 1 + 1;

/**
 * 人が0人のチームに出る「まだ決まっていません」（px）。
 * `text-[9px]` の1行 ＋ `py-0.5`(2+2) ＋ 破線の枠(1+1)。
 */
const EMPTY_TEAM_NOTE_PX = 9 * LINE_HEIGHT_JP + 2 + 2 + 1 + 1;

/**
 * 体制図の中身の高さの**粗い見積り**（mm）。DOM は測らない（純粋関数）。
 *
 * 数えるのは**未選択＝紙に出る側の描画だけ**。選択中しか出ないもの（＋階層 / ＋チーム /
 * ＋人のボタン・人数・「まだチームがありません」）は紙に出ないので数えない。
 * 同じ階層のチームは横に並ぶ（`flex items-start`）ので、その階層の高さは
 * **いちばん高い1枚**で決まる（人数の合計ではない）。
 *
 * ⚠️ **粗い見積り**。①文字の折り返し（長い氏名、チームが多くて1枚が細くなる場合）
 * ②`block.style` の `font-size` 上書き ③`show` を増やしたときの折り返し——は見ていない。
 * どれも実際の高さを**増やす**方向なので、この見積りは**少なめに出る**（＝見逃す側に倒れる）。
 * だから呼び出し側の文言も「入りきらないかもしれない」で、「必ず切れる」とは言わない。
 */
export function estimateOrgChartHeightMm(content: ManualOrgChartContent): number {
  const tiers = content.tiers ?? [];
  if (tiers.length === 0) return 0;
  const gapPx = (content.connectors ?? true) ? TIER_GAP_PX : TIER_GAP_NO_CONNECTOR_PX;

  let px = 0;
  tiers.forEach((tier, i) => {
    if (i > 0) px += gapPx;
    px += TIER_HEADER_PX;
    const boxes = tier.boxes ?? [];
    // チームが0枚の階層は見出しだけ（紙には何も出ない）＝ 0 のまま
    px += boxes.reduce((tallest, box) => {
      const people = box.people?.length ?? 0;
      const bodyPx = people > 0 ? people * PERSON_ROW_PX : EMPTY_TEAM_NOTE_PX;
      return Math.max(tallest, TEAM_CHROME_PX + bodyPx);
    }, 0);
  });
  return px / PX_PER_MM;
}

/** 中身がブロックの高さに入りきらない**かもしれない**か（粗い見積り。断定しない） */
function mayOverflowOrgChart(content: ManualOrgChartContent, blockHeightMm: number): boolean {
  return estimateOrgChartHeightMm(content) > blockHeightMm;
}

/**
 * `sheet.rundown`/`sheet.excerpt` の行数。`SheetLinkedContent.tsx` の
 * `normalizeRows` と同じ3形（`{rows:[...]}` / `{sections:[{rows:[...]}]}` / 素の配列）
 * のどれでも読む——描画側と判定がずれないように同じ規則にする。
 */
function sheetRowCount(data: unknown): number {
  if (Array.isArray(data)) return data.length;
  if (!data || typeof data !== "object") return 0;
  const obj = data as Record<string, unknown>;
  if (Array.isArray(obj.rows)) return obj.rows.length;
  if (Array.isArray(obj.sections)) {
    return (obj.sections as unknown[]).reduce((sum: number, s) => {
      const rows = s && typeof s === "object" ? (s as Record<string, unknown>).rows : undefined;
      return sum + (Array.isArray(rows) ? rows.length : 0);
    }, 0);
  }
  return 0;
}

/**
 * 差し込みブロックの「空」判定（設計判断の「5. 出す前の検査」の2.）。
 *
 * ⚠️⚠️ 外部レビュー再指摘（P1）: 以前は `data` が持つキーの**個数**だけを見ていた——
 * ほとんどの resolver は行の配列を1個のキーに包んで返す（`{ destinations: [] }`
 * `{ decks: [] }` `{ groups: [] }` `{ items: [] }` 等。`DeviceLinkedContent.tsx`/
 * `ScheduleLinkedContent.tsx`/`SheetLinkedContent.tsx` の描画側と同じ形）ため、
 * 中身（配列）が空でも外側のオブジェクトは1キー持っており「空でない」と誤判定して
 * いた——差し込み元の行を全部消しても検査が気づけなかった。ブロック種別ごとに
 * resolver の戻り値の形を理解し、包んだ配列そのものの長さを見るようにする
 * （描画側が「空」として `LinkedEmpty` を出す条件と一致させる）。
 */
function isResolvedDataEmpty(blockKey: string, data: unknown): boolean {
  if (data === null || data === undefined) return true;
  if (Array.isArray(data)) return data.length === 0; // project.team（素の配列）

  if (typeof data !== "object") return false;
  const obj = data as Record<string, unknown>;

  switch (blockKey) {
    case "schedule.day":
    case "schedule.loadInOut":
      return !Array.isArray(obj.items) || obj.items.length === 0;
    case "sheet.rundown":
    case "sheet.excerpt":
      return sheetRowCount(data) === 0;
    case "sheet.micAssignment":
      return !Array.isArray(obj.assignments) || obj.assignments.length === 0;
    case "recording.list":
      return !Array.isArray(obj.decks) || obj.decks.length === 0;
    case "streaming.list":
      return !Array.isArray(obj.destinations) || obj.destinations.length === 0;
    case "streaming.webMeeting":
      return !Array.isArray(obj.meetings) || obj.meetings.length === 0;
    case "rental.list": {
      const groups = Array.isArray(obj.groups) ? (obj.groups as unknown[]) : [];
      return groups.every((g) => {
        const lines = g && typeof g === "object" ? (g as Record<string, unknown>).lines : undefined;
        return !Array.isArray(lines) || lines.length === 0;
      });
    }
    case "equipment.lending": {
      const rows = obj.rows ?? obj.lendings;
      return !Array.isArray(rows) || rows.length === 0;
    }
    default:
      // project.heading・未知の種別は従来どおり「フィールドが1つも無ければ空」
      // （project.resolver.ts は無い項目をキーごと省く契約のため、これで一致する）
      return Object.keys(obj).length === 0;
  }
}

/**
 * 出す前の検査（6種・production-manual.md §6⑤ の4種 ＋ 体制図の
 * production-manual-orgchart.md §7 と「入りきらないかもしれない」）。呼び出し側はこの結果を
 * 見せるだけで、書き出しボタン自体は常に押せる状態のままにする。
 *
 * 検査どうしは独立していて、1つのブロックが複数の配列に入ってよい
 * （はみ出しかつ空、置いた直後の体制図なら空かつ名前の無い階層あり、など）。
 */
export function runManualPreExportChecks(
  pages: ManualPage[],
  resolved: Record<string, ManualResolveEntry>,
): ManualPreExportChecks {
  const overflowing: ManualPreExportIssue[] = [];
  const emptyBlocks: ManualPreExportIssue[] = [];
  const missingSource: ManualPreExportIssue[] = [];
  const staleSource: ManualPreExportIssue[] = [];
  const unnamedOrgEntries: ManualPreExportIssue[] = [];
  const orgChartMayOverflow: ManualPreExportIssue[] = [];

  for (const page of pages) {
    for (const block of page.blocks) {
      const issue: ManualPreExportIssue = { pageId: page.id, pageTitle: page.title, blockId: block.id };

      if (isOverflowingManualBlock(block)) overflowing.push(issue);

      if (block.kind === "free") {
        if (isFreeBlockEmpty(block)) emptyBlocks.push(issue);
        if (block.free.type === "orgchart") {
          if (hasUnnamedOrgEntry(block.free.content)) unnamedOrgEntries.push(issue);
          if (mayOverflowOrgChart(block.free.content, block.h)) orgChartMayOverflow.push(issue);
        }
        continue;
      }

      // ここから kind === 'linked'（差し込みブロック）
      const entry = resolved[block.id];

      if (entry?.error) {
        // 元の資料が消えた（source_missing・access_denied 等）。種類を問わず「消えた」扱い
        missingSource.push(issue);
      } else if (isResolvedDataEmpty(block.link.block, entry?.data)) {
        emptyBlocks.push(issue);
      }

      // 差し込み元が変わったまま。`link.frozen` がある（=確定済み）ときだけ見る
      // （今回`frozen`は常にnullのため、この分岐には到達しない＝常に0件。正しい挙動）
      if (block.link.frozen && entry?.updatedAt) {
        const frozenAt = new Date(block.link.frozen.at).getTime();
        const updatedAt = new Date(entry.updatedAt).getTime();
        if (Number.isFinite(frozenAt) && Number.isFinite(updatedAt) && updatedAt > frozenAt) {
          staleSource.push(issue);
        }
      }
    }
  }

  return { overflowing, emptyBlocks, missingSource, staleSource, unnamedOrgEntries, orgChartMayOverflow };
}
