import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Radio, Square, Users, Eye, QrCode, Copy, BarChart3 } from 'lucide-react';
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

  if (!eventData) return <div className="p-8 text-center text-muted-foreground">読み込み中...</div>;

  const stamps = eventData.stamps || [];
  const audienceUrl = `${window.location.origin}/interactive/audience/${id}`;

  // Total stamps from stats + live buffer
  const getTotal = (stampId: string) => {
    const dbTotal = statsData?.stamps?.find((s: any) => s.id === stampId)?.total || 0;
    return Number(dbTotal) + (stampCounts[stampId] || 0);
  };

  const grandTotal = stamps.reduce((sum: number, s: any) => sum + getTotal(s.id), 0);

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-6">
      {/* Status Bar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Badge variant={eventData.status === 'live' ? 'default' : 'secondary'} className="text-base px-3 py-1">
            {eventData.status === 'live' ? (
              <><Radio className="h-4 w-4 mr-1 animate-pulse" />LIVE</>
            ) : eventData.status}
          </Badge>
          <h1 className="heading-page text-xl">{eventData.title}</h1>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1 text-sm">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500' : 'bg-red-500'}`} />
            {isConnected ? 'Socket接続中' : '切断'}
          </div>
          {eventData.status === 'live' && (
            <Button variant="destructive" size="sm" onClick={handleStop}>
              <Square className="h-4 w-4 mr-1" />終了
            </Button>
          )}
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto text-primary mb-1" />
            <div className="text-3xl font-bold">{connectionCount}</div>
            <div className="text-xs text-muted-foreground">接続中</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <BarChart3 className="h-6 w-6 mx-auto text-primary mb-1" />
            <div className="text-3xl font-bold">{grandTotal.toLocaleString()}</div>
            <div className="text-xs text-muted-foreground">総スタンプ数</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <Users className="h-6 w-6 mx-auto text-primary mb-1" />
            <div className="text-3xl font-bold">{statsData?.sessions?.total || 0}</div>
            <div className="text-xs text-muted-foreground">累計参加者</div>
          </CardContent>
        </Card>
      </div>

      {/* Stamp Counters */}
      <Card>
        <CardHeader><CardTitle>リアルタイムスタンプ</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {stamps.map((stamp: any) => {
              const total = getTotal(stamp.id);
              const maxTotal = Math.max(...stamps.map((s: any) => getTotal(s.id)), 1);
              const pct = Math.round((total / maxTotal) * 100);

              return (
                <div key={stamp.id} className="relative p-4 rounded-lg border overflow-hidden">
                  {/* Background bar */}
                  <div
                    className="absolute inset-0 opacity-10 transition-all duration-300"
                    style={{ background: stamp.color, width: `${pct}%` }}
                  />
                  <div className="relative z-10 text-center">
                    <div className="text-3xl mb-1">{stamp.emoji}</div>
                    <div className="text-2xl font-bold">{total.toLocaleString()}</div>
                    <div className="text-xs text-muted-foreground">{stamp.label}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Links */}
      <div className="flex gap-3">
        <Button variant="outline" onClick={() => navigator.clipboard.writeText(audienceUrl)}>
          <QrCode className="h-4 w-4 mr-1" /><Copy className="h-3 w-3 mr-1" />視聴者URLをコピー
        </Button>
        <Button variant="outline" onClick={() => window.open(`/interactive/overlay/${id}`, '_blank', 'noopener,noreferrer')}>
          <Eye className="h-4 w-4 mr-1" />オーバーレイを開く
        </Button>
        <Button variant="outline" onClick={() => window.open(`/interactive/audience/${id}`, '_blank', 'noopener,noreferrer')}>
          視聴者プレビュー
        </Button>
      </div>
    </div>
  );
}
