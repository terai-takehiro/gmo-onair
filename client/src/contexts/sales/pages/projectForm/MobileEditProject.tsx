/**
 * 案件を直す（スマホ）
 *
 * ── PC 専用だった理由と、直す画面ではその理由が当てはまらない理由 ─────
 *
 * この画面は「入力欄が40以上あり、途中で電話が入ると書きかけが残ります」という
 * 理由でスマホから閉じていました。**案件作成**（`MobileNewProject.tsx`）は
 * この問題を段階ウィザードで解決していますが、**直す画面には向きません** —
 * 直す画面は**保存済みの値を初期表示する**ので、「途中で何段目まで入れたか
 * 分からなくなる」という段の問題がそもそも起きません。
 *
 * → ここでは段ではなく**アコーディオン**にします。案件作成と同じ2枚
 * （いま必要な5つ ／ 進んだら聞く）はカードのまま、それ以外
 * （担当メンバー・予約・日程・番組情報・BOX・書類）は PC の `ProjectFormPage.tsx`
 * と同じ並びで縦積みにします。**中身は書き写さず、同じセクション部品を呼びます**。
 *
 * **自動下書き保存はスコープ外**（ご指示）。「途中で電話が入ると書きかけが残る」
 * 問題への直接対応はせず、まず操作できる形にすることに集中します。
 *
 * ── 送るところは PC と1つ ─────────────────────────────────────
 *
 * `useProjectForm` の返り値（`f`）をそのまま受け取ります。保存・検証・GLS の
 * 操作はどれも PC と同じ関数を呼ぶだけで、ここでは1つも書き直しません。
 * ダイアログ（見積シミュレーション・GLS・取引先の新規作成・スタジオ予約…）は
 * 呼び出し元（`ProjectFormPage.tsx`）が PC と共通で描きます。
 *
 * ── ヘッダーの操作群はシートに畳む ──────────────────────────
 *
 * GLS 発番・付け替え・プロジェクト管理へ移す・関連ページ・削除は、PC では
 * 見出しに横並びですが 375px には収まりません。共通の折りたたみ部品
 * （`DropdownMenu` 等）が shared に無いため、既にある `client-v4/sheet.tsx`
 * の `<Sheet>` で「操作」シートにまとめます（一覧から1件ずつ片づける画面向けの
 * 部品ですが、「押すと選べる操作の一覧が下から出る」という形はここにも合います）。
 */
import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft, ChevronDown, ChevronRight, FolderKanban, Link2,
  Loader2, MoreVertical, Save, Trash2, Trophy,
} from 'lucide-react';
import { Sheet } from '@gmo-onair/shared/src/client-v4/sheet';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ProjectStageLabels } from '@/types';
import ProjectQuickLinks from '@/contexts/shared/components/ProjectQuickLinks';
import { glsGuideText } from '../projectDetail/glsGuide';
import { moreFieldCount } from '../projectNew/fields';
import { RequiredFields } from '../projectNew/RequiredFields';
import { MoreFields } from '../projectNew/MoreFields';
import { RegularSeriesSection } from '../projectNew/RegularSeriesSection';
import { MembersSection } from './MembersSection';
import { BookingListSection } from './BookingListSection';
import { ScheduleSection } from './ScheduleSection';
import { hasEventBooking } from './eventBookings';
import { BroadcastSection } from './BroadcastSection';
import { BoxSection } from './BoxSection';
import { DocsSection } from './DocsSection';
import type { ProjectFormState } from './useProjectForm';
import type { ProjectBooking } from './types';

