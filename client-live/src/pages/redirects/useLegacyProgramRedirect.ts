import { useEffect, useState } from 'react';
import api from '@/lib/api';
import type { RedirectTarget } from './RedirectStatus';

/**
 * 旧URL `/program/:id`（＋ `/timers` `/settings`）→ 新URL
 * `/qsheet/live/:projectId`（＋同サフィックス）の解決。
 *
 * `GET /liveops/programs/:id` で `project_id` を引く（GROUND_RULES §2 の表）。
 *
 * ⚠️ 現場運用レビュー対応（v4.1 段2）: `project_id` が無い（案件に紐づかない旧スタンドアロン
 * program）場合、以前は「制作技術支援の案件から開き直してください」という `blocked` 案内を
 * 出していたが、**これは実行不可能な指示だった** — 案件から開くと `resolve-by-project` が
 * 別の新しい program を作るだけで、この旧スタンドアロン program（そこに設定済みのタイマー・
 * YouTube/Zoom/Teams紐づけ）には二度と辿り着けなくなる。
 * いまは実際に辿り着ける行き先（`/qsheet/live-legacy` の一覧・§致命的2 で復活させた
 * 管理者向け画面）へ、この program をあらかじめ選択した状態でそのまま `redirect` する。
 */
export function useLegacyProgramRedirect(programId: string | undefined, suffix: string): RedirectTarget {
  const [target, setTarget] = useState<RedirectTarget>({ status: 'loading' });

  useEffect(() => {
    let cancelled = false;
    setTarget({ status: 'loading' });

    if (!programId) {
      setTarget({ status: 'error', message: 'URL に番組IDがありません。' });
      return;
    }

    api.get(`/liveops/programs/${programId}`)
      .then((res) => {
        if (cancelled) return;
        const projectId = res.data?.data?.project_id as string | null | undefined;
        if (!projectId) {
          // 案件に紐づかない旧スタンドアロン program。「案件から開き直す」は別物を
          // 作るだけで実行不可能な指示になるため、実データへ実際に辿り着ける
          // 一覧画面（管理者向け・`?program=` で選択済みの状態）へ送る。
          setTarget({ status: 'redirect', to: `/qsheet/live-legacy?program=${encodeURIComponent(programId)}` });
          return;
        }
        setTarget({ status: 'redirect', to: `/qsheet/live/${encodeURIComponent(projectId)}${suffix}` });
      })
      .catch((e: any) => {
        if (cancelled) return;
        const message = e?.response?.data?.error?.message || e?.response?.data?.message || 'セッション情報を取得できませんでした。';
        setTarget({ status: 'error', message });
      });

    return () => { cancelled = true; };
  }, [programId, suffix]);

  return target;
}
