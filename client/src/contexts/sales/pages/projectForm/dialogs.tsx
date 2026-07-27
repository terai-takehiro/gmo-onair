// 案件フォームのダイアログ 7 種 — v2.9.292 で ProjectFormPage.tsx から切り出し。
//
// なぜ 1 ファイルにまとめたか: どれも「開く / 閉じる + 1 つの操作」だけの小さな部品で、
// 単独で開くことはない (必ず案件フォームから開く)。7 ファイルに割ると
// import が 7 行増えるだけで探しやすさは上がらない。
//
// **JSX は 1 行も変えていない** (props 経由に置き換えただけ)。
import { AlertTriangle, CalendarDays, CheckCircle2, ExternalLink, Loader2, Trophy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { confirmAction } from '@gmo-onair/shared/src/client/ui';
import { ToggleButtonGroup } from '@gmo-onair/shared/src/client/ui/toggle-button-group';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  ProjectStageLabels, BroadcastTypeLabels, MediaPlatformLabels, type ProjectStage,
} from '@/types';
import type { GlsDialogState, LostDialogState } from './types';

/** react-query の mutation のうち、ダイアログが使う分だけを型にする */
// react-query の UseMutationResult をそのまま渡せる形にする
// (ダイアログが使うのは mutate と isPending だけ)
interface Mutation<T = unknown> { mutate: (v: T) => void; isPending: boolean }

export interface ProjectLite {
  name?: string;
  gls_number?: string | null;
  event_start?: string | null;
  event_end?: string | null;
  previous_gls_numbers?: string[] | null;
}

export interface GlsProjectOption {
  id: string; gls_number: string; name: string; customer_name: string;
}

export function StageConfirmDialog({
  open, onOpenChange, currentStage, stageSelectValue, setStageSelectValue, stageMutation,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  currentStage: ProjectStage;
  stageSelectValue: string;
  setStageSelectValue: (v: string) => void;
  stageMutation: Mutation<{ stage: string }>;
}) {
  return (
    <>
          {/* ステージ変更確認ダイアログ */}
          <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-500" />
                  ステージ変更の確認
                </DialogTitle>
                <DialogDescription>
                  {(currentStage === 's_completed' || currentStage === 'e_lost') && (
                    <span className="font-semibold text-red-600">終了済みステージから復帰します。意図的な操作か確認してください。</span>
                  )}
                  {currentStage !== 's_completed' && currentStage !== 'e_lost' && (
                    <span>「{ProjectStageLabels[currentStage]}」から「{stageSelectValue ? ProjectStageLabels[stageSelectValue as ProjectStage] : ''}」に変更します。</span>
                  )}
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => { onOpenChange(false); setStageSelectValue(""); }}>キャンセル</Button>
                <Button
                  onClick={() => {
                    onOpenChange(false);
                    stageMutation.mutate({ stage: stageSelectValue });
                    setStageSelectValue("");
                  }}
                >
                  変更する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
    </>
  );
}

