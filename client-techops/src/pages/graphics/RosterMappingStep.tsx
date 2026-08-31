// テロップCG — 名簿インポートの②「部品・スロット選択 ＋ 列マッピング」段。
// `RosterImportDialog.tsx` から切り出した（ファイルサイズ規律・400行）。
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  GRAPHICS_SLOTS, PART_LABELS, SLOT_LABELS,
  type GraphicsPartKey, type GraphicsSlot,
} from '@/lib/graphicsApi';
import { PART_FIELDS, PART_KEYS } from './pageFields';

const NONE = '__none__';
const AUTO = '__auto__';

export default function RosterMappingStep({
  headers, slot, partKey, mapping, nameColumn,
  onSlotChange, onPartKeyChange, onMappingChange, onNameColumnChange,
}: {
  headers: string[];
  slot: GraphicsSlot;
  partKey: GraphicsPartKey;
  mapping: Record<string, string>;
  /** 空文字＝代表フィールドを自動で使う */
  nameColumn: string;
  onSlotChange: (slot: GraphicsSlot) => void;
  onPartKeyChange: (partKey: GraphicsPartKey) => void;
  onMappingChange: (mapping: Record<string, string>) => void;
  onNameColumnChange: (header: string) => void;
}) {
  const setField = (fieldKey: string, header: string) => {
    const next = { ...mapping };
    if (header === NONE) delete next[fieldKey];
    else next[fieldKey] = header;
    onMappingChange(next);
  };

  return (
    <div className="space-y-4 p-4 sm:p-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <Label>部品</Label>
          <Select value={partKey} onValueChange={(v) => onPartKeyChange(v as GraphicsPartKey)}>
            <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {PART_KEYS.map((k) => (
                <SelectItem key={k} value={k}>{PART_LABELS[k]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>スロット（出る場所）</Label>
          <Select value={slot} onValueChange={(v) => onSlotChange(v as GraphicsSlot)}>
            <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              {GRAPHICS_SLOTS.map((s) => (
                <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="rounded-card border border-border bg-card p-3 sm:p-4">
        <p className="mb-3 text-th font-bold text-muted-foreground">
          列を割り当ててください（{PART_LABELS[partKey]}の入力欄）
        </p>
        <div className="space-y-3">
          {/* kind 付き欄（score の entries・vote の choices）は専用UIで編集する可変長配列で、
              CSV の1列を単純に流し込む形と噛み合わない（配列に生文字列が入って壊れる）ため、
              名簿の列マッピング対象からは外す */}
          {(PART_FIELDS[partKey] ?? []).filter((def) => def.kind == null).map((def) => (
            <div key={def.key} className="grid grid-cols-1 items-center gap-1.5 sm:grid-cols-[220px_minmax(0,1fr)] sm:gap-3">
              <Label htmlFor={`roster-map-${def.key}`} className="sm:text-right">{def.label}</Label>
              <Select
                value={mapping[def.key] ?? NONE}
                onValueChange={(v) => setField(def.key, v)}
              >
                <SelectTrigger id={`roster-map-${def.key}`} className="min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>使用しない</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h}>{h}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      </div>

      <div>
        <Label>ページ名に使う列</Label>
        <Select
          value={nameColumn === '' ? AUTO : nameColumn}
          onValueChange={(v) => onNameColumnChange(v === AUTO ? '' : v)}
        >
          <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO}>自動（上のマッピングの代表欄を使う）</SelectItem>
            {headers.map((h) => (
              <SelectItem key={h} value={h}>{h}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="mt-1 text-note text-muted-foreground">
          一覧画面に出るページ名です。空欄になる行は作成されません（他の行は続けて作成します）。
        </p>
      </div>
    </div>
  );
}
