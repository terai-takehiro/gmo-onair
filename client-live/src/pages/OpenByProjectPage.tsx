import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import api from '@/lib/api';
import { AlertCircle, Loader2 } from 'lucide-react';

/**
 * 計時・視聴者 v4.1 段1（フェーズ1・PR-A）— 案件からの橋渡し画面。
 *
 * `docs/design/v4/qsheet-v4-coding/12-live-timer-decision.md` §3-4。
 * 制作技術支援側のミニアプリタイル・スイッチャー（`kind: 'external'`。PR-Bで追加）から
 * `/live/open?project=:projectId` として開かれる。マウント後に「取得または作成」
 * （`POST /liveops/programs/resolve-by-project/:projectId`）を呼び、
 * `programId` が確定したら `/program/:id` へ client 側リダイレクトする。
 *
 * ⚠️ Speculation Rules（`prerender`）の落とし穴（同 §3-4）:
 * `prerender` は対象ページを実際に読み込んで JS を実行するため、この画面が
 * マウントと同時に「取得または作成」の POST を叩く実装だと、**ホバーしただけで
 * liveops_programs の行が作られてしまう**。`document.prerendering`
 * （Page Lifecycle API）を見て、プリレンダー中は API 呼び出しを保留し、
 * `prerenderingchange` イベントで実際に activate されてから初めて呼ぶ。
 * このPR自体はSpeculation Rulesを実装しないが、将来PR-Bや後続で使われても
 * 安全なように、この画面側の対策だけ先に入れておく。
 */
export default function OpenByProjectPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const projectId = searchParams.get('project');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!projectId) {
      setError('案件が指定されていません（URL に ?project= が必要です）');
      return;
    }

    let cancelled = false;

    const resolve = async () => {
      try {
        const res = await api.post(`/liveops/programs/resolve-by-project/${encodeURIComponent(projectId)}`);
        const id = res.data?.data?.id;
        if (cancelled) return;
        if (!id) {
          setError('セッションの取得に失敗しました');
          return;
        }
        navigate(`/program/${id}`, { replace: true });
      } catch (e: any) {
        if (cancelled) return;
        const message = e?.response?.data?.error?.message || e?.response?.data?.message;
        setError(message || 'セッションを開けませんでした');
      }
    };

    // プリレンダー中（Speculation Rules の `prerender`）は、実際に activate される
    // まで API 呼び出しを保留する（上記コメント参照）。
    if (typeof document !== 'undefined' && (document as any).prerendering) {
      const onActivate = () => { void resolve(); };
      document.addEventListener('prerenderingchange', onActivate, { once: true });
      return () => {
        cancelled = true;
        document.removeEventListener('prerenderingchange', onActivate);
      };
    }

    void resolve();
    return () => { cancelled = true; };
  }, [projectId, navigate]);

  if (error) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-3 bg-background px-4 text-center">
        <AlertCircle className="h-8 w-8 text-destructive" aria-hidden="true" />
        <p className="max-w-sm text-sm text-muted-foreground">{error}</p>
      </div>
    );
  }

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-primary" aria-label="読み込み中" />
    </div>
  );
}
