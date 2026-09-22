/**
 * 書き出しと取り込み `/wiki/transfer`（**PC の画面**・設計 §5-2 の約束3-3）
 *
 * 「Markdown ネイティブ」は**形式**の話で、置き場の話ではありません（§5-2）。
 * 本文の正は DB の列（`body_md`）のままにして、`.md` として触りたい場面を
 * 3つの口で満たす — その2つめ（スペースまるごとの zip）がこの画面です
 * （1つめはページの「…」の「.md で書き出す」、3つめは MCP＝段E）。
 *
 * ⚠️ **PC の画面にしてあります**（`src/pcOnlyScreens.ts`）。zip を選ぶ・落とすのが
 *    要る操作で、スマホの画面から入ると端末の中に zip が残るだけになるためです。
 *    読む・書く・検索はスマホでできます（§6-⑧）。
 */
import { ArrowDownUp } from 'lucide-react';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import ExportSpaceCard from './ExportSpaceCard';
import ImportZipCard from './ImportZipCard';

export default function TransferPage() {
  return (
    <PageShell>
      <PageHeader
        title="書き出しと取り込み"
        sub="スペースまるごとを zip（.md のフォルダ）で保存します。Obsidian・Notion の書き出しも取り込めます。"
        icon={<ArrowDownUp />}
      />

      <div className="grid items-start gap-3.5 xl:grid-cols-2">
        <ExportSpaceCard />
        <ImportZipCard />
      </div>
    </PageShell>
  );
}
