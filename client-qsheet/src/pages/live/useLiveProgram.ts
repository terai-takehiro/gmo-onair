// 計時・視聴者（liveops）の運用画面（ダッシュボード・タイマー管理）が共通して使う
// owner 解決フック。
//
// `docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` §3-4 のフェーズ1では
// `client-live/src/pages/OpenByProjectPage.tsx`（`/live/open?project=`）が
// 「取得または作成」を担っていたが、フェーズ2のこのステージでは
// **ダッシュボード自身がマウント時に同じ役割を行う**（GROUND_RULES の指示）。
//
// 手順:
//   ① `getOwnerContext(ownerKey)` で owner を解決する（`device-settings-owner.ts` と
//      同じ owner 解決。GLS番号・案件ID のどちらでも通る）
//   ② `owner.kind !== 'project'` なら対応しない（`scope === 'program'` は
//      12-live-timer-decision.md §3-5 のとおり09完全統合案にも解決策が無い
//      既知の空白のまま。`liveops_programs.project_id` が `projects` テーブルだけを
//      指すため、DBスキーマを変えない限り対応できない）
//   ③ `project` なら `POST /liveops/programs/resolve-by-project/:projectId`
//      （フェーズ1・PR-Aで実装済み）を呼んで「取得または作成」し、programId を得る
//
// ⚠️ resolve-by-project は `requirePermission('qsheet', 'reader')` で通り、
// 既存の program があれば reader/editor でもそのまま取得できる（`GET /liveops/programs`
// と同じ基準）。**まだ program が無い案件で新規作成（INSERT）するときだけ**
// サーバー側が手動で `qsheet` の `manager` を要求する（v4.1 段2 レビュー対応）。
// つまり owner を読めた（qsheet reader 以上）人がこの画面を開いても、
// **その案件で初めて開く（program がまだ無い）ときだけ** manager 未満だと 403 になる
// （既存セッションの閲覧は締め出さない。まだ manager 限定で残っている「初回作成」自体は
// 気になる別の不具合として直すのはこのステージのスコープ外 — GROUND_RULES §6）。
import { useEffect, useState } from 'react';
import api from '@/lib/api';
import { getOwnerContext, type OwnerContext } from '@/lib/deviceSettingsApi';

export type LiveProgramState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'unsupported-scope'; owner: OwnerContext }
  | { status: 'error'; owner: OwnerContext | null; message: string }
  | { status: 'ready'; owner: OwnerContext; programId: string };

export function useLiveProgram(ownerKey: string | undefined): LiveProgramState {
  const [state, setState] = useState<LiveProgramState>({ status: 'loading' });

  useEffect(() => {
    let alive = true;
    setState({ status: 'loading' });

    (async () => {
      const key = (ownerKey ?? '').trim();
      if (!key) {
        if (alive) setState({ status: 'not-found' });
        return;
      }

      const owner = await getOwnerContext(key);
      if (!alive) return;
      if (!owner) {
        setState({ status: 'not-found' });
        return;
      }
      if (owner.kind !== 'project') {
        setState({ status: 'unsupported-scope', owner });
        return;
      }

      try {
        const res = await api.post(`/liveops/programs/resolve-by-project/${encodeURIComponent(owner.id)}`);
        const programId = res.data?.data?.id as string | undefined;
        if (!alive) return;
        if (!programId) {
          setState({ status: 'error', owner, message: 'セッションの取得に失敗しました' });
          return;
        }
        setState({ status: 'ready', owner, programId });
      } catch (e: any) {
        if (!alive) return;
        const message = e?.response?.data?.error?.message || e?.response?.data?.message || 'セッションを開けませんでした';
        setState({ status: 'error', owner, message });
      }
    })();

    return () => { alive = false; };
  }, [ownerKey]);

  return state;
}
