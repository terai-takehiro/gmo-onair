/**
 * GLS 発番 と 発番できたときの知らせ (v4)
 *
 * ── 「新しい番組」と「いまある案件の回にする」の2つ ──────────────
 *
 * 新しい番組なら GLS 番号を採ります。すでにある番組の続き（第2回・8月分…）なら、
 * その GLS 番号を借りて回を足します。**選び間違えると番号を採り直すことになる**ので、
 * どちらなのかを最初に選ばせます。
 *
 * ── 番組種別・配信媒体は A（スタジオ）案件のときだけ ────────────
 *
 * 入力欄も A のときしか出しません。B で送ると、番組という考え方が無いのに
 * 「収録」が勝手に入ります（実際に起きていました。判断は `useProjectActions`）。
 */
import { Loader2, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { FormDialog, FormDialogFooter } from '@gmo-onair/shared/src/client-v4/formDialog';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { ToggleButtonGroup } from '@gmo-onair/shared/src/client/ui/toggle-button-group';
import { BroadcastTypeLabels, MediaPlatformLabels } from '@/types';
import { GLS_ISSUE_BLOCKED_HINT } from '../../../glsIssue';
import { cn } from '@/lib/utils';
import type { GlsDialogState, GlsProject } from '../types';

export function GlsDialog({
  state, setState, projectName, isCategoryA, canIssueNew, glsProjects, busy, onConfirm,
}: {
  state: GlsDialogState;
  setState: React.Dispatch<React.SetStateAction<GlsDialogState>>;
  projectName: string;
  isCategoryA: boolean;
  /**
   * 新しい番組として番号を採れるか（見積提案＝Cより手前は不可）。
   * false のときは「新しい番組」のカードを選べなくし、**理由を必ず出す**。
   * 「いまある案件に足す」（`mode==='link'`）はこの制限を受けない
   */
  canIssueNew: boolean;
  glsProjects: GlsProject[];
  busy: boolean;
  onConfirm: () => void;
}) {
  const newMode = state.mode === 'new';
  /**
   * **押せない理由を必ず文にする**（黙って disabled にしない）。
   *
   * 元は `blocked` という真偽値だけを持っていたため、条件に引っかかった人には
   * 灰色のボタンしか見えませんでした。実際に「新しい番組として発番できない案件が
   * ある」という報告が上がり、原因（ステージが手前）に誰も気づけなかった。
   * ⚠️ 番組種別・配信媒体は初期値が入っているので普段は当たりませんが、
   * **人が全部外すと無言で押せなくなる**穴も同じ形なのでここに含める。
   */
  const blockReason = busy ? null
    : newMode && !canIssueNew ? GLS_ISSUE_BLOCKED_HINT
      : state.mode === 'link' && !state.target_project_id ? '足す先の GLS 案件を選んでください。'
        : newMode && isCategoryA && state.broadcast_types.length === 0 ? '番組種別を1つ以上選んでください。'
          : newMode && isCategoryA && state.media_platforms.length === 0 ? '配信媒体を1つ以上選んでください。'
            : null;
  const blocked = busy || blockReason !== null;

  return (
    <FormDialog
      open={state.open}
      onOpenChange={(open) => setState((s) => ({ ...s, open }))}
      title="GLS 発番"
      sub="新しい番組として番号を採るか、すでにある GLS 案件の回として足すかを選んでください。"
      footer={(
        <>
          {/* 押せないときは**ボタンのすぐ上**に理由を出す（本文は長くて流れるので下端に置く） */}
          {blockReason && <p className="text-note mb-2 text-warning">{blockReason}</p>}
          <FormDialogFooter>
            <Button variant="outline" onClick={() => setState((s) => ({ ...s, open: false }))}>やめる</Button>
            <Button onClick={onConfirm} disabled={blocked}>
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
              {state.mode === 'link' ? 'GLS 番号を付ける' : 'GLS 番号を採る'}
            </Button>
          </FormDialogFooter>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {([
            {
              mode: 'new' as const,
              title: '新しい番組',
              sub: canIssueNew ? '新しい GLS 番号を採る' : GLS_ISSUE_BLOCKED_HINT,
              disabled: !canIssueNew,
            },
            { mode: 'link' as const, title: 'いまある案件に足す', sub: 'その番組の回として足す', disabled: false },
          ]).map((o) => (
            <button
              key={o.mode}
              type="button"
              aria-pressed={state.mode === o.mode}
              disabled={o.disabled}
              className={cn(
                'min-h-tap rounded-control-lg border-2 p-3 text-left lg:min-h-[44px]',
                o.disabled
                  ? 'cursor-not-allowed border-border opacity-50'
                  : state.mode === o.mode
                    ? 'border-primary-border-strong bg-primary-surface'
                    : 'border-border hover:border-primary-border',
              )}
              onClick={() => {
                if (o.disabled) return;
                setState((s) => ({
                  ...s, mode: o.mode, target_project_id: o.mode === 'new' ? '' : s.target_project_id,
                }));
              }}
            >
              <div className="text-list">{o.title}</div>
              <p className="text-note mt-1 text-muted-foreground">{o.sub}</p>
            </button>
          ))}
        </div>

        <div>
          <Label htmlFor="gls-name">案件名</Label>
          <Input id="gls-name" value={projectName} disabled className="bg-muted" />
        </div>

        {newMode && isCategoryA && (
          <>
            <div>
              <Label>番組種別 *（いくつでも）</Label>
              <div className="mt-2">
                <ToggleButtonGroup
                  options={(Object.entries(BroadcastTypeLabels) as [string, string][])
                    .map(([value, label]) => ({ value, label }))}
                  value={state.broadcast_types}
                  onChange={(next) => setState((s) => ({ ...s, broadcast_types: next }))}
                  multi
                  cols={{ base: 2 }}
                />
              </div>
            </div>
            <div>
              <Label>配信媒体 *（いくつでも）</Label>
              <div className="mt-2">
                <ToggleButtonGroup
                  options={(Object.entries(MediaPlatformLabels) as [string, string][])
                    .map(([value, label]) => ({ value, label }))}
                  value={state.media_platforms}
                  onChange={(next) => setState((s) => ({ ...s, media_platforms: next }))}
                  multi
                  cols={{ base: 2, sm: 3 }}
                />
              </div>
            </div>
          </>
        )}

        {state.mode === 'link' && (
          <div>
            <Label>足す先の GLS 案件 *</Label>
            <SearchableSelect
              options={glsProjects.map((p) => ({
                value: p.id,
                label: `${p.gls_number} ${p.name}`,
                subLabel: p.customer_name,
              }))}
              value={state.target_project_id}
              onChange={(v) => setState((s) => ({ ...s, target_project_id: v }))}
              placeholder="GLS 番号で探す..."
            />
            <p className="text-note mt-1 text-muted-foreground">
              選んだ案件の GLS 番号が付き、概算見積は確定した売上に変わります。
            </p>
          </div>
        )}
      </div>
    </FormDialog>
  );
}

/** 発番できたときの知らせ。番号は**その場で控えられる大きさ**で出す */
export function GlsResultDialog({
  glsNumber, projectName, onClose, onOpenBilling,
}: {
  glsNumber: string;
  projectName: string;
  onClose: () => void;
  onOpenBilling: () => void;
}) {
  return (
    <FormDialog
      open
      onOpenChange={(open) => { if (!open) onClose(); }}
      title="GLS 番号を採りました"
      footer={(
        <FormDialogFooter>
          <Button variant="outline" onClick={onClose}>閉じる</Button>
          <Button onClick={onOpenBilling}>
            <ExternalLink className="mr-2 h-4 w-4" aria-hidden="true" />
            見積・売上へ
          </Button>
        </FormDialogFooter>
      )}
    >
      <div className="space-y-2 rounded-card border border-success-border bg-success-surface p-4">
        <div className="flex justify-between gap-3">
          <span className="text-sub text-muted-foreground">イベントコード</span>
          <span className="text-h2 font-number">{glsNumber}</span>
        </div>
        <div className="flex justify-between gap-3">
          <span className="text-sub text-muted-foreground">案件名</span>
          <span className="text-sub min-w-0 truncate">{projectName}</span>
        </div>
      </div>
    </FormDialog>
  );
}
