// 計時・視聴者（liveops）— 表示レイアウトエディタ（v4.1・PR3・Main.dc.html 相当）。
//
// `/techops/live/:ownerKey/timers/:timerId/layout`。表示画面（`/live/display/:timerId`。
// TimerDisplayPage.tsx・PR2で対応済み）が読む自由配置レイアウトを、案件単位のタイマーごとに
// ドラッグ・リサイズで編集して保存する。ドラッグ中の見た目は編集キャンバス自体が兼ね、
// 下の「プレビュー」枠は直近に保存した状態だけを描画する（設計 §6-2 の判断）。
//
// 権限: 閲覧は qsheet reader、ドラッグ・リサイズ・保存・「未設定に戻す」は qsheet manager
// （`LiveTimerAdminPage.tsx` の `canManage` パターンを踏襲。サーバー側も `PUT`/`DELETE
// /:id/layout` を canWrite で二重防御済み — PR1）。PC専用画面として
// `src/pcOnlyScreens.ts` の `TECHOPS_PC_ONLY` に登録している。
import { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, LayoutTemplate, Loader2, RotateCcw, Save, Timer } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { useLiveProgram } from './useLiveProgram';
import BackToOwner, { type BackToOwnerTarget } from './BackToOwner';
import { useTimer } from '@gmo-onair/shared/src/client/live/useTimer';
import { DisplayCanvas, DisplayCanvasBoundary } from '@gmo-onair/shared/src/client/live/DisplayCanvas';
import {
  DISPLAY_ELEMENT_KEYS,
  type DisplayElementKey,
  type DisplayElementLayout,
  type DisplayLayout,
} from '@gmo-onair/shared/src/client/live/displayLayout';
import { formatTimer } from '@/components/live/format';
import { notifyError, notifySuccess } from '@/lib/notify';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { DisplayLayoutEditCanvas } from './DisplayLayoutEditCanvas';
import { ELEMENT_LABELS, MIN_ELEMENT_SIZE, clampPct, defaultDisplayLayout, isValidDisplayLayout, normalizeDisplayLayout } from './displayLayoutDefaults';

interface TimerRecord {
  id: string;
  name: string;
  program_id: string | null;
  viewer_overlay_program_id: string | null;
}

interface Counts { youtube: number; jstream: number; zoom: number; teams: number; total: number }

export default function LiveDisplayLayoutEditorPage() {
  const { ownerKey, timerId } = useParams<{ ownerKey: string; timerId: string }>();
  const live = useLiveProgram(ownerKey);

  if (live.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (live.status === 'not-found') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<Timer />} title="見つかりませんでした" description="GLS番号または案件IDを確認してください。" />
      </div>
    );
  }

  if (live.status === 'unsupported-scope') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <BackToOwner owner={live.owner} />
        <EmptyState
          icon={<Timer />}
          title="案件からのみ開けます"
          description="計時・視聴者は案件からだけ開けます。案件のハブ画面から開いてください。"
        />
      </div>
    );
  }

  if (live.status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        {live.owner && <BackToOwner owner={live.owner} />}
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={live.message} />
      </div>
    );
  }

  if (!timerId) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <BackToOwner owner={live.owner} />
        <EmptyState icon={<Timer />} title="タイマーが指定されていません" description="タイマー管理からレイアウト編集を開いてください。" />
      </div>
    );
  }

  return <LayoutEditorContent key={timerId} owner={live.owner} timerId={timerId} />;
}

