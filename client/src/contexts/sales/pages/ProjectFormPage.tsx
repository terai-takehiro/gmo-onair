/**
 * 案件を直す画面 (v4)
 *
 * ── 入力欄は「案件作成」と同じものを使います ────────────────────
 *
 * この画面は長いあいだ**自前の欄**を持っていました。その結果、案件作成
 * （`/sales/projects/new`）で訊く
 *
 *   客入れの有無 ／ 案件分類 ／ ご担当 ／ 継続区分 ／ 来場人数 ／
 *   案件内容 ／ リード経路
 *
 * が**この画面にひとつも無く**、代わりに旧1段の「案件種類」
 * （ハイブリッド／生放送／収録／…）だけが残っていました。
 * つまり**作るときに入れたものを、あとから直す場所がどこにも無い**うえ、
 * 同じ案件が画面によって違う分類で見えていました。
 * 言葉も揃っておらず（顧客／お客様・主担当／社内の担当・想定金額／予算）、
 * 見出しの型も枠の形も別物でした。
 *
 * → **`projectNew/RequiredFields` と `projectNew/MoreFields` をそのまま呼びます。**
 *   項目を足すときは `projectNew/fields.ts` に足すだけで両方に出ます。
 *   **この画面に欄を書き足さないこと。**
 *
 * ── 案件作成と違うのは4つだけ（どれも理由があります）──────────
 *
 *  1. **ステージの欄が無い** … 段を動かすと履歴が1行増え、失注は理由が要り、
 *     受注は GLS 発番の確認が挟まります。この保存（`PUT /projects/:id`）は
 *     `stage` を1文字も見ないので、置くと**押せるのに何も起きない欄**になります。
 *     見出しの札で見せ、変えるのは案件詳細のヘッダーです
 *  2. **実施日の欄が無い** … 下の「スタジオの日程」が `project_dates` の唯一のもとです。
 *     2か所から同じ列を全置換すると、片方で足した日が消えます
 *  3. **最初のタスク・メモの欄が無い** … タスクはタスクタブ、メモはやり取りが持ちます。
 *     直すたびに同じものが1件ずつ増えるためです
 *  4. **グループ区分がある** … 見積の単価（定価 / グループ内価格）がこの値で決まり、
 *     直せる場所がここ以外にありません
 *
 * ── ここに詳細と同じものを戻さないこと ─────────────────────────
 *
 * 分割前はここに詳細と同じものが**別の実装で**載っていました:
 * ステージの帯・AI 起票の帯・売上／仕入／粗利・「今すべきこと」・
 * 「お客様とのやり取り」・概算見積カード・GLS 発番済みの帯。行き先は:
 *
 *   AI 起票の「確認した」 → `projectDetail/AiReviewBanner.tsx`（概要タブ）
 *   ステージを変える     → `projectDetail/DetailHeader.tsx`
 *   失注の理由入力       → `projectDetail/LostDialog.tsx`
 *   やり取り・次の一手   → 概要タブ ／ やり取りタブ
 *   売上・仕入・粗利     → 概要タブ ／ 見積・請求タブ
 *
 * **見出しに案件詳細へ戻る導線を必ず置くこと。** `/edit` を直接ブックマークして
 * いる人が、やり取り・次のアクションに辿り着けなくなります。
 *
 * ── GLS まわりの操作は見出しにまとめてあります ──────────────────
 *
 * 発番 ／ 別の GLS へ付け替える ／ プロジェクト管理へ移す は、どれも
 * 「この案件の番号をどうするか」の話なので1か所に並べます。
 * モックは「受注が決まったら自動で採る」形ですが、**番号を採る時期を変えるのは
 * 業務の決めごと**なので、画面の作り直しと同じ回では動かしません。
 */
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft, Calculator, Check, ChevronDown, ChevronRight, FolderKanban,
  Link2, Loader2, Save, Sparkles, Trash2, Trophy,
} from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Delayed, SkeletonRows, ErrorPanel } from '@gmo-onair/shared/src/client/states';
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/contexts/platform/AuthContext';
import { formatRelativeTime } from '@/lib/format';
import ProjectQuickLinks from '@/contexts/shared/components/ProjectQuickLinks';
import { ProjectStageLabels } from '@/types';
import { glsGuideText } from './projectDetail/glsGuide';
import { moreFieldCount } from './projectNew/fields';
import { RequiredFields } from './projectNew/RequiredFields';
import { MoreFields } from './projectNew/MoreFields';
import { useProjectForm } from './projectForm/useProjectForm';
import { MembersSection } from './projectForm/MembersSection';
import { BookingListSection } from './projectForm/BookingListSection';
import { ScheduleSection } from './projectForm/ScheduleSection';
import { hasEventBooking } from './projectForm/eventBookings';
import { BroadcastSection } from './projectForm/BroadcastSection';
import { BoxSection } from './projectForm/BoxSection';
import { DocsSection } from './projectForm/DocsSection';
import { FormDialogs } from './projectForm/FormDialogs';
import { MobileEditProject } from './projectForm/MobileEditProject';
import type { ProjectBooking } from './projectForm/types';

