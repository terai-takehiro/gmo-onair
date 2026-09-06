/**
 * ウィークリー活動報告 ▸ 資料をつくる（`/weekly/:id/deck`・PC 専用）
 *
 * 隔週キープの資料（pptx）を、ONAiR の数字（定例報告パック）から半自動で組む画面。
 * 左にページの一覧、真ん中にスライドのキャンバス、右に置ける部品と、いまのページの設定。
 * 設計は docs/design/v4/keep-report.md §3・§6、絵は `mockups/keep-report/Builder.dc.html`。
 *
 * ── 会議日の決め方 ──────────────────────────────────────────
 * URL の `?meeting=YYYY-MM-DD` が正。無ければ、週報の週（`period_key` = 月曜）から
 * 「次回の開催日が月曜以降ならそれ、無ければ週の水曜」を仮に置いて URL に書く。
 * **開催日が決まるまで構成を読まない** — `GET /keep/decks/:meeting` は無ければ版1を作るので、
 * 仮の日付で読むと要らない構成が残る。
 *
 * ── 編集の正は store（`deckState.ts`）──────────────────────
 * 開いたときと組み直したあとだけサーバーの構成を store に流し込み、あとは store を直して
 * 1.5 秒静かになったら PUT（自動保存）。出力・組み直しの前には打ちかけを先に送る。
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { Delayed, ErrorPanel, NoPermissionPanel, NotFoundPanel, SkeletonRows } from '@gmo-onair/shared/src/client/states';
import { notifyApiError, notifyError, notifySuccess, notifyWarning } from '@gmo-onair/shared/src/client/notify';
import { cn } from '@gmo-onair/shared/src/client/utils';
import { useIsMobile } from '@gmo-onair/shared/src/client-v4/mobile';
import type { KeepDeck } from '@gmo-onair/shared/src/keepReport/types';
import { usePermissions } from '@/hooks/usePermissions';
import { useReport } from '@/lib/reportsApi';
import { useDeck, useExportDeck, useKeepMeetings, useRebuildDeck, useSaveDeck } from '@/lib/deckApi';
import { WeeklyTabs } from '../WeeklyTabs';
import { CompareDialog } from './CompareDialog';
import { DeckDnd } from './DeckDnd';
import { DeckHeader } from './DeckHeader';
import { defaultMeetingDate, humanEditCount } from './deckLabels';
import { useDeckAutosave, useDeckStore } from './deckState';
import { PageList } from './PageList';
import { PagePropertiesPanel } from './PagePropertiesPanel';
import { PartsPanel } from './PartsPanel';
import { PreviewDialog } from './PreviewDialog';
import { SlideCanvas, confirmRemovePart } from './SlideCanvas';
import { pageNumbers } from './SlideFrame';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Box に入らなかった理由（`X-Box-Reason`）の言い方。`client/src/lib/docPdf.ts` と同じ語彙 */
const BOX_REASON: Record<string, string> = {
  NOT_CONFIGURED: 'この環境は Box につないでいないので、保存はしていません。',
  NO_SUBFOLDER: 'Box の置き場所を用意できませんでした。あとでもう一度お試しください。',
  UNAVAILABLE: 'Box につながらなかったので保存できませんでした。あとでもう一度お試しください。',
  NO_PERMISSION: '保存する権限が無いので Box には入れていません。',
};

