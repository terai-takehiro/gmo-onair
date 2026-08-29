/**
 * 機材台帳のバッジ (種別 ／ 資産管理)
 *
 * ── 生のパレットをやめた ────────────────────────────────────
 *
 * 旧実装は `bg-violet-50 text-violet-700` のように Tailwind の生の色を
 * 種別ごとに8つ、資産管理ごとに4つ書いていました。
 * **種別は「良い・悪い」ではなくただの見分け**なので、
 * 意味を持たない見分けの色 `cat-1`〜`cat-8` を使います
 * (`success` / `warning` を借りると、緑の種別が「良い状態」に読めます)。
 *
 * ── 種別の帯だけ幅を渡す ────────────────────────────────────
 *
 * この列に出るのは `sectionDisplay()` = 種別 ＋ 区分で **4〜8字が同居**します
 * (「映像貸出」から「ネットワーク設備」まで)。`TableBadge` の既定は
 * **和文4字までしか幅を固定しない**ので、5字以上は自然幅になり
 * **同じ列なのに帯の右端が4通り**にずれていました (`docs/design/v4/_rules.md`
 * 「縦の整列」= 目は色の塊の形で行を追う)。列でいちばん長い札が収まる 112px を
 * 渡してそろえます (`COL_W.equipment_type` = 128 の枠に padding ごと収まる幅)。
 */
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import { ASSET_CLASS_LABELS } from '@/lib/constants';
import { sectionDisplay } from './types';

const TYPE_TONE: Record<string, string> = {
  V: 'bg-cat-1/15 text-cat-1 border-transparent',
  C: 'bg-cat-2/15 text-cat-2 border-transparent',
  A: 'bg-cat-3/15 text-cat-3 border-transparent',
  IC: 'bg-cat-4/15 text-cat-4 border-transparent',
  NW: 'bg-cat-5/15 text-cat-5 border-transparent',
  L: 'bg-cat-6/15 text-cat-6 border-transparent',
  XR: 'bg-cat-7/15 text-cat-7 border-transparent',
  E: 'bg-muted text-muted-foreground border-transparent',
};

export function SectionBadge({ typeCode, section, placeholder = true, fixedW }: {
  typeCode?: string | null;
  section?: string | null;
  /**
   * 種別が無いときに `—` を出すか。**表では出す**（列を空にすると
   * その行だけ幅が詰まって隣の列がずれる）。**カードでは出さない**（M8）—
   * 揃える列が無いので、ID の前に意味の無い横棒が1本付くだけになる。
   */
  placeholder?: boolean;
  /**
   * 帯の幅（px）。**表の列に置くときだけ渡す**（右端をそろえるため）。
   * カードでは渡さないこと — 揃える列が無いので、余った幅のぶん
   * ID が右に押し出されるだけになる。
   */
  fixedW?: number;
}) {
  const label = sectionDisplay(typeCode, section);
  if (!label || label === '-') {
    return placeholder ? <span className="text-sub-sm text-muted-foreground">—</span> : null;
  }
  return (
    <TableBadge
      label={label}
      w={null}
      fixedW={fixedW}
      className={TYPE_TONE[typeCode ?? ''] ?? 'bg-muted text-muted-foreground border-transparent'}
    />
  );
}

const ASSET_TONE: Record<string, string> = {
  fixed_asset: 'bg-primary-surface-weak text-primary border-transparent',
  consumable: 'bg-muted text-muted-foreground border-transparent',
  leased: 'bg-warning-surface text-warning border-transparent',
  transferred: 'bg-cat-7/15 text-cat-7 border-transparent',
};

export function AssetBadge({ v }: { v: string }) {
  return (
    <TableBadge
      label={ASSET_CLASS_LABELS[v] ?? v}
      w={null}
      className={ASSET_TONE[v] ?? 'bg-muted text-muted-foreground border-transparent'}
    />
  );
}
