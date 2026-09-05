/**
 * 「要整理」ビューの行アクション（docs/core-redesign-plan.md §3-2・Phase1 #6）
 *
 * 停滞している案件を前にしたとき、人が取れる手は4つしかありません:
 *   次の一手 … やり取りタブへ行って次回アクションを書く（案件を生かす）
 *   スヌーズ … 再開日を決めて意図して寝かせる（無期限には寝かせられない）
 *   見送り   … 案件にならなかったと認めて閉じる（失注分析に混ざらない理由で）
 *   失注     … 案件だったが取れなかったと認めて閉じる
 *
 * この4つを**一覧の行の上に置く**のが要点です。旧実装は「開いて・タブを探して・
 * 変えて・戻る」の N×4 手で、クローズが重いから誰も閉じず、ゴミが溜まりました。
 *
 * ── 行の主クリック（案件を開く）との分離 ────────────────────────
 *
 * 行全体が「開く」ボタンなので、この帯は **click/keydown を必ず止めます**。
 * 止め忘れると「スヌーズを押したのに詳細が開く」になります。
 * カード（スマホ）は行自体が `<button>` なので、**この帯はカードの外**
 * （`<li>` の中・ボタンの下）に置くこと — button の入れ子は HTML として無効です。
 */
import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { ArrowRight, AlarmClock, Archive, XCircle } from 'lucide-react';
import api from '@/lib/api';
import { notifySuccess, notifyApiError } from '@gmo-onair/shared/src/client/notify';
import { useAuth } from '@/contexts/platform/AuthContext';
import { LostDialog, type LostPayload } from '../projectDetail/LostDialog';
import { SnoozeDialog } from './snooze';
import type { ProjectListRow } from './types';

/** 帯の中の1ボタン。小さく・静かに（主役は行の案件名。ここは道具） */
function ActionButton({
  icon: Icon, label, tone, onClick,
}: {
  icon: typeof ArrowRight;
  label: string;
  tone?: 'destructive';
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`text-sub inline-flex min-h-tap items-center gap-1 rounded-control border border-border bg-card px-2.5 lg:min-h-[32px] ${
        tone === 'destructive'
          ? 'text-destructive hover:bg-destructive-surface'
          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      {label}
    </button>
  );
}

export function TidyActions({ p }: { p: ProjectListRow }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('sales', 'editor');
  const [dialog, setDialog] = useState<null | 'snooze' | 'pass' | 'lost'>(null);

  /**
   * 見送り・失注はどちらも `e_lost` ＋理由（`LostDialog` の `mode` 参照）。
   * invalidate は3点セット（一覧・詳細・台帳）— 片方だけ欠けると
   * 「閉じたのに台帳では生きている」になる（client/CLAUDE.md の実例）。
   */
  const closeStage = useMutation({
    mutationFn: (payload: LostPayload) =>
      api.patch(`/projects/${p.id}/stage`, { stage: 'e_lost', ...payload }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['projects'] });
      qc.invalidateQueries({ queryKey: ['project', p.id] });
      qc.invalidateQueries({ queryKey: ['project-ledger'] });
      notifySuccess(dialog === 'pass' ? '失注にしました（案件化せず。ステージ帯からいつでも戻せます）' : '失注にしました');
      setDialog(null);
    },
    onError: (err) => notifyApiError('ステージを変更できませんでした', err),
  });

  return (
    /* **行のクリックに食われない**（行は div[role=button] で click と Enter/Space を拾う） */
    <div
      className="mt-1.5 flex flex-wrap items-center gap-1.5"
      onClick={(e) => e.stopPropagation()}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <ActionButton icon={ArrowRight} label="次の一手" onClick={() => navigate(`/sales/projects/${p.id}/thread`)} />
      {canEdit && (
        <>
          <ActionButton icon={AlarmClock} label="スヌーズ" onClick={() => setDialog('snooze')} />
          <ActionButton icon={Archive} label="案件化せず" onClick={() => setDialog('pass')} />
          <ActionButton icon={XCircle} label="失注" tone="destructive" onClick={() => setDialog('lost')} />
        </>
      )}

      <SnoozeDialog
        open={dialog === 'snooze'}
        onOpenChange={(v) => !v && setDialog(null)}
        projectId={p.id}
        current={p.snooze_until}
      />
      {/* 「案件化せず」と失注は同じダイアログの `mode` 違い（理由の初期選択だけ変わる。どちらも `e_lost`） */}
      <LostDialog
        open={dialog === 'pass' || dialog === 'lost'}
        onOpenChange={(v) => !v && setDialog(null)}
        mode={dialog === 'pass' ? 'pass' : 'lost'}
        busy={closeStage.isPending}
        onConfirm={(payload) => closeStage.mutate(payload)}
      />
    </div>
  );
}
