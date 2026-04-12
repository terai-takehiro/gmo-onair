import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Plus, Trash2, GripVertical, Radio, Eye, QrCode, Copy, Check,
  ArrowUp, ArrowDown, Youtube, Image, X, BarChart3, ChevronRight,
  ChevronDown, Settings, Link2, ExternalLink,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

const ANIMATIONS = ['bounce', 'fade', 'slide', 'shake', 'pop', 'none'] as const;
const PRESET_COLORS = ['#e11d48', '#f97316', '#eab308', '#22c55e', '#06b6d4', '#6366f1', '#a855f7', '#ec4899'];
const PRESET_EMOJI = ['👏', '❤️', '🎉', '😂', '👍', '🔥', '⭐', '🎵', '💪', '🙌', '😍', '🤩'];

export default function EventEditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [copied, setCopied] = useState<string | null>(null);
  const [showQr, setShowQr] = useState(false);
  const fileInputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  // Accordion state
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(['basic']));

  const toggleSection = (key: string) => {
    setOpenSections(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

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

  const startRehearsal = useMutation({
    mutationFn: () => api.post(`/interactive/events/${id}/rehearsal`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interactive-event', id] });
      navigate(`/live/${id}`);
    },
  });

  const resetRehearsal = useMutation({
    mutationFn: () => api.post(`/interactive/events/${id}/rehearsal-reset`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  const reuseEvent = useMutation({
    mutationFn: () => api.post(`/interactive/events/${id}/reuse`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  if (isLoading) return <div className="p-8 text-center text-muted-foreground">読み込み中...</div>;
  if (!eventData) return <div className="p-8 text-center text-muted-foreground">イベントが見つかりません</div>;

  const audienceUrl = `${window.location.origin}/interactive/audience/${id}`;
  const overlayUrl = `${window.location.origin}/interactive/overlay/${id}`;
  const qrUrl = `/api/v1/internal/interactive/audience/events/${id}/qr`;

  const handleCopy = async (url: string, key: string) => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(url);
      } else {
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
    } catch { /* ignore */ }
    setCopied(key);
    setTimeout(() => setCopied(null), 2000);
  };

  const stamps = eventData.stamps || [];
  const channels = eventData.channels || [];

  const moveStamp = (index: number, dir: -1 | 1) => {
    const newOrder = stamps.map((s: any, i: number) => ({
      id: s.id,
      sort_order: i === index ? stamps[index + dir].sort_order : i === index + dir ? stamps[index].sort_order : s.sort_order,
    }));
    api.put(`/interactive/stamps/event/${id}/reorder`, { order: newOrder }).then(() => {
      queryClient.invalidateQueries({ queryKey: ['interactive-event', id] });
    });
  };

  const handleImageUpload = (stampId: string, file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      updateStamp.mutate({ stampId, data: { image_url: dataUrl } });
    };
    reader.readAsDataURL(file);
  };

  const isOpen = (key: string) => openSections.has(key);

  return (
    <div className="max-w-4xl mx-auto px-3 sm:px-4 py-4 space-y-3 pb-12">
      {/* ── Sticky Header ── */}
      <div className="flex items-center justify-between sticky top-0 z-30 bg-background/95 backdrop-blur-sm py-3 -mt-4 pt-4">
        <div className="min-w-0">
          <h1 className="text-lg sm:text-xl font-semibold truncate">{eventData.title}</h1>
          <div className="flex items-center gap-2 mt-0.5">
            <Badge variant={eventData.status === 'live' ? 'default' : eventData.status === 'rehearsal' ? 'warning' : 'secondary'} className="text-xs">
              {eventData.status === 'draft' ? '下書き' : eventData.status === 'rehearsal' ? 'リハーサル' : eventData.status === 'live' ? 'LIVE' : eventData.status === 'ended' ? '終了' : 'アーカイブ'}
            </Badge>
            {eventData.accepting && <span className="text-[10px] text-green-600 font-medium">受付中</span>}
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          {(eventData.status === 'live' || eventData.status === 'rehearsal') && (
            <Button size="sm" onClick={() => navigate(`/live/${id}`)}>
              <Radio className="h-4 w-4 mr-1" />管理画面
            </Button>
          )}
          {eventData.status === 'draft' && stamps.length > 0 && (
            <>
              <Button size="sm" variant="outline" onClick={() => startRehearsal.mutate()} disabled={startRehearsal.isPending}>
                リハーサル
              </Button>
              <Button size="sm" onClick={() => startEvent.mutate()} disabled={startEvent.isPending}>
                <Radio className="h-4 w-4 mr-1" />本番開始
              </Button>
            </>
          )}
          {eventData.status === 'rehearsal' && (
            <Button size="sm" variant="outline" onClick={() => { if (confirm('リハーサルデータをリセットして下書きに戻しますか？')) resetRehearsal.mutate(); }}>
              リセット
            </Button>
          )}
          {eventData.status === 'ended' && (
            <Button size="sm" variant="outline" onClick={() => { if (confirm('統計をリセットして再利用しますか？スタンプ数・参加者・クイズ回答は全てクリアされます。')) reuseEvent.mutate(); }}>
              再利用
            </Button>
          )}
        </div>
      </div>

      {/* ── Section: 基本設定 ── */}
      <Card>
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors rounded-t-xl"
          onClick={() => toggleSection('basic')}
        >
          <div className="flex items-center gap-2">
            <Settings className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">基本設定</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen('basic') ? 'rotate-180' : ''}`} />
        </button>
        {isOpen('basic') && (
          <CardContent className="pt-0 pb-4 px-4 space-y-4 accordion-content border-t">
            <div>
              <label className="text-sm font-medium">タイトル</label>
              <Input
                className="mt-1"
                defaultValue={eventData.title}
                onBlur={e => { if (e.target.value !== eventData.title) updateEvent.mutate({ title: e.target.value }); }}
              />
            </div>
            <div>
              <label className="text-sm font-medium">説明</label>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[72px]"
                defaultValue={eventData.description || ''}
                onBlur={e => updateEvent.mutate({ description: e.target.value })}
                placeholder="イベントの説明（任意）"
              />
            </div>
            <div>
              <label className="text-sm font-medium">最大接続数</label>
              <Input
                type="number"
                className="mt-1 max-w-[160px]"
                defaultValue={eventData.max_connections}
                onBlur={e => updateEvent.mutate({ max_connections: parseInt(e.target.value) })}
                min={1} max={10000}
              />
            </div>

            {/* YouTube URL */}
            <div>
              <label className="text-sm font-medium">YouTube URL</label>
              <p className="text-xs text-muted-foreground">視聴者画面に埋め込み表示されます</p>
              <Input
                className="mt-1"
                placeholder="https://www.youtube.com/watch?v=..."
                defaultValue={eventData.youtube_url || ''}
                onBlur={e => updateEvent.mutate({ youtube_url: e.target.value || null })}
              />
            </div>

            {/* バナー画像URL */}
            <div>
              <label className="text-sm font-medium">バナー画像URL</label>
              <p className="text-xs text-muted-foreground">YouTube未設定時に表示（任意）</p>
              <Input
                className="mt-1"
                placeholder="https://..."
                defaultValue={eventData.banner_url || ''}
                onBlur={e => updateEvent.mutate({ banner_url: e.target.value || null })}
              />
            </div>

            {/* 運営コメント */}
            <div>
              <label className="text-sm font-medium">運営コメント</label>
              <p className="text-xs text-muted-foreground">視聴者画面に表示されるメッセージ</p>
              <textarea
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm mt-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring min-h-[60px]"
                defaultValue={eventData.admin_comment || ''}
                onBlur={e => updateEvent.mutate({ admin_comment: e.target.value || null })}
                placeholder="視聴者へのメッセージ（任意）"
              />
            </div>

            {/* アンケートURL */}
            <div>
              <label className="text-sm font-medium">アンケートURL</label>
              <Input
                className="mt-1"
                placeholder="https://forms.google.com/..."
                defaultValue={eventData.survey_url || ''}
                onBlur={e => updateEvent.mutate({ survey_url: e.target.value || null })}
              />
            </div>

            {/* 受付ON/OFF スイッチ */}
            <div className="flex items-center justify-between py-2">
              <div>
                <label className="text-sm font-medium">スタンプ受付</label>
                <p className="text-xs text-muted-foreground">ONにすると視聴者がスタンプを送信できます</p>
              </div>
              <button
                onClick={() => updateEvent.mutate({ accepting: !eventData.accepting })}
                className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors ${
                  eventData.accepting ? 'bg-primary' : 'bg-muted'
                }`}
              >
                <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform ${
                  eventData.accepting ? 'translate-x-6' : 'translate-x-1'
                }`} />
              </button>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Section: チャンネル設定 ── */}
      <Card>
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors rounded-t-xl"
          onClick={() => toggleSection('channels')}
        >
          <div className="flex items-center gap-2">
            <Youtube className="h-4 w-4 text-red-500" />
            <span className="font-semibold text-sm">チャンネル設定</span>
            <Badge variant="outline" className="text-[10px] px-1.5">{channels.length}ch</Badge>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen('channels') ? 'rotate-180' : ''}`} />
        </button>
        {isOpen('channels') && (
          <CardContent className="pt-0 pb-4 px-4 space-y-4 accordion-content border-t">
            <div className="flex justify-end">
              <Button size="sm" variant="outline" onClick={() => {
                api.post(`/interactive/events/${id}/channels`, { name: `チャンネル${(channels?.length || 0) + 1}` })
                  .then(() => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }));
              }}>
                <Plus className="h-4 w-4 mr-1" />チャンネル追加
              </Button>
            </div>
            {(!channels || channels.length === 0) && (
              <p className="text-sm text-muted-foreground text-center py-4">チャンネルがありません</p>
            )}
            {channels?.map((ch: any) => (
              <div key={ch.id} className="border rounded-xl p-3 sm:p-4 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <Input
                    className="flex-1 h-8 text-sm font-semibold"
                    defaultValue={ch.name}
                    onBlur={e => {
                      if (e.target.value !== ch.name)
                        api.put(`/interactive/channels/${ch.id}`, { name: e.target.value })
                          .then(() => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }));
                    }}
                    placeholder="チャンネル名 (例: 日本語)"
                  />
                  <Input
                    className="w-16 h-8 text-xs"
                    defaultValue={ch.language_code || ''}
                    onBlur={e => api.put(`/interactive/channels/${ch.id}`, { language_code: e.target.value })
                      .then(() => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }))}
                    placeholder="ja"
                  />
                  {channels.length > 1 && (
                    <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive"
                      onClick={() => {
                        if (confirm('このチャンネルを削除しますか？'))
                          api.delete(`/interactive/channels/${ch.id}`)
                            .then(() => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }));
                      }}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  )}
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">YouTube URL</label>
                  <Input className="mt-1 h-8 text-sm" placeholder="https://youtube.com/watch?v=..."
                    defaultValue={ch.youtube_url || ''}
                    onBlur={e => api.put(`/interactive/channels/${ch.id}`, { youtube_url: e.target.value || null })
                      .then(() => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }))} />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">バナー画像URL</label>
                  <Input className="mt-1 h-8 text-sm" placeholder="https://..."
                    defaultValue={ch.banner_url || ''}
                    onBlur={e => api.put(`/interactive/channels/${ch.id}`, { banner_url: e.target.value || null })
                      .then(() => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }))} />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">管理者コメント</label>
                  <textarea
                    className="flex w-full rounded-md border border-input bg-background px-2 py-1.5 text-sm mt-1 min-h-[48px]"
                    defaultValue={ch.admin_comment || ''}
                    onBlur={e => api.put(`/interactive/channels/${ch.id}`, { admin_comment: e.target.value || null })
                      .then(() => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }))}
                    placeholder="視聴者へのメッセージ"
                  />
                </div>

                <div>
                  <label className="text-xs font-medium text-muted-foreground">アンケートURL</label>
                  <Input className="mt-1 h-8 text-sm" placeholder="https://forms.google.com/..."
                    defaultValue={ch.survey_url || ''}
                    onBlur={e => api.put(`/interactive/channels/${ch.id}`, { survey_url: e.target.value || null })
                      .then(() => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }))} />
                </div>

                <div className="pt-1 flex items-center gap-2 flex-wrap">
                  <span className="text-xs text-muted-foreground shrink-0">URL:</span>
                  <code className="bg-muted px-1 py-0.5 rounded text-[10px] break-all flex-1 min-w-0">
                    {`${window.location.origin}/interactive/audience/${id}?ch=${ch.id}`}
                  </code>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => handleCopy(`${window.location.origin}/interactive/audience/${id}?ch=${ch.id}`, ch.id)}>
                    {copied === ch.id ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    {copied === ch.id ? 'コピー済' : 'コピー'}
                  </Button>
                  <Button size="sm" variant="outline" className="h-7 text-xs gap-1 shrink-0"
                    onClick={() => window.open(`/api/v1/internal/interactive/audience/events/${id}/channels/${ch.id}/qr`, '_blank')}>
                    <QrCode className="h-3 w-3" />QR
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {/* ── Section: スタンプ設定 ── */}
      <Card>
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors rounded-t-xl"
          onClick={() => toggleSection('stamps')}
        >
          <div className="flex items-center gap-2">
            <span className="text-lg">🎉</span>
            <span className="font-semibold text-sm">スタンプ設定</span>
            <Badge variant="outline" className="text-[10px] px-1.5">{stamps.length}/20</Badge>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen('stamps') ? 'rotate-180' : ''}`} />
        </button>
        {isOpen('stamps') && (
          <CardContent className="pt-0 pb-4 px-4 accordion-content border-t">
            <div className="flex justify-end pt-3 pb-2">
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
            {stamps.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">スタンプを追加してください</p>
            ) : (
              <div className="space-y-2">
                {stamps.map((stamp: any, i: number) => (
                  <div key={stamp.id} className="p-3 bg-muted/40 rounded-xl border space-y-2">
                    {/* Row 1: Icon + Label + Delete */}
                    <div className="flex items-center gap-2">
                      <GripVertical className="h-4 w-4 text-muted-foreground/50 flex-shrink-0" />

                      {/* Image or Emoji picker */}
                      <div className="relative group flex-shrink-0">
                        {stamp.image_url ? (
                          <div className="relative">
                            <img src={stamp.image_url} alt={stamp.label} className="w-10 h-10 rounded-xl object-cover border-2" style={{ borderColor: stamp.color + '66' }} />
                            <button
                              className="absolute -top-1 -right-1 w-4 h-4 bg-destructive text-destructive-foreground rounded-full flex items-center justify-center hover:opacity-80"
                              onClick={() => updateStamp.mutate({ stampId: stamp.id, data: { image_url: null } })}
                            >
                              <X className="h-2.5 w-2.5" />
                            </button>
                          </div>
                        ) : (
                          <>
                            <button
                              className="text-2xl w-10 h-10 flex items-center justify-center rounded-xl border-2 hover:bg-background transition"
                              style={{ borderColor: stamp.color + '66' }}
                            >
                              {stamp.emoji || '👏'}
                            </button>
                            <div className="absolute top-full left-0 mt-1 bg-background border rounded-xl shadow-lg p-2 grid grid-cols-6 gap-1 opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto transition z-10 min-w-max">
                              {PRESET_EMOJI.map(e => (
                                <button key={e} className="text-xl p-1 hover:bg-muted rounded-lg" onClick={() => updateStamp.mutate({ stampId: stamp.id, data: { emoji: e } })}>{e}</button>
                              ))}
                            </div>
                          </>
                        )}
                      </div>

                      <Input
                        className="flex-1 h-8 text-sm"
                        defaultValue={stamp.label}
                        onBlur={e => { if (e.target.value !== stamp.label) updateStamp.mutate({ stampId: stamp.id, data: { label: e.target.value } }); }}
                      />

                      <div className="flex items-center gap-0.5 shrink-0">
                        <button className="p-1 hover:bg-muted rounded disabled:opacity-30" disabled={i === 0} onClick={() => moveStamp(i, -1)}>
                          <ArrowUp className="h-3 w-3" />
                        </button>
                        <button className="p-1 hover:bg-muted rounded disabled:opacity-30" disabled={i === stamps.length - 1} onClick={() => moveStamp(i, 1)}>
                          <ArrowDown className="h-3 w-3" />
                        </button>
                      </div>

                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive shrink-0" onClick={() => deleteStamp.mutate(stamp.id)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    {/* Row 2: Image upload + Colors + Animation */}
                    <div className="flex items-center gap-2 pl-6 flex-wrap">
                      {/* Image upload */}
                      <div className="flex-shrink-0">
                        <input
                          ref={el => { fileInputRefs.current[stamp.id] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={e => {
                            const file = e.target.files?.[0];
                            if (file) handleImageUpload(stamp.id, file);
                            e.target.value = '';
                          }}
                        />
                        <button
                          className="flex items-center gap-1 px-2 py-1 text-xs border rounded-lg hover:bg-muted transition text-muted-foreground"
                          onClick={() => fileInputRefs.current[stamp.id]?.click()}
                          title="画像をアップロード"
                        >
                          <Image className="h-3 w-3" />画像
                        </button>
                      </div>

                      {/* Color swatches */}
                      <div className="flex gap-1">
                        {PRESET_COLORS.map(c => (
                          <button
                            key={c}
                            className={`w-5 h-5 rounded-full border-2 transition-transform ${stamp.color === c ? 'border-foreground scale-125' : 'border-transparent'}`}
                            style={{ background: c }}
                            onClick={() => updateStamp.mutate({ stampId: stamp.id, data: { color: c } })}
                          />
                        ))}
                      </div>

                      {/* Animation */}
                      <select
                        className="text-xs border border-input rounded-lg px-2 py-1 bg-background"
                        value={stamp.animation}
                        onChange={e => updateStamp.mutate({ stampId: stamp.id, data: { animation: e.target.value } })}
                      >
                        {ANIMATIONS.map(a => <option key={a} value={a}>{a}</option>)}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>

      {/* ── Section: クイズ / アンケート ── */}
      <Card className="card-hover">
        <button
          onClick={() => navigate(`/event/${id}/quiz`)}
          className="w-full flex items-center gap-3 p-4 text-left"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-100 text-violet-600">
            <BarChart3 className="h-5 w-5" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold">クイズ / アンケート</p>
            <p className="text-xs text-muted-foreground">択一式クイズ・アンケートの作成・管理・集計</p>
          </div>
          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
        </button>
      </Card>

      {/* ── Section: 共有リンク & QR ── */}
      <Card>
        <button
          className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors rounded-t-xl"
          onClick={() => toggleSection('links')}
        >
          <div className="flex items-center gap-2">
            <Link2 className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">共有リンク & QR</span>
          </div>
          <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen('links') ? 'rotate-180' : ''}`} />
        </button>
        {isOpen('links') && (
          <CardContent className="pt-0 pb-4 px-4 space-y-4 accordion-content border-t">
            {/* QR Code */}
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setShowQr(!showQr)}>
                <QrCode className="h-4 w-4 mr-1" />{showQr ? 'QRを閉じる' : 'QRコード表示'}
              </Button>
            </div>
            {showQr && (
              <div className="flex flex-col items-center gap-3 p-4 bg-white border rounded-2xl">
                <p className="text-sm font-medium text-muted-foreground">視聴者用QRコード</p>
                <img src={qrUrl} alt="QR Code" className="w-48 h-48" />
                <p className="text-xs text-muted-foreground break-all text-center max-w-xs">{audienceUrl}</p>
              </div>
            )}

            <div>
              <label className="text-sm font-medium text-muted-foreground">視聴者URL（スタンプ入力）</label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={audienceUrl} className="text-xs font-mono" />
                <Button variant="outline" size="sm" onClick={() => handleCopy(audienceUrl, 'audience')}>
                  {copied === 'audience' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-muted-foreground flex items-center gap-1">
                <Eye className="h-3.5 w-3.5" />オーバーレイURL（OBS用）
              </label>
              <div className="flex gap-2 mt-1">
                <Input readOnly value={overlayUrl} className="text-xs font-mono" />
                <Button variant="outline" size="sm" onClick={() => handleCopy(overlayUrl, 'overlay')}>
                  {copied === 'overlay' ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button variant="outline" size="sm" onClick={() => window.open(overlayUrl, '_blank', 'noopener,noreferrer')}>
                  <Eye className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </CardContent>
        )}
      </Card>

      {/* ── Footer actions ── */}
      <div className="flex justify-between pt-2">
        <Button variant="outline" onClick={() => navigate('/')}>戻る</Button>
      </div>
    </div>
  );
}
