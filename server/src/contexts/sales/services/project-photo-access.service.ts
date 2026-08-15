/**
 * 「この写真はこの案件のものか」を**BOX を叩きすぎずに**確かめる
 *
 * ── なぜ要るのか ────────────────────────────────────────────
 *
 * 写真のサムネイルはサーバーが中継します（`projects.routes`）。中継する以上、
 * **その案件の写真かどうかを毎回確かめなければなりません** — 確かめないと、
 * 案件の閲覧権限さえあれば **id を渡すだけで別の案件の写真**が取れます
 * （id は一覧の応答に出るので推測は要りません）。
 *
 * ── ⚠️ ただし「毎回2回 BOX に訊く」はできない ──────────────────
 *
 * 確認は「社外フォルダを一覧 → `08_写真` を一覧」の**2回**です。写真の格子は
 * `<img>` ごとに別のリクエストなので、**100 枚なら 200 回**になります。
 * BOX に絞られると**正しい写真まで 404 になり、格子が歯抜けに見えます**
 * （レビューでの指摘。**確認を外すのではなく、確認の回数を減らして解く**）。
 *
 * だから**案件ごとに写真の id の集合を短く覚えます**。同じ格子の 100 枚は
 * 1回ぶんの問い合わせで済みます。
 *
 * ── 覚えたものが古いとき ────────────────────────────────────
 *
 * ・**知らない id が来たら1度だけ引き直します**（さっき上げた写真がすぐ見えるように）
 * ・ただし**引き直しは案件ごとに `REFRESH_MIN_MS` に1回まで**。
 *   でないと、当てずっぽうの id を連打されるだけで BOX を叩き続けることになります
 * ・**写真を上げたら覚えたものを捨てます**（`forgetProjectPhotos`）
 */

/** 覚えておく時間。長くすると、消した写真がしばらく見えたままになる */
const TTL_MS = 60_000;
/** 知らない id で引き直す間隔の下限（案件ごと） */
const REFRESH_MIN_MS = 5_000;
/** 覚える案件の数の上限。**入れっぱなしにしない**（案件は増え続ける） */
const MAX_PROJECTS = 200;

interface Entry {
  /** その案件の写真フォルダにあるファイルの id */
  ids: Set<string>;
  /** 最後に BOX から取った時刻 */
  at: number;
}

/**
 * 写真の持ち主を確かめる道具。**BOX の呼び出し方は外から渡します** —
 * こうしておくと、BOX につながない環境（CI・手元）でも
 * 「叩く回数」そのものを試験で固定できます。
 */
export function createPhotoAccess(
  /** その案件の写真フォルダにある id を全部返す。フォルダが無ければ null */
  load: (projectId: string) => Promise<Set<string> | null>,
  now: () => number = Date.now,
) {
  const cache = new Map<string, Entry>();

  const remember = (projectId: string, ids: Set<string>) => {
    // いちばん古いものから落とす（`Map` は入れた順を保つ）
    if (cache.size >= MAX_PROJECTS && !cache.has(projectId)) {
      const oldest = cache.keys().next().value;
      if (oldest !== undefined) cache.delete(oldest);
    }
    cache.set(projectId, { ids, at: now() });
  };

  return {
    async isProjectPhoto(projectId: string, fileId: string): Promise<boolean> {
      if (!projectId || !fileId) return false;
      const hit = cache.get(projectId);
      const age = hit ? now() - hit.at : Infinity;

      if (hit && age < TTL_MS) {
        if (hit.ids.has(fileId)) return true;
        // 知らない id。**引き直すのは間隔を空けてから**
        if (age < REFRESH_MIN_MS) return false;
      }

      const ids = await load(projectId);
      // 取れなかった（BOX が落ちている・フォルダが無い）ときは**通さない**。
      // ここで通すと、障害の日だけ確認が消える
      if (!ids) return false;
      remember(projectId, ids);
      return ids.has(fileId);
    },

    /** 写真を上げた・消したときに呼ぶ。次の1回で取り直す */
    forget(projectId: string): void {
      cache.delete(projectId);
    },

    /** 試験用。覚えている案件の数 */
    size(): number {
      return cache.size;
    },
  };
}

export type PhotoAccess = ReturnType<typeof createPhotoAccess>;
