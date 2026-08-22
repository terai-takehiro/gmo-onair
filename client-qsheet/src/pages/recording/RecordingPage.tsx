// 収録設定の画面の骨（帯・絞り込み・本線8/控え4の表・スマホの下シート）。
// ⚠️ この画面は useState のローカル状態。素の <input>/<select> で構わない（impl doc §5-2）。
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, FileDown, Radio, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifySuccess, notifyError } from '@/lib/notify';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { FilterChips, type FilterChipItem } from '@gmo-onair/shared/src/client/ui/filterChips';
import { getOwnerContext, getRecording, putRecording, type Deck, type OwnerContext } from '@/lib/deviceSettingsApi';
import { DECK_IDS_MAIN, DECK_IDS_BACKUP, defaultDecks } from './deckOptions';
import DeckRow from './DeckRow';
import DeckSheet from './DeckSheet';
import ExportDialog from '../settings-export/ExportDialog';
import CopyFromDialog from '../settings-export/CopyFromDialog';
import MiniAppSwitcher from '@/components/journey/MiniAppSwitcher';

type DeckFilter = 'all' | 'main' | 'sub';
const DECK_FILTER_ITEMS: FilterChipItem<DeckFilter>[] = [
  { key: 'all', label: 'すべて', count: 12 },
  { key: 'main', label: '本線', count: 8 },
  { key: 'sub', label: '控え', count: 4 },
];

function fillMissing(decks: Deck[]): Deck[] {
  const byId = new Map(decks.map((d) => [d.deckId, d]));
  return [...DECK_IDS_MAIN, ...DECK_IDS_BACKUP].map((deckId) => byId.get(deckId) ?? { deckId });
}

