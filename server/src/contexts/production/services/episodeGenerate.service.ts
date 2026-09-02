/**
 * 回の一括生成 — 「頻度 × 期間 × 1日あたりの本数」で日付を組み立てる
 * （`docs/design/v4/regular-series.md` §7・§10 の5番目）
 *
 * ── 既存 `/episodes/batch` とは別口にした理由 ──────────────────────
 *
 * `/episodes/batch` は「件数か話数を明示指定」だけを受ける口で、GLS-B の
 * 月次以外の単発追加・MCP など**既存の呼び出し元がある**。頻度・日付計算を
 * 混ぜ込むと挙動が変わってしまうため、日付を組み立てる新しい入口
 * （`POST /:projectId/episodes/generate`）を別に立てた。番号の採番・
 * 重複チェック・トランザクションの作法は `/episodes/batch` と揃える
 * （このファイルは「どの日にいくつ作るか」の計画だけを持つ。DB アクセスは
 * ルート側 `episodes.routes.ts` に置く）。
 *
 * ── ここに置くのは日付計算と、既存行との突き合わせ計算だけ（DB そのものは読まない） ─
 *
 * 「その日は既に回があるか」はプロジェクトの実データを見ないと分からないので、
 * ここでは判定しない。`planEpisodeDates()` は**計画**（どの日に何本作りたいか）
 * だけを返す。実データの行（`recording_date` の一覧）を渡して突き合わせる
 * `resolvePlan()` はこのファイルに置く（DB へのクエリ自体はルート側の役目・
 * ここは受け取った行を数えるだけの純関数）。
 *
 * `shared/src/production/episodeSpec.ts` 側に複製しない — この日付計算は
 * 画面が直接使わない（プレビューは dry_run 経由でサーバーから取得する設計。
 * クライアント側で同じ計算を再実装すると2つ目の置き場ができてズレるリスクが
 * あるため、あえて複製しない）。
 */

/** 収録日の繰り返し方。'none' は日付を手で複数指定するモード */
export type EpisodeCadence = 'weekly' | 'biweekly' | 'monthly_nth_weekday' | 'none';

export interface GeneratePlanInput {
  cadence: EpisodeCadence;
  /** weekly / biweekly / monthly_nth_weekday で必須。最初の収録日 (YYYY-MM-DD) */
  start_date?: string | null;
  /** cadence === 'none' のとき必須。手で並べた収録日の一覧 (YYYY-MM-DD の配列) */
  dates?: string[] | null;
  /** 1日あたりの本数。既定1 */
  per_day_count: number;
  /** 終了条件A: 作る回の総数（1日あたりの本数を跨いで数える） */
  count?: number | null;
  /** 終了条件B: この日以前（含む）で打ち切る */
  end_date?: string | null;
}

/** 計画した1日ぶん。`take` はその日に作りたい本数（1〜per_day_count） */
export interface PlannedDate {
  date: string;
  take: number;
}

export class EpisodeGenerateError extends Error {}

/** 一度の生成で計画できる回の上限（既存 `/batch` の上限に揃える） */
export const MAX_GENERATE_EPISODES = 100;
/** 日付を歩く回数の上限（無限ループ防止。月次第N◯曜日が存在しない月をまたいでも安全な余裕を持たせる） */
const MAX_CADENCE_STEPS = 400;

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function assertIsoDate(value: string, label: string): void {
  if (!ISO_DATE_RE.test(value) || Number.isNaN(Date.parse(`${value}T00:00:00Z`))) {
    throw new EpisodeGenerateError(`${label}は YYYY-MM-DD 形式で指定してください（入力: "${value}"）`);
  }
}

function toUtcDate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function toIso(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number): string {
  const d = toUtcDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIso(d);
}

/** その月の「第n◯曜日」を返す。存在しない月（例: 第5金曜日が無い月）は null */
function nthWeekdayOfMonth(year: number, month1to12: number, weekday: number, n: number): string | null {
  const first = new Date(Date.UTC(year, month1to12 - 1, 1));
  const firstWeekday = first.getUTCDay();
  const day = 1 + ((weekday - firstWeekday + 7) % 7) + (n - 1) * 7;
  const daysInMonth = new Date(Date.UTC(year, month1to12, 0)).getUTCDate();
  if (day > daysInMonth) return null;
  return toIso(new Date(Date.UTC(year, month1to12 - 1, day)));
}

