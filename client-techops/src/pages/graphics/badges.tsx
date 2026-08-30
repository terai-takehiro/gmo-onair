// テロップCG の一覧で使う小さなバッジ2種（ハブと送出コンソールで共用）。
//
// スロット名は「フルスクリーン」「サイドスーパー」など5字超が普通に混ざるので、
// 既定の 62px 帯では右端が行ごとにずれる。モック（v4-mockup-graphics.dc.html）の
// スロット札は幅 96px 固定なので、`fixedW` で列ごと 96px にそろえる
// （`TableBadge` の機材台帳・種別列と同じやり方）。
import { TableBadge } from '@gmo-onair/shared/src/client/ui/tableBadge';
import {
  SLOT_LABELS, PROOF_LABELS,
  type GraphicsSlot, type GraphicsProofState,
} from '@/lib/graphicsApi';

export function SlotBadge({ slot, w = 96 }: { slot: GraphicsSlot; w?: 96 | null }) {
  return <TableBadge label={SLOT_LABELS[slot]} w={w} fixedW={96} variant="secondary" />;
}

const PROOF_VARIANT: Record<GraphicsProofState, 'destructive' | 'warning' | 'success'> = {
  draft: 'destructive',
  unproofed: 'warning',
  proofed: 'success',
};

export function ProofBadge({ state, w = 72 }: { state: GraphicsProofState; w?: 72 | null }) {
  return <TableBadge label={PROOF_LABELS[state]} w={w} variant={PROOF_VARIANT[state]} />;
}
