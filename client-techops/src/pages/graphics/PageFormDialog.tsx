// テロップCG — ページの作成・編集ダイアログ（段3: フォーム自動生成・検証・
// ライブプレビュー・校正ステータス。段6-2: テンプレートからの作成・公開フィールド絞り込み）。
//
// 本来の設計（docs/design/v4/graphics.md §3・§5）では入力欄はテンプレートの
// 公開フィールドから自動生成し、常時ライブプレビューを付ける。段1〜2ではまだ
// テンプレート編集が無いので、部品（partKey）ごとに決め打ちの欄を出す
// **つなぎの形**のまま（欄の定義は `pageFields.ts` に切り出した）。
// 段3で足したのはライブプレビュー（`PageLivePreview.tsx`）と文字数のソフトな警告。
// 「検証は記入時に完結」— 上限を超えても保存は止めない（§3「本番画面にバリデーション
// エラーが出た時点で設計の負け」）。
//
// 段6-2で「テンプレートから作る／自由入力」の切替を足した（新規作成時のみ意味を持つ。
// 編集時は既存ページの `templateId` の有無で自動判定する）。テンプレート選択時は
// 部品・スロットの選択UIを隠しテンプレートの値を使い、`publicFields` に含まれる
// フィールドの入力欄だけを出す（それ以外は編集不可の表示 — `TemplateFieldsSection.tsx`）。
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
  fetchGraphicsTemplates,
  type GraphicsPageRow, type GraphicsPartKey, type GraphicsSlot, type GraphicsProofState,
  type GraphicsThemeKey, type GraphicsTemplateRow,
} from '@/lib/graphicsApi';
import { PART_FIELDS, PART_KEYS, normalizeFieldsForPart, buildDefaultFields } from './pageFields';
import PageLivePreview from './PageLivePreview';
import { PageFieldEditor } from './PageFieldEditor';
import { TemplateFieldsSection, initialFieldsFromTemplate } from './TemplateFieldsSection';
import { TemplateLayerFieldsList } from './TemplateLayerFieldsList';
import { saveGraphicsPageForm } from './savePageForm';
import { VoteInteractiveSection } from './VoteInteractiveSection';

