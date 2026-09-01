// テロップCG のハブ・送出コンソールが共通で使う owner 解決フック。
//
// `pages/live/useLiveProgram.ts` と同じ形:
//   ① `getOwnerContext(ownerKey)` で owner（案件 or 番組）を解決する
//   ② `POST /graphics/projects/resolve` で CGプロジェクトを「取得または作成」する
//      （owner.kind をそのまま ownerType として渡す。project / program の両 scope 対応）
//
// resolve はプロジェクトだけでなくページ・cue も一括で返す（画面の初期表示に必要な
// ものを1往復で揃える契約）。`reload()` は resolve 済みのプロジェクトを
// `GET /graphics/projects/:id` で読み直す（ページの作成・更新・削除のあとに呼ぶ）。
import { useCallback, useEffect, useState } from 'react';
import { getOwnerContext, type OwnerContext } from '@/lib/deviceSettingsApi';
import { setProductionNavContext } from '@/lib/productionNavContext';
import {
  resolveGraphicsProject, getGraphicsProject, type GraphicsBundle,
} from '@/lib/graphicsApi';

export type GraphicsProjectState =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; owner: OwnerContext | null; message: string }
  | { status: 'ready'; owner: OwnerContext; bundle: GraphicsBundle };

export function useGraphicsProject(ownerKey: string | undefined): {
  state: GraphicsProjectState;
  /** ページ一覧・cue を読み直す（ready のときだけ意味を持つ） */
  reload: () => Promise<void>;
} {
  const [state, setState] = useState<GraphicsProjectState>({ status: 'loading' });

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
      // サイドバーのサブメニューに文脈を渡す（`nav.ts` の `resolveContext` が読む。
      // 呼ばないとテロップCGのタブだけメニューが「トップ」のみに落ちる）
      setProductionNavContext({ scope: owner.kind, id: key, label: owner.name ?? owner.glsNumber ?? null });

      try {
        const bundle = await resolveGraphicsProject(owner.kind, owner.id, owner.name);
        if (!alive) return;
        setState({ status: 'ready', owner, bundle });
      } catch (e: unknown) {
        if (!alive) return;
        const err = e as { response?: { data?: { error?: { message?: string }; message?: string } } };
        const message = err?.response?.data?.error?.message
          || err?.response?.data?.message
          || 'テロップCGのプロジェクトを開けませんでした';
        setState({ status: 'error', owner, message });
      }
    })();

    return () => { alive = false; };
  }, [ownerKey]);

  const reload = useCallback(async () => {
    setState((prev) => {
      if (prev.status !== 'ready') return prev;
      const { owner, bundle } = prev;
      getGraphicsProject(bundle.project.id)
        .then((next) => {
          setState((cur) => (cur.status === 'ready' && cur.bundle.project.id === next.project.id
            ? { status: 'ready', owner, bundle: next }
            : cur));
        })
        .catch(() => { /* 読み直し失敗は画面を壊さない（次の操作でまた読む） */ });
      return prev;
    });
  }, []);

  return { state, reload };
}
