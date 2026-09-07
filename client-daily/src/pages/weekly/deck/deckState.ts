/**
 * 資料ビルダーの状態（zustand）— 構成（`KeepDeck`）の編集の正はここ
 *
 * ── 決めごと ────────────────────────────────────────────────
 *
 * - **構成は不変の値として持ち、操作のたびに新しい配列を作る**（自動保存が「変わった」を
 *   参照の違いで知るため）。ページ・部品を書き換えるときは必ず `set` 系の action を通す
 * - **消したページは残して印を付ける**（`removed: true`）。次回の既定に効かせるため
 *   （`docs/design/v4/keep-report.md` §6.1）。一覧では薄く出して「戻す」を置く
 * - **数字そのものは持たない**。部品は `binding`（パックのどこを読むか）と人の上書きだけ
 * - 自動保存は `useDeckAutosave` — 変更から 1.5 秒静かになったら PUT。
 *   失敗しても打ちかけは消さず、`saveStatus: 'error'` で「もう一度保存」を出す
 */
import { useCallback, useEffect, useRef } from 'react';
import { create } from 'zustand';
import { BODY_TOP, SLIDE_TEMPLATES } from '@gmo-onair/shared/src/keepReport/templates';
import type { KeepDeck, KeepReportPack, SlidePage, SlidePart, SlideTemplateKey } from '@gmo-onair/shared/src/keepReport/types';
import type { DeckBundle, SaveDeckResult } from '@/lib/deckApi';

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error';

/** 部品を足すときの指定（位置は store が決める） */
export interface NewPartSpec {
  type: SlidePart['type'];
  binding: string | null;
  text_override?: string | null;
  options?: Record<string, unknown>;
  /** 高さ（%）。省略すると種類ごとの既定 */
  h?: number;
}

/** ページを足すときの指定。`scope` は `project.` `report.` の binding を付け替える先（`project_pages[0]` など） */
export interface NewPageSpec {
  template: SlideTemplateKey;
  title?: string;
  scope?: string;
  options?: Record<string, unknown>;
  parts?: NewPartSpec[];
}

const DEFAULT_H: Record<SlidePart['type'], number> = {
  table: 30, chart: 40, image: 40, text: 12, bullets: 22, kpi: 16, calendar: 60, photos: 34,
};

/** 本文の下端（フッターの上）。部品はこれより下に置かない */
const BODY_BOTTOM = 92;