export default function RecordingPage() {
  const { ownerKey = '' } = useParams();
  const [params] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const navigate = useNavigate();

  const [decks, setDecks] = useState<Deck[]>(defaultDecks());
  const [serviceDate, setServiceDate] = useState(date ?? new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mobileDeck, setMobileDeck] = useState<Deck | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [owner, setOwner] = useState<OwnerContext | null>(null);
  const [filter, setFilter] = useState<DeckFilter>('all');
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [lastExportName, setLastExportName] = useState<string | null>(null);

  const loadRecording = useCallback(() => {
    let alive = true;
    setLoading(true);
    getRecording(ownerKey, date)
      .then((data) => {
        if (!alive) return;
        if (data) {
          setDecks(fillMissing(data.decks));
          setServiceDate(data.serviceDate);
          setLastExportedAt(data.lastExportedAt);
          setLastExportName(data.lastExportName);
        }
      })
      .catch(() => notifyError('収録設定の取得に失敗しました'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [ownerKey, date]);

  useEffect(() => loadRecording(), [loadRecording]);

  useEffect(() => {
    let alive = true;
    getOwnerContext(ownerKey).then((data) => { if (alive) setOwner(data); });
    return () => { alive = false; };
  }, [ownerKey]);

  const updateDeck = (next: Deck) => setDecks((prev) => prev.map((d) => (d.deckId === next.deckId ? next : d)));

  const copyFromMain = (backupId: string, mainId: string) => {
    const main = decks.find((d) => d.deckId === mainId);
    if (!main) return;
    updateDeck({ ...main, deckId: backupId, label: undefined, skip: undefined });
  };

  const save = async () => {
    setSaving(true);
    try {
      await putRecording(ownerKey, serviceDate, decks);
      notifySuccess('収録設定を保存しました');
    } catch {
      notifyError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const unfilledCount = decks.filter((d) => !d.skip && !d.videoFormat && !d.codec && !d.slot).length;
  const usedCount = decks.filter((d) => !d.skip).length;

  const mainDecks = decks.filter((d) => DECK_IDS_MAIN.includes(d.deckId as any));
  const backupDecks = decks.filter((d) => DECK_IDS_BACKUP.includes(d.deckId as any));

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mb-4 flex items-center gap-3">
        {owner ? (
          <Link
            to={owner.kind === 'project' ? `/qsheet/projects/${owner.id}` : `/qsheet/programs/${owner.id}`}
            className="flex h-11 min-w-0 shrink items-center gap-1 rounded-lg px-2 text-sm font-semibold hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5 shrink-0" />
            <span className="truncate">{owner.name}</span>
          </Link>
        ) : (
          <button onClick={() => navigate(-1)} className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted" aria-label="戻る">
            <ChevronLeft className="h-5 w-5" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-lg font-bold">収録設定</h1>
          <p className="truncate text-xs text-muted-foreground">
            {owner?.glsNumber ?? owner?.name ?? ownerKey} ・ {serviceDate}
          </p>
        </div>
        {owner && <MiniAppSwitcher owner={owner} current="recording" />}
      </div>

      {/* 状態の帯 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <Radio className="h-4 w-4 text-primary" />
        <span>使用中 {usedCount}/12 台</span>
        {unfilledCount > 0 && <span className="text-warning">未入力 {unfilledCount} 台</span>}
        <span className="text-muted-foreground">
          {lastExportName ? `${lastExportName}（${formatRelativeTime(lastExportedAt)}）` : 'まだ書き出していません'}
        </span>
      </div>

      {/* 絞り込みは PC の表にだけ効く（スマホの縦積みは対象外） */}
      <div className="mb-4 hidden sm:block">
        <FilterChips items={DECK_FILTER_ITEMS} value={filter} onChange={setFilter} label="デッキで絞り込む" />
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">読み込み中…</p>
      ) : (
        <>
          {/* PC: 表。sm 未満は横スクロールで守る */}
          <div className="hidden sm:block">
            {filter !== 'sub' && (
              <RecordingSection title="本線（Studio 4K Pro）" decks={mainDecks} onChange={updateDeck} />
            )}
            {filter !== 'main' && (
              <RecordingSection
                title="控え（HD Plus）"
                decks={backupDecks}
                onChange={updateDeck}
                onCopyFromMain={(backupId, i) => copyFromMain(backupId, DECK_IDS_MAIN[i])}
              />
            )}
          </div>

          {/* スマホ: 縦積みの行 → タップで下シート */}
          <div className="space-y-2 sm:hidden">
            {decks.map((d) => (
              <button
                key={d.deckId}
                onClick={() => setMobileDeck(d)}
                className={`flex min-h-[44px] w-full flex-col items-start rounded-lg border px-3 py-2 text-left ${d.skip ? 'opacity-50' : ''}`}
              >
                <span className="text-sm font-semibold">{d.deckId}</span>
                <span className="cond truncate text-xs text-muted-foreground" style={{ transform: 'scaleX(0.94)', transformOrigin: 'left' }}>
                  {[d.videoFormat, d.codec, d.audioChannels && `${d.audioChannels}ch`, d.slot].filter(Boolean).join('・') || '未設定'}
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      <p className="mt-4 text-xs text-muted-foreground">
        空欄は「現地の設定を変えない」という意味です。TCソース・IP・機種などの設置情報はここでは扱いません。
      </p>

      {/* 下端の主アクション（スマホ幅いっぱい／PC は右寄せ） */}
      <div className="sticky bottom-0 mt-6 flex flex-col gap-2 border-t bg-background/95 py-3 backdrop-blur sm:static sm:flex-row sm:justify-end sm:border-0 sm:bg-transparent sm:py-0">
        <Button variant="outline" className="h-[52px] sm:h-10" onClick={() => setCopyFromOpen(true)}>
          <Copy className="mr-2 h-4 w-4" /> 前回の設定を写す
        </Button>
        <Button variant="outline" className="h-[52px] sm:h-10" onClick={() => setExportOpen(true)}>
          <FileDown className="mr-2 h-4 w-4" /> Excel を書き出す
        </Button>
        <Button className="h-[52px] sm:h-10" onClick={save} disabled={saving}>
          <Save className="mr-2 h-4 w-4" /> {saving ? '保存中…' : '保存する'}
        </Button>
      </div>

      <DeckSheet deck={mobileDeck} onChange={(next) => { updateDeck(next); setMobileDeck(next); }} onClose={() => setMobileDeck(null)} />
      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} ownerKey={ownerKey} date={serviceDate} />
      <CopyFromDialog
        open={copyFromOpen}
        onOpenChange={setCopyFromOpen}
        ownerKey={ownerKey}
        date={serviceDate}
        what={['recording']}
        onCopied={loadRecording}
      />
    </div>
  );
}

function RecordingSection({
  title,
  decks,
  onChange,
  onCopyFromMain,
}: {
  title: string;
  decks: Deck[];
  onChange: (d: Deck) => void;
  onCopyFromMain?: (backupId: string, index: number) => void;
}) {
  return (
    <div className="mb-6">
      <h2 className="mb-2 text-sm font-semibold text-muted-foreground">{title}</h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="whitespace-nowrap px-2 py-2 text-left">デッキ</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">解像度</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">コーデック</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">音声ch</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">収録先</th>
              <th className="whitespace-nowrap px-2 py-2 text-left">ファイル名</th>
              <th className="whitespace-nowrap px-2 py-2 text-center">使わない</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {decks.map((d, i) => (
              <DeckRow
                key={d.deckId}
                deck={d}
                onChange={onChange}
                onCopyFromMain={onCopyFromMain ? () => onCopyFromMain(d.deckId, i) : undefined}
              />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
