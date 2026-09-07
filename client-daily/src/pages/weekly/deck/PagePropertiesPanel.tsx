/**
 * 右の「このページ」— テンプレート・題（【カテゴリ｜緊急×重要｜時間】）・表の対象・発表メモ・選んだ部品の文
 *
 * 数字そのものはここでは直せない（直すなら元のデータ）。直せるのは、文・注記・写真・並びだけ
 * （`docs/design/v4/keep-report.md` §6.1）。上書きした文は資料で赤になる。
 */
import type { ReactNode } from 'react';
import { SLIDE_TEMPLATES } from '@gmo-onair/shared/src/keepReport/templates';
import { BUSINESS_ENTITY_LABELS, type SlidePart } from '@gmo-onair/shared/src/keepReport/types';
import { EmptyState } from '@gmo-onair/shared/src/client/states';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { hasOverride, pageHumanEdits, partLabel, plBinding, plOptions, stripAgenda, templateLabel, type PlEntity, type PlMode } from './deckLabels';
import { composeTitle, useDeckStore } from './deckState';

const SELECT = 'text-sub h-9 w-full rounded-control border border-border bg-background px-2';
const INPUT = 'h-9 text-sub';

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-th text-muted-foreground">{label}</span>
      {children}
      {hint && <span className="text-note text-muted-foreground">{hint}</span>}
    </label>
  );
}

const OVERRIDE_LABEL: Record<SlidePart['type'], string> = {
  text: '文', bullets: '箇条書き（1行に1項目）', table: '表の中身（タブ区切り・1行目は見出し）', photos: 'Box の file id（1行に1つ）',
  kpi: '数字（「ラベル：値」を1行に1つ）', chart: 'グラフの代わりに出す文', calendar: 'カレンダーの代わりに出す文', image: '画像の代わりに出す文',
};