function LayoutEditorContent({ owner, timerId }: {
  owner: BackToOwnerTarget & { glsNumber: string | null };
  timerId: string;
}) {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('qsheet', 'manager');
  const qc = useQueryClient();

  const [selectedKey, setSelectedKey] = useState<DisplayElementKey | null>(null);
  const [draft, setDraft] = useState<DisplayLayout>(defaultDisplayLayout());
  const [savedLayout, setSavedLayout] = useState<DisplayLayout | null>(null);
  const initializedRef = useRef(false);

  const timerQuery = useQuery({
    queryKey: ['timer-record', timerId],
    queryFn: () => api.get(`/liveops/timers/${timerId}`).then((r) => r.data.data as TimerRecord),
  });

  const layoutQuery = useQuery({
    queryKey: ['timer-layout', timerId],
    queryFn: () => api.get(`/liveops/timers/${timerId}/layout`).then((r) => r.data.data as DisplayLayout | null),
  });

  // マウント時に一度だけ draft/savedLayout を初期化する。以後の layoutQuery の再取得
  // （フォーカス復帰等）で編集中の draft を上書きしない。
  // ⚠️ **失敗時も「初期化済み」にする。** 下の描画ガードが `initializedRef.current` を
  // 見るようになったため、成功時にしか立てないと通信が失敗したときに骨組みのまま
  // 固まる（失敗時は「保存済みレイアウトは無い」扱いで既定配置から編集を始められるようにする）。
  useEffect(() => {
    if (initializedRef.current || layoutQuery.isLoading) return;
    const data = layoutQuery.isSuccess ? layoutQuery.data : null;
    if (data && isValidDisplayLayout(data)) {
      setSavedLayout(data);
      setDraft(normalizeDisplayLayout(data));
    } else {
      setSavedLayout(null);
      setDraft(defaultDisplayLayout());
    }
    initializedRef.current = true;
  }, [layoutQuery.isLoading, layoutQuery.isSuccess, layoutQuery.data]);

  // プレビュー用のタイマー状態（設計 §6-2: `useTimer` を通常どおり使う）
  const { state } = useTimer(timerId);
  const phase = state?.phase ?? 'idle';
  const remainingMs = state?.remainingMs ?? 0;
  const totalSeconds = state?.totalSeconds ?? 0;
  const timerDisplay = state ? formatTimer(remainingMs) : '--:--';
  const progress = state && phase !== 'idle' && totalSeconds > 0
    ? clampPct(remainingMs / (totalSeconds * 1000), 0, 1)
    : null;

  // プレビュー用の視聴者数。表示画面（TimerDisplayPage.tsx）と同じく
  // viewer_overlay_program_id を優先し、無ければ program_id にフォールバックする。
  const programIdForCounts = timerQuery.data?.viewer_overlay_program_id ?? timerQuery.data?.program_id ?? null;
  const [counts, setCounts] = useState<Counts>({ youtube: 0, jstream: 0, zoom: 0, teams: 0, total: 0 });
  useEffect(() => {
    if (!programIdForCounts) return;
    let alive = true;
    const poll = async () => {
      try {
        const r = await api.get(`/liveops/snapshots/${programIdForCounts}/display`);
        const s = r.data?.data?.[0];
        if (alive && s) {
          setCounts({
            youtube: s.youtube_count ?? 0,
            jstream: s.jstream_count ?? 0,
            zoom: s.zoom_count ?? 0,
            teams: s.teams_count ?? 0,
            total: s.total_count ?? 0,
          });
        }
      } catch {
        /* プレビューの視聴者数取得なので、失敗しても編集そのものは続けられる */
      }
    };
    poll();
    const id = setInterval(poll, 15_000);
    return () => { alive = false; clearInterval(id); };
  }, [programIdForCounts]);

  function updateElement(key: DisplayElementKey, patch: Partial<DisplayElementLayout>) {
    setDraft((prev) => ({
      ...prev,
      elements: prev.elements.map((e) => (e.key === key ? { ...e, ...patch } : e)),
    }));
  }

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/liveops/timers/${timerId}/layout`, { layout: draft }),
    onSuccess: (res) => {
      const saved = res.data.data as DisplayLayout;
      setSavedLayout(saved);
      qc.setQueryData(['timer-layout', timerId], saved);
      notifySuccess('レイアウトを保存しました');
    },
    onError: () => notifyError('保存できませんでした。', { description: '少し待ってから、もう一度お試しください。' }),
  });

  const resetMutation = useMutation({
    mutationFn: () => api.delete(`/liveops/timers/${timerId}/layout`),
    onSuccess: () => {
      setSavedLayout(null);
      setDraft(defaultDisplayLayout());
      setSelectedKey(null);
      qc.setQueryData(['timer-layout', timerId], null);
      notifySuccess('未設定に戻しました。表示画面は既定の描画に戻ります。');
    },
    onError: () => notifyError('削除できませんでした。', { description: '少し待ってから、もう一度お試しください。' }),
  });

  async function handleReset() {
    if (!(await confirmAction({
      title: '保存済みのレイアウトを削除しますか？',
      description: '表示画面（会場モニター・OBS）は既定の描画（固定パターン）に戻ります。',
      confirmLabel: '未設定に戻す',
      tone: 'danger',
    }))) return;
    resetMutation.mutate();
  }

  const selectedEl = selectedKey ? draft.elements.find((e) => e.key === selectedKey) ?? null : null;

  // **`layoutQuery` が来ただけでは「読み込み終わった」にしない。** `['timer-layout', timerId]`
  // は「テンプレート」画面（`LiveDisplayTemplateLibraryPage.tsx`）と同じキャッシュ鍵を読むため、
  // そちらを経由してから戻ってくる・同じタイマーのレイアウト編集を開き直すSPA遷移では、
  // このコンポーネントが新規マウントされた1回目のレンダーから `layoutQuery` が
  // キャッシュ済みの値を持つ。`initializedRef` の effect（`reset` 相当）が効くのはその後の
  // コミットなので、ここで `layoutQuery.isLoading` だけを見ると、保存済みレイアウトが
  // 一瞬 `defaultDisplayLayout()` のまま描画されてしまう。`initializedRef.current` も
  // 一緒に見て、この画面が実際にサーバー値へ同期し終えるまで骨組みのまま待つ。
  if (timerQuery.isLoading || layoutQuery.isLoading || !initializedRef.current) {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }

  if (timerQuery.isError || !timerQuery.data) {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <BackToOwner owner={owner} />
        <EmptyState icon={<AlertCircle />} title="タイマーが見つかりません" description="削除された可能性があります。タイマー管理からやり直してください。" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-3 py-3 sm:px-6">
        <BackToOwner owner={owner} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">表示レイアウト編集</h1>
          <p className="truncate text-xs text-muted-foreground">{timerQuery.data.name} ／ {owner.glsNumber ?? owner.name}</p>
        </div>
        <Link to={`/techops/live-display-templates?fromTimer=${timerId}`}>
          <Button variant="outline" size="sm" className="min-h-tap">
            <LayoutTemplate className="mr-1.5 h-4 w-4" />テンプレート
          </Button>
        </Link>
        {canManage && (
          <>
            <Button
              variant="outline" size="sm" className="min-h-tap text-destructive hover:text-destructive"
              onClick={handleReset} disabled={resetMutation.isPending}
            >
              <RotateCcw className="mr-1.5 h-4 w-4" />未設定に戻す
            </Button>
            <Button size="sm" className="min-h-tap" onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              <Save className="mr-1.5 h-4 w-4" />保存
            </Button>
          </>
        )}
      </div>

      <div className="flex flex-1 flex-col overflow-hidden lg:flex-row">
        <div className="flex-1 space-y-6 overflow-y-auto p-4">
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">
              編集キャンバス（{canManage ? 'ドラッグで移動・右下の丸で拡大縮小' : '閲覧のみ'}）
            </p>
            <DisplayLayoutEditCanvas
              layout={draft}
              canManage={canManage}
              selectedKey={selectedKey}
              onSelect={setSelectedKey}
              onChange={updateElement}
            />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-muted-foreground">プレビュー（直近保存した状態。ドラッグ中の変更は反映されません）</p>
            {savedLayout ? (
              <div className="relative aspect-video w-full overflow-hidden rounded-lg border border-border">
                <DisplayCanvasBoundary fallback={<PreviewFallback />}>
                  <DisplayCanvas layout={savedLayout} timerDisplay={timerDisplay} timerPhase={phase} progress={progress} counts={counts} />
                </DisplayCanvasBoundary>
              </div>
            ) : (
              <div className="flex aspect-video w-full items-center justify-center rounded-lg border border-dashed border-border px-4 text-center text-sm text-muted-foreground">
                まだ保存されていません。保存すると、直近保存した状態がここに表示されます。
              </div>
            )}
          </div>
        </div>

        <aside className="w-full shrink-0 space-y-6 overflow-y-auto border-t border-border p-4 lg:w-72 lg:border-l lg:border-t-0">
          <div>
            <h2 className="mb-2 text-sm font-bold">要素の表示ON/OFF</h2>
            <div className="space-y-1">
              {DISPLAY_ELEMENT_KEYS.map((key) => {
                const el = draft.elements.find((e) => e.key === key)!;
                return (
                  <div
                    key={key}
                    className={`flex items-center justify-between gap-2 rounded-md px-2 py-1 text-sm ${selectedKey === key ? 'bg-primary/10' : 'hover:bg-muted'}`}
                  >
                    <button type="button" className="min-h-tap min-w-0 flex-1 truncate text-left" onClick={() => setSelectedKey(key)}>
                      {ELEMENT_LABELS[key]}
                    </button>
                    <Switch checked={el.visible} disabled={!canManage} onCheckedChange={(v) => updateElement(key, { visible: v })} />
                  </div>
                );
              })}
            </div>
          </div>

          {selectedEl && (
            <div className="space-y-3">
              <h2 className="text-sm font-bold">{ELEMENT_LABELS[selectedEl.key]}のサイズ</h2>
              <div className="space-y-1.5">
                <Label htmlFor="display-layout-el-w">幅（%）</Label>
                <Input
                  id="display-layout-el-w" type="number" min={MIN_ELEMENT_SIZE} max={100} disabled={!canManage}
                  value={Math.round(selectedEl.w)}
                  onChange={(e) => updateElement(selectedEl.key, {
                    w: clampPct(Number(e.target.value) || MIN_ELEMENT_SIZE, MIN_ELEMENT_SIZE, 100 - selectedEl.x),
                  })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="display-layout-el-h">高さ（%）</Label>
                <Input
                  id="display-layout-el-h" type="number" min={MIN_ELEMENT_SIZE} max={100} disabled={!canManage}
                  value={Math.round(selectedEl.h)}
                  onChange={(e) => updateElement(selectedEl.key, {
                    h: clampPct(Number(e.target.value) || MIN_ELEMENT_SIZE, MIN_ELEMENT_SIZE, 100 - selectedEl.y),
                  })}
                />
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h2 className="text-sm font-bold">背景</h2>
            <div className="flex gap-2">
              <Button
                type="button" size="sm" variant={draft.background === 'dark' ? 'default' : 'outline'}
                className="min-h-tap flex-1" disabled={!canManage}
                onClick={() => setDraft((prev) => ({ ...prev, background: 'dark' }))}
              >
                暗い
              </Button>
              <Button
                type="button" size="sm" variant={draft.background === 'light' ? 'default' : 'outline'}
                className="min-h-tap flex-1" disabled={!canManage}
                onClick={() => setDraft((prev) => ({ ...prev, background: 'light' }))}
              >
                明るい
              </Button>
            </div>
          </div>

          {!canManage && (
            <p className="text-xs text-muted-foreground">現在は閲覧のみです。編集して保存するには 制作技術支援の「管理」が必要です。</p>
          )}
        </aside>
      </div>
    </div>
  );
}

function PreviewFallback() {
  return (
    <div className="flex h-full items-center justify-center bg-muted px-4 text-center text-xs text-muted-foreground">
      プレビューを表示できませんでした（レイアウトの形が不正です）
    </div>
  );
}
