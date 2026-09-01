/**
 * 日本の壁時計（JST）— **サーバーの時計をそのまま日本時間として使わない**
 *
 * ── 何が起きていたか ────────────────────────────────────────
 *
 * コンテナ（`node:20-alpine`）は **UTC で動きます**。`TZ` はどこにも設定していません。
 * それなのに、夜間ジョブの時刻判定とダッシュボードの「今日」は
 * `new Date().getHours()` / `getFullYear()` のような**ローカル時刻の取得**を
 * 日本時間のつもりで使っていました。結果:
 *
 * - **09:00 の仕事が JST 18:00 に走る**（3時間の夜間整形は正午に走る）
 * - **JST の 00:00〜08:59 はダッシュボードが前日**を出す。月初は先月を出す
 *   （画面のヘッダーは端末の時計なので「今日」なのに、数字だけ前日になる）
 *
 * ── なぜ `TZ=Asia/Tokyo` を置かないのか ──────────────────────
 *
 * Alpine は **tzdata を持っていません**。`TZ` を渡しても Node の `Date` は
 * 時間帯を引けず**黙って UTC のまま**になります（設定したのに効かない、という
 * いちばん気づけない形）。一方 `Intl` は **ICU 内蔵の時間帯データ**を使うので、
 * tzdata が無くても正しく引けます。だから**ここで明示的に変換します**。
 *
 * SQL の中では `NOW() AT TIME ZONE 'Asia/Tokyo'` を使ってください（`project.service`）。
 * こちらは Postgres が自分の tzdata を持つので同じ問題は起きません。
 */

/** `Intl` は呼ぶたびに作ると重い。日付と時刻で1つずつ持つ */
const YMD = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
});
const HM = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit', hour12: false,
});

/** 日本時間の `YYYY-MM-DD`（`en-CA` はこの並びで返す） */
export function jstDate(d: Date = new Date()): string {
  return YMD.format(d);
}

/** 日本時間の `HH:MM`（24時間表記） */
export function jstTime(d: Date = new Date()): string {
  // ⚠️ 24時ちょうどは `24:00` と返る実装があるので `00:00` に直す
  // （`HH:MM` で大小を比べるので、24 のままだと真夜中の仕事が「まだ来ていない」になる）
  const t = HM.format(d);
  return t.startsWith('24:') ? `00:${t.slice(3)}` : t;
}

/** 日本時間の日付と時刻をまとめて */
export function jstParts(d: Date = new Date()): { date: string; time: string } {
  return { date: jstDate(d), time: jstTime(d) };
}

/**
 * **ローカル取得（`getHours()` 等）が日本の壁時計を返す Date** を作る。
 *
 * `getFullYear()`/`getDate()`/`getHours()` で成分を読む既存コード
 * （投入口の期限解析など）に「JST の今」を渡すための器。
 * 時間帯の情報は持たないので、**成分の取り出しと素朴な日付演算にだけ**使うこと
 * （epoch ミリ秒や他の Date との比較に使うとずれる）。
 * ゾーン記号なしの `YYYY-MM-DDTHH:mm:00` はローカル時刻として解釈されるので、
 * サーバーがどの時間帯で動いていても成分は JST になる。
 */
export function jstNaive(d: Date = new Date()): Date {
  return new Date(`${jstDate(d)}T${jstTime(d)}:00`);
}

/**
 * `YYYY-MM-DD` に日数を足す。**時間帯を持ち込まない純粋な足し算**
 * （UTC で作って UTC で読むので、どの時間帯で動かしても同じ答えになる）。
 */
export function shiftYmd(date: string, days: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${t.getUTCFullYear()}-${p(t.getUTCMonth() + 1)}-${p(t.getUTCDate())}`;
}

/** 日本時間の「今月」の初日と末日（`YYYY-MM-01` / `YYYY-MM-31`） */
export function jstMonthRange(d: Date = new Date()): { start: string; end: string } {
  const ym = jstDate(d).slice(0, 7);
  // 末日は 31 固定でよい。日付は TEXT の文字列比較なので、
  // 2月に `-31` を渡しても「その月のすべて」を含む上限として正しく働く
  return { start: `${ym}-01`, end: `${ym}-31` };
}