/** `startIso` を1本目として、`cadence` に従って以降の収録日を歩くイテレータ */
function* walkCadenceDates(cadence: Exclude<EpisodeCadence, 'none'>, startIso: string): Generator<string> {
  yield startIso;

  if (cadence === 'weekly' || cadence === 'biweekly') {
    const step = cadence === 'weekly' ? 7 : 14;
    let cur = startIso;
    for (let i = 0; i < MAX_CADENCE_STEPS; i++) {
      cur = addDays(cur, step);
      yield cur;
    }
    return;
  }

  // monthly_nth_weekday: 開始日の曜日・「第何」を種にして、以降は月を1つずつ進める
  const start = toUtcDate(startIso);
  const weekday = start.getUTCDay();
  const n = Math.floor((start.getUTCDate() - 1) / 7) + 1;
  let year = start.getUTCFullYear();
  let month = start.getUTCMonth() + 1; // 1-12
  for (let i = 0; i < MAX_CADENCE_STEPS; i++) {
    month += 1;
    if (month > 12) { month = 1; year += 1; }
    const iso = nthWeekdayOfMonth(year, month, weekday, n);
    // 存在しない月（第5◯曜日が無い等）は飛ばして次の月へ進む — 何も生成しない
    if (iso) yield iso;
  }
}

/**
 * 「頻度 × 期間 × 1日あたりの本数」から、作りたい収録日と本数の計画を組み立てる。
 *
 * - `count` 指定: 作る回の**総数**（1日あたりの本数を跨いで数える）に達するまで
 *   日付を歩く。最後の日は残り本数だけ（例: 1日2本・残り1本なら最後の日は1本）
 * - `end_date` 指定: その日を超えるまで日付を歩く。各日は必ず `per_day_count` 本
 * - `cadence: 'none'`: `dates` に並べた日付をそのまま使う。各日 `per_day_count` 本
 *   （`count`/`end_date` はこのモードでは見ない — 並べた日付そのものが終了条件のため）
 */
export function planEpisodeDates(input: GeneratePlanInput): PlannedDate[] {
  const perDayCount = Math.trunc(input.per_day_count);
  if (!Number.isFinite(perDayCount) || perDayCount < 1) {
    throw new EpisodeGenerateError('1日あたりの本数は1以上の整数で指定してください');
  }
  if (perDayCount > MAX_GENERATE_EPISODES) {
    throw new EpisodeGenerateError(`1日あたりの本数が多すぎます（上限${MAX_GENERATE_EPISODES}）`);
  }

  if (input.cadence === 'none') {
    const dates = input.dates ?? [];
    if (dates.length === 0) throw new EpisodeGenerateError('収録日を1件以上指定してください');
    const seen = new Set<string>();
    const sorted = [...dates].sort();
    const plan: PlannedDate[] = [];
    for (const d of sorted) {
      assertIsoDate(d, '収録日');
      if (seen.has(d)) throw new EpisodeGenerateError(`同じ収録日を2回指定しています（${d}）`);
      seen.add(d);
      plan.push({ date: d, take: perDayCount });
    }
    assertTotalWithinLimit(plan);
    return plan;
  }

  if (!input.start_date) throw new EpisodeGenerateError('開始日を指定してください');
  assertIsoDate(input.start_date, '開始日');

  const hasCount = input.count !== undefined && input.count !== null;
  const hasEndDate = !!input.end_date;
  if (hasCount === hasEndDate) {
    // 両方指定・両方未指定のどちらもエラー（「どちらか」を強制する — 設計文書 §7）
    throw new EpisodeGenerateError('終了条件は「回数」か「終了日」のどちらか一方を指定してください');
  }

  const plan: PlannedDate[] = [];

  if (hasCount) {
    const count = Math.trunc(input.count as number);
    if (!Number.isFinite(count) || count < 1) {
      throw new EpisodeGenerateError('回数は1以上の整数で指定してください');
    }
    if (count > MAX_GENERATE_EPISODES) {
      throw new EpisodeGenerateError(`一度に作成できるのは${MAX_GENERATE_EPISODES}件までです`);
    }
    let remaining = count;
    for (const date of walkCadenceDates(input.cadence, input.start_date)) {
      if (remaining <= 0) break;
      const take = Math.min(perDayCount, remaining);
      plan.push({ date, take });
      remaining -= take;
    }
    if (remaining > 0) {
      // monthly_nth_weekday が MAX_CADENCE_STEPS 以内に必要な本数へ届かなかった
      // （通常は起きない・保険）
      throw new EpisodeGenerateError('指定した回数ぶんの日付を組み立てられませんでした。開始日・頻度を確かめてください');
    }
  } else {
    const endDate = input.end_date as string;
    assertIsoDate(endDate, '終了日');
    if (endDate < input.start_date) {
      throw new EpisodeGenerateError('終了日は開始日以降にしてください');
    }
    for (const date of walkCadenceDates(input.cadence, input.start_date)) {
      if (date > endDate) break;
      plan.push({ date, take: perDayCount });
    }
    assertTotalWithinLimit(plan);
  }

  return plan;
}