const PROOF_KEYS: GraphicsProofState[] = ['draft', 'unproofed', 'proofed'];

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
  // 複数部品テンプレート（段6-2 本格拡張）のときのレイヤーごとの値。
  // インデックスがテンプレート（または保存済みページ）の `layers` の順序と対応する
  const [layerFieldsList, setLayerFieldsList] = useState<Record<string, unknown>[]>([]);

  // 段6-2: テンプレート一覧・選択状態。「テンプレートから作る」は新規作成時のみ意味を持つ
  const [templates, setTemplates] = useState<GraphicsTemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [useTemplateMode, setUseTemplateMode] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<GraphicsTemplateRow | null>(null);

  // 開くたびにテンプレート一覧を読み直す（作成直後の一覧にも追従させるため毎回フェッチ）
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setTemplatesLoading(true);
    fetchGraphicsTemplates(projectId)
      .then((rows) => { if (!cancelled) setTemplates(rows); })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setTemplatesLoading(false); });
    return () => { cancelled = true; };
  }, [open, projectId]);

  // 開くたびに編集対象（または新規の既定値）を入れ直す
  useEffect(() => {
    if (!open) return;
    if (page) {
      setName(page.name);
      setPartKey(page.partKey);
      setSlot(page.slot);
      setProofState(page.proofState);
      if (page.layers && page.layers.length > 0) {
        // 複数部品テンプレートから作られたページ: page.fields/partKey は無視してよく、
        // 各レイヤーの保存済み値を layers[i].fields から拾う（サーバー側の規約）
        setLayerFieldsList(page.layers.map((l) => normalizeFieldsForPart(l.partKey as GraphicsPartKey, l.fields)));
        setFields({});
      } else {
        setFields(normalizeFieldsForPart(page.partKey, page.fields));
        setLayerFieldsList([]);
      }
      // テンプレートから作られたページ（templateId あり）は編集も自動的にテンプレートモード
      // （編集画面でテンプレートの切替はできない — 部品・スロットが変わってしまうため）
      setUseTemplateMode(!!page.templateId);
      setSelectedTemplate(null); // templates フェッチ完了後、下の effect で解決する
    } else {
      const initPartKey = initialValues?.partKey ?? 'name';
      setName(initialValues?.name ?? '');
      setPartKey(initPartKey);
      setSlot(initialValues?.slot ?? PART_DEFAULT_SLOT[initPartKey]);
      setProofState('draft');
      setUseTemplateMode(false);
      setSelectedTemplate(null);
      setFields(buildDefaultFields(initPartKey, initialValues?.firstFieldValue));
      setLayerFieldsList([]);
    }
  }, [open, page, initialValues]);

  // 編集対象ページが template_id を持つとき、テンプレート一覧が揃ってから該当行を解決する
  // （一覧のフェッチと初期値の投入は別の effect で非同期に進むため）
  useEffect(() => {
    if (!page?.templateId) return;
    const found = templates.find((t) => t.id === page.templateId) ?? null;
    setSelectedTemplate(found);
  }, [page, templates]);

  const pickPart = (key: GraphicsPartKey) => {
    setPartKey(key);
    setSlot(PART_DEFAULT_SLOT[key]);
    setFields(buildDefaultFields(key));
  };

  const pickTemplate = (template: GraphicsTemplateRow) => {
    setSelectedTemplate(template);
    setPartKey(template.partKey);
    setSlot(template.slot);
    if (template.layers && template.layers.length > 0) {
      setLayerFieldsList(template.layers.map((l) => initialFieldsFromTemplate(l)));
      setFields({});
    } else {
      setFields(initialFieldsFromTemplate(template));
      setLayerFieldsList([]);
    }
  };

  const switchMode = (nextUseTemplate: boolean) => {
    setUseTemplateMode(nextUseTemplate);
    setSelectedTemplate(null);
    setLayerFieldsList([]);
    if (!nextUseTemplate) pickPart(partKey);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    if (useTemplateMode && !page && !selectedTemplate) return; // 新規作成でテンプレート未選択
    if (page?.templateId && !selectedTemplate) return; // 編集対象のテンプレート行が未解決
    setSaving(true);
    try {
      const saved = await saveGraphicsPageForm({
        projectId, page, name: name.trim(), partKey, slot, fields, proofState,
        useTemplateMode, selectedTemplate, layerFieldsList,
      });
      notifySuccess(page ? 'ページを保存しました' : 'ページを作りました');
      onOpenChange(false);
      onSaved(saved);
    } catch {
      notifyError(page ? 'ページを保存できませんでした' : 'ページを作れませんでした');
    } finally {
      setSaving(false);
    }
  };

  // テンプレートモードでの表示可否: 新規作成時はトグルの選択どおり。編集時は
  // ページが templateId を持つ場合だけ（テンプレートを外して編集し直すことはできない）
  const showTemplatePicker = !page && useTemplateMode;
  const showTemplateFields = useTemplateMode && !!selectedTemplate;
  // 編集対象がテンプレート付きページのときは、そのテンプレート行（publicFields の判定に要る）が
  // 解決し終わるまで保存させない — 未解決のまま送ると locked フィールドまで送って 400 になりうる
  const editingTemplatedPageUnresolved = !!page?.templateId && !selectedTemplate;
  const canSubmit = !!name.trim() && !saving && (!showTemplatePicker || !!selectedTemplate) && !editingTemplatedPageUnresolved;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="xl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{page ? `ページを編集（番号 ${page.callNo}）` : 'ページを作る'}</DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
          <form id="graphics-page-form" className="space-y-4" onSubmit={submit}>
            {!page && (
              <div className="flex gap-1.5 rounded-control-md bg-surface-subtle p-1">
                <button
                  type="button"
                  className={`min-h-tap flex-1 rounded-control px-3 text-sub font-bold transition-colors ${!useTemplateMode ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => switchMode(false)}
                >
                  自由入力
                </button>
                <button
                  type="button"
                  className={`min-h-tap flex-1 rounded-control px-3 text-sub font-bold transition-colors ${useTemplateMode ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                  onClick={() => switchMode(true)}
                  disabled={templates.length === 0 && !templatesLoading}
                >
                  テンプレートから作る
                </button>
              </div>
            )}

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

            {showTemplatePicker && (
              <div>
                <Label>テンプレート</Label>
                {templatesLoading ? (
                  <p className="mt-1 flex items-center gap-1.5 text-sub text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />読み込み中…
                  </p>
                ) : templates.length === 0 ? (
                  <p className="mt-1 text-sub text-muted-foreground">
                    このプロジェクトにテンプレートはまだありません。部品ライブラリから作成してください。
                  </p>
                ) : (
                  <Select
                    value={selectedTemplate ? String(selectedTemplate.id) : ''}
                    onValueChange={(v) => {
                      const t = templates.find((tpl) => String(tpl.id) === v);
                      if (t) pickTemplate(t);
                    }}
                  >
                    <SelectTrigger className="mt-1 min-h-[44px]"><SelectValue placeholder="テンプレートを選ぶ" /></SelectTrigger>
                    <SelectContent>
                      {templates.map((t) => (
                        <SelectItem key={t.id} value={String(t.id)}>
                          {t.name}（{PART_LABELS[t.partKey]}・{SLOT_LABELS[t.slot]}）
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
            )}

            {!useTemplateMode && (
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
            )}

            {showTemplateFields && selectedTemplate && (
              selectedTemplate.layers && selectedTemplate.layers.length > 0 ? (
                <TemplateLayerFieldsList
                  templateName={selectedTemplate.name}
                  layers={selectedTemplate.layers}
                  layerFieldsList={layerFieldsList}
                  setLayerFieldsList={setLayerFieldsList}
                  pageId={page?.id ?? null}
                />
              ) : (
                <TemplateFieldsSection
                  partKey={selectedTemplate.partKey}
                  slot={selectedTemplate.slot}
                  templateName={selectedTemplate.name}
                  publicFields={selectedTemplate.publicFields}
                  fields={fields}
                  setFields={setFields}
                  pageId={page?.id ?? null}
                />
              )
            )}

            {!useTemplateMode && (PART_FIELDS[partKey] ?? []).map((def) => (
              <PageFieldEditor
                key={def.key}
                def={def}
                idPrefix="graphics-field"
                fields={fields}
                setFields={setFields}
                pageId={page?.id ?? null}
              />
            ))}

            {/* 締切連動・外部インタラクティブ連携（段6-6・6-7）。useTemplateMode を問わず
                vote なら常に出す（`proofState` と同じ扱い）。詳細は VoteInteractiveSection.tsx */}
            {partKey === 'vote' && (
              <VoteInteractiveSection
                fields={fields}
                setFields={setFields}
                pageId={page?.id ?? null}
                countdownLocked={useTemplateMode}
              />
            )}

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
              layers={
                selectedTemplate?.layers && selectedTemplate.layers.length > 0
                  ? selectedTemplate.layers.map((l, i) => ({ partKey: l.partKey, fields: layerFieldsList[i] ?? {} }))
                  : undefined
              }
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="submit" form="graphics-page-form" className="min-h-[44px]" disabled={!canSubmit}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : page ? '保存する' : '作る'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
