/**
 * スタジオ予約の重複疑い検知（表記揺らぎ対応）
 *
 * ── なぜ要るか ──────────────────────────────────────────────
 *
 * スタジオ予約は複数の経路から作られる:
 *  ①案件ステージ移行での自動生成（`project.service.ts` の d_hold 遷移）
 *  ②MCP（メール取込の下書き・チャットでの依頼）
 *  ③人の手入力（カレンダー UI）
 *
 * ①には「この案件に既に予約が1件でもあれば作らない」という強い重複防止が
 * 元からあるが、②③にはそれが無い。同じ枠を指す予約が題名の言い回しだけ違う形
 * （「収録」/「本番」・語順違い・全角半角違い・スペースの有無）で二重に入ることが
 * 多々あり、**完全一致の突合では拾えない**。
 *
 * ── 方針は「止めない」（`business-hours.service.ts` の out_of_hours と同じ型）──
 *
 * 保存そのものは止めない — 締切間際に入れたい予約が入らないと業務が止まる。
 * ここは疑わしい組を**判定するだけ**の純粋関数。呼び出し側（`studio-booking.service.ts`）
 * が結果を DB に印として残し、あとから一覧で拾って人が個別に確認する。
 *
 * ── 判定の組み立て ──────────────────────────────────────────
 *
 * 「時間帯が重なっている」ことは必須。そのうえで、
 *  ・**同じ案件**に紐づく予約同士（部屋が両方分かっていて重ならない場合は除く）
 *  ・**部屋が重なっていて**、正規化した題名の類似度が閾値以上
 * のどちらかに当たれば重複の疑いとする。案件も部屋も分からない予約同士
 * （部屋を押さえない相談・外現場など）は、題名がよく似ていても拾わない —
 * 手がかりが題名しか無いときに誤検知（無関係な同名イベント）を増やさないため。
 */

const TITLE_SIMILARITY_THRESHOLD = 0.6;

/** よくある言い回しの揺れを1つに寄せる（ドメイン特有の同義語だけ・辞書は必要になった分だけ足す） */
const TITLE_SYNONYMS: Record<string, string> = {
  '本番': '収録',
  'リハ': 'リハーサル',
  '打合せ': '打ち合わせ',
  '打ち合せ': '打ち合わせ',
  'ミーティング': '打ち合わせ',
  'mtg': '打ち合わせ',
  '仮予約': '仮押さえ',
  '仮おさえ': '仮押さえ',
  '仮抑え': '仮押さえ',
};

// 全角/半角のスペース・記号・括弧類。単語の区切りとして落とす
// (`\s` は半角のみ拾うので全角スペース U+3000 を別途 \u3000 で足す — 文字そのものを
// 書くと eslint の no-irregular-whitespace に引っかかる)
const DELIMITER_RE = /[\s\u3000・:：,、。\-–—_/／()（）[\]【】「」『』]+/g;

/** 題名を比較用トークンの配列にする。NFKC 正規化（全角→半角・合字展開）→小文字化→区切りで分割→同義語寄せ */
export function titleTokens(title: string): string[] {
  const normalized = String(title ?? '').normalize('NFKC').toLowerCase();
  return normalized
    .split(DELIMITER_RE)
    .map((t) => t.trim())
    .filter(Boolean)
    .map((t) => TITLE_SYNONYMS[t] ?? t);
}

/**
 * 題名どうしの類似度（Jaccard 係数・0〜1）。
 * 語順が違っても（「収録 GLS-A010」⇔「GLS-A010 収録」）トークン集合の一致で拾える。
 */
export function titleSimilarity(a: string, b: string): number {
  const ta = new Set(titleTokens(a));
  const tb = new Set(titleTokens(b));
  if (ta.size === 0 || tb.size === 0) return 0;
  let intersection = 0;
  for (const t of ta) if (tb.has(t)) intersection++;
  const union = new Set([...ta, ...tb]).size;
  return union === 0 ? 0 : intersection / union;
}

/** 予約の終了 (無ければ開始 = 単発の瞬間として扱う) */
function effectiveEnd(start: string, end: string | null | undefined): string {
  return end && String(end).trim() ? String(end) : start;
}