export function GlsResultDialog({
  glsResult, setGlsResult, project, onGoEpisodes,
}: {
  glsResult: { open: boolean; glsNumber: string } | null;
  setGlsResult: (v: null) => void;
  project: ProjectLite | undefined;
  onGoEpisodes: () => void;
}) {
  return (
    <>
          {/* GLS発番完了ダイアログ */}
          {glsResult && (
            <Dialog open={glsResult.open} onOpenChange={(open) => { if (!open) setGlsResult(null); }}>
              <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2 text-green-700">
                    <CheckCircle2 className="h-6 w-6" />
                    GLS発番完了
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 py-4">
                  <div className="rounded-lg border bg-green-50 p-4 space-y-2">
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">イベントコード</span>
                      <span className=" font-bold text-lg">{glsResult.glsNumber}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">案件名</span>
                      <span className="font-medium">{project?.name}</span>
                    </div>
                  </div>
                </div>
                <DialogFooter className="flex gap-2 sm:gap-2">
                  <Button variant="outline" onClick={() => { setGlsResult(null); }}>
                    閉じる
                  </Button>
                  <Button onClick={() => { setGlsResult(null); onGoEpisodes(); }}>
                      <ExternalLink className="mr-2 h-4 w-4" />
                      見積・売上管理へ
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
    </>
  );
}

export function HoldPromptDialog({
  open, onOpenChange, project, onGoSchedule,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  project: ProjectLite | undefined;
  onGoSchedule: () => void;
}) {
  return (
    <>
          {/* 仮押さえ完了 → スタジオ予約誘導ダイアログ */}
          <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-blue-700">
                  <CalendarDays className="h-5 w-5" />
                  仮押さえに移行しました
                </DialogTitle>
                <DialogDescription>
                  スタジオの日程を押さえましょう。カレンダーから空き状況を確認して予約できます。
                </DialogDescription>
              </DialogHeader>
              <div className="py-4">
                <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 space-y-2">
                  <div className="flex justify-between">
                    <span className="text-sm text-muted-foreground">案件名</span>
                    <span className="font-medium text-sm">{project?.name}</span>
                  </div>
                  {project?.event_start && (
                    <div className="flex justify-between">
                      <span className="text-sm text-muted-foreground">イベント予定日</span>
                      <span className="font-medium text-sm">{project.event_start}{project.event_end && project.event_end !== project.event_start ? ` 〜 ${project.event_end}` : ''}</span>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter className="flex gap-2 sm:gap-2">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  あとで
                </Button>
                <Button
                  className="bg-blue-600 hover:bg-blue-700"
                  onClick={onGoSchedule}
                >
                  <CalendarDays className="mr-2 h-4 w-4" />
                  スタジオ予約へ
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
    </>
  );
}

export function CategorySwitchDialog({
  dialog, setDialog, glsCategory, project, categorySwitchMutation,
}: {
  dialog: { open: boolean; target: 'A' | 'B' };
  setDialog: (fn: { open: boolean; target: 'A' | 'B' } | ((s: { open: boolean; target: 'A' | 'B' }) => { open: boolean; target: 'A' | 'B' })) => void;
  glsCategory: string;
  project: ProjectLite | undefined;
  categorySwitchMutation: Mutation<'A' | 'B'>;
}) {
  return (
    <>
          {/* 案件分類 A↔B 切替 (GLS発番済の採番し直し確認) */}
          <Dialog open={dialog.open} onOpenChange={(o) => setDialog((s) => ({ ...s, open: o }))}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>案件分類を変更しますか？</DialogTitle>
                <DialogDescription>
                  {glsCategory === 'A' ? 'スタジオ案件 (GLS-A)' : 'ビジネス案件 (GLS-B)'}
                  {' → '}
                  {dialog.target === 'A' ? 'スタジオ案件 (GLS-A)' : 'ビジネス案件 (GLS-B)'}
                  に切り替えます。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-3 text-sm">
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
                    <div className="space-y-1.5">
                      <p className="font-medium">この案件は GLS 発番済みです ({project?.gls_number})</p>
                      <p>切替に伴い以下が自動で更新されます:</p>
                      <ul className="list-disc list-inside text-xs space-y-0.5">
                        <li>GLS 番号を新カテゴリ側で<strong>採番し直し</strong></li>
                        <li>エピソードコード (例: <code>{project?.gls_number}-001</code>) も新番号に書換</li>
                        <li>BOX フォルダ名（社内限り / 社外共有可）を新 GLS 番号にリネーム</li>
                        <li>既発行 PDF（見積書 / 請求書）の手元ファイルは更新されません</li>
                      </ul>
                    </div>
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDialog({ open: false, target: 'A' })} disabled={categorySwitchMutation.isPending}>
                  キャンセル
                </Button>
                <Button
                  onClick={() => categorySwitchMutation.mutate(dialog.target)}
                  disabled={categorySwitchMutation.isPending}
                >
                  {categorySwitchMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  採番し直して変更
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
    </>
  );
}

export function LostDialog({
  lostDialog, setLostDialog, lostReasonCategories, stageMutation,
}: {
  lostDialog: LostDialogState;
  setLostDialog: (v: LostDialogState) => void;
  lostReasonCategories: { id: string; name: string }[];
  stageMutation: Mutation<{ stage: string; lost_reason?: string; lost_reason_note?: string; lessons_learned?: string }>;
}) {
  return (
    <>
          {/* 失注ダイアログ */}
          <Dialog open={lostDialog.open} onOpenChange={(open) => setLostDialog({ ...lostDialog, open })}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="h-5 w-5" />
                  失注登録
                </DialogTitle>
                <DialogDescription>
                  失注理由を記録してください。今後の営業改善に活用されます。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div>
                  <Label>失注理由 *</Label>
                  <div className="mt-2 space-y-2">
                    {lostReasonCategories.map((cat) => (
                      <label key={cat.id} className="flex items-center gap-2 cursor-pointer">
                        <input
                          type="radio" name="lost_reason" value={cat.name}
                          checked={lostDialog.lost_reason === cat.name}
                          onChange={(e) => setLostDialog({ ...lostDialog, lost_reason: e.target.value })}
                          className="accent-red-500"
                        />
                        <span className="text-sm">{cat.name}</span>
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <Label>補足メモ</Label>
                  <Textarea
                    value={lostDialog.lost_reason_note}
                    onChange={(e) => setLostDialog({ ...lostDialog, lost_reason_note: e.target.value })}
                    placeholder="失注に至った経緯など"
                    rows={2}
                  />
                </div>
                <div>
                  <Label>教訓・学び</Label>
                  <Textarea
                    value={lostDialog.lessons_learned}
                    onChange={(e) => setLostDialog({ ...lostDialog, lessons_learned: e.target.value })}
                    placeholder="次回に活かすべきポイント、改善すべき点など"
                    rows={3}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    ここに記録した内容は営業レビューの失注分析で共有されます
                  </p>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setLostDialog({ ...lostDialog, open: false })}>キャンセル</Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    stageMutation.mutate({
                      stage: 'e_lost',
                      lost_reason: lostDialog.lost_reason,
                      lost_reason_note: lostDialog.lost_reason_note,
                      lessons_learned: lostDialog.lessons_learned,
                    });
                    setLostDialog({ open: false, lost_reason: '', lost_reason_note: '', lessons_learned: '' });
                  }}
                  disabled={!lostDialog.lost_reason || stageMutation.isPending}
                >
                  {stageMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  失注にする
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
    </>
  );
}

export function RelinkDialog({
  relinkDialog, setRelinkDialog, glsProjects, project, relinkMutation, projectId,
}: {
  relinkDialog: { open: boolean; target_project_id: string };
  setRelinkDialog: (v: { open: boolean; target_project_id: string }) => void;
  glsProjects: GlsProjectOption[];
  project: ProjectLite | undefined;
  relinkMutation: Mutation<string>;
  projectId: string | undefined;
}) {
  return (
    <>
          {/* 別GLSへ紐づけ直しダイアログ (発番済み案件をエピソード化) */}
          <Dialog open={relinkDialog.open} onOpenChange={(open) => setRelinkDialog({ ...relinkDialog, open })}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>別GLSのエピソードへ紐づけ直す</DialogTitle>
                <DialogDescription>
                  この案件（現在 {project?.gls_number}）を、選択した既存GLS案件のエピソードとして付け替えます。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div>
                  <Label>紐づけ先のGLS案件</Label>
                  <SearchableSelect
                    options={glsProjects
                      .filter((p) => p.id !== projectId)
                      .map((p) => ({ value: p.id, label: `${p.gls_number}　${p.name}`, subLabel: p.customer_name }))}
                    value={relinkDialog.target_project_id}
                    onChange={(v) => setRelinkDialog({ ...relinkDialog, target_project_id: v })}
                    placeholder="GLS番号で検索..."
                  />
                </div>
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800 space-y-1">
                  <p>適用すると以下が行われます：</p>
                  <ul className="list-disc pl-4 space-y-0.5">
                    <li>GLS番号が紐づけ先のものに変わり、エピソードコードは新GLSで採番し直されます</li>
                    <li>現在のGLS番号（{project?.gls_number}）は履歴 (previous_gls_numbers) に保存されます</li>
                    <li>BOXフォルダ名・Qシートのエピソードコードも新GLSに更新されます</li>
                    <li>概算見積が残っていれば確定売上に変換されます（売上/仕入の実績はそのまま保持）</li>
                  </ul>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setRelinkDialog({ open: false, target_project_id: "" })}>キャンセル</Button>
                <Button
                  disabled={!relinkDialog.target_project_id || relinkMutation.isPending}
                  onClick={async () => {
                    if ((await confirmAction({ title: "この案件を選択したGLSのエピソードに紐づけ直します。よろしいですか？" }))) {
                      relinkMutation.mutate(relinkDialog.target_project_id);
                    }
                  }}
                >
                  {relinkMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  紐づけ直す
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
    </>
  );
}

export function GlsIssueDialog({
  glsDialog, setGlsDialog, glsProjects, isCategoryA, project, handleGlsConfirm, glsMutation, linkGlsMutation,
}: {
  glsDialog: GlsDialogState;
  setGlsDialog: (v: GlsDialogState) => void;
  glsProjects: GlsProjectOption[];
  isCategoryA: boolean;
  project: ProjectLite | undefined;
  handleGlsConfirm: () => void;
  glsMutation: Mutation<{ broadcast_type: string | null; media_platform: string | null }>;
  linkGlsMutation: Mutation<string>;
}) {
  return (
    <>
          {/* GLS発番ダイアログ */}
          <Dialog open={glsDialog.open} onOpenChange={(open) => setGlsDialog({ ...glsDialog, open })}>
            <DialogContent className="sm:max-w-md max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-green-600" />
                  GLS発番
                </DialogTitle>
                <DialogDescription>
                  新規番組としてGLS番号を発番するか、既存のGLS案件にエピソードを追加するか選択してください。
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {/* モード選択 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <button
                    type="button"
                    className={`rounded-lg border-2 p-3 text-left transition-colors ${glsDialog.mode === 'new' ? 'border-green-500 bg-green-50' : 'border-muted hover:border-green-300'}`}
                    onClick={() => setGlsDialog({ ...glsDialog, mode: 'new', target_project_id: '' })}
                  >
                    <div className="font-medium text-sm">新規番組</div>
                    <p className="text-xs text-muted-foreground mt-1">新しいGLS番号を発番</p>
                  </button>
                  <button
                    type="button"
                    className={`rounded-lg border-2 p-3 text-left transition-colors ${glsDialog.mode === 'link' ? 'border-blue-500 bg-blue-50' : 'border-muted hover:border-blue-300'}`}
                    onClick={() => setGlsDialog({ ...glsDialog, mode: 'link' })}
                  >
                    <div className="font-medium text-sm">既存案件に追加</div>
                    <p className="text-xs text-muted-foreground mt-1">エピソード追加</p>
                  </button>
                </div>

                <div>
                  <Label>案件名</Label>
                  <Input value={project?.name || ""} disabled className="bg-muted" />
                </div>

                {/* 新規モード: A系の場合は番組種別と配信媒体（複数選択可） */}
                {glsDialog.mode === 'new' && isCategoryA && (
                  <>
                    <div>
                      <Label>番組種別 * <span className="text-xs text-muted-foreground">(複数選択可)</span></Label>
                      <div className="mt-2">
                        <ToggleButtonGroup
                          options={(Object.entries(BroadcastTypeLabels) as [string, string][]).map(([val, label]) => ({ value: val, label }))}
                          value={glsDialog.broadcast_types}
                          onChange={(next) => setGlsDialog({ ...glsDialog, broadcast_types: next })}
                          multi
                          cols={{ base: 2 }}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>配信媒体 * <span className="text-xs text-muted-foreground">(複数選択可)</span></Label>
                      <div className="mt-2">
                        <ToggleButtonGroup
                          options={(Object.entries(MediaPlatformLabels) as [string, string][]).map(([val, label]) => ({ value: val, label }))}
                          value={glsDialog.media_platforms}
                          onChange={(next) => setGlsDialog({ ...glsDialog, media_platforms: next })}
                          multi
                          cols={{ base: 2, sm: 3 }}
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* リンクモード: 既存GLS案件を選択 */}
                {glsDialog.mode === 'link' && (
                  <div>
                    <Label>リンク先GLS案件 *</Label>
                    <SearchableSelect
                      options={glsProjects.map((p) => ({
                        value: p.id,
                        label: `${p.gls_number} ${p.name}`,
                        subLabel: p.customer_name,
                      }))}
                      value={glsDialog.target_project_id}
                      onChange={(v) => setGlsDialog({ ...glsDialog, target_project_id: v })}
                      placeholder="GLS番号で検索..."
                    />
                    <p className="text-xs text-muted-foreground mt-1">
                      選択した案件のGLS番号が割り当てられ、概算見積が確定売上に変換されます。
                    </p>
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setGlsDialog({ ...glsDialog, open: false })}>キャンセル</Button>
                <Button
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleGlsConfirm}
                  disabled={
                    glsMutation.isPending || linkGlsMutation.isPending ||
                    (glsDialog.mode === 'link' && !glsDialog.target_project_id) ||
                    (glsDialog.mode === 'new' && isCategoryA &&
                      (glsDialog.broadcast_types.length === 0 || glsDialog.media_platforms.length === 0))
                  }
                >
                  {(glsMutation.isPending || linkGlsMutation.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {glsDialog.mode === 'link' ? 'GLS番号をリンク' : 'GLS発番する'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
    </>
  );
}

