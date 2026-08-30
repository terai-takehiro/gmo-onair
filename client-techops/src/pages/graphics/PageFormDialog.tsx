// テロップCG — ページの作成・編集ダイアログ（段1の最小形）。
//
// 本来の設計（docs/design/v4/graphics.md §3・§5）では入力欄はテンプレートの
// 公開フィールドから自動生成し、常時ライブプレビューを付ける。段1ではまだ
// テンプレート編集が無いので、部品（partKey）ごとに決め打ちの欄を出す
// **つなぎの形**にしてある（欄の鍵は出力画面のレンダラーと共通:
// `title` / `name` / `text` / `targetAt`）。
import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  GRAPHICS_SLOTS, SLOT_LABELS, PART_LABELS, PART_DEFAULT_SLOT, PROOF_LABELS,
  createGraphicsPage, updateGraphicsPage,
  type GraphicsPageRow, type GraphicsPartKey, type GraphicsSlot, type GraphicsProofState,
} from '@/lib/graphicsApi';

/** 部品ごとの入力欄（段1の決め打ち。テンプレートの公開フィールドに置き換わる予定） */
const PART_FIELDS: Record<GraphicsPartKey, { key: string; label: string; type?: 'datetime-local' }[]> = {
  name: [{ key: 'subText', label: '肩書・行き先（上の行）' }, { key: 'mainText', label: '氏名（下の行）' }],
  title: [{ key: 'text', label: '題字' }],
  list: [{ key: 'text', label: '内容（1行ずつ）' }],
  ticker: [{ key: 'text', label: '流す文言' }],
  countdown: [
    { key: 'prefix', label: '枕詞（例: 開演まであと）' },
    { key: 'targetAt', label: '目標時刻（空なら現在時刻の時計）', type: 'datetime-local' },
  ],
  score: [{ key: 'text', label: 'スコア表示' }],
  flash: [{ key: 'text', label: '速報の文言' }],
  side: [{ key: 'text', label: 'サイドの文言' }],
  vote: [{ key: 'text', label: '設問' }],
};

const PART_KEYS = Object.keys(PART_FIELDS) as GraphicsPartKey[];
const PROOF_KEYS: GraphicsProofState[] = ['draft', 'unproofed', 'proofed'];

export default function PageFormDialog({
  projectId, page, open, onOpenChange, onSaved,
}: {
  projectId: string;
  /** 編集対象。null なら新規作成 */
  page: GraphicsPageRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const [name, setName] = useState('');
  const [partKey, setPartKey] = useState<GraphicsPartKey>('name');
  const [slot, setSlot] = useState<GraphicsSlot>('lower');
  const [proofState, setProofState] = useState<GraphicsProofState>('draft');
  const [fields, setFields] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  // 開くたびに編集対象（または新規の既定値）を入れ直す
  useEffect(() => {
    if (!open) return;
    if (page) {
      setName(page.name);
      setPartKey(page.partKey);
      setSlot(page.slot);
      setProofState(page.proofState);
      const next: Record<string, string> = {};
      for (const def of PART_FIELDS[page.partKey] ?? []) {
        const v = page.fields?.[def.key];
        next[def.key] = typeof v === 'string' ? v : v == null ? '' : String(v);
      }
      setFields(next);
    } else {
      setName('');
      setPartKey('name');
      setSlot('lower');
      setProofState('draft');
      setFields({});
    }
  }, [open, page]);

  const pickPart = (key: GraphicsPartKey) => {
    setPartKey(key);
    setSlot(PART_DEFAULT_SLOT[key]);
    setFields({});
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const input = { name: name.trim(), slot, partKey, fields: { ...fields }, proofState };
      if (page) {
        await updateGraphicsPage(page.id, input);
        notifySuccess('ページを保存しました');
      } else {
        await createGraphicsPage(projectId, input);
        notifySuccess('ページを作りました');
      }
      onOpenChange(false);
      onSaved();
    } catch {
      notifyError(page ? 'ページを保存できませんでした' : 'ページを作れませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{page ? `ページを編集（番号 ${page.callNo}）` : 'ページを作る'}</DialogTitle>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit}>
          <div>
            <Label htmlFor="graphics-page-name">ページ名 <span className="text-destructive">*</span></Label>
            <Input
              id="graphics-page-name"
              className="mt-1 min-h-[44px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="例：主催者あいさつ 田島常務"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <Label>部品</Label>
              <Select value={partKey} onValueChange={(v) => pickPart(v as GraphicsPartKey)}>
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
              <Select value={slot} onValueChange={(v) => setSlot(v as GraphicsSlot)}>
                <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GRAPHICS_SLOTS.map((s) => (
                    <SelectItem key={s} value={s}>{SLOT_LABELS[s]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {(PART_FIELDS[partKey] ?? []).map((def) => (
            <div key={def.key}>
              <Label htmlFor={`graphics-field-${def.key}`}>{def.label}</Label>
              <Input
                id={`graphics-field-${def.key}`}
                type={def.type ?? 'text'}
                className="mt-1 min-h-[44px]"
                value={fields[def.key] ?? ''}
                onChange={(e) => setFields((prev) => ({ ...prev, [def.key]: e.target.value }))}
              />
            </div>
          ))}

          <div>
            <Label>校正の状態</Label>
            <Select value={proofState} onValueChange={(v) => setProofState(v as GraphicsProofState)}>
              <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue /></SelectTrigger>
              <SelectContent>
                {PROOF_KEYS.map((k) => (
                  <SelectItem key={k} value={k}>{PROOF_LABELS[k]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="mt-1 text-note text-muted-foreground">
              「未完成」は送出コンソールで TAKE できません。「未確認」は TAKE 時に警告が出ます。
            </p>
          </div>

          <DialogFooter>
            <Button type="submit" className="min-h-[44px]" disabled={!name.trim() || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : page ? '保存する' : '作る'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
