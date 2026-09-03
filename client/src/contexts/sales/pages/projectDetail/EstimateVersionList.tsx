/**
 * 見積タブの「版の一覧」（`EstimateTab.tsx` から分離・400行超の是正）
 *
 * PC の `Row` 表とスマホのカード積みの**両方**をここに持つ。片方だけ直すと
 * 「PC では出るのにスマホでは出ない」欄ができるので、必ずセットで直すこと
 * （元は `EstimateTab.tsx` に同居していたが、`アーカイブ済み` 表示・
 * `onArchive`/`onUnarchive` を足したところで400行を超えたため、
 * `EstimateTab.tsx` 側のデータ取得・ミューテーション定義とは切り離した——
 * ここは「渡された一覧をどう描くか」だけを持つ）。
 */
import { Money } from '@gmo-onair/shared/src/client/ui/money';
import { Row, RowHeader, RowMain, RowSlot } from '@gmo-onair/shared/src/client/ui/row';
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { EstimateActions, type EstimateStatus as Status } from './EstimateActions';
import type { Estimate } from './EstimateTab';

export function EstimateVersionList({
  estimates, isMobile, onToggleOpen, base, statusLabel, statusTone, episodeLabels,
  onSetStatus, onConvert, onNextVersion, onRemove, onArchive, onUnarchive,
  canDuplicate, onDuplicate,
}: {
  estimates: Estimate[];
  isMobile: boolean;
  /** 押すと開閉をトグルする（すでに開いていれば閉じる）。判定は呼び手（`EstimateTab.tsx`）が持つ */
  onToggleOpen: (id: string) => void;
  base: string;
  statusLabel: Record<Status, string>;
  statusTone: Record<Status, string>;
  /**
   * 回id → 「#3」のような表示ラベル（仕様変更 #18）。回を持たない
   * 見積（案件全体の見積）はこの表を引かないので、何も出さない。
   * 複数回のひとまとまりの見積は、対応するラベルを「・」で連結して出す（仕様変更 #20）
   */
  episodeLabels: Record<string, string>;
  onSetStatus: (id: string, status: Status) => void;
  onConvert: (id: string) => void;
  onNextVersion: (id: string) => void;
  onRemove: (id: string) => void;
  onArchive: (id: string) => void;
  onUnarchive: (id: string) => void;
  /** 「別の回の見積として複製する」を出すか（案件がレギュラーのときだけ） */
  canDuplicate: boolean;
  onDuplicate: (id: string) => void;
}) {
  if (isMobile) {
    // **版1件＝カード1枚。** PC の `Row` は「版」「操作」を含む5列の表を
    // 375px でも横に並べたまま `stackOnMobile` で潰していたため、右端
    // 240px の操作ボタン群が折り返して行の高さが版ごとにばらついていた
    return (
      <div className="flex flex-col gap-2">
        {estimates.map((e) => {
          // この見積が属する回のラベル（仕様変更 #18・#20）。複数回のひとまとまりなら
          // 「#1・#2」のようにまとめて出す。案件全体の見積（episode_ids が空）は null
          const epLabels = e.episode_ids.map((id) => episodeLabels[id]).filter(Boolean);
          const epLabel = epLabels.length > 0 ? epLabels.join('・') : null;
          return (
          <div key={e.id} className="rounded-card flex flex-col gap-2.5 border border-border bg-card p-3.5">
            <button
              type="button"
              onClick={() => onToggleOpen(e.id)}
              className="flex min-h-tap items-start gap-2.5 text-left"
            >
              <span className="text-list rounded-control-sm shrink-0 bg-surface-subtle px-1.5 py-0.5 font-number text-muted-foreground">
                v{e.version}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-list block truncate font-bold">{e.title || '名前のない見積'}</span>
                {epLabel && (
                  <span className="text-sub-sm block text-primary">{epLabel} の見積</span>
                )}
                {e.sent_at && (
                  <span className="text-sub-sm block text-muted-foreground">
                    出した日 {e.sent_at.slice(0, 10).replace(/-/g, '/')}
                  </span>
                )}
                {e.archived_at && (
                  <span className="text-sub-sm block text-muted-foreground">アーカイブ済み</span>
                )}
              </span>
              <TableBadge w={null} label={statusLabel[e.status]} className={cn('shrink-0', statusTone[e.status])} />
            </button>
            <Money value={e.subtotal - e.discount} className="text-list font-bold" />
            <EstimateActions
              e={e}
              base={base}
              onSetStatus={(status) => onSetStatus(e.id, status)}
              onConvert={() => onConvert(e.id)}
              onNextVersion={() => onNextVersion(e.id)}
              onRemove={() => onRemove(e.id)}
              onArchive={() => onArchive(e.id)}
              onUnarchive={() => onUnarchive(e.id)}
              canDuplicate={canDuplicate}
              onDuplicate={() => onDuplicate(e.id)}
            />
          </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-card border border-border bg-card">
      <RowHeader className="hidden sm:flex">
        <RowSlot w={56}>版</RowSlot>
        <RowMain>見積</RowMain>
        <RowSlot w={128} align="right">金額（税抜）</RowSlot>
        <RowSlot w={96}>状態</RowSlot>
        <RowSlot w={240} align="right">操作</RowSlot>
      </RowHeader>
      {estimates.map((e) => {
        // この見積が属する回のラベル（仕様変更 #18・#20）。複数回のひとまとまりなら
        // 「#1・#2」のようにまとめて出す。案件全体の見積（episode_ids が空）は null
        const epLabels = e.episode_ids.map((id) => episodeLabels[id]).filter(Boolean);
        const epLabel = epLabels.length > 0 ? epLabels.join('・') : null;
        return (
        <Row key={e.id} divider interactive stackOnMobile align="center">
          <RowSlot w={56}>
            <span className="text-list font-number">v{e.version}</span>
          </RowSlot>
          <RowMain>
            {/* 高さは決めた段に乗せる (中身任せだと 39px になり、指でも押しにくい) */}
            <button type="button" onClick={() => onToggleOpen(e.id)} className="min-h-tap w-full text-left">
              <span className="text-list block truncate">{e.title || '名前のない見積'}</span>
              {epLabel && (
                <span className="text-sub-sm block text-primary">{epLabel} の見積</span>
              )}
              {e.sent_at && (
                <span className="text-sub-sm block text-muted-foreground">
                  出した日 {e.sent_at.slice(0, 10).replace(/-/g, '/')}
                </span>
              )}
              {e.archived_at && (
                <span className="text-sub-sm block text-muted-foreground">アーカイブ済み</span>
              )}
            </button>
          </RowMain>
          <Money value={e.subtotal - e.discount} className="text-sub w-32 shrink-0" />
          <TableBadge w={96} label={statusLabel[e.status]} className={statusTone[e.status]} />
          <RowSlot w={240} align="right" className="flex-wrap gap-1">
            <EstimateActions
              e={e}
              base={base}
              onSetStatus={(status) => onSetStatus(e.id, status)}
              onConvert={() => onConvert(e.id)}
              onNextVersion={() => onNextVersion(e.id)}
              onRemove={() => onRemove(e.id)}
              onArchive={() => onArchive(e.id)}
              onUnarchive={() => onUnarchive(e.id)}
              canDuplicate={canDuplicate}
              onDuplicate={() => onDuplicate(e.id)}
            />
          </RowSlot>
        </Row>
        );
      })}
    </div>
  );
}
