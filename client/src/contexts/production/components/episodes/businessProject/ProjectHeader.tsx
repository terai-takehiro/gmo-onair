/**
 * GPM の請求タブ — 画面のヘッダー（戻る・案件名・分類バッジ・案件を編集）
 *
 * ⚠️ **`BusinessProjectView.tsx` から切り出したもので、中身は1文字も変えていません**（段5）。
 *
 * ⚠️ **`useNavigate` は子で呼びます。** 子のフックの並びは固定なので順序の問題は
 * 起きません（親のフックの並びをこれ以上増やさないため）。
 *
 * ⚠️ **生のパレット（トークンでない橙・琥珀系の色）はそのまま。** `check-ui-tokens` の
 * `raw-palette` はアプリ単位の**件数**を数えるので、トークンへ寄せると記録も一緒に
 * 下げる必要があります。まとめて別の回に。
 *
 * ⚠️ **この説明文に実物のクラス名を書かないこと。** 検査は文字列で数えるので、
 * **例として書いただけで件数が増えて lint が止まります**（この分割で実際に踏みました）。
 *
 * ⚠️ **`isEstimateMode` の分岐は、いまどこからも渡されていません**（`BillingTab` が
 * 渡していないことをテストが見張っている）。**実質デッドですが消しません** —
 * 検証もできないので「整理」しないこと。
 */
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Pencil, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  ProjectTypeLabels,
  BroadcastTypeLabels,
  MediaPlatformLabels,
} from '@/types';
import type { Project } from '@/types';

export function ProjectHeader({
  project, projectId, isCategoryA, isEstimateMode,
}: {
  project: Project;
  projectId: string;
  isCategoryA: boolean;
  isEstimateMode?: boolean;
}) {
  const navigate = useNavigate();
  return (
    <>
      <div className="space-y-2">
        <Button
          variant="ghost"
          size="sm"
          className="gap-1 text-muted-foreground"
          onClick={() =>
            isEstimateMode
              ? navigate(`/sales/projects/${projectId}`)
              : navigate(isCategoryA ? "/sales/projects" : "/gpm/projects")
          }
        >
          <ArrowLeft className="h-4 w-4" />
          {isEstimateMode ? "案件に戻る" : "確定案件一覧"}
        </Button>
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl lg:text-2xl font-bold">
            {project.gls_number && (
              <span className=" text-primary">
                {project.gls_number}{" "}
              </span>
            )}
            {project.name}
          </h1>
          {isEstimateMode && (
            <Badge className="bg-orange-500 text-white">概算見積</Badge>
          )}
          {isCategoryA && project.broadcast_type && (
            <Badge color="#005bac">
              {BroadcastTypeLabels[
                project.broadcast_type as keyof typeof BroadcastTypeLabels
              ] ?? project.broadcast_type}
            </Badge>
          )}
          {isCategoryA && project.media_platform && (
            <Badge variant="outline">
              {MediaPlatformLabels[
                project.media_platform as keyof typeof MediaPlatformLabels
              ] ?? project.media_platform}
            </Badge>
          )}
          {!isCategoryA && (
            <Badge variant="outline">
              {ProjectTypeLabels[
                project.project_type as keyof typeof ProjectTypeLabels
              ] || project.project_type}
            </Badge>
          )}
          {/* 確定案件でも案件名・パラメータを再編集できるよう編集フォームへの導線を出す
              (従来この画面には編集ボタンが無く、確定済みプロジェクトのタイトル等を編集できなかった) */}
          {!isEstimateMode && (
            <Button
              variant="outline"
              size="sm"
              className="gap-1 ml-auto"
              onClick={() => navigate(`/sales/projects/${projectId}`)}
            >
              <Pencil className="h-4 w-4" />
              案件を編集
            </Button>
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          {(project as any).customer_name}
        </p>
      </div>

      {/* Estimate mode info banner */}
      {isEstimateMode && (
        <div className="flex items-start gap-2 rounded-lg border border-orange-200 bg-orange-50 p-3 text-sm text-orange-800">
          <FileText className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            概算見積の作成モードです。ここで作成した見積はGLS発番時に自動で確定売上に変換されます。
          </span>
        </div>
      )}
    </>
  );
}