export function MobileEditProject({
  f, id, backTo, canDelete, amountExtra, openCalendar, onAddBooking, onEditBooking,
}: {
  f: ProjectFormState;
  id: string | undefined;
  backTo: string;
  canDelete: boolean;
  /** 予算欄のすぐ下に置くもの（料金シミュレーション・AI下書き）。PC と同じものを渡す */
  amountExtra: ReactNode;
  /** カレンダーで空きを見る。スタジオ案件（A）で発番済みのときだけ渡す */
  openCalendar?: () => void;
  onAddBooking: () => void;
  onEditBooking: (b: ProjectBooking) => void;
}) {
  const navigate = useNavigate();
  const {
    form, isEdit, project, schedule, actions, fields, missing, onSubmit, saveMutation,
    studioLocations, currentStage, isYomi, hasGls, canIssueNewGls, isCategoryA,
  } = f;
  const [menuOpen, setMenuOpen] = useState(false);
  // 「進んだら聞く」は直す画面では開いた状態で出す（PC と同じ理由。`ProjectFormPage.tsx` 参照）
  const [more, setMore] = useState(true);

  return (
    <div className="flex min-h-full flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-card px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label="案件の中身に戻る"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control-lg border border-border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
          </button>
          <h1 className="text-h1 min-w-0 flex-1 truncate">案件を直す</h1>
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="操作メニューを開く"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-control-lg border border-border hover:bg-muted"
          >
            <MoreVertical className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
          </button>
        </div>
        <div className="mt-1.5 flex items-center gap-2">
          <Badge variant="outline">{ProjectStageLabels[currentStage] || currentStage}</Badge>
          <p className="text-note min-w-0 flex-1 truncate text-muted-foreground">
            {[project?.name, project?.gls_number || project?.code].filter(Boolean).join(' ・ ')}
          </p>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col">
        <div className="flex-1 space-y-3.5 p-4">
          {/*
            入れ忘れ。**欄のすぐ上に出す**（PC と同じ文面・色。`ProjectFormPage.tsx` 参照）
          */}
          {missing.length > 0 && (
            <p className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-2 text-sub text-warning">
              {missing.join(' ・ ')} が入っていないので、まだ保存できません
            </p>
          )}

          {/* ここから2枚は**案件作成と同じ部品・同じ見た目**（`projectNew/`） */}
          <div className="rounded-card border border-primary-border bg-card px-4 py-4">
            <p className="text-cardtitle mb-3">いま必要な5つ</p>
            <RequiredFields f={fields} mode="edit" />
          </div>

          <div className="rounded-card overflow-hidden border border-border bg-card">
            <button
              type="button"
              onClick={() => setMore((o) => !o)}
              aria-expanded={more}
              className="min-h-tap flex w-full items-center gap-2.5 px-4 py-3 text-left hover:bg-muted"
            >
              {more
                ? <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                : <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="text-list font-bold">進んだら聞く</span>
              <span className="text-badge font-number rounded-badge-xs bg-muted px-1.5 py-0.5 text-muted-foreground">
                {moreFieldCount(fields.v.audience, 'edit')}
              </span>
              <span className="flex-1" />
              <span className="text-note text-muted-foreground">あとから足せます</span>
            </button>

            {more && (
              <div className="border-t border-border-faint px-4 pb-4 pt-4">
                <MoreFields f={fields} mode="edit" amountExtra={amountExtra} />
              </div>
            )}
          </div>

          {/* 回を作るたびに聞かれては困る4つの取り決め（PC と同じ部品。`ProjectFormPage.tsx` 参照） */}
          <RegularSeriesSection f={fields} />

          {/* ここから下は**直す画面だけが持つもの**（PC と同じセクション部品を縦積み） */}
          <MembersSection projectId={isEdit ? id : undefined} />

          {isEdit && (
            <BookingListSection
              bookings={actions.bookings}
              onAdd={onAddBooking}
              onEdit={onEditBooking}
              onDelete={actions.deleteBooking}
            />
          )}

          <ScheduleSection
            s={schedule}
            studioLocations={studioLocations}
            isEdit={isEdit}
            hasBookings={hasEventBooking(actions.bookings)}
            onOpenCalendar={openCalendar}
          />

          {hasGls && isCategoryA && <BroadcastSection form={form} />}

          <BoxSection
            form={form}
            isEdit={isEdit}
            onCreate={actions.handleCreateBoxFolder}
            creating={actions.createBoxFolderMutation.isPending}
          />

          <DocsSection form={form} />
        </div>

        {/* 主役は保存。**下端に固定**して、長い縦積みのどこからでも押せるようにする */}
        <div
          className="sticky bottom-0 z-10 flex gap-2 border-t border-border bg-card px-4 py-3"
          style={{ paddingBottom: 'calc(0.75rem + env(safe-area-inset-bottom))' }}
        >
          <Button type="button" variant="outline" className="flex-1" onClick={() => navigate(backTo)}>
            やめる
          </Button>
          <Button type="submit" className="flex-1" disabled={saveMutation.isPending || missing.length > 0}>
            {saveMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
            保存
          </Button>
        </div>
      </form>

      {/*
        GLS の操作・関連ページ・削除。**PC の見出しと同じ操作を同じ関数で呼ぶだけ**
        （判定ロジックは1行も書き直していない）。押したらシートを閉じる —
        開いたままだとダイアログの下にシートが残って二重に見える。
      */}
      <Sheet open={menuOpen} onOpenChange={setMenuOpen} title="操作" sub="この案件でできること">
        <div className="space-y-2 py-1">
          <Button
            variant="outline" className="w-full justify-start"
            onClick={() => { setMenuOpen(false); navigate(`/sales/projects/${id}`); }}
          >
            案件の中身を見る
          </Button>

          {isYomi && (
            <Button
              className="w-full justify-start"
              title={glsGuideText(currentStage)}
              disabled={actions.glsMutation.isPending}
              onClick={() => {
                setMenuOpen(false);
                actions.setGlsDialog((s) => ({
                  ...s, open: true,
                  // **口頭決定（B）より手前は「新しい番組」を選べない**ので、
                  // 押せる「いまある案件に足す」を既定にして開く（PC と同じ理由）
                  mode: canIssueNewGls ? s.mode : 'link',
                }));
              }}
            >
              <Trophy className="mr-2 h-4 w-4" aria-hidden="true" />
              GLS 発番
            </Button>
          )}

          {hasGls && (
            <>
              <Button
                variant="outline" className="w-full justify-start"
                onClick={() => { setMenuOpen(false); actions.setRelinkDialog({ open: true, target_project_id: '' }); }}
              >
                <Link2 className="mr-2 h-4 w-4" aria-hidden="true" />
                別の GLS へ付け替える
              </Button>
              <Button
                variant="outline" className="w-full justify-start"
                onClick={() => { setMenuOpen(false); actions.setCategorySwitchDialog({ open: true, target: 'B' }); }}
              >
                <FolderKanban className="mr-2 h-4 w-4" aria-hidden="true" />
                プロジェクト管理へ移す…
              </Button>
            </>
          )}

          {id && (
            <div className="pt-2">
              <p className="text-note mb-1.5 text-muted-foreground">関連ページ</p>
              <ProjectQuickLinks
                projectId={id}
                projectName={form.watch('name') || project?.name}
                currentPage="project"
                vertical
                className="w-full [&>button]:w-full [&>button]:justify-start"
              />
            </div>
          )}

          {isEdit && canDelete && (
            <Button
              variant="outline"
              className="w-full justify-start text-destructive hover:text-destructive"
              disabled={actions.deleteMutation.isPending}
              onClick={() => { setMenuOpen(false); actions.handleDeleteProject(); }}
            >
              {actions.deleteMutation.isPending
                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />}
              削除
            </Button>
          )}
        </div>
      </Sheet>
    </div>
  );
}
