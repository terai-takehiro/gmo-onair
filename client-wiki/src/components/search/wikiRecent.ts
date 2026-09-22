/**
 * 最近見たもの（Wiki のページ・端末の中だけ）
 *
 * 決まりは `shared/src/client-v4/recent.ts` と同じにしてあります:
 *   ・**その端末の中だけ**（`localStorage`）。別の端末では出ません。画面にそう書きます
 *   ・**8件**まで。同じページは1つにまとめる
 *   ・**`uid` を突き合わせる**。1台を別の人が使ったとき、前の人が読んだページの
 *     題が出てしまうのを防ぐ（開けば 404 になりますが、題はもう読まれています）
 *   ・読めない・書けないとき（容量切れ・プライベートモード）は**何も無かったことにする**
 *
 * ── なぜ共通のものをそのまま使わないか ──────────────────────
 *
 * 共通の `recent.ts` は `gmo_onair_recent` という1つの鍵に書きます。本番は
 * **5つのアプリが同じドメインから配られる**ので、`localStorage` はアプリ間で
 * 共有です。そこへ Wiki のページを足すと、案件管理の「探す」の最近見たものに
 * `/p/<id>`（案件管理には無い道）が並び、**押しても開けない行**になります
 * （種類も `project` / `customer` / `gpm` の3つしか無く、ページを表せません）。
 *
 * だから Wiki は**自分の鍵**（`gmo_onair_wiki_recent`）に、自分の形で持ちます。
 * 共通側に「アプリごとの区分」を足すのは全アプリに効く変更なので、別の回に分けます。
 */

const KEY = 'gmo_onair_wiki_recent';
/** 残す数。共通の `recent.ts` と同じ8件 */
const MAX = 8;

export interface WikiRecentItem {
  /** ページ id（`/p/:id` へ行く） */
  id: string;
  title: string;
  /** スペース名。同じ題のページを見分ける */
  spaceName: string;
  /** スペースの色（DB の hex）。無ければ印を出さない */
  spaceColor: string | null;
  /** 最後に開いた時刻（ミリ秒） */
  at: number;
}

interface Store {
  uid: string;
  items: WikiRecentItem[];
}

/** いま入っている人のものだけを返す。形が違うもの・持ち主が違うものは捨てる */
export function readWikiRecent(uid: string): WikiRecentItem[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as Store | null;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return [];
    if (!uid || parsed.uid !== uid) return [];
    const list = parsed.items;
    if (!Array.isArray(list)) return [];
    return list
      .filter(
        (v): v is WikiRecentItem =>
          !!v && typeof v.id === 'string' && typeof v.title === 'string' && typeof v.at === 'number',
      )
      .slice(0, MAX);
  } catch {
    return [];
  }
}

/**
 * 開いたページを積む。**同じページは1つにまとめる**。
 * 画面を描いている途中で呼ばれるので、**失敗しても黙って何もしない**。
 */
export function pushWikiRecent(item: Omit<WikiRecentItem, 'at'>, uid: string): void {
  if (!item.id || !item.title || !uid) return;
  try {
    const rest = readWikiRecent(uid).filter((v) => v.id !== item.id);
    const next: Store = { uid, items: [{ ...item, at: Date.now() }, ...rest].slice(0, MAX) };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 容量切れ・プライベートモード。最近見たものが出ないだけ */
  }
}

/**
 * 1件だけ消す（読まれたくないものが残り続けないように）。
 * **消えたあとの見た目は呼ぶ側の state で更新すること** — この関数は保存するだけです。
 */
export function removeWikiRecent(id: string, uid: string): void {
  if (!id || !uid) return;
  try {
    const next: Store = { uid, items: readWikiRecent(uid).filter((v) => v.id !== id) };
    localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* 同上 */
  }
}
