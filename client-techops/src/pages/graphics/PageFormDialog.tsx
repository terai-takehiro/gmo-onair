// テロップCG — ページの作成・編集ダイアログ（段3: フォーム自動生成・検証・
// ライブプレビュー・校正ステータス）。
//
// 本来の設計（docs/design/v4/graphics.md §3・§5）では入力欄はテンプレートの
// 公開フィールドから自動生成し、常時ライブプレビューを付ける。段1〜2ではまだ
// テンプレート編集が無いので、部品（partKey）ごとに決め打ちの欄を出す
// **つなぎの形**のまま（欄の定義は `pageFields.ts` に切り出した）。
// 段3で足したのはライブプレビュー（`PageLivePreview.tsx`）と文字数のソフトな警告。
// 「検証は記入時に完結」— 上限を超えても保存は止めない（§3「本番画面にバリデーション
// エラーが出た時点で設計の負け」）。
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
  type GraphicsThemeKey,
} from '@/lib/graphicsApi';
import { PART_FIELDS, PART_KEYS } from './pageFields';
import PageLivePreview from './PageLivePreview';
import { ScoreEntriesEditor } from './ScoreEntriesEditor';
import { defaultScoreEntries, normalizeScoreEntries } from './scoreEntries';
import { VoteChoicesEditor } from './VoteChoicesEditor';
import { defaultVoteChoices, normalizeVoteChoices } from './voteChoices';

const PROOF_KEYS: GraphicsProofState[] = ['draft', 'unproofed', 'proofed'];

/** 文字数カウンターの色（ソフトな警告。80%到達で注意色・超過で警告色 — 保存は止めない） */
function counterClass(length: number, limit: number): string {
  if (length > limit) return 'text-destructive font-bold';
  if (length >= limit * 0.8) return 'text-warning font-bold';
  return 'text-muted-foreground';
}

/** 新規作成時の事前入力（発注＝テロ原からの「ページにする」用）。`page` が非nullのときは無視される */
export interface PageFormInitialValues {
  name?: string;
  slot?: GraphicsSlot;
  partKey?: GraphicsPartKey;
  /** 部品の最初のテキスト欄に入れる文言（発注の detail/desiredTiming 程度の簡易マッピングでよい） */
  firstFieldValue?: string;
}

