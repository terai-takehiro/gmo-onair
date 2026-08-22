// 配信設定の画面の骨（上: 実施日と状態 / 左: ENC ごとの配信先 / 右: インスペクタ / 下段: WEB会議）。
// ⚠️ この画面は useState のローカル状態。素の <input> で構わない（impl doc §5-2）。
//
// ⚠️ 直したこと（監査 2026-08-22・実機で確認したもの）:
//   ③ 実施日を画面から選べず、案件につき事実上1日ぶんしか持てなかった → <ServiceDateBar>
//   ④ 保存の失敗理由が出ず、しかも1行でも規則違反があると**配信先も WEB会議も丸ごと**
//      保存されなかった（全角のセッション名1つで、打ち込んだ会議情報まで消えた）
//      → 押す前に自分で検査し、サーバーが返した理由をそのまま出す
//   ⑤ 未保存のまま画面を移ると黙って全部消えた → useUnsavedGuard
//   ⑪ 選択中の行を配列 index で持っていたため、読み直し・コピーの後にずれた → destId で持つ
import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, FileDown, Video, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notifySuccess, notifyError } from '@/lib/notify';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { apiErrorMessage, destIssues, jstToday, type DestIssue } from '@/lib/deviceSettingsShared';
import { confirmAction } from '@gmo-onair/shared/src/client/ui/confirm';
import { useUnsavedGuard } from '@/lib/useUnsavedGuard';
import ServiceDateBar from '@/components/device-settings/ServiceDateBar';
import {
  getOwnerContext, getStreaming, putStreaming,
  type Destination, type Meeting, type OwnerContext, type StreamingSettings,
} from '@/lib/deviceSettingsApi';
import { useCanEditDeviceSettings } from '@/lib/useCanEditDeviceSettings';
import { setProductionNavContext } from '@/lib/productionNavContext';
import DestinationInspector from './DestinationInspector';
import EncoderList from './EncoderList';
import { ENCODER_IDS, blockingError, fromWire, newDestination } from './destinationHelpers';
import MeetingList from './MeetingList';
import { meetingBlockingError, toolLabel } from './meetingFields';
import ExportDialog from '../settings-export/ExportDialog';
import CopyFromDialog from '../settings-export/CopyFromDialog';
import MiniAppSwitcher from '@/components/journey/MiniAppSwitcher';

// 下シート（スマホ用インスペクタ）を出すかどうか。
// ⚠️ 実際に踏んだ不具合: 下の <Dialog> は DialogContent に sm:hidden を付けて
// 「PC では中身を出さない」つもりだったが、shared/src/client/ui/dialog.tsx の
// DialogOverlay（画面全体を覆う半透明の板）は DialogContent とは別要素で、
// sm:hidden の対象外だったため PC 幅でも描かれ続けていた。中身が sm:hidden で
// 見えないだけで、Dialog 自体は「開いている」ため、画面全体が暗く覆われたまま
// 右のインラインインスペクタも含めて一切操作できなくなっていた
// （配信先を1つでも選ぶ/足すたびに再現）。CSS で隠すのではなく、
// open 自体を「640px 未満のときだけ」にする
function useIsNarrow() {
  const [narrow, setNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia('(max-width: 639px)').matches : false
  );
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 639px)');
    const onChange = () => setNarrow(mq.matches);
    mq.addEventListener('change', onChange);
    onChange();
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return narrow;
}

/** 「いま画面にある内容」を1本の文字列にする。保存済みと比べて未保存かどうかを見る */
const snapshotOf = (dests: Destination[], meetings: Meeting[]) => JSON.stringify({ dests, meetings });

/** 状態の帯の1つぶん（モック Stream.dc.html:255-259 の3つ） */
function Stat({ label, value, tone }: { label: string; value: string; tone: 'primary' | 'bad' | 'mute' }) {
  const dot = tone === 'primary' ? 'bg-primary' : tone === 'bad' ? 'bg-destructive' : 'bg-border-disabled';
  const fg = tone === 'primary' ? 'text-primary' : tone === 'bad' ? 'text-destructive' : 'text-muted-foreground';
  return (
    <span className="flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-2 w-2 shrink-0 rounded-chip ${dot}`} aria-hidden="true" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={`text-sm font-extrabold tabular-nums ${fg}`}>{value}</span>
    </span>
  );
}

