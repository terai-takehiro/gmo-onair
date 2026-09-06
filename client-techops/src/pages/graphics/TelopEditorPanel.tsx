// テロップCG — テロップ一覧の右パネル（旧 `PageFormDialog.tsx` の内容を、
// ダイアログの外枠なしで①一覧に埋め込むための作り直し）。
//
// docs/design/v4/graphics-redesign.md §5「① テロップ一覧」:
// 「行を押すと右パネルに開く（別ページに飛ばない）」— ダイアログ往復をやめる、が
// このコンポーネントの存在理由。**フォームの組み立て・検証・テンプレート対応・
// 投票の外部連携ロジックは `PageFormDialog.tsx` からそのまま引き継ぐ**
// （動いている実装を書き直さない。変えたのは外枠と、校正の見せ方だけ）。
//
// 校正（§12-1・§4-1）: 3段の手動選択をやめ、**「確認済み」の切替1つ**にする。
// 「未完成」は主フィールドが空のときだけ自動で付く（`isPageContentEmpty`）。
// 切替はページ保存後は即時 PATCH（一覧の行の✓ボタンと同じ挙動・同じ結果に揃える）。
// 内容の文字入力は、これまでどおり明示的な保存ボタンで確定する（自動保存はしない —
// 1文字ごとの保存はレース条件のリスクがあり、段Aのスコープでは踏み込まない）。
//
// 新規作成は「種類を選ぶ → 文言を入れる」の2段（§5「③ 新しいテロップ」）。
// 種類を選ぶステップは `TelopKindGrid`（旧・部品ライブラリ）を使う。
import { useEffect, useState } from 'react';
import { ChevronLeft, Copy, Loader2, Trash2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { notifyError, notifySuccess } from '@/lib/notify';
import {
  PART_LABELS, PART_DEFAULT_SLOT,
  createGraphicsPage, deleteGraphicsPage, updateGraphicsPage, fetchGraphicsTemplates,
  type GraphicsPageRow, type GraphicsPartKey, type GraphicsSlot, type GraphicsThemeKey,
  type GraphicsTemplateRow,
} from '@/lib/graphicsApi';
import { buildDefaultFields, normalizeFieldsForPart, isPageContentEmpty } from './pageFields';
import { initialFieldsFromTemplate } from './TemplateFieldsSection';
import { saveGraphicsPageForm } from './savePageForm';
import TelopKindOrTemplateStep from './TelopKindOrTemplateStep';
import TelopEditorFormBody from './TelopEditorFormBody';

/** 新規作成時の事前入力（依頼＝テロ原からの「テロップにする」用）。`page` が非nullのときは無視される */
export interface PageFormInitialValues {
  name?: string;
  slot?: GraphicsSlot;
  partKey?: GraphicsPartKey;
  /** 部品の最初のテキスト欄に入れる文言（依頼の detail/desiredTiming 程度の簡易マッピングでよい） */
  firstFieldValue?: string;
}

export default function TelopEditorPanel({
  projectId, page, theme, initialValues, onSaved, onClose, onDeleted,
}: {
  projectId: string;
  /** 編集対象。null なら新規作成 */
  page: GraphicsPageRow | null;
  theme: GraphicsThemeKey;
  /** 新規作成（`page === null`）のときだけ効く事前入力 */
  initialValues?: PageFormInitialValues;
  /** 保存できたページ（作成・更新どちらも）を渡す */
  onSaved: (savedPage: GraphicsPageRow) => void;
  /** パネルを閉じる（保存はしない） */
  onClose: () => void;
  /** 削除できたときに呼ぶ（パネルは呼び出し側が閉じる） */
  onDeleted: () => void;
}) {
  // 新規作成の1段目（種類を選ぶ）が済んでいるか。`initialValues.partKey`（依頼からの変換）が
  // 来ているときは最初から2段目（文言を入れる）でよい
  const [partKeyChosen, setPartKeyChosen] = useState(!!page || !!initialValues?.partKey);

  const [name, setName] = useState('');
  const [partKey, setPartKey] = useState<GraphicsPartKey>('name');
  const [slot, setSlot] = useState<GraphicsSlot>('lower');
  const [confirmed, setConfirmed] = useState(false);
  const [fields, setFields] = useState<Record<string, unknown>>({});
  const [saving, setSaving] = useState(false);
  const [togglingConfirm, setTogglingConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [layerFieldsList, setLayerFieldsList] = useState<Record<string, unknown>[]>([]);

  // 段6-2: テンプレート一覧・選択状態（「テンプレートから作る」は新規作成時のみ意味を持つ。
  // テンプレート管理そのものは①の主導線からは外したが、既存テンプレートからの作成は引き続き使える）
  const [templates, setTemplates] = useState<GraphicsTemplateRow[]>([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [useTemplateMode, setUseTemplateMode] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<GraphicsTemplateRow | null>(null);

  useEffect(() => {
    let cancelled = false;
    setTemplatesLoading(true);
    fetchGraphicsTemplates(projectId)
      .then((rows) => { if (!cancelled) setTemplates(rows); })
      .catch(() => { if (!cancelled) setTemplates([]); })
      .finally(() => { if (!cancelled) setTemplatesLoading(false); });
    return () => { cancelled = true; };
  }, [projectId]);

  // 開いた対象（page か initialValues か）が変わるたびに入れ直す
  useEffect(() => {
    if (page) {
      setName(page.name);
      setPartKey(page.partKey);
      setSlot(page.slot);
      setConfirmed(page.proofState === 'proofed');
      if (page.layers && page.layers.length > 0) {
        setLayerFieldsList(page.layers.map((l) => normalizeFieldsForPart(l.partKey as GraphicsPartKey, l.fields)));
        setFields({});
      } else {
        setFields(normalizeFieldsForPart(page.partKey, page.fields));
        setLayerFieldsList([]);
      }
      setUseTemplateMode(!!page.templateId);
      setSelectedTemplate(null); // テンプレート一覧が揃ってから下の effect で解決する
      setPartKeyChosen(true);
    } else {
      const initPartKey = initialValues?.partKey ?? null;
      setName(initialValues?.name ?? '');
      setPartKey(initPartKey ?? 'name');
      setSlot(initialValues?.slot ?? (initPartKey ? PART_DEFAULT_SLOT[initPartKey] : 'lower'));
      setConfirmed(false);
      setUseTemplateMode(false);
      setSelectedTemplate(null);
      setFields(initPartKey ? buildDefaultFields(initPartKey, initialValues?.firstFieldValue) : {});
      setLayerFieldsList([]);
      setPartKeyChosen(!!initPartKey);
    }
  }, [page, initialValues]);

  useEffect(() => {
    if (!page?.templateId) return;
    const found = templates.find((t) => t.id === page.templateId) ?? null;
    setSelectedTemplate(found);
  }, [page, templates]);

  const pickPart = (key: GraphicsPartKey) => {
    setPartKey(key);
    setSlot(PART_DEFAULT_SLOT[key]);
    setFields(buildDefaultFields(key));
    setPartKeyChosen(true);
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
    setPartKeyChosen(true);
  };

  const backToKindPicker = () => {
    setPartKeyChosen(false);
    setSelectedTemplate(null);
    setLayerFieldsList([]);
  };

  // 主フィールドが空＝未完成（自動判定・§12-1）。複数部品テンプレートは対象外
  // （レイヤーごとの必須判定までは段Aのスコープにしない — 見た目の作り直しが主目的のため）
  const contentEmpty = layerFieldsList.length === 0 ? isPageContentEmpty(partKey, fields) : false;
  const effectiveProofState = contentEmpty ? 'draft' as const : (confirmed ? 'proofed' as const : 'unproofed' as const);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || saving) return;
    if (useTemplateMode && !page && !selectedTemplate) return;
    if (page?.templateId && !selectedTemplate) return;
    setSaving(true);
    try {
      const saved = await saveGraphicsPageForm({
        projectId, page, name: name.trim(), partKey, slot, fields, proofState: effectiveProofState,
        useTemplateMode, selectedTemplate, layerFieldsList,
      });
      notifySuccess(page ? 'テロップを保存しました' : 'テロップを作りました');
      onSaved(saved);
    } catch {
      notifyError(page ? 'テロップを保存できませんでした' : 'テロップを作れませんでした');
    } finally {
      setSaving(false);
    }
  };

  // 確認済みの切替は保存済みページだけ即時反映（一覧の行の✓と同じ挙動に揃える・§12-1）。
  // 新規作成中（page がまだ無い）はローカルの state を切り替えるだけで、実際の反映は
  // 「作る」を押したときの submit に乗る
  const toggleConfirmed = async () => {
    const next = !confirmed;
    setConfirmed(next);
    if (!page) return;
    setTogglingConfirm(true);
    try {
      const saved = await updateGraphicsPage(page.id, { proofState: next ? 'proofed' : 'unproofed' });
      onSaved(saved);
    } catch {
      setConfirmed(!next);
      notifyError('確認の状態を変更できませんでした');
    } finally {
      setTogglingConfirm(false);
    }
  };

  // 複製: いまの内容（テンプレート付きは publicFields の値のみ）で新しいテロップを作る。
  // 番号は自動採番（§12-3・固定番号の決定はここには関係ない — 複製は常に新しい番号を取る）
  const duplicate = async () => {
    if (!page) return;
    setDuplicating(true);
    try {
      const saved = layerFieldsList.length > 0
        ? await createGraphicsPage(projectId, {
            name: `${page.name}（複製）`, slot, partKey, fields: {}, proofState: 'draft',
            templateId: page.templateId ?? undefined,
            layerFields: layerFieldsList.map((f) => ({ ...f })),
          })
        : await createGraphicsPage(projectId, {
            name: `${page.name}（複製）`, slot, partKey, fields: { ...fields }, proofState: 'draft',
            templateId: page.templateId ?? undefined,
          });
      notifySuccess('複製しました');
      onSaved(saved);
    } catch {
      notifyError('複製できませんでした');
    } finally {
      setDuplicating(false);
    }
  };

  const remove = async () => {
    if (!page) return;
    if (!(await confirmAction({
      title: `テロップ「${page.name}」を削除しますか？`,
      description: `番号 ${page.callNo} のテロップが消えます。出す順からも外れます。`,
      confirmLabel: '削除する',
      tone: 'danger',
    }))) return;
    setDeleting(true);
    try {
      await deleteGraphicsPage(page.id);
      notifySuccess('テロップを削除しました');
      onDeleted();
    } catch {
      notifyError('テロップを削除できませんでした');
    } finally {
      setDeleting(false);
    }
  };

  const showTemplateFields = useTemplateMode && !!selectedTemplate;
  const editingTemplatedPageUnresolved = !!page?.templateId && !selectedTemplate;
  const canSubmit = !!name.trim() && !saving && !editingTemplatedPageUnresolved
    && (!useTemplateMode || !!selectedTemplate || !!page?.templateId);

  // ── 1段目: 種類を選ぶ（新規作成のみ・依頼からの変換で partKey が来ているときは省く） ──
  if (!page && !partKeyChosen) {
    return (
      <TelopKindOrTemplateStep
        useTemplateMode={useTemplateMode}
        onUseTemplateModeChange={(next) => { setUseTemplateMode(next); if (!next) setSelectedTemplate(null); }}
        templates={templates}
        templatesLoading={templatesLoading}
        onPickPart={pickPart}
        onPickTemplate={pickTemplate}
        onClose={onClose}
      />
    );
  }

  // ── 2段目: 文言を入れる（新規・編集共通） ──
  return (
    <aside className="flex w-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-sm lg:w-[420px]">
      <div className="flex items-center gap-2 border-b border-border-faint px-4 py-3">
        {!page && (
          <Button type="button" variant="ghost" size="icon" aria-label="種類の選び直しに戻る" onClick={backToKindPicker}>
            <ChevronLeft className="h-4 w-4" aria-hidden="true" />
          </Button>
        )}
        {page && <span className="font-number shrink-0 rounded-badge-xs bg-muted px-1.5 py-0.5 text-th font-bold text-muted-foreground">{page.callNo}</span>}
        <h2 className="min-w-0 flex-1 truncate text-cardtitle">{PART_LABELS[partKey]}</h2>
        {page && (
          <>
            <Button type="button" variant="ghost" size="icon" aria-label="複製" disabled={duplicating} onClick={() => void duplicate()}>
              {duplicating ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Copy className="h-4 w-4" aria-hidden="true" />}
            </Button>
            <Button type="button" variant="ghost" size="icon" aria-label="削除" disabled={deleting} onClick={() => void remove()}>
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Trash2 className="h-4 w-4 text-destructive" aria-hidden="true" />}
            </Button>
          </>
        )}
        <Button type="button" variant="ghost" size="icon" aria-label="閉じる" onClick={onClose}>
          <X className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>

      <form id="telop-editor-form" onSubmit={submit} className="flex-1 overflow-y-auto p-4">
        <TelopEditorFormBody
          page={page}
          name={name}
          onNameChange={setName}
          partKey={partKey}
          slot={slot}
          onSlotChange={setSlot}
          useTemplateMode={useTemplateMode}
          showTemplateFields={showTemplateFields}
          selectedTemplate={selectedTemplate}
          layerFieldsList={layerFieldsList}
          setLayerFieldsList={setLayerFieldsList}
          fields={fields}
          setFields={setFields}
          theme={theme}
          contentEmpty={contentEmpty}
          confirmed={confirmed}
          togglingConfirm={togglingConfirm}
          onToggleConfirmed={() => void toggleConfirmed()}
        />
      </form>

      <div className="flex items-center gap-2 border-t border-border-faint px-4 py-3">
        <span className="text-note text-muted-foreground">{page ? '' : '保存すると出す順の末尾に入ります'}</span>
        <div className="flex-1" />
        <Button type="submit" form="telop-editor-form" className="min-h-[44px]" disabled={!canSubmit}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : page ? '保存する' : '作る'}
        </Button>
      </div>
    </aside>
  );
}
