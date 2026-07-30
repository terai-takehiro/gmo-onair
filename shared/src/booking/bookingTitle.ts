/**
 * スタジオ予約の題名を作る。**生成はここ1か所だけ** (v3.1.2)
 *
 * ── なぜ1か所にしたか ─────────────────────────────────────
 *
 * 同じ予約を作る経路が4つあり、それぞれ独自に題名を組み立てていた:
 *
 *   ステージ移行の自動仮押さえ   `<案件名> 仮押さえ`
 *   カレンダーの予約ダイアログ    `<案件名> (YY/MM/DD)`
 *   AI 投入 (行動案の実行)       AI が読み取った自由文 (無ければ `仮押さえ`)
 *   シードデータ                 `<GLS番号> <案件名> リハーサル`
 *
 * 同じ案件・同じ日の予定が経路ごとに違う文字列になるので、**二重に入っていても
 * 機械も人も同一と判定できない**。これが「若干の表記揺らぎ」の直接の原因。
 *
 * ── 種別を題名に入れない ───────────────────────────────────
 *
 * `仮押さえ` `本番` を題名に混ぜると、(a) 種別を変えても題名が古いまま残り、
 * (b) 種別ラベルと二重に出る。種別は**色と種別ラベル**で出す
 * (カレンダーの月表示・週表示・直近の予定・案件詳細のすべてでラベルを描いている)。
 *
 * ICS 書き出し (`studios/calendar.ics`) だけは `【本番】` を前置する。
 * 外部カレンダーには ONAiR の色もラベルも無く、題名しか手掛かりが無いため。
 * これは**保存する題名ではなく書き出しの表現**なので、ここでは扱わない。
 *
 * ── 人が書いた題名は上書きしない ───────────────────────────
 *
 * この関数は「既定の題名」を作るだけ。人が題名を打ち替えたらそれを残す
 * (呼び出し側の責任。予約ダイアログは `titleTouched` で見ている)。
 */

export interface BookingTitleInput {
  /** 案件名。これがあるときは案件名を主役にする */
  projectName?: string | null;
  /** 予約の開始日 (`YYYY-MM-DD` または `YYYY-MM-DDTHH:mm`)。無ければ日付を付けない */
  date?: string | null;
  /**
   * 案件が無いときに使う文字列 (AI が読み取った自由文など)。
   * 案件名があるときは**使わない** (経路ごとの揺らぎを持ち込まないため)。
   */
  fallback?: string | null;
}

/** `YYYY-MM-DD…` → `YY/MM/DD`。読めない形は空文字 (client の formatShortDate と同じ規則) */
export function shortDateForTitle(dateStr?: string | null): string {
  if (!dateStr) return '';
  const m = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  return `${m[1].slice(2)}/${m[2]}/${m[3]}`;
}

/**
 * 予約の既定の題名を作る。
 *
 * - 案件あり + 日付あり → `案件名 (26/08/12)`
 * - 案件あり + 日付なし → `案件名`
 * - 案件なし           → fallback (無ければ `予約`)
 *
 * 案件名の先頭に付いた GLS 番号は落とす (画面が表示時に落としているので、
 * 保存する題名にも入れない。`GLS-A005 番組名` → `番組名`)。
 */
export function buildBookingTitle(input: BookingTitleInput): string {
  const name = stripGlsPrefix(String(input.projectName ?? '').trim());
  if (!name) {
    const fb = String(input.fallback ?? '').trim();
    return (fb || '予約').slice(0, 200);
  }
  const d = shortDateForTitle(input.date);
  return (d ? `${name} (${d})` : name).slice(0, 200);
}

/** 題名の先頭の GLS 番号を落とす (`GLS-A005 番組名` → `番組名`) */
export function stripGlsPrefix(title: string): string {
  return title.replace(/^GLS[-A-Z0-9]*\s+/i, '').trim() || title;
}