/**
 * 開始/終了の境界を比較可能な形にする。**終日（`YYYY-MM-DD` の10文字）は
 * その日いっぱい (00:00〜24:00) に広げる** — 広げずに素の文字列比較をすると、
 * `"2026-08-20"` は `"2026-08-20T10:00"` より辞書順で小さいと判定され
 * （短い接頭辞は長い文字列より「小さい」）、終日予約と同日の時刻ありの予約が
 * 重なっていないと誤判定される。
 */
function dayBound(value: string, edge: 'start' | 'end'): string {
  return value.length <= 10 ? `${value}T${edge === 'start' ? '00:00' : '24:00'}` : value;
}

/**
 * 2つの予約の時間帯が重なっているか。start_time/end_time は TEXT
 * (`YYYY-MM-DD` = 終日 / `YYYY-MM-DDTHH:mm` = 時刻あり) で、
 * 境界を揃えたあとは文字列としての大小比較がそのまま時系列の前後になる
 * (他の予約系ロジックと同じ前提)。隣接（片方の終了 = もう片方の開始）は重なりに数えない。
 */
export function timeRangesOverlap(
  aStart: string, aEnd: string | null | undefined,
  bStart: string, bEnd: string | null | undefined,
): boolean {
  const aS = dayBound(aStart, 'start');
  const aE = dayBound(effectiveEnd(aStart, aEnd), 'end');
  const bS = dayBound(bStart, 'start');
  const bE = dayBound(effectiveEnd(bStart, bEnd), 'end');
  return aS < bE && bS < aE;
}

/** 部屋の配列同士が1つでも重なるか */
function roomsShareAny(a: string[], b: string[]): boolean {
  if (a.length === 0 || b.length === 0) return false;
  const set = new Set(a);
  return b.some((r) => set.has(r));
}

export interface DuplicateCheckBooking {
  id?: string;
  title: string;
  project_id?: string | null;
  start_time: string;
  end_time?: string | null;
  room_ids: string[];
}

export interface DuplicateCandidate extends DuplicateCheckBooking {
  id: string;
}

export interface DuplicateResult {
  bookingId: string;
  reason: string;
}

/**
 * 新規/更新しようとしている予約 (`input`) と既存予約の候補群 (`candidates`) を突き合わせ、
 * 最初に見つかった重複疑いを返す。無ければ `null`。
 *
 * `candidates` は呼び出し側が「時間帯が近い予約」に絞って渡す想定
 * （全件を渡しても正しく動くが、DB 側で日付を先に絞ったほうが軽い）。
 */
export function findDuplicateCandidate(
  input: DuplicateCheckBooking,
  candidates: DuplicateCandidate[],
): DuplicateResult | null {
  for (const c of candidates) {
    if (input.id && c.id === input.id) continue;
    if (!timeRangesOverlap(input.start_time, input.end_time, c.start_time, c.end_time)) continue;

    const bothRoomsKnown = input.room_ids.length > 0 && c.room_ids.length > 0;
    const sharedRoom = roomsShareAny(input.room_ids, c.room_ids);
    // 部屋が両方分かっていて、かつ重ならないなら「別の場所の予定」— 同じ案件・似た題名でも除外
    if (bothRoomsKnown && !sharedRoom) continue;

    const sameProject = !!input.project_id && !!c.project_id && input.project_id === c.project_id;
    if (sameProject) {
      return { bookingId: c.id, reason: `同じ案件・時間帯が重なる予約があります（「${c.title}」）` };
    }

    // 案件が無い/違う組は、部屋が重なっていて題名も似ているときだけ拾う
    // （部屋も題名も手がかりが無いものまで拾うと無関係な同名イベントを誤検知する）
    if (sharedRoom && titleSimilarity(input.title, c.title) >= TITLE_SIMILARITY_THRESHOLD) {
      return { bookingId: c.id, reason: `件名がよく似た予約と時間帯・部屋が重なっています（「${c.title}」）` };
    }
  }
  return null;
}