function assertTotalWithinLimit(plan: PlannedDate[]): void {
  const total = plan.reduce((sum, p) => sum + p.take, 0);
  if (total > MAX_GENERATE_EPISODES) {
    throw new EpisodeGenerateError(`一度に作成できるのは${MAX_GENERATE_EPISODES}件までです（指定では${total}件）`);
  }
}

/**
 * 案件が生放送を含むか。
 *
 * v4 フォーム（`BroadcastSection.tsx`）は複数選択をカンマ結合した文字列
 * （例: "live,recording"）として `projects.broadcast_type` に保存するため、
 * 完全一致ではなくカンマ区切りの中に対象値が含まれるかで判定する
 * （旧実装は `=== 'live'` の完全一致で、複数選択の案件では黙って外れていた）。
 *
 * ⚠️ **`resolveBroadcastDate` と対で使う規則なので、同じファイルに置く。**
 * 元は `routes/episodes.routes.ts` にあったが、`episodeDated.service.ts`
 * （サービス）からも要るようになり、ルート→サービス→ルートの循環 import に
 * なるためここへ移した。同じ規則を2か所目に書き写すと生放送の扱いがずれる。
 */
export function broadcastTypeIncludes(broadcastType: string | null | undefined, value: string): boolean {
  return (broadcastType ?? '').split(',').map((s) => s.trim()).includes(value);
}

/** 収録日から放送日を出す。生放送は収録＝放送（既存 PUT /:id と同じ規則） */
export function resolveBroadcastDate(recordingDate: string, offsetDays: number, isLive: boolean): string {
  if (isLive) return recordingDate;
  return addDays(recordingDate, offsetDays);
}

/** 計画した1日に、実データの既存本数を突き合わせた結果 */
export interface ResolvedDate extends PlannedDate {
  /** その日に既にある回の本数（論理削除は含まない前提でルート側が渡す） */
  existingCount: number;
  /** 既に指定本数（`take`）ぶんあるので作らない日か */
  skip: boolean;
}

/**
 * 計画と、実データの `recording_date` の行（1行=1回）を突き合わせ、
 * 日ごとに作る/飛ばすを決める。
 *
 * ⚠️ **「指定本数ぶんあれば丸ごと飛ばす」であって、埋め合わせはしない**
 * （設計文書 §7「既に同じ recording_date に指定本数ぶん回があれば、その日は
 * スキップする」）。1本だけ既にある日に2本作りたい計画をぶつけても、
 * 既存の1本を数に入れて残り1本だけ足す、という部分埋めはしない —
 * その日は `existingCount < take` なので丸ごと `take` 本を新規に作る。
 * 半端に埋める運用は実際には起きない想定（生成は空いている日を狙って
 * 使うものなので、部分的に既存がある日は稀 — 稀な状態を複雑な規則で
 * 扱うより、単純な「全部作る/全部飛ばす」の二択にして毎回目視できる形にした）。
 */
export function resolvePlan(plan: PlannedDate[], existingRows: { recording_date: string }[]): ResolvedDate[] {
  const counts = new Map<string, number>();
  for (const row of existingRows) {
    counts.set(row.recording_date, (counts.get(row.recording_date) ?? 0) + 1);
  }
  return plan.map((p) => {
    const existingCount = counts.get(p.date) ?? 0;
    return { ...p, existingCount, skip: existingCount >= p.take };
  });
}

/** 画面・API レスポンス共通の集計（プレビューと実行結果の両方で使う） */
export function summarizeResolvedPlan(resolved: ResolvedDate[]) {
  const toCreate = resolved.filter((r) => !r.skip);
  const skipped = resolved.filter((r) => r.skip);
  return {
    dates: resolved.map((r) => ({
      date: r.date, planned: r.take, existing: r.existingCount, skip: r.skip,
    })),
    summary: {
      dates_total: resolved.length,
      dates_to_create: toCreate.length,
      dates_skipped: skipped.length,
      episodes_to_create: toCreate.reduce((sum, r) => sum + r.take, 0),
      episodes_skipped: skipped.reduce((sum, r) => sum + r.take, 0),
    },
  };
}