export default function StreamingPage() {
  const { ownerKey = '' } = useParams();
  const [params, setParams] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const navigate = useNavigate();

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  // ⚠️ 既定は**日本時間**の今日。toISOString() は UTC なので朝9時前は前日になる
  const [serviceDate, setServiceDate] = useState(date ?? jstToday());
  const [saved, setSaved] = useState(() => snapshotOf([], []));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // WEB会議の「一覧＋詳細」で選んでいる1件。⚠️ 配列 index ではなく meetingId_ で持つ
  // （読み直し・並べ替えの後に別の会議を直してしまうため・配信先の destId と同じ理由）
  const [selectedMeetingId, setSelectedMeetingId] = useState<string | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [owner, setOwner] = useState<OwnerContext | null>(null);
  const isNarrow = useIsNarrow();
  // ⚠️ **画面全体に効かせる**（当初は WEB会議だけに入れたが、実機で確かめたら
  //    配信先側は素通りで、閲覧のみの人でも「保存する」が押せたままだった）。
  //    閲覧しかできない人が打ち込んでから
  // 「保存に失敗しました」と言われて全部捨てられていた（useCanEditDeviceSettings のコメント）
  const canEdit = useCanEditDeviceSettings();
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [lastExportName, setLastExportName] = useState<string | null>(null);

  const dirty = snapshotOf(destinations, meetings) !== saved;
  useUnsavedGuard(dirty);

  const applyData = useCallback((data: StreamingSettings) => {
    const dests = fromWire(data.destinations);
    setDestinations(dests);
    setMeetings(data.meetings);
    setServiceDate(data.serviceDate);
    setLastExportedAt(data.lastExportedAt);
    setLastExportName(data.lastExportName);
    setSaved(snapshotOf(dests, data.meetings));
  }, []);

  // 読み込みの順番が入れ替わっても古い応答で上書きしないよう、最後に投げたものだけ採る
  const reqRef = useRef(0);
  const load = useCallback(async (opts?: { silent?: boolean }) => {
    const seq = ++reqRef.current;
    if (!opts?.silent) setLoading(true);
    try {
      const data = await getStreaming(ownerKey, date);
      if (seq !== reqRef.current) return;
      if (data) applyData(data);
    } catch (e) {
      if (seq === reqRef.current) notifyError(apiErrorMessage(e, '配信設定の取得に失敗しました'));
    } finally {
      if (seq === reqRef.current && !opts?.silent) setLoading(false);
    }
  }, [ownerKey, date, applyData]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    let alive = true;
    getOwnerContext(ownerKey).then((data) => { if (alive) setOwner(data); });
    return () => { alive = false; };
  }, [ownerKey]);

  useEffect(() => {
    if (!owner) return;
    setProductionNavContext({ scope: owner.kind, id: ownerKey, label: owner.name ?? owner.glsNumber ?? null });
  }, [owner, ownerKey]);

  // その場の点検（打ち込んだばかりの値を見る）。Excel の書き出しは保存済みしか見ない
  const issuesByDest = new Map<string, DestIssue[]>();
  for (const d of destinations) issuesByDest.set(d.destId, destIssues(d, destinations));
  const warnIds = new Set([...issuesByDest].filter(([, v]) => v.length > 0).map(([k]) => k));
  const blockedIds = new Set(destinations.filter((d) => blockingError(d)).map((d) => d.destId));
  const usedEncoders = new Set(destinations.map((d) => d.encoderId));
  const emptyEncoders = ENCODER_IDS.filter((id) => !usedEncoders.has(id)).length;

  const selectedDest = destinations.find((d) => d.destId === selectedId) ?? null;

  const updateDestination = (next: Destination) =>
    setDestinations((prev) => prev.map((d) => (d.destId === next.destId ? next : d)));
  const deleteDestination = (destId: string) => {
    setDestinations((prev) => prev.filter((d) => d.destId !== destId));
    setSelectedId(null);
  };
  const addDestination = (encoderId: string) => {
    const dest = newDestination(encoderId);
    setDestinations((prev) => [...prev, dest]);
    setSelectedId(dest.destId);
  };

  const changeDate = async (next: string) => {
    // ⚠️ 実施日を変えると読み直すので、打ちかけの内容は消える。先に訊く
    // （`window.confirm` は使わない。画面の外に出るうえ、何が消えるかを書けない）
    if (dirty && !(await confirmAction({
      title: '実施日を変えますか？',
      description: '保存していない変更（配信先・WEB会議）は失われます。',
      confirmLabel: '変える',
      tone: 'danger',
    }))) return;
    setSelectedId(null);
    setServiceDate(next);
    const p = new URLSearchParams(params);
    p.set('date', next);
    setParams(p, { replace: true });
  };

  /** 保存。書き出しダイアログの「保存して続ける」からも呼ばれるので成否を返す */
  const save = async (): Promise<boolean> => {
    // ⚠️ サーバーは1行でも規則に反すると**全体を**受け付けない（配信先も WEB会議も）。
    // 弾かれる前に自分で見つけて、その行を選び・赤くして止める
    const bad = destinations.find((d) => blockingError(d));
    if (bad) {
      setSelectedId(bad.destId);
      notifyError(`${bad.encoderId} / ${bad.name || '（名前がありません）'}: ${blockingError(bad)}`, {
        description: '1行でも規則に反すると、配信先も WEB会議もまとめて保存されません。',
      });
      return false;
    }
    // ⚠️ WEB会議も同じ。会議URLが1件でも空だと zod が payload 全体を落とすので、
    // **配信先まで巻き添えで保存されない**。投げる前にその会議を選んで止める
    const badMeeting = meetings
      .map((m) => ({ m, err: meetingBlockingError(m) }))
      .find((x) => x.err);
    if (badMeeting) {
      setSelectedMeetingId(badMeeting.m.meetingId_);
      notifyError(`WEB会議「${badMeeting.m.label || toolLabel(badMeeting.m)}」: ${badMeeting.err}`, {
        description: '1件でも規則に反すると、配信先も WEB会議もまとめて保存されません。',
      });
      return false;
    }
    setSaving(true);
    try {
      await putStreaming(ownerKey, serviceDate, destinations, meetings);
      notifySuccess('配信設定を保存しました');
      // 保存後に読み直す（新しく入れた鍵が「設定済み」に変わるのを画面へ映すため）
      await load({ silent: true });
      setSavedAt(new Date());
      return true;
    } catch (e) {
      // ⚠️ 以前は理由を捨てて「保存に失敗しました」だけ出していた。
      // サーバーは「ENC3 / 記念式典 本線: セッション名は…」まで返している
      notifyError(apiErrorMessage(e, '保存に失敗しました'));
      return false;
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-6xl px-3 py-4 sm:px-6 sm:py-6" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mb-3 flex items-center gap-3">
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
          <h1 className="truncate text-lg font-bold">配信設定</h1>
          <p className="truncate text-xs text-muted-foreground">
            {owner?.glsNumber ?? owner?.name ?? ownerKey} ・ {serviceDate}
          </p>
        </div>
        {owner && <MiniAppSwitcher owner={owner} current="streaming" />}
      </div>

      {/* ⚠️ 下の固定バーは「保存する」1つだけにし、他はここへ出す（スマホで指が届く高さを保存に使う） */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {canEdit && (
          <Button variant="outline" className="h-11" onClick={() => setCopyFromOpen(true)}>
            <Copy className="mr-2 h-4 w-4" /> 前回の設定を写す
          </Button>
        )}
        <Button variant="outline" className="h-11" onClick={() => setExportOpen(true)}>
          <FileDown className="mr-2 h-4 w-4" /> Excel を書き出す
        </Button>
        <span className="flex-1" />
        {canEdit && (
          <Button className="hidden h-11 sm:inline-flex" onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? '保存中…' : '保存する'}
          </Button>
        )}
      </div>

      {/* 打ち終わってから捨てられるのがいちばん困るので、**打つ前に**言う */}
      {!canEdit && (
        <p className="mb-3 rounded-note border border-warning-border bg-warning-surface px-3 py-2 text-note text-foreground">
          <strong>閲覧のみの権限です。</strong>内容は見られますが、保存も Excel の書き出しも
          できません（サーバーがどちらも編集できる人に限っています）。
          直すには制作技術支援の編集権限が要ります。
        </p>
      )}

      <ServiceDateBar
        ownerKey={ownerKey}
        serviceDate={serviceDate}
        onChange={(next) => { void changeDate(next); }}
        dirty={dirty}
        savedAt={savedAt}
        kind="streaming"
      />

      {/* 状態の帯（配信先 / 直したほうがよい / 出ない台） */}
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 rounded-card border bg-card px-3 py-2">
        <Stat label="配信先" value={`${destinations.length}件`} tone="primary" />
        <Stat label="直したほうがよい" value={`${warnIds.size}件`} tone="bad" />
        <Stat label="出ない台" value={`${emptyEncoders}台`} tone="mute" />
        <span className="flex-1" />
        <span className="truncate text-xs text-muted-foreground">
          {lastExportName ? `${lastExportName}（${formatRelativeTime(lastExportedAt)}）` : 'まだ書き出していません'}
        </span>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">読み込み中…</p>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
            <div className="min-w-0 flex-1">
              <EncoderList
                destinations={destinations}
                selectedId={selectedId}
                warnIds={warnIds}
                blockedIds={blockedIds}
                onSelect={setSelectedId}
                onAdd={canEdit ? addDestination : undefined}
              />
            </div>

            {/* PC: 右にインラインのインスペクタ。
                ⚠️ 以前は sticky でなかったため、下の台を選ぶと編集欄が画面外に消えていた */}
            {selectedDest && (
              <div className="hidden w-[372px] shrink-0 sm:block">
                <fieldset disabled={!canEdit} className="sticky top-4 block max-h-[calc(100vh-2rem)] overflow-y-auto rounded-card border bg-card p-4">
                  <DestinationInspector
                    dest={selectedDest}
                    issues={issuesByDest.get(selectedDest.destId) ?? []}
                    onChange={updateDestination}
                    onDelete={() => deleteDestination(selectedDest.destId)}
                  />
                </fieldset>
              </div>
            )}
          </div>

          {/* スマホ: 下シートでインスペクタを出す。
              ⚠️ sm:hidden は DialogContent の中身にしか効かず、DialogOverlay は隠せない
              （useIsNarrow のコメント参照）。open 自体を isNarrow で絞る */}
          <Dialog open={isNarrow && !!selectedDest} onOpenChange={(open) => !open && setSelectedId(null)}>
            <DialogContent className="dialog-bottom-sheet max-h-[90vh] overflow-y-auto p-4" aria-describedby={undefined}>
              <DialogHeader><DialogTitle>配信先の設定</DialogTitle></DialogHeader>
              {selectedDest && (
                /* ⚠️ シートは portal で本文の外に出るので、上の <fieldset> は届かない */
                <fieldset disabled={!canEdit} className="contents">
                  <DestinationInspector
                    dest={selectedDest}
                    issues={issuesByDest.get(selectedDest.destId) ?? []}
                    onChange={updateDestination}
                    onDelete={() => deleteDestination(selectedDest.destId)}
                  />
                </fieldset>
              )}
            </DialogContent>
          </Dialog>

          {/* WEB会議（配信設定の下段。Excel には出さない） */}
          <div className="mt-8 border-t pt-6">
            <div className="mb-1 flex items-center gap-2">
              <Video className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold">WEB会議</h2>
            </div>
            <p className="mb-3 text-xs font-medium text-warning">ここから下は Excel に出ません。共有は画面のコピーで行ってください。</p>
            {/* ⚠️ 一覧＋詳細（配信先と同じ作り）。会議は本番用・リハ用…と3〜4本になるので
                カードの縦積みでは目的の1件に辿り着けなかった。スマホは 1画面ずつ（MeetingList 参照）。
                ⚠️ ここで <Dialog> は使わない（PC 幅で画面全体が暗転した実害・useIsNarrow のコメント） */}
            <MeetingList
              meetings={meetings}
              selectedId={selectedMeetingId}
              canEdit={canEdit}
              onSelect={setSelectedMeetingId}
              onChange={setMeetings}
            />
          </div>
        </>
      )}

      {canEdit && (
        <div className="sticky bottom-0 mt-6 border-t bg-background/95 py-3 backdrop-blur sm:hidden">
          <Button className="h-[52px] w-full" onClick={save} disabled={saving}>
            <Save className="mr-2 h-4 w-4" /> {saving ? '保存中…' : '保存する'}
          </Button>
        </div>
      )}

      <ExportDialog
        open={exportOpen}
        onOpenChange={setExportOpen}
        ownerKey={ownerKey}
        date={serviceDate}
        dirty={dirty}
        onSave={canEdit ? save : undefined}
      />
      <CopyFromDialog
        open={copyFromOpen}
        onOpenChange={setCopyFromOpen}
        ownerKey={ownerKey}
        date={serviceDate}
        what={['streaming']}
        onCopied={() => { void load(); }}
      />
    </div>
  );
}
