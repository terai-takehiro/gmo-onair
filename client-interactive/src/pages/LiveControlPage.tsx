import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Radio, Square, Users, Eye, QrCode, Copy, BarChart3, Play, Check,
  MessageSquare, Send, Award, PieChart,
} from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
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
  const [comment, setComment] = useState('');
  const [commentSaved, setCommentSaved] = useState(false);
  const stampCountsRef = useRef(stampCounts);
  stampCountsRef.current = stampCounts;

  // ── Data Fetching ──
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

  const { data: questions } = useQuery({
    queryKey: ['quiz-questions', id],
    queryFn: () => api.get(`/interactive/events/${id}/questions`).then(r => r.data.data),
    enabled: !!id,
    refetchInterval: 5000,
  });

  // ── Mutations ──
  const updateEvent = useMutation({
    mutationFn: (data: any) => api.put(`/interactive/events/${id}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  const goLive = useMutation({
    mutationFn: () => api.post(`/interactive/events/${id}/start`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['interactive-event', id] }),
  });

  const resetRehearsal = useMutation({
    mutationFn: () => api.post(`/interactive/events/${id}/rehearsal-reset`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['interactive-event', id] });
      queryClient.invalidateQueries({ queryKey: ['interactive-stats', id] });
      queryClient.invalidateQueries({ queryKey: ['quiz-questions', id] });
      setStampCounts({});
      navigate(`/event/${id}`);
    },
  });

  const activateQ = useMutation({
    mutationFn: (qId: string) => api.post(`/interactive/questions/${qId}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', id] }),
  });

  const closeQ = useMutation({
    mutationFn: (qId: string) => api.post(`/interactive/questions/${qId}/close`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', id] }),
  });

  const showResultsQ = useMutation({
    mutationFn: ({ qId, mode }: { qId: string; mode: string }) =>
      api.post(`/interactive/questions/${qId}/show-results`, { display_mode: mode }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', id] }),
  });

  const revealQ = useMutation({
    mutationFn: (qId: string) => api.post(`/interactive/questions/${qId}/reveal`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', id] }),
  });

  const [resultDisplayMode, setResultDisplayMode] = useState<'percent' | 'count'>('percent');

  // Init comment from event data
  useEffect(() => {
    if (eventData?.admin_comment !== undefined && comment === '') {
      setComment(eventData.admin_comment || '');
    }
  }, [eventData?.admin_comment]);

  // ── Socket.IO ──
  useEffect(() => {
    if (!id) return;
    const socket = getSocket(id, { admin: true });

    socket.on('connect', () => setIsConnected(true));
    socket.on('disconnect', () => setIsConnected(false));
    socket.on('stamp:update', (data: { stampId: string; count: number }) => {
      setStampCounts(prev => ({ ...prev, [data.stampId]: (prev[data.stampId] || 0) + data.count }));
    });
    socket.on('connections:count', (data: { count: number }) => {
      setConnectionCount(data.count);
    });

    return () => { disconnectSocket(); };
  }, [id]);

  // ── Handlers ──
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
        ta.value = url; ta.style.position = 'fixed'; ta.style.left = '-9999px';
        document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
      }
    } catch { /* */ }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCommentSave = () => {
    updateEvent.mutate({ admin_comment: comment });
    setCommentSaved(true);
    setTimeout(() => setCommentSaved(false), 2000);
  };

  if (!eventData) return <div className="p-8 text-center text-muted-foreground">読み込み中...</div>;

  const stamps = eventData.stamps || [];
  const getTotal = (stampId: string) => {
    const dbTotal = statsData?.stamps?.find((s: any) => s.id === stampId)?.total || 0;
    return Number(dbTotal) + (stampCounts[stampId] || 0);
  };
  const grandTotal = stamps.reduce((sum: number, s: any) => sum + getTotal(s.id), 0);

  const activeQuestion = questions?.find((q: any) => q.status === 'active');
  const draftQuestions = questions?.filter((q: any) => q.status === 'draft') || [];
  const getQuestionText = (q: any) => {
    const texts = q.texts || [];
    const ja = texts.find((t: any) => t.language_code === 'ja') || texts[0];
    return ja?.question_text || '(テキストなし)';
  };

  return (
    <div className="max-w-6xl mx-auto px-3 sm:px-4 py-4 space-y-4">
      {/* ════ ステータスバー ════ */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-3 min-w-0">
          {eventData.status === 'rehearsal' ? (
            <Badge variant="secondary" className="text-base px-3 py-1 shrink-0 bg-amber-100 text-amber-800">
              🎬 リハーサル
            </Badge>
          ) : (
            <Badge variant="default" className="text-base px-3 py-1 shrink-0">
              <Radio className="h-4 w-4 mr-1 animate-pulse" />LIVE
            </Badge>
          )}
          <h1 className="text-lg sm:text-xl font-semibold truncate">{eventData.title}</h1>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <div className="flex items-center gap-1 text-xs">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            <span className="hidden sm:inline">{isConnected ? '接続中' : '切断'}</span>
          </div>
          {eventData.status === 'rehearsal' && (
            <>
              <Button variant="outline" size="sm" onClick={() => { if (confirm('リハーサルデータをリセットして下書きに戻しますか？')) resetRehearsal.mutate(); }}>
                リセット
              </Button>
              <Button size="sm" onClick={() => { if (confirm('本番配信を開始しますか？（リハーサルデータはクリアされます）')) goLive.mutate(); }}>
                <Radio className="h-4 w-4 mr-1" />本番開始
              </Button>
            </>
          )}
          {eventData.status === 'live' && (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Square className="h-4 w-4 mr-1" />配信終了
            </Button>
          )}
        </div>
      </div>

      {/* ════ 配信コントロール (受付 + コメント) ════ */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">配信コントロール</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* スタンプ受付ON/OFF */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">スタンプ受付</p>
              <p className="text-xs text-muted-foreground">視聴者からのスタンプ送信を制御</p>
            </div>
            <button
              onClick={() => updateEvent.mutate({ accepting: !eventData.accepting })}
              className={`relative inline-flex h-8 w-14 items-center rounded-full transition-colors ${
                eventData.accepting ? 'bg-green-500' : 'bg-zinc-300'
              }`}
            >
              <span className={`inline-block h-6 w-6 rounded-full bg-white shadow-sm transition-transform ${
                eventData.accepting ? 'translate-x-7' : 'translate-x-1'
              }`} />
            </button>
          </div>

          {/* 運営コメント即時更新 */}
          <div>
            <p className="text-sm font-medium mb-1.5 flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" />
              運営コメント
            </p>
            <p className="text-xs text-muted-foreground mb-2">視聴者画面にリアルタイムで表示されます</p>
            <div className="flex gap-2">
              <textarea
                className="flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm min-h-[60px] resize-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                value={comment}
                onChange={e => setComment(e.target.value)}
                placeholder="視聴者へのメッセージを入力..."
              />
              <Button
                size="sm"
                className="shrink-0 self-end gap-1"
                onClick={handleCommentSave}
                disabled={updateEvent.isPending}
              >
                {commentSaved ? <Check className="h-3.5 w-3.5" /> : <Send className="h-3.5 w-3.5" />}
                {commentSaved ? '保存済' : '更新'}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ════ 統計カード ════ */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold tabular-nums">{connectionCount}</div>
            <div className="text-[10px] text-muted-foreground">接続中</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <BarChart3 className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold tabular-nums">{grandTotal.toLocaleString()}</div>
            <div className="text-[10px] text-muted-foreground">総スタンプ</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Users className="h-5 w-5 mx-auto text-primary mb-1" />
            <div className="text-2xl font-bold tabular-nums">{statsData?.sessions?.total || 0}</div>
            <div className="text-[10px] text-muted-foreground">累計参加者</div>
          </CardContent>
        </Card>
      </div>

      {/* ════ リアルタイムスタンプ ════ */}
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
                  <div className="absolute inset-y-0 left-0 opacity-10 transition-all duration-500" style={{ background: stamp.color, width: `${pct}%` }} />
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

      {/* ════ クイズ/アンケート操作 ════ */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">クイズ / アンケート操作</CardTitle>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">結果表示:</span>
              <select
                value={resultDisplayMode}
                onChange={e => setResultDisplayMode(e.target.value as 'percent' | 'count')}
                className="text-xs border rounded px-1.5 py-0.5 bg-background"
              >
                <option value="percent">パーセント</option>
                <option value="count">実数</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {(!questions || questions.length === 0) && (
            <p className="text-sm text-muted-foreground text-center py-2">クイズ/アンケートは未登録です</p>
          )}

          {/* 実施中の問題 — 段階的操作 */}
          {activeQuestion && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge className="bg-green-500 text-white text-[10px]">回答受付中</Badge>
                    <Badge variant="outline" className="text-[10px]">{activeQuestion.type === 'quiz' ? 'クイズ' : 'アンケート'}</Badge>
                    <span className="text-xs text-muted-foreground">{activeQuestion.answer_count || 0}回答</span>
                  </div>
                  <p className="text-sm font-medium">{getQuestionText(activeQuestion)}</p>
                </div>
              </div>
              {/* 操作ボタン: クイズ = 締切→アンサーチェック→正解発表, アンケート = 集計終了→結果発表 */}
              <div className="flex gap-2 flex-wrap">
                <Button size="sm" variant="destructive" className="gap-1" onClick={() => closeQ.mutate(activeQuestion.id)}>
                  <Square className="h-3 w-3" />
                  {activeQuestion.type === 'quiz' ? '回答締切' : '集計終了'}
                </Button>
              </div>
            </div>
          )}

          {/* 締切済みの問題 — 結果発表/正解発表の操作 */}
          {questions?.filter((q: any) => q.status === 'closed').map((q: any) => (
            <div key={q.id} className="p-3 bg-amber-50 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <Badge className="bg-amber-500 text-white text-[10px]">締切済</Badge>
                    <Badge variant="outline" className="text-[10px]">{q.type === 'quiz' ? 'クイズ' : 'アンケート'}</Badge>
                    <span className="text-xs text-muted-foreground">{q.answer_count || 0}回答</span>
                  </div>
                  <p className="text-sm font-medium">{getQuestionText(q)}</p>
                </div>
              </div>
              <div className="flex gap-2 flex-wrap">
                {/* アンサーチェック / 集計結果発表 */}
                <Button size="sm" variant="outline" className="gap-1"
                  onClick={() => showResultsQ.mutate({ qId: q.id, mode: resultDisplayMode })}>
                  <PieChart className="h-3 w-3" />
                  {q.type === 'quiz' ? 'アンサーチェック' : '結果発表'}
                </Button>
                {/* 正解発表（クイズのみ） */}
                {q.type === 'quiz' && (
                  <Button size="sm" className="gap-1 bg-amber-600 hover:bg-amber-700"
                    onClick={() => revealQ.mutate(q.id)}>
                    <Award className="h-3 w-3" />正解発表
                  </Button>
                )}
                {/* 再出題 */}
                <Button size="sm" variant="ghost" className="gap-1 text-xs"
                  onClick={() => activateQ.mutate(q.id)}>
                  <Play className="h-3 w-3" />再出題
                </Button>
              </div>
            </div>
          ))}

          {/* 未実施の問題一覧 */}
          {questions?.filter((q: any) => q.status === 'draft').map((q: any) => (
            <div key={q.id} className="flex items-center gap-3 p-3 bg-muted/40 border rounded-xl">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <Badge variant="outline" className="text-[10px]">{q.type === 'quiz' ? 'クイズ' : 'アンケート'}</Badge>
                </div>
                <p className="text-sm font-medium truncate">{getQuestionText(q)}</p>
              </div>
              <Button size="sm" className="shrink-0 gap-1" onClick={() => activateQ.mutate(q.id)}>
                <Play className="h-3 w-3" />出題
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* ════ クイックリンク ════ */}
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
