/**
 * 機材台帳の上の道具帯（件数 ＋ ボタン）
 *
 * ── スマホでは5つ落とす（M8）──────────────────────────────
 *
 * Excel 取込・Excel 出力・印刷・出す列・表で編集 は**どれも表に効くもの**で、
 * 768px 未満では表そのものが出ていません（`EquipmentCards` に切り替わる）。
 * 押しても何も起きないボタンが5つ並ぶと、画面が「壊れている」と読まれます。
 * Excel の取込・出力はご判断の「データを出し入れする道具はスマホに出さない」にも当たります。
 *
 * 残すのは **「機材を追加」だけ** — 現場で「これ増えた」を入れるのは実際に起きます。
 *
 * **「表で編集」は今もここに出しません**（監査 2026-08-20 要対応3への対応後も）。
 * 表そのものが無い以上「一覧を編集モードにする」という道具帯の切り替えは意味を
 * 持たず、代わりに `EquipmentCards.tsx` の各カードへ鉛筆ボタンを1つずつ置きました
 * （押した1点だけ編集シートが開く）。
 */
import { Download, Edit3, Plus, Printer, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function ItemsToolbar({
  count, filterLabel, isMobile, canEdit, editMode, columnPicker,
  onImport, onExport, onPrint, onToggleEdit, onNew,
}: {
  count: number;
  /** 効いている絞り込みの説明。空なら出さない */
  filterLabel: string;
  isMobile: boolean;
  canEdit: boolean;
  editMode: boolean;
  /** 出す列のドロップダウン。**自前で状態を持つ部品**なので丸ごと受け取る */
  columnPicker: React.ReactNode;
  onImport: () => void;
  onExport: () => void;
  onPrint: () => void;
  onToggleEdit: () => void;
  onNew: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <p className="text-sub text-muted-foreground">
        機材 <span className="font-number font-bold">{count.toLocaleString('ja-JP')}</span> 点
        {filterLabel && `（絞り込み: ${filterLabel}）`}
      </p>
      <div className="flex-1" />

      {!isMobile && canEdit && (
        <Button variant="outline" onClick={onImport}>
          <Upload className="mr-1 h-4 w-4" aria-hidden="true" />Excel 取込
        </Button>
      )}
      {!isMobile && (
        <Button variant="outline" onClick={onExport}>
          <Download className="mr-1 h-4 w-4" aria-hidden="true" />Excel 出力
        </Button>
      )}
      {!isMobile && (
        <Button variant="outline" onClick={onPrint}>
          <Printer className="mr-1 h-4 w-4" aria-hidden="true" />印刷
        </Button>
      )}
      {!isMobile && columnPicker}
      {!isMobile && canEdit && (
        <Button variant={editMode ? 'default' : 'outline'} onClick={onToggleEdit}>
          <Edit3 className="mr-1 h-4 w-4" aria-hidden="true" />{editMode ? '編集を終了' : '表で編集'}
        </Button>
      )}
      {canEdit && (
        <Button onClick={onNew}>
          <Plus className="mr-1 h-4 w-4" aria-hidden="true" />機材を追加
        </Button>
      )}
    </div>
  );
}
