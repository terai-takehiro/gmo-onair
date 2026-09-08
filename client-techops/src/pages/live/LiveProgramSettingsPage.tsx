// 計時・視聴者（liveops）— 番組設定（v4.1 段2・ミニアプリ化フェーズ2・このステージ）。
//
// `client-live/src/pages/ProgramsPage.tsx` の移植。落としていない機能:
//   ・番組名・YouTube URL（複数・ラベル付き）・Jstream LPID・
//     Zoom ミーティング/ウェビナー ID・Teams 会議 URL の編集
//   ・保存（PUT /liveops/programs/:id — Teams URL を設定するとサーバー側で
//     Teams サブスクリプションを試みる副作用も含め、エンドポイント自体は
//     このステージで変更していないためそのまま効く）
//   ・紐づき案件（GLS番号・案件名）の読み取り専用表示
//
// マウント時の owner 解決・「取得または作成」は `useLiveProgram`
// （ダッシュボード・タイマー管理と共通）。
import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, Save, AlertCircle, Timer, Loader2 } from 'lucide-react';
import api from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import MiniAppSwitcher from '@/components/journey/MiniAppSwitcher';
import { useLiveProgram } from './useLiveProgram';
import BackToOwner, { type BackToOwnerTarget } from './BackToOwner';

interface YoutubeUrl { label: string; url: string }
interface LiveProgram {
  id: string;
  name: string;
  jstream_lpid: string | null;
  youtube_urls: YoutubeUrl[];
  zoom_meeting_id: string | null;
  zoom_webinar_id: string | null;
  teams_meeting_url: string | null;
  project_id: string | null;
  project_name?: string;
  gls_number?: string | null;
  qsheet_program_id: string | null;
  qsheet_program_name?: string;
}

/** 視聴者数を取る先。並びはそのまま画面の並びになる */
type SourceKey = 'youtube' | 'jstream' | 'zoom' | 'teams';
const SOURCE_LABELS: { key: SourceKey; label: string }[] = [
  { key: 'youtube', label: 'YouTube' },
  { key: 'jstream', label: 'Jstream' },
  { key: 'zoom', label: 'Zoom' },
  { key: 'teams', label: 'Teams' },
];

export default function LiveProgramSettingsPage() {
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
      <PageShell width="narrow">
        <EmptyState icon={<Timer />} title="見つかりませんでした" description="GLS番号または案件IDを確認してください。" />
      </PageShell>
    );
  }

  if (live.status === 'unsupported-scope') {
    return (
      <PageShell width="narrow">
        <BackToOwner owner={live.owner} />
        <EmptyState
          icon={<Timer />}
          title="案件からのみ開けます"
          description="計時・視聴者は案件からだけ開けます。案件のハブ画面から開いてください。"
        />
      </PageShell>
    );
  }

  if (live.status === 'error') {
    return (
      <PageShell width="narrow">
        {live.owner && <BackToOwner owner={live.owner} />}
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={live.message} />
      </PageShell>
    );
  }

  return <ProgramSettingsContent owner={live.owner} programId={live.programId} />;
}

