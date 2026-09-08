// 計時・視聴者（liveops）— ダッシュボード（v4.1 段2・ミニアプリ化フェーズ2）。
//
// `client-live/src/pages/DashboardPage.tsx` の移植。落としていない機能:
//   ・メインタイマー表示（TimerDisplay・主タイマー = liveops_programs.main_timer_id）
//   ・視聴者数取得の開始/停止・カード・推移グラフ（`components/live/ViewerPanel.tsx` に切り出し）
//   ・タイマー選択・設定（TimerSettingsPanel。管理者のみ）
//   ・タイマー管理へのリンク（新URL `/techops/live/:ownerKey/timers`）
//   ・番組設定へのリンク（新URL `/techops/live/:ownerKey/settings`）
//   ・組織の鍵設定へのリンク（歯車アイコン・新URL `/techops/live-org-settings`。
//     ownerKey を取らない画面なので、ここではリンクを出すだけ）
//   ・表示画面（`/live/display/:timerId`）を別タブで開くリンク
//
// マウント時の owner 解決・「取得または作成」は `useLiveProgram`（旧
// `OpenByProjectPage.tsx` の役割をこの画面へ統合）が行う。
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ExternalLink, AlertCircle, Timer, Settings2, KeyRound, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import MiniAppSwitcher from '@/components/journey/MiniAppSwitcher';
import { useLiveProgram } from './useLiveProgram';
import BackToOwner, { type BackToOwnerTarget } from './BackToOwner';
import { useTimer } from '@gmo-onair/shared/src/client/live/useTimer';
import TimerDisplay from '@/components/live/TimerDisplay';
import TimerControls from '@/components/live/TimerControls';
import TimerSettingsPanel from '@/components/live/TimerSettingsPanel';
import ViewerPanel from '@/components/live/ViewerPanel';

interface TimerData { id: string; name: string; phase: string }
interface ProgramData {
  main_timer_id: string | null;
  youtube_urls?: { label: string; url: string }[];
  jstream_lpid?: string | null;
  zoom_meeting_id?: string | null;
  zoom_webinar_id?: string | null;
  teams_meeting_url?: string | null;
}

export default function LiveDashboardPage() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
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
        <EmptyState
          icon={<Timer />}
          title="見つかりませんでした"
          description="管理番号または案件IDを確認してください。"
        />
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
        <EmptyState
          icon={<AlertCircle />}
          title="開けませんでした"
          description={live.message}
        />
      </div>
    );
  }

  return <DashboardContent ownerKey={ownerKey ?? ''} owner={live.owner} programId={live.programId} />;
}

function DashboardContent({ ownerKey, owner, programId }: {
  ownerKey: string;
  owner: BackToOwnerTarget & { glsNumber: string | null };
  programId: string;
}) {
  const { hasPermission } = useAuth();
  // 権限区画の統合（liveops → qsheet）後は、このハブ自体が qsheet 権限で守られているため
  // ここでは manager 判定だけ持てば足りる（client-live 版の usePermissions() に相当）。
  const canManage = hasPermission('qsheet', 'manager');

  const { data: program } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data as ProgramData),
    enabled: !!programId,
    staleTime: 60_000,
  });

  const { data: timers = [] } = useQuery({
    queryKey: ['timers', programId],
    queryFn: () => api.get(`/liveops/timers?program_id=${programId}`).then(r => r.data.data as TimerData[]),
    enabled: !!programId,
  });

  // 運用画面が出すタイマーは liveops_programs.main_timer_id（実装設計 09 §1-6 #2）。
  // 未設定・選ばれたタイマーが消えている場合は先頭のタイマーにフォールバックする。
  const mainTimerId = program?.main_timer_id ?? null;
  const activeTimerId = (mainTimerId && timers.some(t => t.id === mainTimerId))
    ? mainTimerId
    : (timers[0]?.id ?? null);
  const timer = useTimer(activeTimerId);

  return (
    <div className="mx-auto max-w-4xl px-3 py-4 sm:px-6 sm:py-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {/* 狭い画面ではミニアプリの帯を次の行へ回す。同じ行に押し込むと案件名に
          押されて画面外へ出て、右端の項目が押せないまま素で切れる
          （`w-full` にするのが要点 — `flex-1` は折り返しの計算で幅0と数えられ、
           いつまでも同じ行に残る） */}
      <div className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <BackToOwner owner={owner} />
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">計時・視聴者</h1>
          <p className="truncate text-xs text-muted-foreground">{owner.glsNumber ?? owner.name}</p>
        </div>
        <div className="w-full min-w-0 sm:w-auto">
          <MiniAppSwitcher owner={owner} current="liveops" />
        </div>
      </div>

      <div className="mb-3 flex flex-wrap items-center justify-end gap-1.5">
        <a
          href={`/techops/live/${ownerKey}/settings`}
          className="flex min-h-tap items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
        >
          <Settings2 className="h-3.5 w-3.5" />番組設定
        </a>
        {canManage && (
          <a
            href="/techops/live-org-settings"
            className="flex min-h-tap items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            title="計時・視聴者の組織の鍵設定"
          >
            <KeyRound className="h-3.5 w-3.5" />組織の鍵設定
          </a>
        )}
        {activeTimerId && (
          <a
            href={`/live/display/${activeTimerId}`}
            target="_blank"
            rel="noreferrer"
            className="flex min-h-tap items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />表示画面
          </a>
        )}
      </div>

      <div className="space-y-3 sm:space-y-4">

        {/* Timer panel */}
        {timers.length === 0 ? (
          <EmptyState
            icon={<Timer />}
            title="まだタイマーがありません"
            description="本番進行用のタイマーを登録しましょう。"
            action={
              <a href={`/techops/live/${ownerKey}/timers`}>
                <Button size="sm" variant="outline">
                  <Timer className="h-4 w-4 mr-1.5" aria-hidden="true" />タイマーを追加
                </Button>
              </a>
            }
          />
        ) : (
          <div className="rounded-lg border border-border bg-card overflow-hidden">
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Timer</span>
                {timers.length > 1 && (
                  <span className="text-xs text-muted-foreground">
                    — {timers.find(t => t.id === activeTimerId)?.name ?? timers[0].name}
                  </span>
                )}
              </div>
              <div className="flex items-center">
                {canManage && (
                  <TimerSettingsPanel programId={programId} timers={timers} mainTimerId={mainTimerId} />
                )}
                <a href={`/techops/live/${ownerKey}/timers`}>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs text-muted-foreground hover:text-foreground" // ui-tokens-ok: client-live 原実装のまま移植
                  >
                    管理
                  </Button>
                </a>
              </div>
            </div>
            <div className="h-44 sm:h-52">
              <TimerDisplay state={timer.state} compact={false} />
            </div>
            <div className="p-3 sm:p-4 border-t border-border">
              <TimerControls
                state={timer.state}
                onSet={timer.setTime}
                onStart={timer.start}
                onStop={timer.stop}
                onReset={timer.reset}
                onAdjust={timer.adjust}
              />
            </div>
          </div>
        )}

        {/* key で番組ごとに作り直す — プラットフォーム選択 (useState 初期値) を番組切替時に再読込するため */}
        <ViewerPanel key={programId} programId={programId} program={program} canManage={canManage} />
      </div>
    </div>
  );
}
