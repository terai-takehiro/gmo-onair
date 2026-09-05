// テロップCG — ランキング発表パーツ（part_key: 'ranking'）の演出SE管理画面
// （`/techops/graphics/:ownerKey/sounds`・段6-5）。
//
// プロジェクト単位で、ステップ切替（title/ranks52/winner-bar/...）ごとに鳴らす効果音を
// アップロード・音量調整・削除する。旧 `client-awards` の CGコックピット内の演出SE設定
// （event 単位）を、テロップCGの project 単位に置き換えた新規UI。
// `TemplateManagerPage.tsx` と同じ owner 解決（`useGraphicsProject`）・同じ画面の骨組み。
import { useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  AlertCircle, ChevronLeft, Loader2, Music, Trash2, Volume2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Switch } from '@gmo-onair/shared/src/client/ui/switch';
import { EmptyState } from '@gmo-onair/shared/src/client/dashboard';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  deleteRankingSound, fetchRankingSounds, updateRankingSound, uploadRankingSound,
  type RankingSoundRow,
} from '@/lib/graphicsSoundsApi';
import type { OwnerContext } from '@/lib/deviceSettingsApi';
import type { RankingStep } from './rankingFields';
import { useGraphicsProject } from './useGraphicsProject';

/** 演出SEを割り当てられるステップ（`RankingStep` の一部——idle はカットアウトのみで
 *  SE設定の対象にしない。survey-oneshot は段6-6以降の範囲のためここでは出さない） */
const SOUND_STEPS: { value: RankingStep; label: string }[] = [
  { value: 'title', label: 'タイトル' },
  { value: 'nominees', label: 'ノミネート' },
  { value: 'ranks52', label: 'RANKS（5→2位）' },
  { value: 'winner-bar', label: 'winner-bar（1位バー）' },
  { value: 'oneshot', label: 'oneshot（決定カット）' },
  { value: 'top3', label: 'TOP3' },
  { value: 'final-pitch', label: 'Final Pitch' },
  { value: 'celebration', label: 'Celebration' },
];
const STEP_LABEL = new Map(SOUND_STEPS.map((s) => [s.value, s.label]));

const RANK_START_OPTIONS = [5, 4, 3, 2] as const;

function soundsPath(ownerKey: string): string {
  return `/techops/graphics/${encodeURIComponent(ownerKey)}/sounds`;
}
function templatesPath(ownerKey: string): string {
  return `/techops/graphics/${encodeURIComponent(ownerKey)}/templates`;
}

export default function RankingSoundsPanel() {
  const { ownerKey } = useParams<{ ownerKey: string }>();
  const { state } = useGraphicsProject(ownerKey);

  if (state.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center py-16">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
      </div>
    );
  }
  if (state.status === 'not-found') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<Music />} title="見つかりませんでした" description="GLS番号が合っているか確かめてください。" />
      </div>
    );
  }
  if (state.status === 'error') {
    return (
      <div className="mx-auto max-w-lg px-4 py-10">
        <EmptyState icon={<AlertCircle />} title="開けませんでした" description={state.message} />
      </div>
    );
  }

  return (
    <RankingSoundsContent
      ownerKey={ownerKey ?? ''}
      owner={state.owner}
      projectId={state.bundle.project.id}
    />
  );
}

function graphicsSoundsQueryKey(projectId: string) {
  return ['graphics-ranking-sounds', projectId] as const;
}

