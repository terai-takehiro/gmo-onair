// 計時・視聴者（liveops）— 案件に入っていない既存の番組（v4.1 段2・レビュー対応）。
//
// セッション一覧の廃止（`client-live/src/pages/SessionHomePage.tsx` 削除）で、
// `project_id IS NULL` の既存 `liveops_programs`（旧スタンドアロン作成）へ到達する画面が
// どこにも無くなっていた。旧URL（`/live/program/:id`）の案内文「案件から開き直してください」も
// 実行不可能だった — 案件から開くと**別の新しい** program が作られるだけで、
// 既存のスタンドアロン program（そこに設定済みのタイマー・YouTube/Zoom/Teams紐づけ等）とは
// 別物になる（現場運用レビューでの指摘）。
//
// ここは「新規のスタンドアロン作成」を復活させるものではない — **一覧・閲覧・既存タイマーを
// 開く導線だけ**（GROUND_RULES §致命的2）。旧 `SessionHomePage.tsx` が持っていた
// 「＋新規作成」ダイアログは意図的に持たせていない。
//
// `useLegacyProgramRedirect.ts`（`client-live` 側の旧URLリダイレクト）が
// `project_id` の無い program を見つけると、ここへ `?program=<id>` 付きで飛ばす。
import { useState } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, ShieldOff, Timer, Youtube, Globe, Video, ExternalLink, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { useTimer } from '@gmo-onair/shared/src/client/live/useTimer';
import TimerDisplay from '@/components/live/TimerDisplay';
import TimerControls from '@/components/live/TimerControls';
import ViewerPanel from '@/components/live/ViewerPanel';

interface LiveProgram {
  id: string;
  name: string;
  project_id: string | null;
  qsheet_program_id: string | null;
  youtube_urls: { label: string; url: string }[];
  jstream_lpid: string | null;
  zoom_meeting_id: string | null;
  zoom_webinar_id: string | null;
  teams_meeting_url: string | null;
  created_at: string;
}
interface TimerData { id: string; name: string; phase: string }

export default function LiveLegacyProgramsPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('qsheet', 'manager');
  const [searchParams] = useSearchParams();
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('program'));

  const Header = (
    <div className="flex items-center gap-3 border-b border-border bg-card px-4 py-2">
      <button
        type="button"
        onClick={() => navigate('/techops/top')}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
        aria-label="戻る"
      >
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-sm font-bold">計時・視聴者 — 案件未紐付けの番組</h1>
        <p className="truncate text-xs text-muted-foreground">
          案件に結びつけずに作られた古い番組の一覧です。ここで新しく作ることはできません。
        </p>
      </div>
      {/* レビュー指摘（②組織の鍵設定への導線が実質1本しかない）対応: 従来はダッシュボードの
          歯車アイコン（プロジェクトを1回開かないと辿り着けない）だけが入口だった。
          この管理者向け画面からも開けるようにする（新規作成ではなく既存導線の追加なので
          §致命的2のスコープの範囲内） */}
      <a
        href="/techops/live-org-settings"
        className="flex min-h-tap shrink-0 items-center gap-1.5 rounded-md px-2.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        組織の鍵設定
      </a>
    </div>
  );

  if (!canManage) {
    return (
      <div className="flex h-full flex-col">
        {Header}
        <div className="flex flex-1 items-center justify-center gap-2 text-muted-foreground">
          <ShieldOff className="h-5 w-5" />
          <span className="text-sm">この一覧を見るには 制作技術支援の「管理」が必要です。</span>
        </div>
      </div>
    );
  }

  return <LegacyProgramsContent Header={Header} selectedId={selectedId} onSelect={setSelectedId} />;
}

