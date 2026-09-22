/**
 * 一覧の1行（ホームの「最近更新」「お気に入り」）
 *
 * バッジは**出す理由があるときだけ**出す。公開のページに毎行「公開」と付けると、
 * 読み手が目で追うのは色の並びなので、意味のある印（下書き・非表示）が埋もれる
 * （モック `Main.dc.html` も一部の行にしかバッジが無い）。
 *
 * ⚠️ 一覧の最後の列は**更新した人**。サーバーが一覧で返すのは `updater_name` で、
 *    担当（`owner_name`）は返らない（`wiki-home.service.ts` の `CARD_SELECT`）。
 *    「担当」と書いて更新者を出すと嘘になるので、見出しも「更新者」にしてある。
 */
import { Link } from 'react-router-dom';
import { Row, RowMain, RowSlot, RowSub, RowTitle } from '@gmo-onair/shared/src/client/ui/row';
import type { WikiPageBrief } from '@/lib/wikiApi';
import WikiStatusBadge from './WikiStatusBadge';
import { updatedLabel } from '@/lib/wikiFormat';

export default function PageBriefRow({ page }: { page: WikiPageBrief }) {
  return (
    <Link to={`/p/${page.id}`} className="block no-underline">
      <Row divider interactive>
        <RowMain>
          <RowTitle>{page.title}</RowTitle>
          {/* PC では右の列に出すので、スマホのときだけ副の行に落とす */}
          <RowSub className="sm:hidden">
            {page.space_name} ・ {updatedLabel(page.updated_at)}
          </RowSub>
        </RowMain>
        <RowSlot w={96} align="center" placeholder="">
          {page.status !== 'published' ? <WikiStatusBadge status={page.status} column /> : null}
        </RowSlot>
        <RowSlot w={96} hideOnMobile>
          <span className="truncate text-sub text-muted-foreground">{page.space_name}</span>
        </RowSlot>
        <RowSlot w={96} hideOnMobile>
          <span className="truncate text-sub text-muted-foreground">{updatedLabel(page.updated_at)}</span>
        </RowSlot>
        <RowSlot w={72} hideOnMobile>
          <span className="truncate text-sub text-muted-foreground">{page.updater_name}</span>
        </RowSlot>
      </Row>
    </Link>
  );
}
