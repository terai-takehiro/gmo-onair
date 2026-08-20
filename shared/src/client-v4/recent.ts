/**
 * 最近見たもの（⑪ 探す の3つ目の塊）
 *
 * ── なぜ端末に置くのか ──────────────────────────────────────
 *
 * 「最近見たもの」を残す表がサーバーにありません。作ることもできますが、
 * **開くたびに1行 INSERT する**ことになり、案件詳細を開く速さに効きます。
 * しかも「見た」は業務の記録ではないので、消えても誰も困りません。
 *
 * だから **`localStorage`（その端末の中）** に置きます。
 * **別の端末では出ません**。それは画面にそう書きます
 * （書かないと「スマホで見た案件が PC に出ない＝壊れている」と読まれます）。
 *
 * ── ⚠️ 誰のものかを必ず持つ ──────────────────────────────────
 *
 * `localStorage` は**ログアウトしても残ります**。持ち主を書いていなかったので、
 * 1台の端末を別の人が使ったとき（共用の PC・引き継いだ端末）に
 * **前の人が見た案件名・お客様名・GLS 番号がそのまま出ていました**。
 * 開こうとすれば 403 になりますが、**名前はもう読まれています**。
 *
 * だから中身に `uid` を持たせ、**読むときに突き合わせて、違えば無かったことにします**。
 * 鍵そのものを人ごとに分けない（`…:<uid>` にしない）のは、
 * **辞めた人の分が端末に残り続ける**のを避けるためです。
 *
 * ── 消える前提で書く ────────────────────────────────────────
 *
 * `localStorage` は容量が尽きると書き込みが例外になり、
 * プライベートモードでは読めないこともあります。
 * **読めない・書けないときは何も無かったことにする**（例外を外に出さない）。
 * 最近見たものが出ないだけで、探すこと自体は困りません。
 */

const KEY = 'gmo_onair_recent';
/** 残す数。増やすと探すより読むのが遅くなる */
const MAX = 8;

export interface RecentItem {
  /** 行き先の URL（同じアプリの中） */
  to: string;
  /** 太字で出す名前 */
  label: string;
  /** 下に小さく出す補足（GLS番号など）。無くてよい */
  sub?: string;
  /** 種類の見出し（案件 / お客様 …）。**画面が絵文字やアイコンを選ぶのに使う** */
  kind: 'project' | 'customer' | 'gpm';
  /** 最後に開いた時刻（ミリ秒） */
  at: number;
}

/** 端末に置く形。`uid` は**いま入っている人**（`users.id`） */
interface RecentStore {
  uid: string;
  items: RecentItem[];
}

/**
 * 最近見たもの。**いま入っている人のものだけ**を返す。
 *
 * @param uid いま入っている人の `users.id`。**必須にしてある** —
 *   省略できると、渡し忘れた画面だけが前の人の分を出す
 */
export function readRecent(uid: string): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as RecentStore | RecentItem[];
    // **持ち主を書いていない古い形は捨てる**（誰のものか分からないものは出さない）
    if (Array.isArray(parsed)) return [];
    if (!parsed || typeof parsed !== 'object') return [];
    if (!uid || parsed.uid !== uid) return [];
    const list = parsed.items;
    if (!Array.isArray(list)) return [];
    // **形が違うものは捨てる。** 古い版が書いた値が残っていても画面を壊さない
    return list.filter(
      (v): v is RecentItem =>
        !!v && typeof v.to === 'string' && typeof v.label === 'string' && typeof v.at === 'number',
    ).slice(0, MAX);
  } catch {
    return [];
  }
}

/**
 * 開いたものを積む。**同じ行き先は1つにまとめる**（同じ案件が並ぶと数が減る）。
 * 画面の描画中に呼ばれるので、**失敗しても黙って何もしない**。
 */
export function pushRecent(item: Omit<RecentItem, 'at'>, uid: string): void {
  if (!item.to || !item.label || !uid) return;
  try {
    const now = Date.now();
    // **人が変わっていたら積み直す**（`readRecent` が空を返すので、前の人の分は消える）
    const rest = readRecent(uid).filter((v) => v.to !== item.to);
    const next: RecentStore = { uid, items: [{ ...item, at: now }, ...rest].slice(0, MAX) };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 容量切れ・プライベートモード。最近見たものが出ないだけ */
  }
}

export function clearRecent(): void {
  try { localStorage.removeItem(KEY); } catch { /* 同上 */ }
}

/**
 * 1件だけ消す（⑪ 探す の「最近見たもの」に削除操作が無かった。読むだけで、
 * 見られたくないものが残り続けていた）。**呼び出し側で先に `readRecent(uid)` した
 * 一覧を state に持っておき、消えたあとの見た目はその state 側で更新すること**
 * （この関数は保存するだけで、消えたあとの一覧を返さない）。
 */
export function removeRecent(to: string, uid: string): void {
  if (!to || !uid) return;
  try {
    // **`readRecent` を経由する。** 持ち主が違う・形が壊れているものは
    // ここで既に弾かれているので、そのまま書き戻しても他人の分を巻き込まない
    const rest = readRecent(uid).filter((v) => v.to !== to);
    const next: RecentStore = { uid, items: rest };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 容量切れ・プライベートモード。消せないだけで読み書きの他は困らない */
  }
}
