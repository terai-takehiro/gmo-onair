/**
 * 案件を直す（PC）— **見出しと、この案件そのものへの操作**
 *
 * ── 何のまとまりか ──────────────────────────────────────────
 *
 * 案件名・ステージの札と、**「この案件の番号・行き先をどうするか」の操作**
 * （案件の中身へ戻る／GLS 発番／別の GLS へ付け替える／プロジェクト管理へ移す／
 * 関連ページ／削除）だけ。**入力欄はここに1つも無い** —
 * 欄は `projectNew/` の部品（`RequiredFields` / `MoreFields`）が持つ。
 *
 * ── なぜ切り出したか ────────────────────────────────────────
 *
 * `ProjectFormPage.tsx` が 400 行（このリポジトリの1ファイルの上限）を
 * 超えたため、**役割で分けた**もの。フォーム本体（欄の並び）と、
 * 案件そのものへの操作は別の仕事なので、後者をここに移した。
 * 状態・送信・確認ダイアログはすべて `useProjectForm` / `useProjectActions`
 * のまま（ここは受け取って描くだけ）で、**JSX は1文字も変えずに移してある**。
 *
 * スマホ版の同じ操作群は `MobileEditProject.tsx` の「操作」シートにある
 * （375px に横並びが収まらないため）。**片方だけ操作を足さないこと。**
 */
import type { NavigateFunction } from 'react-router-dom';
import { ArrowLeft, FolderKanban, Link2, Loader2, Trash2, Trophy } from 'lucide-react';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import ProjectQuickLinks from '@/contexts/shared/components/ProjectQuickLinks';
import { ProjectStageLabels } from '@/types';
import { glsGuideText } from '../projectDetail/glsGuide';
import type { ProjectFormState } from './useProjectForm';

export function EditHeader({
  f, form, actions, project, navigate, id, isEdit, canDelete, backTo, backLabel,
}: {
  f: ProjectFormState;
  form: ProjectFormState['form'];
  actions: ProjectFormState['actions'];
  project: ProjectFormState['project'];
  navigate: NavigateFunction;
  id: string | undefined;
  isEdit: boolean;
  /** `manager` 未満には削除を出さない（サーバーの縛りと同じ） */
  canDelete: boolean;
  backTo: string;
  backLabel: string;
}) {
  return (
    <PageHeader
      title="案件を編集"
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
              // **採れるときは必ず「新しい番組」で開く**（`s.mode` を引き継ぐと、
              // 一度「足す」で開いたあとは次も足す側で開く）。採れないときだけ
              // 押せる足す側を既定にし、理由は `GlsDialog` が文で出す
              mode: f.canIssueNewGls ? 'new' : 'link',
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
  );
}