function LegacyProgramsContent({ Header, selectedId, onSelect }: {
  Header: React.ReactNode;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const { data: programs = [], isLoading } = useQuery({
    queryKey: ['liveops-legacy-programs'],
    queryFn: () => api.get('/liveops/programs').then(
      // ⚠️ migration 237 で qsheet_program_id が増えた後は、project_id が無いだけでは
      // 「案件にも番組にも紐づかない」とは言えない — 「独自作成の番組」に紐づく行
      // （qsheet_program_id が入っている）も project_id は常に null になるため、
      // 両方 null の行だけを本当の「案件・番組どちらにも紐づかない」旧データとして絞る。
      (r) => (r.data.data as LiveProgram[]).filter((p) => !p.project_id && !p.qsheet_program_id),
    ),
  });

  const selected = programs.find((p) => p.id === selectedId) ?? null;

  return (
    <div className="flex h-full flex-col">
      {Header}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden sm:flex-row">
        {/* Program list */}
        <div className="border-b border-border sm:w-72 sm:shrink-0 sm:border-b-0 sm:border-r sm:overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" aria-label="読み込み中" />
            </div>
          ) : programs.length === 0 ? (
            <div className="p-4">
              <EmptyState
                icon={<Timer />}
                title="案件未紐付けの番組はありません"
                description="いま残っている番組は、すべて案件に入っています。"
              />
            </div>
          ) : (
            <div className="space-y-0.5 p-2">
              {programs.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => onSelect(p.id)}
                  className={`flex min-h-tap w-full items-center justify-between gap-2 rounded-md px-3 py-2.5 text-left text-sm transition-colors ${
                    selectedId === p.id
                      ? 'bg-primary/15 font-medium text-primary'
                      : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                  }`}
                >
                  <span className="min-w-0 truncate">{p.name}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 opacity-50" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Detail */}
        <div className="flex-1 overflow-y-auto p-3 sm:p-4">
          {!selected ? (
            <div className="flex h-full items-center justify-center py-16 text-sm text-muted-foreground">
              左の一覧から番組を選んでください
            </div>
          ) : (
            // key でセッションごとに作り直す — 同じインスタンスを使い回すと、
            // ViewerPanel の配信プラットフォーム選択 (useState 初期値) が前のセッションの
            // まま残り、計測開始が前のセッションの選択で走る
            <LegacyProgramDetail key={selected.id} program={selected} />
          )}
        </div>
      </div>
    </div>
  );
}

function LegacyProgramDetail({ program }: { program: LiveProgram }) {
  const [selectedTimerId, setSelectedTimerId] = useState<string | null>(null);

  const { data: timers = [] } = useQuery({
    queryKey: ['timers', program.id],
    queryFn: () => api.get(`/liveops/timers?program_id=${program.id}`).then((r) => r.data.data as TimerData[]),
  });

  const activeTimerId = timers.some((t) => t.id === selectedTimerId) ? selectedTimerId : (timers[0]?.id ?? null);
  const timer = useTimer(activeTimerId);

  return (
    <div className="mx-auto max-w-3xl space-y-3 sm:space-y-4">
      {/* 読み取り専用の紐づけ情報。編集はこの画面の対象外（GROUND_RULES §致命的2） */}
      <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
        <h2 className="mb-2 text-sm font-bold">{program.name}</h2>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          {program.youtube_urls.length > 0 && (
            <span className="flex items-center gap-1"><Youtube className="h-3.5 w-3.5" />{program.youtube_urls.length} 件</span>
          )}
          {program.jstream_lpid && <span className="flex items-center gap-1"><Globe className="h-3.5 w-3.5" />Jstream</span>}
          {(program.zoom_meeting_id || program.zoom_webinar_id) && (
            <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" />Zoom</span>
          )}
          {program.teams_meeting_url && <span className="flex items-center gap-1"><Video className="h-3.5 w-3.5" />Teams</span>}
          {program.youtube_urls.length === 0 && !program.jstream_lpid && !program.zoom_meeting_id
            && !program.zoom_webinar_id && !program.teams_meeting_url && (
            <span>視聴者の数え先は未設定です</span>
          )}
        </div>
      </div>

      {timers.length === 0 ? (
        <EmptyState icon={<Timer />} title="まだタイマーがありません" description="この番組にはタイマーが1つも登録されていません。" />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-2">
            {timers.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setSelectedTimerId(t.id)}
                className={`rounded-md px-2.5 py-1.5 text-xs transition-colors ${
                  t.id === activeTimerId ? 'bg-primary/15 font-medium text-primary' : 'text-muted-foreground hover:bg-accent'
                }`}
              >
                {t.name}
              </button>
            ))}
            {activeTimerId && (
              <a
                href={`/live/display/${activeTimerId}`}
                target="_blank"
                rel="noreferrer"
                className="ml-auto flex min-h-tap items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <ExternalLink className="h-3.5 w-3.5" />表示画面
              </a>
            )}
          </div>
          <div className="h-44 sm:h-52">
            <TimerDisplay state={timer.state} compact={false} />
          </div>
          <div className="border-t border-border p-3 sm:p-4">
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

      <ViewerPanel programId={program.id} program={program} canManage />
    </div>
  );
}
