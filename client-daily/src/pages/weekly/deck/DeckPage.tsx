/**
 * ウィークリー活動報告 ▸ 「資料をつくる」（`/weekly/:id/deck`）— **置き場所だけ**
 *
 * 中身（ページ一覧 ／ スライドのキャンバス ／ 部品・pptx 出力）は資料ビルダーの回で
 * 作り直す（`docs/design/v4/keep-report.md` §6）。PC 専用の宣言は `pcOnlyScreens.ts`。
 */
import { useParams } from 'react-router-dom';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { FileOutput } from 'lucide-react';
import { WeeklyTabs } from '../WeeklyTabs';

export default function DeckPage() {
  const { id } = useParams<{ id: string }>();
  return (
    <div className="flex flex-col gap-4 p-3 lg:gap-5 lg:p-6">
      <PageHeader title="資料をつくる" sub="隔週キープの資料を、いまの数字から組みます" />
      <WeeklyTabs reportId={id ?? ''} tab="deck" isMobile={false} />
      <EmptyState
        icon={<FileOutput />}
        title="準備中"
        description="ページ一覧・スライドのキャンバス・部品はこのあと入ります。数字は「隔週キープの数字」で確かめられます。"
      />
    </div>
  );
}
