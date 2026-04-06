import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2, GripVertical, Radio, Eye, QrCode, Copy, Check, ArrowUp, ArrowDown } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const ANIMATIONS = ['bounce', 'fade', 'slide', 'shake', 'pop', 'none'] as const;
const PRESET_COLORS = ['#e11d48', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];
const PRESET_EMOJI = ['👏', '❤️', '🎉', '😂', '👍', '🔥', '⭐', '🎵', '💪', '🙌', '😍', '🤩'];

export default function EventEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState(false);

  const { data: eventData, isLoading } = useQuery({
    queryKey: ['interactive-event', id],
    queryFn: () => api.get(`/interactive/events/${id}`).then(r => r.data.data),
    enabled: !!id,
  });

  const updateEvent = useMutation({
    mutationFn: (data: any) => api.put(`/interactive/events/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  const addStamp = useMutation({
    mutationFn: (data: any) => api.post('/interactive/stamps', { event_id: id, ...data }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  const updateStamp = useMutation({
    mutationFn: ({ stampId, data }: { stampId: string; data: any }) => api.put(`/interactive/stamps/${stampId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  const deleteStamp = useMutation({
    mutationFn: (stampId: string) => api.delete(`/interactive/stamps/${stampId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  const startEvent = useMutation({
    mutationFn: () => api.post(`/interactive/events/${id}/start`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interactive-event', id] });
      navigate(`/live/${id}`);
    },
  });

  if (isLoading) return <div className="p-8 text-center text-gray-500">読み込み中...</div>;
  if (!eventData) return <div className="p-8 text-center text-gray-500">イベントが見つかりません</div>;

  const stamps = eventData.stamps || [];
  const audienceUrl = `${window.location.origin}/interactive/audience/${id}`;
  const overlayUrl = `${window.location.origin}/interactive/overlay/${id}`;

  const handleCopyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const moveStamp = (index: number, dir: -1 | 1) => {
    const newOrder = stamps.map((s: any, i: number) => ({
      id: s.id,
      sort_order: i === index ? stamps[index + dir].sort_order : i === index + dir ? stamps[index].sort_order : s.sort_order,
    }));
    api.put(`/interactive/stamps/event/${id}/reorder`, { order: newOrder }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['interactive-event', id] });
    });
  };

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-6">
      {/* Event Info */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>イベント設定</CardTitle>
            <Badge variant={eventData.status === 'live' ? 'default' : 'secondary'}>
              {eventData.status === 'draft' ? '下書き' : eventData.status === 'live' ? 'LIVE' : eventData.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">タイトル</label>
            <Input
              defaultValue={eventData.title}
              onBlur={e => { if (e.target.value !== eventData.title) updateEvent.mutate({ title: e.target.value }); }}
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">説明</label>
            <textarea
              className="flex w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-500 min-h-[80px]"
              defaultValue={eventData.description || ''}
              onBlur={e => updateEvent.mutate({ description: e.target.value })}
              placeholder="イベントの説明（任意）"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700">最大接続数</label>
            <Input
              type="number"
              defaultValue={eventData.max_connections}
              onBlur={e => updateEvent.mutate({ max_connections: parseInt(e.target.value) })}
              min={1}
              max={10000}
            />
          </div>
        </CardContent>
      </Card>

      {/* Stamps */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>スタンプ設定</CardTitle>
            <Button
              size="sm"
              onClick={() => addStamp.mutate({
                label: 'スタンプ',
                emoji: PRESET_EMOJI[stamps.length % PRESET_EMOJI.length],
                color: PRESET_COLORS[stamps.length % PRESET_COLORS.length],
                sort_order: stamps.length,
              })}
              disabled={stamps.length >= 20}
            >
              <Plus className="h-4 w-4 mr-1" />追加
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {stamps.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-4">スタンプを追加してください</p>
          ) : (
            <div className="space-y-3">
              {stamps.map((stamp: any, i: number) => (
                <div key={stamp.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <GripVertical className="h-4 w-4 text-gray-400 flex-shrink-0" />

                  {/* Emoji picker */}
                  <div className="relative group">
                    <button
                      className="text-2xl w-10 h-10 flex items-center justify-center rounded-lg border hover:bg-white transition"
                      style={{ borderColor: stamp.color }}
                    >
                      {stamp.emoji || '👏'}
                    </button>
                    <div className="absolute top-full left-0 mt-1 bg-white border rounded-lg shadow-lg p-2 grid grid-cols-6 gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition z-10">
                      {PRESET_EMOJI.map(e => (
                        <button key={e} className="text-xl p-1 hover:bg-gray-100 rounded" onClick={() => updateStamp.mutate({ stampId: stamp.id, data: { emoji: e } })}>{e}</button>
                      ))}
                    </div>
                  </div>

                  {/* Label */}
                  <Input
                    className="flex-1 max-w-[180px]"
                    defaultValue={stamp.label}
                    onBlur={e => { if (e.target.value !== stamp.label) updateStamp.mutate({ stampId: stamp.id, data: { label: e.target.value } }); }}
                  />

                  {/* Color */}
                  <div className="flex gap-1">
                    {PRESET_COLORS.slice(0, 4).map(c => (
                      <button
                        key={c}
                        className={`w-6 h-6 rounded-full border-2 transition ${stamp.color === c ? 'border-gray-900 scale-110' : 'border-transparent'}`}
                        style={{ background: c }}
                        onClick={() => updateStamp.mutate({ stampId: stamp.id, data: { color: c } })}
                      />
                    ))}
                  </div>

                  {/* Animation */}
                  <select
                    className="text-xs border rounded px-2 py-1"
                    value={stamp.animation}
                    onChange={e => updateStamp.mutate({ stampId: stamp.id, data: { animation: e.target.value } })}
                  >
                    {ANIMATIONS.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>

                  {/* Reorder */}
                  <div className="flex flex-col">
                    <button className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30" disabled={i === 0} onClick={() => moveStamp(i, -1)}>
                      <ArrowUp className="h-3 w-3" />
                    </button>
                    <button className="p-0.5 hover:bg-gray-200 rounded disabled:opacity-30" disabled={i === stamps.length - 1} onClick={() => moveStamp(i, 1)}>
                      <ArrowDown className="h-3 w-3" />
                    </button>
                  </div>

                  {/* Delete */}
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => deleteStamp.mutate(stamp.id)}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* URLs */}
      <Card>
        <CardHeader><CardTitle>共有リンク</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div>
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <QrCode className="h-3.5 w-3.5" /> 視聴者URL
            </label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={audienceUrl} className="text-xs" />
              <Button variant="outline" size="sm" onClick={() => handleCopyUrl(audienceUrl)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 flex items-center gap-1">
              <Eye className="h-3.5 w-3.5" /> オーバーレイURL (OBS)
            </label>
            <div className="flex gap-2 mt-1">
              <Input readOnly value={overlayUrl} className="text-xs" />
              <Button variant="outline" size="sm" onClick={() => handleCopyUrl(overlayUrl)}>
                {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={() => navigate('/')}>戻る</Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => window.open(overlayUrl, '_blank', 'noopener,noreferrer')}>
            <Eye className="h-4 w-4 mr-1" />プレビュー
          </Button>
          {eventData.status === 'draft' && stamps.length > 0 && (
            <Button onClick={() => startEvent.mutate()} disabled={startEvent.isPending}>
              <Radio className="h-4 w-4 mr-1" />ライブ開始
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