function RankingSoundsContent({ ownerKey, owner, projectId }: {
  ownerKey: string;
  owner: OwnerContext;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const queryKey = graphicsSoundsQueryKey(projectId);
  const listQuery = useQuery({ queryKey, queryFn: () => fetchRankingSounds(projectId) });
  const sounds = listQuery.data ?? [];

  const [step, setStep] = useState<RankingStep>('ranks52');
  const [rankStart, setRankStart] = useState<string>('5');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const invalidate = () => void queryClient.invalidateQueries({ queryKey });

  const handleFilePick = async (file: File | undefined) => {
    if (!file) return;
    setUploading(true);
    try {
      await uploadRankingSound(projectId, {
        step,
        rankStart: step === 'ranks52' ? Number(rankStart) : null,
        file,
      });
      notifySuccess('演出SEをアップロードしました');
      invalidate();
    } catch {
      notifyError('音を取り込めませんでした。', { description: 'MP3 / WAV の 10MB までのファイルを選び直してください。' });
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const volumeMutation = useMutation({
    mutationFn: ({ id, volume }: { id: number; volume: number }) => updateRankingSound(id, { volume }),
    onSuccess: invalidate,
    onError: () => notifyError('音量を変更できませんでした'),
  });
  const enabledMutation = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) => updateRankingSound(id, { enabled }),
    onSuccess: invalidate,
    onError: () => notifyError('切り替えできませんでした'),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: number) => deleteRankingSound(id),
    onSuccess: () => { notifySuccess('演出SEを削除しました'); invalidate(); },
    onError: () => notifyError('削除できませんでした'),
  });

  const removeSound = async (s: RankingSoundRow) => {
    if (!(await confirmAction({
      title: `「${STEP_LABEL.get(s.step as RankingStep) ?? s.step}」の演出SEを削除しますか？`,
      description: '削除すると、このステップに切り替わっても音が鳴らなくなります（無音のまま進行）。',
      confirmLabel: '削除する',
      tone: 'danger',
    }))) return;
    deleteMutation.mutate(s.id);
  };

  return (
    <div className="px-4 py-6 sm:px-6 sm:py-8">
      <Link
        to={templatesPath(ownerKey)}
        className="mb-2 inline-flex min-h-tap items-center gap-1 rounded-control-md px-1.5 text-sub font-bold text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        テンプレート管理へ戻る
      </Link>

      <div className="min-w-0">
        <h1 className="text-h1">演出SE ／ {owner.name}</h1>
        <p className="mt-1 text-sub text-muted-foreground">
          ランキング発表（<strong className="font-bold text-foreground">ranking</strong> パーツ）のステップ切替時に鳴らす効果音。旧リアルタイムCGの演出SEの移植です — 出力URLに <code className="rounded bg-surface-subtle px-1">?audio=1</code> を付けたときだけ鳴ります。
        </p>
      </div>

      {/* アップロードフォーム */}
      <div className="mt-4 flex flex-col gap-3 rounded-card border border-border bg-card p-4 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1">
          <Label>ステップ</Label>
          <Select value={step} onValueChange={(v) => setStep(v as RankingStep)}>
            <SelectTrigger className="w-full sm:w-52">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SOUND_STEPS.map((s) => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {step === 'ranks52' && (
          <div className="flex flex-col gap-1">
            <Label>開始順位</Label>
            <Select value={rankStart} onValueChange={setRankStart}>
              <SelectTrigger className="w-full sm:w-32">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {RANK_START_OPTIONS.map((r) => (
                  <SelectItem key={r} value={String(r)}>{r}位から</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="flex flex-col gap-1">
          <Label>音声ファイル（MP3 / WAV）</Label>
          <input
            ref={fileInputRef}
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,.mp3,.wav"
            disabled={uploading}
            onChange={(e) => void handleFilePick(e.target.files?.[0])}
            className="block min-h-tap w-full max-w-xs rounded-control-md border border-border bg-background text-sub file:mr-3 file:min-h-tap file:rounded-control-md file:border-0 file:bg-primary file:px-3 file:text-sub file:font-bold file:text-primary-foreground"
          />
        </div>

        {uploading && (
          <div className="flex items-center gap-1.5 text-sub text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />アップロード中…
          </div>
        )}
      </div>

      {/* 一覧 */}
      {listQuery.isLoading ? (
        <div className="mt-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-label="読み込み中" />
        </div>
      ) : sounds.length === 0 ? (
        <div className="mt-4 rounded-card border border-border bg-card">
          <EmptyState
            icon={<Music />}
            title="演出SEがまだありません"
            description="上のフォームからステップを選び、音声ファイルをアップロードしてください。"
          />
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-2">
          {sounds.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center gap-3 rounded-card border border-border bg-card p-3">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-list font-bold">{STEP_LABEL.get(s.step as RankingStep) ?? s.step}</span>
                  {s.rankStart != null && (
                    <span className="inline-flex h-5 items-center whitespace-nowrap rounded-control bg-info-surface px-1.5 text-[10px] font-bold text-info">
                      {s.rankStart}位から
                    </span>
                  )}
                </div>
                <audio controls preload="none" src={s.url} className="mt-1.5 h-8 w-full max-w-xs" />
              </div>

              <div className="flex items-center gap-1.5">
                <Volume2 className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  defaultValue={s.volume}
                  aria-label="音量"
                  className="w-24"
                  onChange={(e) => volumeMutation.mutate({ id: s.id, volume: Number(e.target.value) })}
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Switch
                  checked={s.enabled}
                  onCheckedChange={(checked) => enabledMutation.mutate({ id: s.id, enabled: checked })}
                  aria-label={s.enabled ? '有効' : '無効'}
                />
                <span className="text-sub text-muted-foreground">{s.enabled ? '有効' : '無効'}</span>
              </div>

              <Button type="button" variant="ghost" size="icon" aria-label="演出SEを削除" onClick={() => void removeSound(s)}>
                <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export { soundsPath };