export default function ProjectFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const f = useProjectForm(id);
  const { form, isEdit, project, schedule, actions } = f;
  const { hasPermission } = useAuth();
  // 削除は `DELETE /projects/:id` と同じ縛り（サーバーが `requirePermission('sales','manager')`）。
  // ここより緩くすると「押せるのに 403」になる（他の削除ボタンと同じ理由）
  const canDelete = hasPermission('sales', 'manager');

  const [bookingDialogOpen, setBookingDialogOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<ProjectBooking | null>(null);
  /**
   * 「進んだら聞く」は**直す画面では開いた状態で出します**。枠も項目も
   * 案件作成と同じで、初めから開いているかどうかだけが違います —
   * 直しに来た人が探しているのはたいていこの中の項目で、
   * 畳んでおくと「入れたはずのものが無い」と読まれます。
   */
  const [more, setMore] = useState(true);
  // **スマホは丸ごと入れ替える**（`MobileEditProject.tsx`）。判定は1回だけ呼び、
  // 部品の中で早期 return しない — 幅が変わった瞬間にフック数が変わって React が落ちる
  const isMobile = useIsMobile();
  const handleAddBooking = () => { setEditingBooking(null); setBookingDialogOpen(true); };
  const handleEditBooking = (b: ProjectBooking) => { setEditingBooking(b); setBookingDialogOpen(true); };

  if (f.isLoading) {
    return <div className="p-4 lg:p-6"><Delayed><SkeletonRows rows={6} /></Delayed></div>;
  }
  if (f.isLoadError) {
    return (
      <div className="p-4 lg:p-6">
        <ErrorPanel title="案件を読み込めませんでした" onRetry={() => navigate(0)} />
        <Button variant="outline" className="mt-3" onClick={() => navigate('/sales/projects')}>
          <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" />
          案件一覧に戻る
        </Button>
      </div>
    );
  }

  const backTo = isEdit ? `/sales/projects/${id}` : '/sales/projects';
  const backLabel = isEdit ? '案件の中身に戻る' : '案件一覧に戻る';
  const openCalendar = () => navigate('/studio/calendar', {
    state: {
      presetRoomIds: schedule.roomIds,
      presetDate: f.buildPresetDate(),
      presetProjectId: id,
    },
  });

  /**
   * 予算の欄のすぐ下に置くもの（案件作成には無い）。
   * **金額の欄から離さない** — 「確定する」を押した結果がどこに入ったのか
   * 分からなくなります。AI の下書きは押すまで予算に入りません。
   * **いつ作られたかは出しますが、誰の指示かは出しません**（`docs/wording.md`）。
   */
  const amountExtra = (
    <>
      {f.isCategoryA && (
        <Button
          type="button"
          variant="link"
          size="sm"
          className="text-sub mt-1 h-auto p-0"
          onClick={() => f.setSimOpen(true)}
        >
          <Calculator className="mr-1 h-3 w-3" aria-hidden="true" />
          料金シミュレーション
        </Button>
      )}

      {f.hasDraftSimulation && (
        <div className="rounded-card mt-2 border border-ai-border bg-ai-surface p-3">
          <div className="flex items-start gap-2">
            <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-ai" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <p className="text-list">AI が作った見積の下書きがあります</p>
              <p className="text-sub mt-0.5 flex flex-wrap items-baseline gap-1">
                合計
                <Money value={f.draftSimulationTotal} className="inline-flex gap-1 font-bold" />
                。「確定する」を押すと予算に入ります。
              </p>
              {f.aiDraftCreatedAt && (
                <p className="text-sub-sm mt-0.5 text-muted-foreground">
                  {formatRelativeTime(f.aiDraftCreatedAt)}に AI が作りました
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  onClick={() => f.finalizeSim.mutate()}
                  disabled={f.finalizeSim.isPending}
                >
                  {f.finalizeSim.isPending
                    ? <Loader2 className="mr-1 h-3 w-3 animate-spin" aria-hidden="true" />
                    : <Check className="mr-1 h-3 w-3" aria-hidden="true" />}
                  確定する
                </Button>
                <Button type="button" size="sm" variant="outline" onClick={() => f.setSimOpen(true)}>
                  <Calculator className="mr-1 h-3 w-3" aria-hidden="true" />
                  中身を見て直す
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  // ダイアログ群は `FormDialogs.tsx` に切り出してあり、PC/スマホ両分岐から同じものを呼ぶ
  const formDialogs = (
    <FormDialogs
      f={f} form={form} navigate={navigate} id={id} isEdit={isEdit} project={project} actions={actions}
      bookingDialogOpen={bookingDialogOpen} setBookingDialogOpen={setBookingDialogOpen}
      editingBooking={editingBooking} setEditingBooking={setEditingBooking}
    />
  );

  // **スマホは部品ごと入れ替える**（`MobileEditProject.tsx`）
  if (isMobile) {
    return (
      <>
        <MobileEditProject
          f={f}
          id={id}
          backTo={backTo}
          canDelete={canDelete}
          amountExtra={amountExtra}
          openCalendar={isEdit && f.isCategoryA ? openCalendar : undefined}
          onAddBooking={handleAddBooking}
          onEditBooking={handleEditBooking}
        />
        {formDialogs}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-3 lg:space-y-5 lg:p-6">
      <PageHeader
        title="案件を直す"
        sub={[project?.name, project?.gls_number || project?.code].filter(Boolean).join(' ・ ')}
        icon={(
          <button
            type="button"
            onClick={() => navigate(backTo)}
            aria-label={backLabel}
            title={backLabel}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-control-lg border border-border hover:bg-muted"
          >
            <ArrowLeft className="h-4 w-4 text-secondary-foreground" aria-hidden="true" />
          </button>
        )}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{ProjectStageLabels[f.currentStage] || f.currentStage}</Badge>
          {/*
            **詳細へ戻る道を必ず置く。** `/edit` を直接開いた人は、ここが無いと
            やり取り・次のアクション・見積にたどり着けません。
          */}
          <Button variant="outline" size="sm" onClick={() => navigate(`/sales/projects/${id}`)}>
            案件の中身を見る
          </Button>
          {f.isYomi && (
            <Button
              size="sm"
              title={glsGuideText(f.currentStage)}
              onClick={() => actions.setGlsDialog((s) => ({
                ...s, open: true,
                // **口頭決定（B）より手前は「新しい番組」を選べない**ので、
                // 押せる「いまある案件に足す」を既定にして開く（開いた瞬間
                // 何も選べていないように見えるのを防ぐ）
                mode: f.canIssueNewGls ? s.mode : 'link',
              }))}
              disabled={actions.glsMutation.isPending}
            >
              <Trophy className="mr-1 h-4 w-4" aria-hidden="true" />
              GLS 発番
            </Button>
          )}
          {f.hasGls && (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={() => actions.setRelinkDialog({ open: true, target_project_id: '' })}
              >
                <Link2 className="mr-1 h-4 w-4" aria-hidden="true" />
                別の GLS へ付け替える
              </Button>
              {/*
                **GLS の操作はここにまとめる。** 元は「基本情報」の中に埋まっていて、
                番号にまつわる操作が見出しと本文に散っていました。
                発番済みなので、移すと番号を採り直します（確認はダイアログが出します）。
              */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => actions.setCategorySwitchDialog({ open: true, target: 'B' })}
              >
                <FolderKanban className="mr-1 h-4 w-4" aria-hidden="true" />
                プロジェクト管理へ移す…
              </Button>
            </>
          )}
          {id && (
            <ProjectQuickLinks
              projectId={id}
              projectName={form.watch('name') || project?.name}
              currentPage="project"
            />
          )}
          {/*
            **削除は前からサーバーにあったが、押せる場所がどこにも無かった**
            （`DELETE /projects/:id` を呼ぶ画面が1つも無かった）。GLS の操作と
            同じ並びに置く — 「この案件をどうするか」の操作が一箇所にまとまる。
            `manager` 未満には出さない（他の削除ボタンと同じ絞り方）。
            確認ダイアログと送信は `useProjectActions`（GLS 操作と同じ置き場所）
          */}
          {isEdit && canDelete && (
            <Button
              variant="outline"
              size="sm"
              className="ml-auto text-destructive hover:text-destructive"
              disabled={actions.deleteMutation.isPending}
              onClick={actions.handleDeleteProject}
            >
              {actions.deleteMutation.isPending
                ? <Loader2 className="mr-1 h-4 w-4 animate-spin" aria-hidden="true" />
                : <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />}
              削除
            </Button>
          )}
        </div>
      </PageHeader>

      {/*
        入れ忘れ。**欄のすぐ上に出す** — 帯に出すと画面外で気づかれない。
        **文面と色は案件作成と同じ**（黄色の帯・項目を名指し）にしてあります。
        押せないボタンだけだと、何が足りないのかを探すことになります。
      */}
      {f.missing.length > 0 && (
        <p className="rounded-note border border-warning-border bg-warning-surface px-3.5 py-2 text-sub text-warning">
          {f.missing.join(' ・ ')} が入っていないので、まだ保存できません
        </p>
      )}

      <form onSubmit={form.handleSubmit(f.onSubmit)} className="space-y-4 lg:space-y-5">
        {/* ここから2枚は**案件作成と同じ部品・同じ見た目**（`projectNew/`） */}
        <div className="rounded-card border border-primary-border bg-card px-4 py-4 lg:px-5">
          <p className="text-cardtitle mb-3">いま必要な5つ</p>
          <RequiredFields f={f.fields} mode="edit" />
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
              {moreFieldCount(f.fields.v.audience, 'edit')}
            </span>
            <span className="flex-1" />
            <span className="text-note text-muted-foreground">あとから足せます</span>
          </button>

          {more && (
            <div className="border-t border-border-faint px-4 pb-4 pt-4 lg:px-5">
              <MoreFields f={f.fields} mode="edit" amountExtra={amountExtra} />
            </div>
          )}
        </div>

        {/* ここから下は**直す画面だけが持つもの**（案件作成には無い） */}
        <MembersSection projectId={isEdit ? id : undefined} />

        {isEdit && (
          <BookingListSection
            bookings={actions.bookings}
            onAdd={handleAddBooking}
            onEdit={handleEditBooking}
            onDelete={actions.deleteBooking}
          />
        )}

        <ScheduleSection
          s={schedule}
          studioLocations={f.studioLocations}
          isEdit={isEdit}
          hasBookings={hasEventBooking(actions.bookings)}
          onOpenCalendar={isEdit && f.isCategoryA ? openCalendar : undefined}
        />

        {f.hasGls && f.isCategoryA && <BroadcastSection form={form} />}

        <BoxSection
          form={form}
          isEdit={isEdit}
          onCreate={actions.handleCreateBoxFolder}
          creating={actions.createBoxFolderMutation.isPending}
        />

        <DocsSection form={form} />

        <div className="flex items-center justify-end gap-3">
          <Button type="button" variant="outline" onClick={() => navigate(backTo)}>やめる</Button>
          <Button type="submit" disabled={f.saveMutation.isPending || f.missing.length > 0}>
            {f.saveMutation.isPending
              ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
              : <Save className="mr-2 h-4 w-4" aria-hidden="true" />}
            保存
          </Button>
        </div>
      </form>

      {formDialogs}
    </div>
  );
}
