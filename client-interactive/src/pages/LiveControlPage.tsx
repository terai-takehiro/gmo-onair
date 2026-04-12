import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Radio, Square, Users, Eye, QrCode, Copy, BarChart3, Play, Check } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getSocket, disconnectSocket } from '@/lib/socket';

interface StampCount {
  [stampId: string]: number;
}

export default function LiveControlPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [connectionCount, setConnectionCount] = useState(0);
  const [stampCounts, setStampCounts] = useState<StampCount>({});
  const [isConnected, setIsConnected] = useState(false);
  const [copied, setCopied] = useState(false);
  const stampCountsRef = useRef(stampCounts);
  stampCountsRef.current = stampCounts;

  const { data: eventData } = useQuery({
    queryKey: ['interactive-event', id],
    queryFn: () => api.get(`/interactive/events/${id}`).then(r => r.data.data),
    enabled: !!id,
    refetchInterval: 10000,
  });

  const { data: statsData } = useQuery({
    queryKey: ['interactive-stats', id],
    queryFn: () => api.get(`/interactive/events/${id}/stats`).then(r => r.data.data),
    enabled: !!id,
    refetchInterval: 5000,
  });

  // Quiz questions
  const { data: questions } = useQuery({
    queryKey: ['quiz-questions', id],
    queryFn: () => api.get(`/interactive/events/${id}/questions`).then(r => r.data.data),
    enabled: !!id,
    refetchInterval: 5000,
  });

  const updateEvent = useMutation({
    mutationFn: (data: any) => api.put(`/interactive/events/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  const activateQ = useMutation({
    mutationFn: (qId: string) => api.post(`/interactive/questions/${qId}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', id] }),
  });

  const closeQ = useMutation({
    mutationFn: (qId: string) => api.post(`/interactive/questions/${qId}/close`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', id] }),
  });

  // Socket.IO connection
  useEffect(() => {
    if (!id) return;
    const socket = getSocket(id, { admin: true });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));

    socket.on('stamp:update', (data: { stampId: string; count: number }) => {
      setStampCounts(prev => ({
        ...prev,
        [data.stampId]: (prev[data.stampId] || 0) + data.count,
      }));
    });

    socket.on('connections:count', (data: { count: number }) => {
      setConnectionCount(data.count);
    });

    return () => {
      disconnectSocket();
    };
  }, [id]);

  const handleStop = async () => {
    if (!confirm('ライブを終了しますか？')) return;
    await api.post(`/interactive/events/${id}/stop`);
    queryClient.invalidateQueries({ queryKey: ['interactive-event', id] });
    navigate(`/event/${id}`);
  };

  const handleCopy = async () => {
    const url = `${window.location.origin}/interactive/audience/${id}`;
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
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (!eventData) return <div className="p-8 text-center text-muted-foreground">読み込み中...</div>;

  const stamps = eventData.stamps || [];

  // Total stamps from stats + live buffer
  const getTotal = (stampId: string) => {
    const dbTotal = statsData?.stamps?.find((s: any) => s.id === stampId)?.total || 0;
    return Number(dbTotal) + (stampCounts[stampId] || 0);
  };

  const grandTotal = stamps.reduce((sum: number, s: any) => sum + getTotal(s.id), 0);

  // Quiz helpers
  const activeQuestion = questions?.find((q: any) => q.status === 'active');
  const nextDraftQuestion = questions?.find((q: any) => q.status === 'draft');
  const getQuestionText = (q: any) => {
    const texts = q.texts || [];
    const ja = texts.find((t: any) => t.language_code === 'ja') || texts[0];
    return ja?.question_text || '(テキストなし)';
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:p-4 py-4 space-y-4 sm:space-y-5">
      {/* ── Status Bar ── */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <Badge variant={eventData.status === 'live' ? 'default' : 'secondary'} className="text-base px-3 py-1 shrink-0">
            {eventData.status === 'live' ? (
              <><Radio className="h-4 w-4 mr-1 animate-pulse" />LIVE</>
            ) : eventData.status}
          </Badge>
          <h1 className="text-lg sm:text-xl font-semibold truncate">{eventData.title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 text-xs">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? '接続中' : '切断'}
          </div>

          {/* 受付ON/OFF toggle */}
          {eventData.status === 'live' && (
            <button
              onClick={() => updateEvent.mutate({ accepting: !eventData.accepting })}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                eventData.accepting
                  ? 'bg-green-100 text-green-700 hover:bg-green-200'
                  : 'bg-zinc-100 text-zinc-500 hover:bg-zinc-200'
              }`}
            >
              <span className={`w-2 h-2 rounded-full ${eventData.accepting ? 'bg-green-500' : 'bg-zinc-400'}`} />
              {eventData.accepting ? '受付中' : '停止中'}
            </button>
          )}

          {eventData.status === 'live' && (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Square className="h-4 w-4 mr-1" />終了
            </Button>
          )}
        </div>
      </div>

      {/* ── Stats Cards ── */}
      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl sm:text-3xl font-bold tabular-nums">{connectionCount}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">接続中</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl sm:text-3xl font-bold tabular-nums">{grandTotal.toLocaleString()}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">総スタンプ</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 sm:p-4 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl sm:text-3xl font-bold tabular-nums">{statsData?.sessions?.total || 0}</div>
            <div className="text-[10px] sm:text-xs text-muted-foreground">累計参加者</div>
          </CardContent>
        </Card>
      </div>

      {/* ── Stamp Counters ── */}
      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-sm">リアルタイムスタンプ</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
            {stamps.map((stamp: any) => {
              const total = getTotal(stamp.id);
              const maxTotal = Math.max(...stamps.map((s: any) => getTotal(s.id)), 1);
              const pct = Math.round((total / maxTotal) * 100);

              return (
                <div key={stamp.id} className="relative p-3 rounded-xl border overflow-hidden">
                  {/* Background bar */}
                  <div
                    className="absolute inset-y-0 left-0 opacity-10 transition-all duration-500"
                    style={{ background: stamp.color, width: `${pct}%` }}
                  />
                  <div className="relative z-10 text-center">
                    {stamp.image_url ? (
                      <img src={stamp.image_url} alt={stamp.label} className="w-8 h-8 mx-auto mb-1 object-contain" />
                    ) : (
                      <div className="text-2xl mb-1">{stamp.emoji}</div>
                    )}
                    <div className="text-xl font-bold tabular-nums">{total.toLocaleString()}</div>
                    <div className="text-[10px] text-muted-foreground truncate">{stamp.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Quiz Control Panel ── */}
      {questions && questions.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">クイズ / アンケート操作</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {/* Active question */}
            {activeQuestion && (
              <div className="flex items-center gap-3 p-3 bg-green-50 border border-green-200 rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge className="bg-green-500 text-white text-[10px]">回答中</Badge>
                    <span className="text-xs text-muted-foreground">{activeQuestion.answer_count || 0}回答</span>
                  </div>
                  <p className="text-sm font-medium truncate">{getQuestionText(activeQuestion)}</p>
                </div>
                <Button size="sm" variant="destructive" className="shrink-0 gap-1" onClick={() => closeQ.mutate(activeQuestion.id)}>
                  <Square className="h-3 w-3" />終了
                </Button>
              </div>
            )}

            {/* Next draft question */}
            {!activeQuestion && nextDraftQuestion && (
              <div className="flex items-center gap-3 p-3 bg-muted/40 border rounded-xl">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge variant="outline" className="text-[10px]">次の問題</Badge>
                  </div>
                  <p className="text-sm font-medium truncate">{getQuestionText(nextDraftQuestion)}</p>
                </div>
                <Button size="sm" className="shrink-0 gap-1" onClick={() => activateQ.mutate(nextDraftQuestion.id)}>
                  <Play className="h-3 w-3" />開始
                </Button>
              </div>
            )}

            {!activeQuestion && !nextDraftQuestion && (
              <p className="text-sm text-muted-foreground text-center py-2">全ての問題が完了しました</p>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Quick Links ── */}
      <div className="flex gap-2 flex-wrap">
        <Button variant="outline" size="sm" onClick={handleCopy}>
          {copied ? <Check className="h-3.5 w-3.5 mr-1 text-green-500" /> : <><QrCode className="h-3.5 w-3.5 mr-1" /><Copy className="h-3 w-3 mr-1" /></>}
          {copied ? 'コピー済' : '視聴者URL'}
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.open(`/interactive/overlay/${id}`, '_blank', 'noopener,noreferrer')}>
          <Eye className="h-3.5 w-3.5 mr-1" />オーバーレイ
        </Button>
        <Button variant="outline" size="sm" onClick={() => window.open(`/interactive/audience/${id}`, '_blank', 'noopener,noreferrer')}>
          視聴者プレビュー
        </Button>
      </div>
    </div>
  );
}
