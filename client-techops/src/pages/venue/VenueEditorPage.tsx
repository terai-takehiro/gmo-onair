// ⚠️ 一時的なプレースホルダ。会場図面の編集画面（②・PC=編集/スマホ=閲覧）は
// 別担当が実装中（docs/design/v4/venue-layout.md §6②・`VenueBoard.tsx` ほか）。
// `App.tsx` の `/techops/venue-layouts/:id` ルートが解決できるよう、
// このタスク（一覧・仕上がり・配線）の検証（`npx tsc -b client-techops`）を通すためだけに
// 置いてある。後日、担当の実装で本ファイルごと上書きされる想定。
import { useParams } from "react-router-dom";
import { PageShell } from "@gmo-onair/shared/src/client/ui/pageShell";
import { PageHeader } from "@gmo-onair/shared/src/client/ui/pageHeader";

export default function VenueEditorPage() {
  const { id = "" } = useParams();
  return (
    <PageShell>
      <PageHeader title="会場図面" sub="編集画面は準備中です。" />
      <p className="text-sub text-muted-foreground">図面ID: {id}</p>
    </PageShell>
  );
}
