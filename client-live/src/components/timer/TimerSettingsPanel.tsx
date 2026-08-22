import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from '@/components/ui/select';
import { Settings2 } from 'lucide-react';

interface TimerOption { id: string; name: string }

interface TimerDetail {
  id: string;
  project_id: string | null;
  program_id: string | null;
  viewer_overlay_program_id: string | null;
  warning_threshold_sec: number;
}

/** 黄色に変わるしきい値のプリセット（実装設計 09-live-timer.md §1-6 #1） */
const THRESHOLD_PRESETS = [
  { value: 30, label: '30秒' },
  { value: 60, label: '1分' },
  { value: 120, label: '2分' },
  { value: 300, label: '5分' },
];

interface TimerSettingsPanelProps {
  programId: string;
  timers: TimerOption[];
  /** liveops_programs.main_timer_id（未設定なら null） */
  mainTimerId: string | null;
}

/**
 * 運用画面がどのタイマーを出すか（主タイマー）と、
 * そのタイマーの黄色のしきい値を選ぶ設定パネル（実装設計09 §1-6 #1・#2、PR5）。
 */
export default function TimerSettingsPanel({ programId, timers, mainTimerId }: TimerSettingsPanelProps) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);

  // まだ選ばれていない・選ばれたタイマーが消えている場合は先頭のタイマーが実質の主タイマー
  const effectiveMainTimerId = (mainTimerId && timers.some(t => t.id === mainTimerId))
    ? mainTimerId
    : (timers[0]?.id ?? null);

  const [selectedMainId, setSelectedMainId] = useState<string | null>(effectiveMainTimerId);
  const [thresholdSec, setThresholdSec] = useState(60);

  useEffect(() => {
    if (open) setSelectedMainId(effectiveMainTimerId);
  }, [open, effectiveMainTimerId]);

  const { data: timerDetail } = useQuery({
    queryKey: ['timerDetail', selectedMainId],
    queryFn: () => api.get(`/liveops/timers/${selectedMainId}`).then(r => r.data.data as TimerDetail),
    enabled: open && !!selectedMainId,
  });

  useEffect(() => {
    if (timerDetail) setThresholdSec(Number(timerDetail.warning_threshold_sec) || 60);
  }, [timerDetail]);

  const mainTimerMutation = useMutation({
    mutationFn: (timerId: string | null) =>
      api.put(`/liveops/programs/${programId}`, { mainTimerId: timerId }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['program', programId] }),
  });

  const thresholdMutation = useMutation({
    mutationFn: (sec: number) => {
      if (!selectedMainId || !timerDetail) throw new Error('タイマーが選ばれていません');
      // ⚠️ timers PUT は projectId/programId/viewerOverlayProgramId を省略すると
      //    NULL で上書きしてしまうため、必ず現在の値を渡し直す。
      return api.put(`/liveops/timers/${selectedMainId}`, {
        projectId: timerDetail.project_id,
        programId: timerDetail.program_id,
        viewerOverlayProgramId: timerDetail.viewer_overlay_program_id,
        warningThresholdSec: sec,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['timerDetail', selectedMainId] });
      qc.invalidateQueries({ queryKey: ['timers', programId] });
    },
  });

  const saving = mainTimerMutation.isPending || thresholdMutation.isPending;

  const handleSave = async () => {
    if (selectedMainId !== effectiveMainTimerId) {
      await mainTimerMutation.mutateAsync(selectedMainId);
    }
    if (selectedMainId && (!timerDetail || Number(timerDetail.warning_threshold_sec) !== thresholdSec)) {
      await thresholdMutation.mutateAsync(thresholdSec);
    }
    setOpen(false);
  };

  if (timers.length === 0) return null;

  return (
    <>
      <Button
        variant="ghost"
        size="sm"
        className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
        onClick={() => setOpen(true)}
        title="タイマー設定（主タイマー・黄色のしきい値）"
      >
        <Settings2 className="h-3.5 w-3.5" />
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="md">
          <DialogHeader>
            <DialogTitle>タイマー設定</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>運用画面に出すタイマー（主タイマー）</Label>
              <Select
                value={selectedMainId ?? undefined}
                onValueChange={(v) => setSelectedMainId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="タイマーを選択" />
                </SelectTrigger>
                <SelectContent>
                  {timers.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                表示画面（<span className="font-mono">/live/display/:timerId</span>）のURLは変わりません。
                ここではダッシュボードに出す1本を選ぶだけです。
              </p>
            </div>

            <div className="space-y-1.5">
              <Label>黄色に変わるしきい値</Label>
              <Select
                value={String(thresholdSec)}
                onValueChange={(v) => setThresholdSec(Number(v))}
                disabled={!selectedMainId}
              >
                <SelectTrigger>
                  <SelectValue placeholder="しきい値を選択" />
                </SelectTrigger>
                <SelectContent>
                  {THRESHOLD_PRESETS.map(p => (
                    <SelectItem key={p.value} value={String(p.value)}>{p.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                残り時間がこの秒数以下になると、タイマーが黄色に変わります（0で赤）。
              </p>
            </div>

            {(mainTimerMutation.isError || thresholdMutation.isError) && (
              <p className="text-xs text-destructive">保存に失敗しました。もう一度お試しください。</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving || !selectedMainId}>
              {saving ? '保存中…' : '保存'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
