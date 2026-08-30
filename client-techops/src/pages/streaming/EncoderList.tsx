/**
 * 配信設定の左側 — ENC ごとにまとまった配信先の一覧（モック Stream.dc.html:70-100）。
 *
 * ⚠️ 直したこと（監査 2026-08-22）:
 *   ① 行が「名前」と「プロトコル」だけで、**宛先もキーの状態も警告も出ていなかった**。
 *      モックどおり [プロトコル][名前][宛先][キーの状態][警告] の5つを出す。
 *   ② ENC を必ず10台ぶん縦に並べていたため、使っていない9台の
 *      「配信先がまだありません」が画面を埋めて、**使っている台を探すのに
 *      毎回スクロールが要った**。配信先を持つ台だけ出し、残りは折りたたむ。
 *      折りたたみの中では従来どおり「この台は Excel に出ません。」を出す
 *      （黙って消えるのがこの手の機能でいちばん危険な壊れ方・#279 §3-2）。
 */
import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Info, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { destTarget } from '@/lib/deviceSettingsShared';
import type { Destination } from '@/lib/deviceSettingsApi';
import { ENCODER_IDS, keyState, keyToneClass, protocolBadgeClass, summarizeEncoders } from './destinationHelpers';
import { presetLabelOf } from './streamPresets';

interface RowProps {
  dest: Destination;
  selected: boolean;
  warn: boolean;
  blocked: boolean;
  onSelect: () => void;
}

function DestinationRow({ dest, selected, warn, blocked, onSelect }: RowProps) {
  const ks = keyState(dest);
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'flex min-h-tap w-full flex-col gap-0.5 px-3 py-2 text-left hover:bg-muted/60 sm:flex-row sm:items-center sm:gap-3',
          // 規則違反の行は赤くする（保存を止めた理由がどの行か分かるように）。
          // 選択中の面と重ねると**どちらが出るか Tailwind の出力順まかせ**になるので、
          // 面は必ずどちらか一方にし、選択中は枠で見せる
          blocked ? 'bg-destructive-surface' : selected ? 'bg-primary-surface' : '',
          selected && 'ring-1 ring-inset ring-primary',
        )}
      >
        <div className="flex min-w-0 items-center gap-2 sm:w-[15rem] sm:shrink-0">
          <span
            className={cn(
              'inline-flex h-6 w-24 shrink-0 items-center justify-center whitespace-nowrap rounded-badge text-xs font-extrabold',
              protocolBadgeClass(dest.protocol),
            )}
          >
            {dest.protocol ?? 'RTMP'}
          </span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold">
            {dest.name || '（名前がありません）'}
          </span>
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          {/* 値は折り返さない（#279 §3-4）。プリセットに当たる URL は短い呼び名で出す
              （`rtmp://a.rtmp.youtube.com/live2` の a と b の1字違いは一覧では読めない） */}
          <span className="min-w-0 flex-1 truncate whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {presetLabelOf(dest.url) ?? destTarget(dest)}
          </span>
          <span className={cn('shrink-0 whitespace-nowrap text-xs font-bold sm:w-24 sm:text-right', keyToneClass(ks.tone))}>
            {ks.label}
          </span>
          {warn ? (
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" aria-label="直したほうがよい点があります" />
          ) : (
            <span className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
        </div>
      </button>
    </li>
  );
}

function EncoderCard({
  encoderId, dests, selectedId, warnIds, blockedIds, onSelect, onAdd,
}: {
  encoderId: string;
  dests: Destination[];
  selectedId: string | null;
  warnIds: Set<string>;
  blockedIds: Set<string>;
  onSelect: (destId: string) => void;
  /** 編集できない人には渡さない（渡らないときは「＋配信先」を出さない） */
  onAdd?: (encoderId: string) => void;
}) {
  return (
    <div className="overflow-hidden rounded-card border bg-card">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-2">
        <span className="text-sm font-extrabold tabular-nums">{encoderId}</span>
        <span className="whitespace-nowrap text-xs text-muted-foreground">
          {dests.length > 0 ? `${dests.length} 件の配信先` : '配信先なし'}
        </span>
        <span className="flex-1" />
        {/* ⚠️ 足せない人には出さない（押せてから断られるのがいちばん悪い） */}
        {onAdd && (
          <button
            type="button"
            onClick={() => onAdd(encoderId)}
            className="flex min-h-tap items-center gap-1 rounded-control-md px-2 text-xs font-bold text-primary hover:bg-primary-surface"
          >
            <Plus className="h-3.5 w-3.5" /> 配信先
          </button>
        )}
      </div>

      {dests.length === 0 ? (
        <p className="flex items-start gap-2 px-3 py-3 text-xs text-muted-foreground">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            配信先がまだありません。<strong className="whitespace-nowrap font-bold">この台は Excel に出ません。</strong>
          </span>
        </p>
      ) : (
        <ul className="divide-y">
          {dests.map((d) => (
            <DestinationRow
              key={d.destId}
              dest={d}
              selected={d.destId === selectedId}
              warn={warnIds.has(d.destId)}
              blocked={blockedIds.has(d.destId)}
              onSelect={() => onSelect(d.destId)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

export default function EncoderList({
  destinations, selectedId, warnIds, blockedIds, onSelect, onAdd,
}: {
  destinations: Destination[];
  selectedId: string | null;
  warnIds: Set<string>;
  blockedIds: Set<string>;
  onSelect: (destId: string) => void;
  /** 編集できない人には渡さない（渡らないときは「＋配信先」を出さない） */
  onAdd?: (encoderId: string) => void;
}) {
  const [showUnused, setShowUnused] = useState(false);

  const byEncoder = new Map<string, Destination[]>();
  for (const d of destinations) {
    byEncoder.set(d.encoderId, [...(byEncoder.get(d.encoderId) ?? []), d]);
  }
  // 一覧に無い ENC 名（手で入れた値・将来増えた台）も落とさずに出す
  const knownIds = [...ENCODER_IDS, ...[...byEncoder.keys()].filter((id) => !ENCODER_IDS.includes(id))];
  const usedIds = knownIds.filter((id) => (byEncoder.get(id) ?? []).length > 0);
  const unusedIds = knownIds.filter((id) => (byEncoder.get(id) ?? []).length === 0);

  const card = (id: string) => (
    <EncoderCard
      key={id}
      encoderId={id}
      dests={byEncoder.get(id) ?? []}
      selectedId={selectedId}
      warnIds={warnIds}
      blockedIds={blockedIds}
      onSelect={onSelect}
      onAdd={onAdd}
    />
  );

  return (
    <div className="space-y-3">
      {usedIds.length === 0 && (
        <p className="rounded-card border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
          配信先がまだ1件もありません。下の「使っていない台」から足してください。
        </p>
      )}
      {usedIds.map(card)}

      {unusedIds.length > 0 && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowUnused((v) => !v)}
            aria-expanded={showUnused}
            className="flex min-h-tap w-full items-center gap-1.5 rounded-card border border-dashed px-3 text-sm font-semibold text-muted-foreground hover:bg-muted/50"
          >
            {showUnused ? <ChevronDown className="h-4 w-4 shrink-0" /> : <ChevronRight className="h-4 w-4 shrink-0" />}
            <span className="truncate">
              使っていない台 {unusedIds.length}台（{summarizeEncoders(unusedIds)}）を{showUnused ? '隠す' : '表示'}
            </span>
          </button>
          {showUnused && unusedIds.map(card)}
        </div>
      )}
    </div>
  );
}