export default function PageFormDialog({
  projectId, page, theme, initialValues, open, onOpenChange, onSaved,
}: {
  projectId: string;
  /** 編集対象。null なら新規作成 */
  page: GraphicsPageRow | null;
  /** プレビューに使うプロジェクトのテーマ（ハブの `ThemePicker` が正） */
  theme: GraphicsThemeKey;
  /** 新規作成（`page === null`）のときだけ効く事前入力 */
  initialValues?: PageFormInitialValues;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** 保存できたページ（作成・更新どちらも）を渡す。発注からの変換で呼び出し元が紐づけに使う */
  onSaved: (savedPage: GraphicsPageRow) => void;
}) {
  const [name, setName] = useState('');
  const [partKey, setPartKey] = useState<GraphicsPartKey>('name');
  const [slot, setSlot] = useState<GraphicsSlot>('lower');
  const [proofState, setProofState] = useState<GraphicsProofState>('draft');
  // 通常の部品は1行テキスト（string）だけだが、score の `entries` 欄は
  // ScoreEntry[] を持つ（pageFields.ts の kind:'entries'）。両方を1つの
  // Record<string, unknown> に同居させ、レンダリング側で欄ごとに読み分ける
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);

  // 開くたびに編集対象（または新規の既定値）を入れ直す
  useEffect(() => {
    if (!open) return;
    if (page) {
      setName(page.name);
      setPartKey(page.partKey);
      setSlot(page.slot);
      setProofState(page.proofState);
      const next: Record<string, unknown> = {};
      for (const def of PART_FIELDS[page.partKey] ?? []) {
        const v = page.fields?.[def.key];
        next[def.key] = def.kind === 'entries'
          ? normalizeScoreEntries(v)
          : def.kind === 'choices'
          ? normalizeVoteChoices(v)
          : typeof v === 'string' ? v : v == null ? '' : String(v);
      }
      setFields(next);
    } else {
      const initPartKey = initialValues?.partKey ?? 'name';
      setName(initialValues?.name ?? '');
      setPartKey(initPartKey);
      setSlot(initialValues?.slot ?? PART_DEFAULT_SLOT[initPartKey]);
      setProofState('draft');
      const defs = PART_FIELDS[initPartKey] ?? [];
      const next: Record<string, unknown> = {};
      defs.forEach((def, i) => {
        if (def.kind === 'entries') next[def.key] = defaultScoreEntries();
        else if (def.kind === 'choices') next[def.key] = defaultVoteChoices();
        else if (i === 0 && initialValues?.firstFieldValue) next[def.key] = initialValues.firstFieldValue;
      });
      setFields(next);
    }
  }, [open, page, initialValues]);

  const pickPart = (key: GraphicsPartKey) => {
    setPartKey(key);
    setSlot(PART_DEFAULT_SLOT[key]);
    const next: Record<string, unknown> = {};
    for (const def of PART_FIELDS[key] ?? []) {
      if (def.kind === 'entries') next[def.key] = defaultScoreEntries();
      else if (def.kind === 'choices') next[def.key] = defaultVoteChoices();
    }
    setFields(next);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    setSaving(true);
    try {
      const input = { name: name.trim(), slot, partKey, fields: { ...fields }, proofState };
      let saved: GraphicsPageRow;
      if (page) {
        saved = await updateGraphicsPage(page.id, input);
        notifySuccess('ページを保存しました');
      } else {
        saved = await createGraphicsPage(projectId, input);
        notifySuccess('ページを作りました');
      }
      onOpenChange(false);
      onSaved(saved);
    } catch {
      notifyError(page ? 'ページを保存できませんでした' : 'ページを作れませんでした');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{page ? `ページを編集（番号 ${page.callNo}）` : 'ページを作る'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <form id="graphics-page-form" className="space-y-4" onSubmit={submit}>
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

            {(PART_FIELDS[partKey] ?? []).map((def) => {
              if (def.kind === 'entries') {
                return (
                  <ScoreEntriesEditor
                    key={def.key}
                    label={def.label}
                    entries={normalizeScoreEntries(fields[def.key])}
                    maxEntries={def.maxEntries}
                    nameLimit={def.nameLimit}
                    onChange={(next) => setFields((prev) => ({ ...prev, [def.key]: next }))}
                  />
                );
              }
              if (def.kind === 'choices') {
                return (
                  <VoteChoicesEditor
                    key={def.key}
                    label={def.label}
                    choices={normalizeVoteChoices(fields[def.key])}
                    maxChoices={def.maxChoices}
                    choiceLabelLimit={def.choiceLabelLimit}
                    onChange={(next) => setFields((prev) => ({ ...prev, [def.key]: next }))}
                  />
                );
              }
              const raw = fields[def.key];
              const value = typeof raw === 'string' ? raw : '';
              const length = Array.from(value).length;
              return (
                <div key={def.key}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Label htmlFor={`graphics-field-${def.key}`}>{def.label}</Label>
                    {def.limit != null && (
                      <span className={`font-number text-note ${counterClass(length, def.limit)}`}>
                        {length} / {def.limit}
                      </span>
                    )}
                  </div>
                  <Input
                    id={`graphics-field-${def.key}`}
                    type={def.type ?? 'text'}
                    className="mt-1 min-h-[44px]"
                    value={value}
                    onChange={(e) => setFields((prev) => ({ ...prev, [def.key]: e.target.value }))}
                  />
                </div>
              );
            })}

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
          </form>

          <div>
            <p className="mb-1.5 text-th font-bold text-muted-foreground">プレビュー</p>
            <PageLivePreview
              name={name}
              partKey={partKey}
              slot={slot}
              fields={fields}
              theme={theme}
              callNo={page?.callNo}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" form="graphics-page-form" className="min-h-[44px]" disabled={!name.trim() || saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : page ? '保存する' : '作る'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
