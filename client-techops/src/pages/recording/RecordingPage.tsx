// 収録設定の画面の骨（実施日・状態の帯・絞り込み・一括変更・本線8/控え4の表・スマホの一覧）。
// ⚠️ この画面は useState のローカル状態。素の <input>/<select> で構わない（impl doc §5-2）。
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, FileDown, Copy, Wand2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifySuccess, notifyError } from '@/lib/notify';
import { FilterChips, type FilterChipItem } from '@gmo-onair/shared/src/client/ui/filterChips';
import { PageShell } from '@gmo-onair/shared/src/client/ui/pageShell';
import { PageHeader } from '@gmo-onair/shared/src/client/ui/pageHeader';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { apiErrorMessage, jstToday } from '@/lib/deviceSettingsShared';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import { useCanEditDeviceSettings } from '@/lib/useCanEditDeviceSettings';
import ServiceDateBar from '@/components/device-settings/ServiceDateBar';
import { getOwnerContext, getRecording, putRecording, type Deck, type OwnerContext } from '@/lib/deviceSettingsApi';
import { setProductionNavContext } from '@/lib/productionNavContext';
import { useDeviceSettingsEventDateDefault } from '@/lib/useDeviceSettingsEventDateDefault';
import {
  DECK_IDS_MAIN, DECK_IDS_BACKUP, MODEL_LABEL_MAIN, MODEL_LABEL_BACKUP, coerceDeck, defaultDecks,
} from './deckOptions';
import DeckGrid from './DeckGrid';
import DeckSheet from './DeckSheet';
import DeckDatalists from './DeckDatalists';
import DeckStatusBand from './DeckStatusBand';
import DeckMobileList from './DeckMobileList';
import BulkEditDialog, { type BulkPatch } from './BulkEditDialog';
import ExportDialog from '../settings-export/ExportDialog';
import CopyFromDialog from '../settings-export/CopyFromDialog';
import MiniAppSwitcher from '@/components/journey/MiniAppSwitcher';

type DeckFilter = 'all' | 'main' | 'sub';

function fillMissing(decks: Deck[]): Deck[] {
  const byId = new Map(decks.map((d) => [d.deckId, d]));
  return [...DECK_IDS_MAIN, ...DECK_IDS_BACKUP].map((deckId) => byId.get(deckId) ?? { deckId });
}

/** 「読み込んだ内容と今の内容が違うか」を比べるための文字列（欄の並びを固定する） */
function serialize(decks: Deck[]): string {
  return JSON.stringify(decks.map((d) => [
    d.deckId, d.label ?? '', d.videoFormat ?? '', d.codec ?? '',
    d.audioChannels ?? '', d.slot ?? '', d.filePrefix ?? '', d.skip ? 1 : 0,
  ]));
}