function RightPanel({ tab, onTab }: { tab: 'parts' | 'page'; onTab: (t: 'parts' | 'page') => void }) {
  const tabs: Array<{ key: 'parts' | 'page'; label: string }> = [{ key: 'parts', label: '部品' }, { key: 'page', label: 'このページ' }];
  return (
    <div className="flex w-[300px] shrink-0 flex-col overflow-hidden rounded-card border border-border bg-card">
      <div className="flex border-b border-border" role="tablist" aria-label="右のパネル">
        {tabs.map((t) => (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={tab === t.key}
            onClick={() => onTab(t.key)}
            className={cn('text-list -mb-px inline-flex h-11 flex-1 items-center justify-center border-b-2', tab === t.key ? 'border-primary text-primary' : 'border-transparent font-normal text-secondary-foreground hover:text-foreground')}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'parts' ? <PartsPanel /> : <PagePropertiesPanel />}
    </div>
  );
}

export default function DeckPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const { canEdit, permissionsLoading } = usePermissions();
  const report = useReport(id);
  const meetings = useKeepMeetings();

  const periodKey = report.data?.period_key ?? null;
  const meetingParam = searchParams.get('meeting');
  const meetingsSettled = meetings.isSuccess || meetings.isError;
  const meeting = useMemo(() => {
    if (meetingParam && DATE_RE.test(meetingParam)) return meetingParam;
    if (!periodKey || !meetingsSettled) return null;
    return defaultMeetingDate(periodKey, meetings.data?.next_meeting_date);
  }, [meetingParam, periodKey, meetingsSettled, meetings.data?.next_meeting_date]);
  useEffect(() => {
    if (meeting && meeting !== meetingParam) setSearchParams({ meeting }, { replace: true });
  }, [meeting, meetingParam, setSearchParams]);

  const bundle = useDeck(meeting);
  const load = useDeckStore((s) => s.load);
  const deck = useDeckStore((s) => s.deck);
  const storeMeeting = useDeckStore((s) => s.meeting);
  const dirty = useDeckStore((s) => s.dirty);
  const saveStatus = useDeckStore((s) => s.saveStatus);
  const savedAt = useDeckStore((s) => s.savedAt);
  const packFrozen = useDeckStore((s) => s.packFrozen);
  const previousMeetingDate = useDeckStore((s) => s.previousMeetingDate);
  const selectedPartId = useDeckStore((s) => s.selectedPartId);
  const replaceTargetPartId = useDeckStore((s) => s.replaceTargetPartId);

  useEffect(() => {
    if (!bundle.data || !meeting) return;
    const s = useDeckStore.getState();
    if (s.meeting === meeting && s.deck && s.dirty) return; // 打ちかけを古い版で巻き戻さない
    load(meeting, bundle.data, { keepSelection: true });
  }, [bundle.data, meeting, load]);

  const save = useSaveDeck(meeting);
  const rebuild = useRebuildDeck(meeting);
  const exportDeck = useExportDeck(meeting);
  const { mutateAsync: saveAsync } = save;
  const saveFn = useCallback((d: KeepDeck) => saveAsync(d), [saveAsync]);
  const { saveNow } = useDeckAutosave(saveFn, canEdit && !!meeting && !!deck);

  const [rightTab, setRightTab] = useState<'parts' | 'page'>('parts');
  useEffect(() => { if (selectedPartId) setRightTab('page'); }, [selectedPartId]);
  useEffect(() => { if (replaceTargetPartId) setRightTab('parts'); }, [replaceTargetPartId]);
  const [preview, setPreview] = useState(false);
  const [compare, setCompare] = useState(false);

  // 選んだ部品を Delete キーで削除（確認つき）。入力欄の中では効かせない
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key !== 'Delete' && e.key !== 'Backspace') return;
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'SELECT' || t.isContentEditable)) return;
      const s = useDeckStore.getState();
      if (!s.selectedPageId || !s.selectedPartId) return;
      e.preventDefault();
      void confirmRemovePart();
    };
    document.addEventListener('keydown', h);
    return () => document.removeEventListener('keydown', h);
  }, []);

  const flush = async () => {
    if (useDeckStore.getState().dirty) await saveNow();
    return useDeckStore.getState().saveStatus !== 'error';
  };

  const onRebuild = async () => {
    if (!meeting || packFrozen) return;
    if (!(await flush())) { notifyError('保存できていない変更があるので、先に「もう一度保存」を押してください'); return; }
    rebuild.mutate(undefined, {
      onSuccess: (b) => {
        load(meeting, b, { keepSelection: true });
        notifySuccess('いまの数字で組み直しました', { description: '人が直した箇所（注記・並び・消したページ）はそのまま残しています' });
      },
      onError: (e) => notifyApiError('数字を更新できませんでした', e),
    });
  };

  const onExport = async () => {
    if (!meeting) return;
    if (!(await flush())) { notifyError('保存できていない変更があるので、先に「もう一度保存」を押してください'); return; }
    exportDeck.mutate(undefined, {
      onSuccess: (r) => {
        const warn = r.warnings.length ? `フォーマットの検査の警告: ${r.warnings.join(' ／ ')}` : undefined;
        if (r.stored) notifySuccess(`PowerPoint を出力し、${r.where ?? 'Box'} に保存しました（${r.filename}）`, { description: warn });
        else notifyWarning(`PowerPoint をダウンロードしました（${r.filename}）。${BOX_REASON[r.reason] ?? 'Box には保存していません。'}`, { description: warn });
      },
    });
  };

  const onChangeMeeting = async (iso: string) => {
    if (!(await flush())) { notifyError('保存できていない変更があるので、先に「もう一度保存」を押してください'); return; }
    setSearchParams({ meeting: iso });
  };

  if (!permissionsLoading && !canEdit) {
    return (
      <div className="p-6">
        <NoPermissionPanel modules={['dailyops']} level="editor" target="資料をつくる" />
      </div>
    );
  }

  const ready = !!deck && storeMeeting === meeting && !!meeting;
  const pageCount = deck ? pageNumbers(deck.pages).size : 0;

  return (
    <div className="flex min-h-full flex-col gap-3.5 p-6">
      <DeckHeader
        meeting={meeting}
        onChangeMeeting={onChangeMeeting}
        previousMeetingDate={previousMeetingDate}
        pageCount={pageCount}
        editCount={humanEditCount(ready ? deck : null)}
        saveStatus={saveStatus}
        savedAt={savedAt}
        dirty={dirty}
        onSaveNow={() => { void saveNow(); }}
        onCompare={() => setCompare(true)}
        onPreview={() => setPreview(true)}
        onRebuild={() => { void onRebuild(); }}
        rebuilding={rebuild.isPending}
        packFrozen={packFrozen}
        onExport={() => { void onExport(); }}
        exporting={exportDeck.isPending}
        ready={ready}
      />
      {id && <WeeklyTabs reportId={id} tab="deck" isMobile={isMobile} />}

      {report.isError ? (
        <ErrorPanel title="この週の報告を読み込めませんでした" error={report.error} onRetry={() => report.refetch()} />
      ) : report.isSuccess && !report.data ? (
        <NotFoundPanel path={`/weekly/${id ?? ''}/deck`} home={{ label: '最新の週を開く', onGo: () => navigate('/weekly') }} />
      ) : bundle.isError ? (
        <ErrorPanel title="資料の構成を読み込めませんでした" error={bundle.error} onRetry={() => bundle.refetch()} />
      ) : !ready ? (
        <Delayed><SkeletonRows rows={5} /></Delayed>
      ) : (
        <DeckDnd>
          <div className="flex h-[calc(100vh-300px)] min-h-[560px] items-stretch gap-3.5">
            <PageList />
            <SlideCanvas onRefreshNumbers={() => { void onRebuild(); }} refreshing={rebuild.isPending} />
            <RightPanel tab={rightTab} onTab={setRightTab} />
          </div>
        </DeckDnd>
      )}

      <p className="text-sub-sm flex items-center gap-2 rounded-control-lg border border-border bg-card px-3.5 py-2 text-muted-foreground">
        <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        出力した pptx は Box「02_隔週 橋口社長キープ ／ {meeting ? meeting.replace(/-/g, '').slice(2) : '……'}」に置き、この構成（ページと直した箇所）を版として残します。
        {packFrozen && ' いま読んでいる数字は週報の確定で凍結した版です。'}
      </p>

      <PreviewDialog open={preview} onOpenChange={setPreview} />
      <CompareDialog open={compare} onOpenChange={setCompare} />
    </div>
  );
}