export function newId(prefix: string): string {
  const rand = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${rand}`;
}

function bindingFor(binding: string | null, scope?: string): string | null {
  if (!binding || !scope) return binding;
  const m = binding.match(/^(project|report)\.(\w+)$/);
  return m ? `${scope}.${m[2]}` : binding;
}

export function buildPage(spec: NewPageSpec): SlidePage {
  const tpl = SLIDE_TEMPLATES[spec.template];
  const parts: SlidePart[] = spec.parts
    ? spec.parts.map((p) => ({
        id: newId('part'), type: p.type, binding: p.binding, x: 2, y: BODY_TOP[tpl.header === 'none' ? 'none' : tpl.header === 'title' ? 'title' : 'bands'] + 2,
        w: 96, h: p.h ?? DEFAULT_H[p.type], text_override: p.text_override ?? null, options: p.options,
      }))
    : tpl.regions.map((r) => ({
        id: newId('part'), type: r.type, binding: bindingFor(r.binding, spec.scope),
        x: r.x, y: r.y, w: r.w, h: r.h, text_override: null,
        // `label` はサーバーが組む部品と同じ約束（`buildStandardDeck`）。右のパネルの呼び名に使う
        options: { label: r.label, ...(spec.options ?? {}) },
      }));
  const title = spec.title ?? tpl.defaultTitle;
  const agenda = title.includes('【') ? parseAgenda(title) : null;
  return { id: newId('page'), template: spec.template, title, auto: false, parts, removed: false, notes: null, agenda };
}

/** 「①数値報告・営業進捗【報告｜3×3｜5分】」→ { category: '報告', priority: '3×3', minutes: 5 } */
export function parseAgenda(title: string): SlidePage['agenda'] {
  const m = title.match(/【([^｜】]*)｜([^｜】]*)｜(\d+)\s*分】/);
  return m ? { category: m[1], priority: m[2], minutes: Number(m[3]) } : null;
}

export function composeTitle(base: string, agenda: SlidePage['agenda']): string {
  const head = base.replace(/【[^】]*】\s*$/, '').trim();
  if (!agenda) return head;
  return `${head}【${agenda.category}｜${agenda.priority}｜${agenda.minutes}分】`;
}

/**
 * 新しい部品の置き場所。**既存の部品のいちばん下**に入れる（「このページの下に部品が入ります」）。
 * 下に余地が無ければ、空いている帯のうちいちばん広いところに縮めて入れる。
 * それも無ければ本文の下端に重ねる（人が右の「このページ」で位置を直せる）。
 */
const MIN_H = 8;
function placeBelow(page: SlidePage, spec: NewPartSpec): Pick<SlidePart, 'x' | 'y' | 'w' | 'h'> {
  const tpl = SLIDE_TEMPLATES[page.template];
  const top = BODY_TOP[tpl?.header === 'none' ? 'none' : tpl?.header === 'title' ? 'title' : 'bands'] + 1;
  const want = spec.h ?? DEFAULT_H[spec.type];
  const bottom = page.parts.reduce((m, p) => Math.max(m, p.y + p.h), top);
  if (BODY_BOTTOM - (bottom + 1) >= MIN_H) return { x: 2, y: bottom + 1, w: 96, h: Math.min(want, BODY_BOTTOM - (bottom + 1)) };
  // 空いている帯（部品と部品のあいだ）を探す
  const spans = [...page.parts].map((p) => [p.y, p.y + p.h] as const).sort((a, b) => a[0] - b[0]);
  let cursor = top;
  let best: { y: number; h: number } | null = null;
  for (const [y0, y1] of [...spans, [BODY_BOTTOM, BODY_BOTTOM] as const]) {
    const free = y0 - 1 - cursor;
    if (free >= MIN_H && (!best || free > best.h)) best = { y: cursor, h: free };
    cursor = Math.max(cursor, y1 + 1);
  }
  if (best) return { x: 2, y: best.y, w: 96, h: Math.min(want, best.h) };
  const h = Math.min(want, BODY_BOTTOM - top);
  return { x: 2, y: Math.max(top, BODY_BOTTOM - h), w: 96, h };
}

interface DeckState {
  /** 手入力（keep_report_inputs）。部品の `inputs.*` が読む */
  inputs: Record<string, unknown> | null;
  meeting: string | null;
  deck: KeepDeck | null;
  pack: KeepReportPack | null;
  packFrozen: boolean;
  previousMeetingDate: string | null;
  selectedPageId: string | null;
  selectedPartId: string | null;
  dirty: boolean;
  saveStatus: SaveStatus;
  savedAt: string | null;
  serverEdits: number | null;
  /** 「差し替え」を押した部品。右の部品の＋がこの部品を置き換える */
  replaceTargetPartId: string | null;
  dragging: 'chip' | 'page' | null;

  load: (meeting: string, bundle: DeckBundle, opts?: { keepSelection?: boolean }) => void;
  select: (pageId: string | null) => void;
  selectPart: (partId: string | null) => void;
  setDragging: (v: 'chip' | 'page' | null) => void;
  setReplaceTarget: (partId: string | null) => void;
  reorder: (activeId: string, overId: string) => void;
  removePage: (pageId: string) => void;
  restorePage: (pageId: string) => void;
  addPage: (spec: NewPageSpec, afterPageId?: string | null, atIndex?: number) => string;
  updatePage: (pageId: string, patch: Partial<Pick<SlidePage, 'title' | 'notes' | 'agenda'>>) => void;
  addPart: (pageId: string, spec: NewPartSpec) => string | null;
  replacePart: (pageId: string, partId: string, spec: NewPartSpec) => void;
  duplicatePart: (pageId: string, partId: string) => void;
  removePart: (pageId: string, partId: string) => void;
  updatePart: (pageId: string, partId: string, patch: Partial<Pick<SlidePart, 'text_override' | 'options' | 'binding' | 'x' | 'y' | 'w' | 'h'>>) => void;
  setSaveStatus: (status: SaveStatus) => void;
  markSaved: (snapshot: KeepDeck, result: SaveDeckResult) => void;
}

const editsCount = (e: SaveDeckResult['edits']) => (Array.isArray(e) ? e.length : typeof e === 'number' ? e : null);

export const useDeckStore = create<DeckState>((set, get) => {
  const touch = (updater: (deck: KeepDeck) => KeepDeck) => {
    const { deck } = get();
    if (!deck) return;
    set({ deck: updater(deck), dirty: true });
  };
  const mapPage = (pageId: string, fn: (p: SlidePage) => SlidePage) =>
    touch((d) => ({ ...d, pages: d.pages.map((p) => (p.id === pageId ? fn(p) : p)) }));

  return {
    meeting: null, deck: null, pack: null, packFrozen: false, previousMeetingDate: null, inputs: null,
    selectedPageId: null, selectedPartId: null, dirty: false, saveStatus: 'idle', savedAt: null, serverEdits: null,
    replaceTargetPartId: null, dragging: null,

    load: (meeting, bundle, opts) => {
      const keep = opts?.keepSelection && get().meeting === meeting;
      const firstVisible = bundle.deck.pages.find((p) => !p.removed)?.id ?? bundle.deck.pages[0]?.id ?? null;
      const stillThere = keep && bundle.deck.pages.some((p) => p.id === get().selectedPageId);
      set({
        meeting, deck: bundle.deck, pack: bundle.pack, packFrozen: bundle.pack_frozen,
        previousMeetingDate: bundle.previous_meeting_date, inputs: bundle.inputs ?? null,
        selectedPageId: stillThere ? get().selectedPageId : firstVisible,
        selectedPartId: null, dirty: false, saveStatus: keep ? get().saveStatus : 'idle', replaceTargetPartId: null,
      });
    },
    select: (pageId) => set({ selectedPageId: pageId, selectedPartId: null, replaceTargetPartId: null }),
    selectPart: (partId) => set({ selectedPartId: partId, replaceTargetPartId: null }),
    setDragging: (v) => set({ dragging: v }),
    setReplaceTarget: (partId) => set({ replaceTargetPartId: partId }),

    reorder: (activeId, overId) => touch((d) => {
      const from = d.pages.findIndex((p) => p.id === activeId);
      const to = d.pages.findIndex((p) => p.id === overId);
      if (from < 0 || to < 0 || from === to) return d;
      const pages = [...d.pages];
      const [moved] = pages.splice(from, 1);
      pages.splice(to, 0, moved);
      return { ...d, pages };
    }),
    removePage: (pageId) => {
      mapPage(pageId, (p) => ({ ...p, removed: true }));
      if (get().selectedPartId) set({ selectedPartId: null });
    },
    restorePage: (pageId) => mapPage(pageId, (p) => ({ ...p, removed: false })),

    addPage: (spec, afterPageId, atIndex) => {
      const page = buildPage(spec);
      touch((d) => {
        const pages = [...d.pages];
        let idx = typeof atIndex === 'number' ? atIndex : -1;
        if (idx < 0) {
          const anchor = afterPageId ?? get().selectedPageId;
          const i = anchor ? pages.findIndex((p) => p.id === anchor) : -1;
          idx = i >= 0 ? i + 1 : pages.length;
        }
        pages.splice(Math.min(idx, pages.length), 0, page);
        return { ...d, pages };
      });
      set({ selectedPageId: page.id, selectedPartId: null });
      return page.id;
    },
    updatePage: (pageId, patch) => mapPage(pageId, (p) => ({ ...p, ...patch })),

    addPart: (pageId, spec) => {
      const page = get().deck?.pages.find((p) => p.id === pageId);
      if (!page) return null;
      const part: SlidePart = {
        id: newId('part'), type: spec.type, binding: spec.binding, ...placeBelow(page, spec),
        text_override: spec.text_override ?? null, options: spec.options,
      };
      mapPage(pageId, (p) => ({ ...p, parts: [...p.parts, part] }));
      set({ selectedPartId: part.id });
      return part.id;
    },
    replacePart: (pageId, partId, spec) => {
      mapPage(pageId, (p) => ({
        ...p,
        parts: p.parts.map((x) => (x.id === partId
          ? { ...x, type: spec.type, binding: spec.binding, text_override: spec.text_override ?? null, options: spec.options }
          : x)),
      }));
      set({ replaceTargetPartId: null });
    },
    duplicatePart: (pageId, partId) => {
      const page = get().deck?.pages.find((p) => p.id === pageId);
      const src = page?.parts.find((x) => x.id === partId);
      if (!page || !src) return;
      const copy: SlidePart = { ...src, id: newId('part'), y: Math.min(src.y + src.h + 1, BODY_BOTTOM - src.h) };
      mapPage(pageId, (p) => ({ ...p, parts: [...p.parts, copy] }));
      set({ selectedPartId: copy.id });
    },
    removePart: (pageId, partId) => {
      mapPage(pageId, (p) => ({ ...p, parts: p.parts.filter((x) => x.id !== partId) }));
      if (get().selectedPartId === partId) set({ selectedPartId: null, replaceTargetPartId: null });
    },
    updatePart: (pageId, partId, patch) =>
      mapPage(pageId, (p) => ({
        ...p,
        parts: p.parts.map((x) => {
          if (x.id !== partId) return x;
          // 位置・大きさを人が直したら印（options.moved）を付ける。組み直し（shared の carryOver）は印のある部品だけ
          // 前の版の位置を残し、ほかはテンプレの今の位置に揃える（印が無いと、テンプレを直しても古い位置が残り続ける）
          const moved = (['x', 'y', 'w', 'h'] as const).some((k) => k in patch);
          return { ...x, ...patch, ...(moved ? { options: { ...(x.options ?? {}), ...(patch.options ?? {}), moved: true } } : {}) };
        }),
      })),

    setSaveStatus: (status) => set({ saveStatus: status }),
    markSaved: (snapshot, result) => {
      const { deck } = get();
      const unchanged = deck === snapshot;
      set({
        saveStatus: 'saved', savedAt: new Date().toISOString(), serverEdits: editsCount(result.edits),
        dirty: !unchanged,
        deck: deck ? { ...deck, version: result.version ?? deck.version, updated_at: result.deck?.updated_at ?? deck.updated_at } : deck,
      });
    },
  };
});

/**
 * 自動保存。変更から 1.5 秒静かになったら PUT。保存中にまた変わったら次の 1.5 秒で追いかける。
 * `saveNow` は「もう一度保存」ボタンと、組み直し・出力の前に打ちかけを送るために使う。
 */
export function useDeckAutosave(save: (deck: KeepDeck) => Promise<SaveDeckResult>, enabled: boolean) {
  const dirty = useDeckStore((s) => s.dirty);
  const deck = useDeckStore((s) => s.deck);
  const inFlight = useRef<Promise<void> | null>(null);

  const saveNow = useCallback(async () => {
    if (!enabled) return;
    // 保存は必ず直列にし、**自分の番が来てから**写しを取る。先に写しを取って待つと、
    // 先の保存で進んだ版より古い version を送って 409 になる（出力・会議日の切り替えの直前に
    // 自動保存が重なったとき）。同時に2つ呼ばれても後のものは前の結果を見てから送る
    const prev = inFlight.current ?? Promise.resolve();
    const run = prev.catch(() => undefined).then(async () => {
      const snapshot = useDeckStore.getState().deck;
      if (!snapshot) return;
      useDeckStore.getState().setSaveStatus('saving');
      try {
        const r = await save(snapshot);
        useDeckStore.getState().markSaved(snapshot, r);
      } catch {
        useDeckStore.getState().setSaveStatus('error');
      }
    });
    inFlight.current = run;
    await run;
    if (inFlight.current === run) inFlight.current = null;
  }, [save, enabled]);

  useEffect(() => {
    if (!dirty || !deck || !enabled) return;
    const t = setTimeout(() => { void saveNow(); }, 1500);
    return () => clearTimeout(t);
  }, [dirty, deck, enabled, saveNow]);

  /** 打ちかけを持ったまま閉じない（ブラウザ標準の確認だけは残る） */
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ''; };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [dirty]);

  return { saveNow };
}