function ProgramSettingsContent({ owner, programId }: {
  owner: BackToOwnerTarget & { glsNumber: string | null };
  programId: string;
}) {
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('qsheet', 'manager');

  const [name, setName] = useState('');
  const [jstreamLpid, setJstreamLpid] = useState('');
  const [youtubeUrls, setYoutubeUrls] = useState<YoutubeUrl[]>([{ label: '', url: '' }]);
  const [zoomMeetingId, setZoomMeetingId] = useState('');
  const [zoomWebinarId, setZoomWebinarId] = useState('');
  const [teamsMeetingUrl, setTeamsMeetingUrl] = useState('');
  const [saved, setSaved] = useState(false);
  /**
   * **どの配信基盤から視聴者数を取るか。**（入力順の見直し）
   * 5系統の欄を常に全部縦に並べていたが、同じアプリの配信設定（`streaming/MeetingCard.tsx`）は
   * 「どのツールか」を先に選ばせ、そのツールに要る欄だけを出す。同じ種類の入力で
   * 作法が2つあったので、先に取る先を選ばせる形へそろえる。
   * ⚠️ **伏せた欄の値は消さない**（`streaming/meetingFields.ts` 冒頭と同じ決めごと）。
   * 保存で送る中身も今までどおり全系統をそのまま送る — 出し分けは描画だけ。
   */
  const [sources, setSources] = useState<Set<SourceKey>>(new Set());
  // **このprogramIdぶん、フォームへ流し込み終えたか。** `['program', programId]` は
  // ダッシュボード（`LiveDashboardPage.tsx`）と同じキャッシュ鍵で、`refetchOnWindowFocus`
  // の既定・保存成功後の `invalidateQueries` で `program` の参照はこの画面を開いたまま
  // 何度も変わりうる。ここに絞りが無いと、そのたびに下の effect が走って
  // **入力中の内容がサーバー値で黙って上書きされる**（`useProjectForm.ts` の
  // `keepDirtyValues` と同じ問題。ここは react-hook-form を使っていないので、
  // 素朴に「このIDの分は最初の1回しか流し込まない」で防ぐ）。
  const syncedProgramIdRef = useRef<string | null>(null);

  const { data: program, isLoading } = useQuery({
    queryKey: ['program', programId],
    queryFn: () => api.get(`/liveops/programs/${programId}`).then(r => r.data.data as LiveProgram),
    enabled: !!programId,
    staleTime: 30_000,
  });

  // Populate form when data loads（このprogramIdの分、まだ流し込んでいなければ1回だけ）
  useEffect(() => {
    if (!program || syncedProgramIdRef.current === programId) return;
    setName(program.name);
    setJstreamLpid(program.jstream_lpid ?? '');
    setYoutubeUrls(program.youtube_urls.length > 0 ? program.youtube_urls : [{ label: '', url: '' }]);
    setZoomMeetingId(program.zoom_meeting_id ?? '');
    setZoomWebinarId(program.zoom_webinar_id ?? '');
    setTeamsMeetingUrl(program.teams_meeting_url ?? '');
    // 既に値が入っている系統は最初から開いておく（設定済みの内容が画面から消えて見えないように）
    const on = new Set<SourceKey>();
    if (program.youtube_urls.some((u) => u.url.trim())) on.add('youtube');
    if (program.jstream_lpid) on.add('jstream');
    if (program.zoom_meeting_id || program.zoom_webinar_id) on.add('zoom');
    if (program.teams_meeting_url) on.add('teams');
    setSources(on);
    syncedProgramIdRef.current = programId;
  }, [program, programId]);

  const toggleSource = (key: SourceKey) => setSources((prev) => {
    const next = new Set(prev);
    // 外しても値は消さない（もう一度入れれば、入れた値がそのまま出る）
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const saveMutation = useMutation({
    mutationFn: () => api.put(`/liveops/programs/${programId}`, {
      name,
      jstreamLpid: jstreamLpid || null,
      youtubeUrls: youtubeUrls.filter(u => u.url.trim()),
      zoomMeetingId: zoomMeetingId || null,
      zoomWebinarId: zoomWebinarId || null,
      teamsMeetingUrl: teamsMeetingUrl || null,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['program', programId] });
      qc.invalidateQueries({ queryKey: ['programs-all'] });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
  });

  const addYtUrl = () => setYoutubeUrls(prev => [...prev, { label: '', url: '' }]);
  const removeYtUrl = (i: number) => setYoutubeUrls(prev => prev.filter((_, idx) => idx !== i));
  const updateYtUrl = (i: number, key: 'label' | 'url', v: string) =>
    setYoutubeUrls(prev => prev.map((u, idx) => idx === i ? { ...u, [key]: v } : u));

  return (
    <PageShell width="narrow">
      <BackToOwner owner={owner} />
      {/* 見出しの右の保存は `children` に置く（`primaryAction` にしない）。
          スマホでは共通シェルの下端の差し込み口へ移るので、フォーム末尾の
          「設定を保存」と同じ場所に2つ並ぶ */}
      <PageHeader title="番組設定" sub={owner.glsNumber ?? owner.name}>
        <MiniAppSwitcher owner={owner} current="liveops" />
        {canManage && (
          <Button
            size="sm"
            className="h-9 text-sub-sm"
            onClick={() => saveMutation.mutate()}
            disabled={!name.trim() || saveMutation.isPending}
          >
            {saved ? '保存済み ✓' : <><Save className="h-3.5 w-3.5 mr-1" />保存</>}
          </Button>
        )}
      </PageHeader>

      {isLoading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-6 w-6 animate-spin rounded-full border-3 border-primary border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-5">
          {/* GLS link info (read-only) */}
          {program?.project_name && (
            <div className="rounded-note border border-border bg-muted/30 px-4 py-3 text-sub">
              <span className="text-sub-sm text-muted-foreground">紐づき案件: </span>
              {program.gls_number && (
                <span className="text-sub-sm text-primary mr-2">{program.gls_number}</span>
              )}
              <span className="text-list">{program.project_name}</span>
            </div>
          )}
          {/* 独自作成の番組（マニュアル）に紐づく場合の表示（migration 237） */}
          {program?.qsheet_program_name && (
            <div className="rounded-note border border-border bg-muted/30 px-4 py-3 text-sub">
              <span className="text-sub-sm text-muted-foreground">紐づき番組: </span>
              <span className="text-list">{program.qsheet_program_name}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>番組名</Label>
            <Input
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="番組名"
              disabled={!canManage}
            />
          </div>

          {/* **先に「どこから取るか」を決める。** 使わない基盤の欄まで常に縦に並んでいると、
              5系統ぶんスクロールしてから自分の使う欄を探すことになる */}
          <div className="space-y-2">
            <Label>視聴者数を取る先</Label>
            <div className="flex flex-wrap gap-2">
              {SOURCE_LABELS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  aria-pressed={sources.has(s.key)}
                  onClick={() => toggleSource(s.key)}
                  disabled={!canManage}
                  className={`min-h-tap rounded-chip border px-3 text-sub lg:min-h-[36px] ${
                    sources.has(s.key)
                      ? 'border-primary bg-primary-surface text-primary'
                      : 'border-border text-muted-foreground hover:bg-muted'
                  }`}
                >
                  {s.label}
                </button>
              ))}
            </div>
            <p className="text-note text-muted-foreground">
              選んだ先の欄だけを出します。外しても、入れた値は消えません。
            </p>
          </div>

          {sources.has('youtube') && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>YouTube URL</Label>
              {canManage && (
                <Button
                  type="button" variant="ghost" size="sm"
                  className="h-6 text-sub-sm" // ui-tokens-ok: client-live 原実装のまま移植（このステージは移植のみ）
                  onClick={addYtUrl}
                >
                  <Plus className="h-3 w-3 mr-1" />追加
                </Button>
              )}
            </div>
            {youtubeUrls.map((u, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="ラベル"
                  value={u.label}
                  onChange={e => updateYtUrl(i, 'label', e.target.value)}
                  className="w-24 shrink-0"
                  disabled={!canManage}
                />
                <Input
                  placeholder="https://youtube.com/watch?v=... または https://youtube.com/live/..."
                  value={u.url}
                  onChange={e => updateYtUrl(i, 'url', e.target.value)}
                  className="flex-1"
                  disabled={!canManage}
                />
                {canManage && youtubeUrls.length > 1 && (
                  <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => removeYtUrl(i)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                )}
              </div>
            ))}
          </div>
          )}

          {sources.has('jstream') && (
          <div className="space-y-1.5">
            <Label>Jstream LPID</Label>
            <Input
              value={jstreamLpid}
              onChange={e => setJstreamLpid(e.target.value)}
              placeholder="例: 123456"
              disabled={!canManage}
            />
          </div>
          )}

          {sources.has('zoom') && (
          <>
          <div className="space-y-1.5">
            <Label>Zoom ミーティング ID</Label>
            <Input
              value={zoomMeetingId}
              onChange={e => setZoomMeetingId(e.target.value)}
              placeholder="例: 123 456 7890"
              disabled={!canManage}
            />
          </div>

          <div className="space-y-1.5">
            <Label>Zoom ウェビナー ID</Label>
            <Input
              value={zoomWebinarId}
              onChange={e => setZoomWebinarId(e.target.value)}
              placeholder="例: 987 654 3210"
              disabled={!canManage}
            />
            {(zoomMeetingId || zoomWebinarId) && (
              <p className="text-note text-muted-foreground">両方設定すると参加者数を合算します</p>
            )}
          </div>
          </>
          )}

          {sources.has('teams') && (
          <div className="space-y-1.5">
            <Label>Teams 会議 URL</Label>
            <Input
              value={teamsMeetingUrl}
              onChange={e => setTeamsMeetingUrl(e.target.value)}
              placeholder="https://teams.microsoft.com/l/meetup-join/..."
              disabled={!canManage}
            />
            <p className="text-note text-muted-foreground">「会議リンクをコピー」で取得したURLを貼り付け。ミーティング・ウェビナー共通。</p>
          </div>
          )}

          {canManage && (
            <Button
              onClick={() => saveMutation.mutate()}
              disabled={!name.trim() || saveMutation.isPending}
              className="w-full sm:w-auto"
            >
              {saved ? '保存済み ✓' : '設定を保存'}
            </Button>
          )}
        </div>
      )}
    </PageShell>
  );
}
