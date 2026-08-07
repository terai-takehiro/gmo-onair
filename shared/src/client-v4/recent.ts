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

export function readRecent(): RecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw);
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
export function pushRecent(item: Omit<RecentItem, 'at'>): void {
  if (!item.to || !item.label) return;
  try {
    const now = Date.now();
    const rest = readRecent().filter((v) => v.to !== item.to);
    const next = [{ ...item, at: now }, ...rest].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 容量切れ・プライベートモード。最近見たものが出ないだけ */
  }
}

export function clearRecent(): void {
  try { localStorage.removeItem(KEY); } catch { /* 同上 */ }
}