export default function RecordingPage() {
  const { ownerKey = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();

  const [decks, setDecks] = useState<Deck[]>(defaultDecks());
  const [baseline, setBaseline] = useState(() => serialize(defaultDecks()));
  // ⚠️ 既定は **日本時間**の今日。`toISOString().slice(0,10)` は UTC なので、
  //    JST 0〜9時（本番前の仕込みでいちばん触る時間帯）に開くと前日になっていた。
  const [serviceDate, setServiceDate] = useState(params.get('date') ?? jstToday());
  /** サーバーに投げる日。未指定のときはサーバーが「最新の実施日」を返す */
  const [requestedDate, setRequestedDate] = useState<string | undefined>(params.get('date') ?? undefined);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [mobileDeck, setMobileDeck] = useState<Deck | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [owner, setOwner] = useState<OwnerContext | null>(null);
  const [filter, setFilter] = useState<DeckFilter>('all');
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [lastExportName, setLastExportName] = useState<string | null>(null);
  const [hasSettings, setHasSettings] = useState<boolean | null>(null);

  /**
   * ⚠️ **以前ここに権限の分岐が1つも無かった**（監査 2026-08-22）。
   * 閲覧しかできない人でも12台ぶん全部打ち込めてしまい、最後に「保存に失敗しました」
   * とだけ出て打った内容は捨てられていた。サーバーは `requirePermission('qsheet','editor')`
   * で守っているので、画面も同じ線を引く（見せはするが直せない）。
   */
  const canEdit = useCanEditDeviceSettings();

  const dirty = serialize(decks) !== baseline;
  useUnsavedGuard(dirty);

  const loadRecording = useCallback(() => {
    let alive = true;
    setLoading(true);
    getRecording(ownerKey, requestedDate)
      .then((data) => {
        if (!alive) return;
        const next = fillMissing(data?.decks ?? []);
        setDecks(next);
        setBaseline(serialize(next));
        setSavedAt(null);
        setServiceDate(data?.serviceDate ?? requestedDate ?? jstToday());
        setLastExportedAt(data?.lastExportedAt ?? null);
        setLastExportName(data?.lastExportName ?? null);
        setHasSettings(data != null);
      })
      .catch((e) => notifyError(apiErrorMessage(e, '収録設定を読み込めませんでした。少し待ってから、画面を開き直してください。')))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [ownerKey, requestedDate]);

  useEffect(() => loadRecording(), [loadRecording]);

  useEffect(() => {
    let alive = true;
    getOwnerContext(ownerKey).then((data) => { if (alive) setOwner(data); });
    return () => { alive = false; };
  }, [ownerKey]);

  useEffect(() => {
    if (!owner) return;
    setProductionNavContext({ scope: owner.kind, id: ownerKey, label: owner.name ?? owner.glsNumber ?? null });
  }, [owner, ownerKey]);

  useDeviceSettingsEventDateDefault(owner, hasSettings, params.get('date'), setRequestedDate);

  const updateDeck = (next: Deck) => setDecks((prev) => prev.map((d) => (d.deckId === next.deckId ? next : d)));

  /** 実施日を変える ＝ その日の設定を読み直す（URL にも残して再読み込み・共有に耐えるようにする） */
  const pickDate = async (date: string) => {
    if (date === serviceDate) return;
    // 実施日を変えると打ち込み中の12台が消えるので、帯ではなく「止まる」確認を出す
    // （`window.confirm` は使わない — 配信設定の changeDate と同じ確認ダイアログに揃える）
    if (dirty && !(await confirmAction({
      title: '実施日を変えますか？',
      description: '保存していない変更（12台の設定）は失われます。',
      confirmLabel: '変える',
      tone: 'danger',
    }))) return;
    const next = new URLSearchParams(params);
    next.set('date', date);
    setParams(next, { replace: true });
    setSelected(new Set());
    setServiceDate(date);
    setRequestedDate(date);
  };

  // ── 本線 → 控え ────────────────────────────────────────
  /**
   * ⚠️ **以前ここが壊れていた**（監査 2026-08-22）
   * `{ ...main, deckId: backupId, label: undefined }` をそのまま入れていたため、
   * ① 控え（HD Plus）が持てない 4K・DNxHR・SSD・8ch がそのまま入り、
   *    画面は空欄に見えるのに保存値と Excel には残った（現地で弾かれる）
   * ② `label: undefined` が **label に触る唯一のコード＝消す処理**で、
   *    せっかく付けた呼び名が写すたびに消えた
   * いまは `coerceDeck()` で機種が持てる値だけに落とし、呼び名と「使わない」は
   * その台のものを残す（どちらも台ごとの決めごとで、本線から写す性質のものではない）。
   */
  const copyOne = (from: Deck[], backupId: string, index: number) => {
    const main = from.find((d) => d.deckId === DECK_IDS_MAIN[index]);
    const cur = from.find((d) => d.deckId === backupId);
    if (!main || !cur) return { deck: null as Deck | null, dropped: [] as string[] };
    const { deck, dropped } = coerceDeck(backupId, main);
    return { deck: { ...deck, label: cur.label, skip: cur.skip }, dropped };
  };

  const droppedNote = (dropped: string[]) =>
    dropped.length ? { description: `機種が持たない値 ${dropped.length} 件（${[...new Set(dropped)].join('・')}）は落としました` } : undefined;

  const copyFromMain = (backupId: string, index: number) => {
    const r = copyOne(decks, backupId, index);
    if (!r.deck) return;
    updateDeck(r.deck);
    notifySuccess(`${DECK_IDS_MAIN[index]} の設定を ${backupId} に複製しました`, droppedNote(r.dropped));
  };

  const mirrorAll = () => {
    const results = DECK_IDS_BACKUP.map((id, i) => copyOne(decks, id, i));
    const byId = new Map(results.filter((r) => r.deck).map((r) => [r.deck!.deckId, r.deck!]));
    setDecks((prev) => prev.map((d) => byId.get(d.deckId) ?? d));
    notifySuccess('本線の設定を控えに複製しました', droppedNote(results.flatMap((r) => r.dropped)));
  };

  // ── まとめて変える ─────────────────────────────────────
  const toggleSelect = (deckId: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(deckId)) next.delete(deckId); else next.add(deckId);
    return next;
  });
  const toggleGroup = (ids: string[], on: boolean) => setSelected((prev) => {
    const next = new Set(prev);
    for (const id of ids) { if (on) next.add(id); else next.delete(id); }
    return next;
  });

  const applyBulk = (patch: BulkPatch) => {
    setDecks((prev) => prev.map((d) => {
      if (!selected.has(d.deckId)) return d;
      const next: Deck = { ...d };
      if (patch.videoFormat !== undefined) next.videoFormat = patch.videoFormat;
      if (patch.codec !== undefined) next.codec = patch.codec;
      if (patch.audioChannels !== undefined) next.audioChannels = patch.audioChannels;
      if (patch.slot !== undefined) next.slot = patch.slot;
      // 接頭辞は台ごとに `<接頭辞>_<デッキ>` にする（12台に同じ名前を付けると上書きし合う）
      if (patch.filePrefix !== undefined) next.filePrefix = `${patch.filePrefix}_${d.deckId}`;
      return next;
    }));
    notifySuccess(`${selected.size} 台にまとめて反映しました`);
  };

  /** 成否を返す。⚠️ 書き出しダイアログの「保存して続ける」がこの戻り値で判断する */
  const save = async (): Promise<boolean> => {
    setSaving(true);
    try {
      await putRecording(ownerKey, serviceDate, decks);
      setBaseline(serialize(decks));
      setSavedAt(new Date());
      notifySuccess('収録設定を保存しました');
      return true;
    } catch (e) {
      // ⚠️ 以前は理由を捨てていたので「どの台の何が悪いのか」が誰にも分からなかった
      notifyError(apiErrorMessage(e, '保存できませんでした。少し待ってから、もう一度お試しください。'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const mainDecks = useMemo(() => decks.filter((d) => (DECK_IDS_MAIN as readonly string[]).includes(d.deckId)), [decks]);
  const backupDecks = useMemo(() => decks.filter((d) => (DECK_IDS_BACKUP as readonly string[]).includes(d.deckId)), [decks]);
  const filterItems: FilterChipItem<DeckFilter>[] = [
    { key: 'all', label: 'すべて', count: decks.length },
    { key: 'main', label: '本線', count: mainDecks.length },
    { key: 'sub', label: '控え', count: backupDecks.length },
  ];

  return (
    <PageShell>
      <DeckDatalists />

      {/* **戻る導線は見出しと別の行にする。** 見出し・戻る・ミニアプリ切替を1行に
          押し込むと、375px では `MiniAppSwitcher`（`shrink-0` の帯）が幅を取り切って
          見出しの取り分がほぼ 0 になり、`<PageHeader>` の `[overflow-wrap:anywhere]`
          で画面の名前が縦に折り返る（`ui/pageHeader.tsx` が v4.5.0 直後に踏んだのと
          同じ壊れ方）。案件管理の詳細画面と同じ「戻る → 見出し」の縦並びに揃える */}
      {owner ? (
        <Link
          to={owner.kind === 'project' ? `/techops/projects/${owner.id}` : `/techops/programs/${owner.id}`}
          className="-ml-2 flex h-11 w-fit min-w-0 items-center gap-1 rounded-control-lg px-2 text-list text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronLeft className="h-5 w-5 shrink-0" />
          <span className="truncate">{owner.name}</span>
        </Link>
      ) : (
        <button onClick={() => navigate(-1)} className="-ml-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-control-lg hover:bg-muted" aria-label="戻る">
          <ChevronLeft className="h-5 w-5" />
        </button>
      )}
      <PageHeader
        title="収録設定"
        sub={`${owner?.glsNumber ?? owner?.name ?? ownerKey} ・ HyperDeck 12台`}
      >
        {owner && <MiniAppSwitcher owner={owner} current="recording" />}
      </PageHeader>

      {/* 書き出し・写しは上のツールバーへ（スマホの下端は主アクション1つだけにする）。
          並びは配信設定と同じ「ツールバー → 権限の断り → 実施日 → 状態の帯」
          （同じ3点セットの縦順が画面ごとに違うと、往復する人が毎回探し直す） */}
      <div className="flex flex-wrap gap-2">
        {canEdit && (
          <Button variant="outline" className="h-11" onClick={() => setCopyFromOpen(true)}>
            <Copy className="mr-2 h-4 w-4" /> 前回の設定を複製
          </Button>
        )}
        <Button variant="outline" className="h-11" onClick={() => setExportOpen(true)}>
          <FileDown className="mr-2 h-4 w-4" /> Excel を書き出す
        </Button>
      </div>

      {/* 打ち終わってから捨てられるのがいちばん困るので、**打つ前に**言う */}
      {!canEdit && (
        <p className="rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-note text-foreground">
          <strong>現在は閲覧のみです。</strong>内容を見ることと Excel の書き出し（キーは空欄）は
          できますが、保存と「キーを入れて出す」はできません。
          編集するには制作技術支援の「編集」が必要です。
        </p>
      )}

      {/* 実施日 ＋ 保存の状態。⚠️ 以前は画面から実施日を選ぶ手段が無く、
          入口が date を付けないので「案件につき事実上1日ぶん」しか持てなかった */}
      <ServiceDateBar
        ownerKey={ownerKey}
        serviceDate={serviceDate}
        onChange={pickDate}
        dirty={dirty}
        savedAt={savedAt}
        kind="recording"
      />

      <DeckStatusBand decks={decks} lastExportName={lastExportName} lastExportedAt={lastExportedAt} />

      {/* 絞り込みと一括変更は PC の表にだけ効く（スマホは1台ずつ・モックどおり） */}
      <div className="hidden flex-wrap items-center gap-3 sm:flex">
        <FilterChips items={filterItems} value={filter} onChange={setFilter} label="デッキで絞り込む" />
        <span className="flex-1" />
        {canEdit && selected.size > 0 && (
          <>
            <span className="text-list text-primary">{selected.size} 台を選択中</span>
            <Button className="h-11" onClick={() => setBulkOpen(true)}>
              <Wand2 className="mr-2 h-4 w-4" /> 選んだ台にまとめて変える
            </Button>
            <Button variant="ghost" className="h-11" onClick={() => setSelected(new Set())}>解除</Button>
          </>
        )}
      </div>

      {loading ? (
        <p className="py-10 text-center text-sub text-muted-foreground">読み込み中…</p>
      ) : (
        <>
          {/* 閲覧のみの人は中の入力欄がまとめて disabled になる（`contents` なので見た目は同じ） */}
          <fieldset disabled={!canEdit} className="hidden sm:block">
            {filter !== 'sub' && (
              <DeckGrid
                title="本線" model={MODEL_LABEL_MAIN} decks={mainDecks} onChange={updateDeck}
                selectedIds={selected} onToggleSelect={toggleSelect} onToggleGroup={toggleGroup}
              />
            )}
            {filter !== 'main' && (
              <DeckGrid
                title="控え" model={MODEL_LABEL_BACKUP} decks={backupDecks} onChange={updateDeck}
                selectedIds={selected} onToggleSelect={toggleSelect} onToggleGroup={toggleGroup}
                mainIdOf={(i) => DECK_IDS_MAIN[i]} onCopyFromMain={copyFromMain} onMirrorAll={mirrorAll}
              />
            )}
          </fieldset>

          <DeckMobileList decks={decks} onPick={setMobileDeck} />
        </>
      )}

      <p className="rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-note text-foreground">
        <strong>橙のセルは「まだ決めていない」</strong>という意味で、間違いではありません。
        空欄のまま書き出すと<strong>現地の設定をそのまま残します</strong>。
        TCソース・IP・機種などの設置情報はここでは扱いません。
      </p>

      {/* 下端は主アクション1つだけ（以前は3段積みで、スマホの表示領域を大きく食っていた） */}
      {canEdit && (
        <div className="sticky bottom-0 border-t bg-background/95 py-3 backdrop-blur sm:static sm:flex sm:justify-end sm:border-0 sm:bg-transparent">
          <Button className="h-[52px] w-full sm:h-11 sm:w-auto" onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? '保存中…' : '保存する'}
          </Button>
        </div>
      )}

      <DeckSheet deck={mobileDeck} onChange={(next) => { updateDeck(next); setMobileDeck(next); }} onClose={() => setMobileDeck(null)} readOnly={!canEdit} />
      <BulkEditDialog open={bulkOpen} onOpenChange={setBulkOpen} deckIds={[...selected]} onApply={applyBulk} />
      {/* ⚠️ `dirty`/`onSave` を渡していなかったため、**未保存を止める仕組みが
          この画面では一度も働いていなかった**（12台打ち込んで見出しだけの Excel が
          落ちてくる事故の直接の原因）。渡して初めて効く */}
      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        ownerKey={ownerKey}
        date={serviceDate}
        dirty={dirty}
        onSave={canEdit ? save : undefined}
        primarySheet="recording"
      />
      <CopyFromDialog
        open={copyFromOpen}
        onOpenChange={setCopyFromOpen}
        ownerKey={ownerKey}
        date={serviceDate}
        what={['recording']}
        onCopied={loadRecording}
      />
    </PageShell>
  );
}
