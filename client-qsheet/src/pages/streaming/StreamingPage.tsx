// 配信設定の画面の骨（左: ENC ごとの配信先一覧 / 右: 372px インスペクタ / 下段: WEB会議）。
// ⚠️ この画面は useState のローカル状態。素の <input> で構わない（impl doc §5-2）。
import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ChevronLeft, Save, FileDown, Plus, Video } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { notifySuccess, notifyError } from '@/lib/notify';
import { getStreaming, putStreaming, type Destination, type Meeting } from '@/lib/deviceSettingsApi';
import { genId } from '@/lib/stableIds';
import DestinationInspector from './DestinationInspector';
import MeetingCard from './MeetingCard';
import ExportDialog from '../settings-export/ExportDialog';

const ENCODER_IDS = Array.from({ length: 10 }, (_, i) => `ENC${i + 1}`);

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

  useEffect(() => {
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
        }
      })
      .catch(() => notifyError('配信設定の取得に失敗しました'))
      .finally(() => alive && setLoading(false));
    return () => { alive = false; };
  }, [ownerKey, date]);

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
        <button onClick={() => navigate(-1)} className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-muted" aria-label="戻る">
          <ChevronLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-lg font-bold">配信設定</h1>
          <p className="truncate text-xs text-muted-foreground">{ownerKey} ・ {serviceDate}</p>
        </div>
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

          {/* スマホ: 下シートでインスペクタを出す */}
          <Dialog open={!!selectedDest} onOpenChange={(open) => !open && setSelected(null)}>
            <DialogContent className="dialog-bottom-sheet max-h-[90vh] overflow-y-auto p-4 sm:hidden" aria-describedby={undefined}>
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
        <Button variant="outline" className="h-[52px] sm:h-10" onClick={() => setExportOpen(true)}>
          <FileDown className="mr-2 h-4 w-4" /> Excel を書き出す
        </Button>
        <Button className="h-[52px] sm:h-10" onClick={save} disabled={saving}>
          <Save className="mr-2 h-4 w-4" /> {saving ? '保存中…' : '保存する'}
        </Button>
      </div>

      <ExportDialog open={exportOpen} onOpenChange={setExportOpen} ownerKey={ownerKey} date={serviceDate} />
    </div>
  );
}