export function PagePropertiesPanel() {
  const deck = useDeckStore((s) => s.deck);
  const pack = useDeckStore((s) => s.pack);
  const selectedPageId = useDeckStore((s) => s.selectedPageId);
  const selectedPartId = useDeckStore((s) => s.selectedPartId);
  const updatePage = useDeckStore((s) => s.updatePage);
  const updatePart = useDeckStore((s) => s.updatePart);

  const page = deck?.pages.find((p) => p.id === selectedPageId) ?? null;
  if (!page) {
    return (
      <div className="p-3">
        <EmptyState title="ページを選んでいません" description="左の一覧でページを押すと、題や文をここで直せます。" />
      </div>
    );
  }
  const tpl = SLIDE_TEMPLATES[page.template];
  const part = page.parts.find((p) => p.id === selectedPartId) ?? null;
  const table = page.parts.find((p) => p.type === 'table') ?? null;
  const agenda = page.agenda ?? null;
  const setAgenda = (patch: Partial<NonNullable<typeof agenda>>) => {
    const next = { category: agenda?.category ?? '', priority: agenda?.priority ?? '', minutes: agenda?.minutes ?? 0, ...patch };
    const empty = !next.category && !next.priority && !next.minutes;
    updatePage(page.id, { agenda: empty ? null : next, title: composeTitle(page.title, empty ? null : next) });
  };
  const partOptions = (part?.options ?? {}) as Record<string, unknown>;
  const setPartOption = (key: string, value: unknown) => {
    if (!part) return;
    updatePart(page.id, part.id, { options: { ...partOptions, [key]: value } });
  };
  const knownProjects = [...(pack?.project_pages ?? []), ...(pack?.event_reports ?? [])];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3">
      <Field label="テンプレート"><p className="text-sub">{templateLabel(page.template)}</p></Field>
      <Field label="題">
        <Input className={INPUT} value={stripAgenda(page.title)} onChange={(e) => updatePage(page.id, { title: composeTitle(e.target.value, agenda) })} />
      </Field>
      {tpl?.header !== 'none' && (
        <Field label="【カテゴリ｜緊急×重要｜時間】" hint="報告ページの題の書式。3つとも空にすると【】無しの題になります">
          <div className="grid grid-cols-3 gap-1.5">
            <Input className={INPUT} placeholder="報告" aria-label="カテゴリ" value={agenda?.category ?? ''} onChange={(e) => setAgenda({ category: e.target.value })} />
            <Input className={INPUT} placeholder="3×3" aria-label="緊急×重要" value={agenda?.priority ?? ''} onChange={(e) => setAgenda({ priority: e.target.value })} />
            <Input className={INPUT} type="number" min={0} placeholder="分" aria-label="時間（分）" value={agenda?.minutes ?? ''} onChange={(e) => setAgenda({ minutes: Number(e.target.value) || 0 })} />
          </div>
        </Field>
      )}
      {page.template === 'pl_table' && table && (
        <>
          <Field label="表" hint={`対象月は数字の側で決まります（${pack ? pack[plOptions(table).mode].all.year_month : '—'}）`}>
            <select className={SELECT} value={plOptions(table).mode} onChange={(e) => { const mode = e.target.value as PlMode; updatePart(page.id, table.id, { binding: plBinding(mode, plOptions(table).entity), options: { ...(table.options ?? {}), mode } }); }}>
              <option value="landing">当月 着地</option>
              <option value="forecast">翌月 着地見込</option>
            </select>
          </Field>
          <Field label="計上会社">
            <select className={SELECT} value={plOptions(table).entity} onChange={(e) => { const entity = e.target.value as PlEntity; updatePart(page.id, table.id, { binding: plBinding(plOptions(table).mode, entity), options: { ...(table.options ?? {}), entity } }); }}>
              <option value="all">全社（統合）</option>
              <option value="GSS">{BUSINESS_ENTITY_LABELS.GSS}</option>
              <option value="GJV">{BUSINESS_ENTITY_LABELS.GJV}</option>
              <option value="GMO">{BUSINESS_ENTITY_LABELS.GMO}</option>
              <option value="by_entity">計上会社別（並べる）</option>
            </select>
          </Field>
        </>
      )}
      {page.template === 'pipeline_table' && table && (
        <Field label="一覧">
          <select className={SELECT} value={(table.options?.list as string) === 'samurai' || (table.binding ?? '').includes('samurai') ? 'samurai' : 'external'} onChange={(e) => updatePart(page.id, table.id, { binding: `pipeline.${e.target.value}`, options: { ...(table.options ?? {}), list: e.target.value } })}>
            <option value="external">外部案件</option>
            <option value="samurai">サムライ関連</option>
          </select>
        </Field>
      )}
      <Field label="発表メモ（資料には出ません）">
        <Textarea rows={3} className="text-sub min-h-0" value={page.notes ?? ''} onChange={(e) => updatePage(page.id, { notes: e.target.value || null })} />
      </Field>

      <div className="flex flex-col gap-3 border-t border-border-faint pt-3">
        {part ? (
          <>
            <p className="text-th text-muted-foreground">選んだ部品 — {partLabel(part, page)}</p>
            <Field
              label={OVERRIDE_LABEL[part.type]}
              hint={part.binding ? `空にすると ONAiR の数字に戻ります。上書きした文は資料で赤になります` : undefined}
            >
              <Textarea rows={6} className="text-sub min-h-0" value={part.text_override ?? ''} onChange={(e) => updatePart(page.id, part.id, { text_override: e.target.value === '' ? null : e.target.value })} />
            </Field>
            {hasOverride(part) && (
              <Button type="button" variant="outline" size="sm" onClick={() => updatePart(page.id, part.id, { text_override: null })}>上書きを外す</Button>
            )}
            {part.type === 'photos' && !part.binding && (
              <Field label="写真の案件" hint="写真は案件 Box の 08_写真 から。file id は案件詳細の Box タブで確かめます">
                <select className={SELECT} value={(partOptions.project_id as string) ?? ''} onChange={(e) => setPartOption('project_id', e.target.value || undefined)}>
                  <option value="">選んでください</option>
                  {knownProjects.map((p) => <option key={p.project_id} value={p.project_id}>{p.band.customer_short}／{p.band.event_name}</option>)}
                </select>
              </Field>
            )}
            <Field label="文字の大きさ（px・空欄で自動）">
              <Input className={INPUT} type="number" min={8} max={72} value={(partOptions.font_size as number | undefined) ?? ''} onChange={(e) => setPartOption('font_size', e.target.value ? Number(e.target.value) : undefined)} />
            </Field>
            <Field label="位置と大きさ（%）">
              <div className="grid grid-cols-4 gap-1.5">
                {(['x', 'y', 'w', 'h'] as const).map((k) => (
                  <Input key={k} className={INPUT} type="number" min={0} max={100} aria-label={k} value={part[k]} onChange={(e) => updatePart(page.id, part.id, { [k]: Math.max(0, Math.min(100, Number(e.target.value) || 0)) })} />
                ))}
              </div>
            </Field>
          </>
        ) : (
          <p className="text-note text-muted-foreground">キャンバスで部品を押すと、ここで文を直せます</p>
        )}
      </div>

      <div className="text-sub-sm mt-auto border-t border-border-faint pt-2 text-muted-foreground">
        このページで人が直した <span className="font-number font-bold text-foreground">{pageHumanEdits(page)}</span> 件
      </div>
    </div>
  );
}
