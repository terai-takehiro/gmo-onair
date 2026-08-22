// 配信設定の画面の骨（左: ENC ごとの配信先一覧 / 右: 372px インスペクタ / 下段: WEB会議）。
// ⚠️ この画面は useState のローカル状態。素の <input> で構わない（impl doc §5-2）。
import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, FileDown, Plus, Video, Copy } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notifySuccess, notifyError } from '@/lib/notify';
import { formatRelativeTime } from '@gmo-onair/shared/src/client/format';
import { getOwnerContext, getStreaming, putStreaming, type Destination, type Meeting, type OwnerContext } from '@/lib/deviceSettingsApi';
import { genId } from '@/lib/stableIds';
import DestinationInspector from './DestinationInspector';
import MeetingCard from './MeetingCard';
import ExportDialog from '../settings-export/ExportDialog';
import CopyFromDialog from '../settings-export/CopyFromDialog';
import MiniAppSwitcher from '@/components/journey/MiniAppSwitcher';

const ENCODER_IDS = Array.from({ length: 10 }, (_, i) => `ENC${i + 1}`);

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

function newMeeting(): Meeting {
  return { meetingId_: genId('mtg'), tool: 'Zoom', url: '', videoInput: 'OA1', audioInput: 'UltraStudio' };
}

export default function StreamingPage() {
  const { ownerKey = '' } = useParams();
  const [params] = useSearchParams();
  const date = params.get('date') ?? undefined;
  const navigate = useNavigate();

  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [serviceDate, setServiceDate] = useState(date ?? new Date().toISOString().slice(0, 10));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState<number | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [copyFromOpen, setCopyFromOpen] = useState(false);
  const [owner, setOwner] = useState<OwnerContext | null>(null);
  const isNarrow = useIsNarrow();
  const [lastExportedAt, setLastExportedAt] = useState<string | null>(null);
  const [lastExportName, setLastExportName] = useState<string | null>(null);

  const loadStreaming = useCallback(() => {
    let alive = true;
    setLoading(true);
    getStreaming(ownerKey, date)
      .then((data) => {
        if (!alive) return;
        if (data) {
          setDestinations(data.destinations.map(({ streamKeyMasked, hasStreamKey, ...rest }) => ({
            ...rest,
            streamKey: hasStreamKey ? streamKeyMasked : undefined,
          })));
          setMeetings(data.meetings);
          setServiceDate(data.serviceDate);
          setLastExportedAt(data.lastExportedAt);
          setLastExportName(data.lastExportName);
        }
      })
      .catch(() => notifyError('配信設定の取得に失敗しました'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [ownerKey, date]);

  useEffect(() => loadStreaming(), [loadStreaming]);

  useEffect(() => {
    let alive = true;
    getOwnerContext(ownerKey).then((data) => { if (alive) setOwner(data); });
    return () => { alive = false; };
  }, [ownerKey]);

  const byEncoder = new Map<string, { dest: Destination; index: number }[]>();
  destinations.forEach((dest, index) => {
    const list = byEncoder.get(dest.encoderId) ?? [];
    list.push({ dest, index });
    byEncoder.set(dest.encoderId, list);
  });

  const updateDestination = (index: number, next: Destination) =>
    setDestinations((prev) => prev.map((d, i) => (i === index ? next : d)));
  const deleteDestination = (index: number) => {
    setDestinations((prev) => prev.filter((_, i) => i !== index));
    setSelected(null);
  };
  const addDestination = (encoderId: string) => {
    setDestinations((prev) => {
      const next = [...prev, { encoderId, name: '' }];
      setSelected(next.length - 1);
      return next;
    });
  };

  const save = async () => {
    setSaving(true);
    try {
      await putStreaming(ownerKey, serviceDate, destinations, meetings);
      notifySuccess('配信設定を保存しました');
    } catch {
      notifyError('保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const selectedDest = selected != null ? destinations[selected] : null;

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
          <h1 className="truncate text-lg font-bold">配信設定</h1>
          <p className="truncate text-xs text-muted-foreground">
            {owner?.glsNumber ?? owner?.name ?? ownerKey} ・ {serviceDate}
          </p>
        </div>
        {owner && <MiniAppSwitcher owner={owner} current="streaming" />}
      </div>

      {/* 状態の帯 */}
      <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2 text-sm">
        <Video className="h-4 w-4 text-primary" />
        <span>配信先 {destinations.length}件</span>
        <span className="text-muted-foreground">
          {lastExportName ? `${lastExportName}（${formatRelativeTime(lastExportedAt)}）` : 'まだ書き出していません'}
        </span>
      </div>

      {loading ? (
        <p className="py-10 text-center text-sm text-muted-foreground">読み込み中…</p>
      ) : (
        <>
          <div className="flex flex-col gap-4 sm:flex-row">
            <div className="flex-1 space-y-3">
              {ENCODER_IDS.map((encoderId) => {
                const list = byEncoder.get(encoderId) ?? [];
                return (
                  <div key={encoderId} className="rounded-lg border">
                    <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                      <span className="text-sm font-semibold">{encoderId}</span>
                      <button onClick={() => addDestination(encoderId)} className="flex min-h-tap items-center gap-1 text-xs text-primary">
                        <Plus className="h-3.5 w-3.5" /> 配信先を足す
                      </button>
                    </div>
                    {list.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">配信先がまだありません。この台は Excel に出ません。</p>
                    ) : (
                      <ul className="divide-y">
                        {list.map(({ dest, index }) => (
                          <li key={index}>
                            <button
                              onClick={() => setSelected(index)}
                              className={`flex min-h-[44px] w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted/50 ${selected === index ? 'bg-primary/5' : ''}`}
                            >
                              <span className="cond truncate" style={{ transform: 'scaleX(0.94)', transformOrigin: 'left' }}>{dest.name || '(名称未設定)'}</span>
                              <span className="shrink-0 text-xs text-muted-foreground">{dest.protocol ?? 'RTMP'}</span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>

            {/* PC: 右にインラインのインスペクタ */}
            {selectedDest && (
              <div className="hidden sm:block">
                <DestinationInspector
                  dest={selectedDest}
                  onChange={(next) => updateDestination(selected!, next)}
                  onDelete={() => deleteDestination(selected!)}
                />
              </div>
            )}
          </div>

          {/* スマホ: 下シートでインスペクタを出す。
              ⚠️ sm:hidden は DialogContent の中身にしか効かず、DialogOverlay は隠せない
              （useIsNarrow のコメント参照）。open 自体を isNarrow で絞る */}
          <Dialog open={isNarrow && !!selectedDest} onOpenChange={(open) => !open && setSelected(null)}>
            <DialogContent className="dialog-bottom-sheet max-h-[90vh] overflow-y-auto p-4" aria-describedby={undefined}>
              <DialogHeader><DialogTitle>配信先の設定</DialogTitle></DialogHeader>
              {selectedDest && (
                <DestinationInspector dest={selectedDest} onChange={(next) => updateDestination(selected!, next)} onDelete={() => deleteDestination(selected!)} />
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
            <div className="space-y-3">
              {meetings.map((m, i) => (
                <MeetingCard
                  key={m.meetingId_}
                  meeting={m}
                  onChange={(next) => setMeetings((prev) => prev.map((mm, idx) => (idx === i ? next : mm)))}
                  onDelete={() => setMeetings((prev) => prev.filter((_, idx) => idx !== i))}
                />
              ))}
            </div>
            <Button variant="outline" className="mt-3 h-11" onClick={() => setMeetings((prev) => [...prev, newMeeting()])}>
              <Plus className="mr-2 h-4 w-4" /> 会議を追加
            </Button>
          </div>
        </>
      )}

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

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} ownerKey={ownerKey} date={serviceDate} />
      <CopyFromDialog
        open={copyFromOpen}
        onOpenChange={setCopyFromOpen}
        ownerKey={ownerKey}
        date={serviceDate}
        what={['streaming']}
        onCopied={loadStreaming}
      />
    </div>
  );
}
