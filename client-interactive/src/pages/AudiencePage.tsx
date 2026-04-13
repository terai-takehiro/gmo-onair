import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { Sparkles, ExternalLink, X, Check } from 'lucide-react';
import { audienceApi } from '@/lib/api';
import { getSocket, disconnectSocket } from '@/lib/socket';

interface Stamp {
  id: string;
  label: string;
  emoji: string;
  color: string;
  animation: string;
  image_url?: string;
}

interface EventData {
  title: string;
  status: string;
  accepting?: boolean;
  stamps: Stamp[];
  youtube_url?: string;
  banner_url?: string;
  admin_comment?: string;
  survey_url?: string;
  waiting_message?: string;
  ended_message?: string;
}

interface MiniStamp {
  id: number;
  emoji: string;
  image_url?: string;
  x: number;
  y: number;
  offsetX: number;
}

function getYoutubeEmbedId(url: string): string | null {
  if (!url) return null;
  // Supports: youtube.com/watch?v=XXX, youtu.be/XXX, youtube.com/live/XXX, youtube.com/embed/XXX
  const m = url.match(/(?:v=|youtu\.be\/|\/live\/|\/embed\/)([A-Za-z0-9_-]{11})/);
  return m ? m[1] : null;
}

export default function AudiencePage() {
  const { eventId } = useParams();
  const [event, setEvent] = useState<EventData | null>(null);
  const [sessionToken, setSessionToken] = useState('');
  const [error, setError] = useState('');
  // Quiz state
  const [activeQuestion, setActiveQuestion] = useState<{ questionId: string; questionText: string; choices: string[]; type: string } | null>(null);
  const [answered, setAnswered] = useState(false);
  const [selectedChoice, setSelectedChoice] = useState<number | null>(null);
  const [questionResult, setQuestionResult] = useState<{ correctIndex?: number } | null>(null);
  const [questionResults, setQuestionResults] = useState<{ total: number; choices: { index: number; count: number; percent: number }[]; displayMode: string } | null>(null);
  // UI state
  const [pressAnimations, setPressAnimations] = useState<Record<string, boolean>>({});
  const [miniStamps, setMiniStamps] = useState<MiniStamp[]>([]);
  const [tapCount, setTapCount] = useState(0);
  const [showTapCounter, setShowTapCounter] = useState(false);
  const [commentDismissed, setCommentDismissed] = useState(false);
  const tapTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const miniIdRef = useRef(0);

  // Load event & join
  useEffect(() => {
    if (!eventId) return;
    const chParam = new URLSearchParams(window.location.search).get('ch');

    // Step 1: イベント情報取得
    audienceApi.get(`/events/${eventId}`, { params: chParam ? { ch: chParam } : {} })
      .then(r => {
        const data = r.data.data;
        setEvent({
          title: data.title,
          status: data.status,
          accepting: data.accepting,
          stamps: data.stamps || [],
          youtube_url: data.youtube_url,
          banner_url: data.banner_url,
          admin_comment: data.admin_comment,
          survey_url: data.survey_url,
          waiting_message: data.waiting_message,
          ended_message: data.ended_message,
        });
        // Step 2: セッション作成
        return audienceApi.post(`/events/${eventId}/join`, { channel_id: chParam || undefined });
      })
      .then(r => {
        setSessionToken(r.data.data.session_token);
      })
      .catch(err => {
        console.error('[audience] API error:', err.response?.status, err.response?.data, err.message);
        const msg = err.response?.data?.error?.message
          || err.response?.data?.message
          || `接続エラー (${err.response?.status || err.message || 'unknown'})`;
        setError(msg);
      });

    return () => { disconnectSocket(); };
  }, [eventId]);

  // Socket.IO
  useEffect(() => {
    if (!eventId || !sessionToken) return;
    const socket = getSocket(eventId, { sessionToken });

    socket.on('stamp:update', () => {
      // visual feedback handled locally
    });

    socket.on('event:status', (data: { status: string }) => {
      setEvent(prev => prev ? { ...prev, status: data.status } : prev);
    });

    // Quiz events
    socket.on('question:active', (data: { questionId: string; texts: any[] }) => {
      const lang = 'ja'; // TODO: detect from channel
      const t = data.texts?.find((t: any) => t.language_code === lang) || data.texts?.[0];
      const choices = typeof t?.choices === 'string' ? JSON.parse(t.choices) : (t?.choices || []);
      setActiveQuestion({ questionId: data.questionId, questionText: t?.question_text || '', choices, type: 'quiz' });
      setAnswered(false);
      setSelectedChoice(null);
      setQuestionResult(null);
      setQuestionResults(null);
    });

    // 締切（回答受付終了）
    socket.on('question:closed', () => {
      setAnswered(true); // 回答不可にする
    });

    // アンサーチェック / 集計結果（各選択肢の投票数）
    socket.on('question:results', (data: { results: any; displayMode: string }) => {
      setQuestionResults({ ...data.results, displayMode: data.displayMode });
    });

    // 正解発表（クイズのみ）
    socket.on('question:reveal', (data: { correctIndex: number }) => {
      setQuestionResult({ correctIndex: data.correctIndex });
    });

    // 画面から消す
    socket.on('question:dismiss', () => {
      setActiveQuestion(null);
      setAnswered(false);
      setSelectedChoice(null);
      setQuestionResult(null);
      setQuestionResults(null);
    });

    return () => { disconnectSocket(); };
  }, [eventId, sessionToken]);

  // Quiz answer handler
  const handleAnswer = async (choiceIndex: number) => {
    if (answered || !activeQuestion) return;
    setSelectedChoice(choiceIndex);
    setAnswered(true);
    try {
      await audienceApi.post(`/audience/questions/${activeQuestion.questionId}/answer`, {
        choice_index: choiceIndex,
        session_token: sessionToken,
      });
    } catch { /* already answered or closed */ }
  };

  // Mini stamp fly animation (from button position)
  const spawnMiniStamp = useCallback((stamp: Stamp, btnEl: HTMLElement) => {
    const rect = btnEl.getBoundingClientRect();
    const id = miniIdRef.current++;
    const mini: MiniStamp = {
      id,
      emoji: stamp.emoji,
      image_url: stamp.image_url,
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
      offsetX: -20 + Math.random() * 40,
    };
    setMiniStamps(prev => [...prev, mini].slice(-30));
    setTimeout(() => {
      setMiniStamps(prev => prev.filter(m => m.id !== id));
    }, 500);
  }, []);

  const handleStamp = useCallback((stamp: Stamp, e: React.MouseEvent<HTMLButtonElement> | React.TouchEvent<HTMLButtonElement>) => {
    if (!sessionToken || !event?.accepting) return;
    if (event.status !== 'live' && event.status !== 'rehearsal') return;

    const socket = getSocket(eventId!, { sessionToken });
    socket.emit('stamp', { stampId: stamp.id, count: 1 });

    setPressAnimations(prev => ({ ...prev, [stamp.id]: true }));
    setTimeout(() => setPressAnimations(prev => ({ ...prev, [stamp.id]: false })), 250);

    spawnMiniStamp(stamp, e.currentTarget);

    // Tap counter
    setTapCount(prev => prev + 1);
    setShowTapCounter(true);
    clearTimeout(tapTimerRef.current);
    tapTimerRef.current = setTimeout(() => setShowTapCounter(false), 2000);
  }, [sessionToken, event?.status, eventId, spawnMiniStamp]);

  // ── Error state ──
  if (error) {
    return (
      <div className="user-page flex items-center justify-center p-4">
        <div className="text-center">
          <p className="text-lg text-[var(--text-primary)]">{error}</p>
          <p className="text-sm text-[var(--text-muted)] mt-2">QRコードを再度読み取ってください</p>
        </div>
      </div>
    );
  }

  // ── Loading state ──
  if (!event) {
    return (
      <div className="user-page flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[var(--accent)]/30 border-t-[var(--accent)] rounded-full animate-spin" />
      </div>
    );
  }

  // ── Ended state ──
  if (event.status === 'ended') {
    return (
      <div className="user-page flex items-center justify-center p-4">
        <div className="text-center max-w-sm">
          <Sparkles className="h-12 w-12 mx-auto mb-4 text-[var(--es-accent)] opacity-40" />
          <h1 className="text-xl font-bold text-[var(--text-primary)] mb-3">{event.title}</h1>
          <p className="text-[var(--text-secondary)] text-base whitespace-pre-wrap">
            {event.ended_message || 'ご視聴ありがとうございました。'}
          </p>
          {event.survey_url && (
            <a
              href={event.survey_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 mt-6 px-6 py-2.5 rounded-full text-sm font-semibold text-white"
              style={{ backgroundColor: 'var(--es-accent)' }}
            >
              <ExternalLink className="h-4 w-4" />
              アンケートに回答する
            </a>
          )}
        </div>
      </div>
    );
  }

  const embedId = getYoutubeEmbedId(event.youtube_url || '');
  const stamps = event.stamps || [];
  const isLive = event.status === 'live' || event.status === 'rehearsal';
  const canStamp = isLive && event.accepting;

  return (
    <div className="user-page">
      {/* Mini stamp fly animations */}
      {miniStamps.map(m => (
        <div
          key={m.id}
          className="mini-stamp-effect"
          style={{
            left: m.x - 16,
            top: m.y - 16,
            ['--fly-x' as any]: `${m.offsetX}px`,
          }}
        >
          {m.image_url ? (
            <img src={m.image_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
          ) : (
            m.emoji
          )}
        </div>
      ))}

      {/* ── Thin header ── */}
      <header className="flex items-center gap-2 px-3 py-2 flex-shrink-0">
        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
          isLive ? 'bg-green-500' : 'bg-zinc-300'
        }`} />
        <span className="text-sm font-medium text-[var(--text-primary)] truncate flex-1">{event.title}</span>
        {isLive && (
          <span className="text-[10px] font-bold text-red-500 tracking-wider">LIVE</span>
        )}
      </header>

      {/* ── YouTube embed — main content (hide in draft) ── */}
      {embedId && isLive && (
        <div className="audience-youtube">
          <div className="youtube-wrapper">
            <iframe
              src={`https://www.youtube.com/embed/${embedId}?autoplay=1&mute=1`}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      )}

      {/* ── Banner (if no YouTube) ── */}
      {!embedId && event.banner_url && isLive && (
        <div className="audience-youtube">
          <img src={event.banner_url} alt="バナー" className="w-full max-h-[240px] object-cover" style={{ borderRadius: 'inherit' }} />
        </div>
      )}

      {/* ── Scrollable content area ── */}
      <div className="audience-content">
        {/* Admin comment — dismissible banner */}
        {event.admin_comment && !commentDismissed && (
          <div className="comment-banner">
            <p className="whitespace-pre-wrap">{event.admin_comment}</p>
            <button className="comment-banner-close" onClick={() => setCommentDismissed(true)}>
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}

        {/* Status messages */}
        {isLive && canStamp && (
          <p className="text-center text-xs text-[var(--text-muted)] py-2">
            スタンプをタップして送信しよう!
          </p>
        )}
        {isLive && !event.accepting && (
          <div className="text-center py-4">
            <div className="text-xl mb-1">⏸</div>
            <p className="text-sm text-[var(--text-secondary)]">スタンプ受付を一時停止中</p>
          </div>
        )}
        {event.status === 'draft' && (
          <div className="flex-1 flex items-center justify-center py-8">
            <div className="text-center max-w-sm">
              <div className="text-4xl mb-3">⏳</div>
              <p className="text-base text-[var(--text-secondary)] whitespace-pre-wrap">
                {event.waiting_message || 'まもなく配信を開始します。\nしばらくお待ちください。'}
              </p>
            </div>
          </div>
        )}

        {/* Footer text in content area */}
        <div className="text-center py-4 text-[10px] text-[var(--text-muted)] tracking-widest opacity-40 uppercase">
          GMO GLOBAL STUDIO
        </div>
      </div>

      {/* ── Quiz bottom sheet ── */}
      {activeQuestion && (
        <div className="quiz-bottom-sheet">
          <div className="quiz-drag-handle" />
          <div className="space-y-3 pb-2">
            <p className="text-sm font-bold text-center">{activeQuestion.questionText}</p>

            <div className="space-y-2">
              {activeQuestion.choices.map((choice, ci) => {
                const isSelected = selectedChoice === ci;
                const isCorrect = questionResult?.correctIndex === ci;
                const isWrong = questionResult && isSelected && questionResult.correctIndex !== ci;
                const resultData = questionResults?.choices?.find((c: any) => c.index === ci);

                // 正解発表済み
                if (questionResult) {
                  return (
                    <div key={ci} className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm transition-all ${
                      isCorrect ? 'border-green-500 bg-green-50 text-green-800' :
                      isWrong ? 'border-red-400 bg-red-50 text-red-700' :
                      'border-zinc-100 text-zinc-400'
                    }`}>
                      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isCorrect ? 'bg-green-500 text-white' : isWrong ? 'bg-red-400 text-white' : 'bg-zinc-100'
                      }`}>
                        {isCorrect ? <Check className="h-3 w-3" /> : String.fromCharCode(65 + ci)}
                      </span>
                      <span className="flex-1">{choice}</span>
                      {resultData && (
                        <span className="text-xs font-bold tabular-nums">
                          {questionResults?.displayMode === 'count' ? `${resultData.count}票` : `${resultData.percent}%`}
                        </span>
                      )}
                    </div>
                  );
                }

                // 集計結果表示（正解未発表）
                if (questionResults) {
                  const maxCount = Math.max(...(questionResults.choices?.map((c: any) => c.count) || [1]), 1);
                  const barPct = resultData ? Math.round((resultData.count / maxCount) * 100) : 0;
                  return (
                    <div key={ci} className={`relative flex items-center gap-2 px-3 py-2 rounded-xl border-2 text-sm overflow-hidden ${
                      isSelected ? 'border-primary' : 'border-zinc-200'
                    }`}>
                      <div className="absolute inset-y-0 left-0 bg-primary/10 transition-all duration-700" style={{ width: `${barPct}%` }} />
                      <span className={`relative flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        isSelected ? 'bg-primary text-white' : 'bg-zinc-100'
                      }`}>
                        {String.fromCharCode(65 + ci)}
                      </span>
                      <span className="relative flex-1">{choice}</span>
                      <span className="relative text-xs font-bold tabular-nums">
                        {questionResults.displayMode === 'count' ? `${resultData?.count || 0}票` : `${resultData?.percent || 0}%`}
                      </span>
                    </div>
                  );
                }

                // 回答フェーズ
                return (
                  <button
                    key={ci}
                    onClick={() => handleAnswer(ci)}
                    disabled={answered}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl border-2 text-left text-sm font-medium transition-all ${
                      isSelected ? 'border-primary bg-primary/10 text-primary' :
                      'border-zinc-200 hover:border-primary/40 active:scale-[0.98]'
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                      isSelected ? 'bg-primary text-white' : 'bg-zinc-100'
                    }`}>
                      {String.fromCharCode(65 + ci)}
                    </span>
                    <span className="flex-1">{choice}</span>
                  </button>
                );
              })}
            </div>

            {/* ステータスメッセージ */}
            {answered && !questionResults && !questionResult && (
              <p className="text-center text-xs text-[var(--text-muted)]">回答済み — 結果をお待ちください</p>
            )}
            {questionResult && (
              <p className="text-center text-xs font-bold text-green-600">
                {selectedChoice === questionResult.correctIndex ? '🎉 正解！' : '😢 不正解...'}
              </p>
            )}
            {questionResults && !questionResult && (
              <p className="text-center text-xs font-semibold text-primary">集計結果</p>
            )}
          </div>
        </div>
      )}

      {/* ── Survey FAB ── */}
      {event.survey_url && isLive && (
        <a
          href={event.survey_url}
          target="_blank"
          rel="noopener noreferrer"
          className="survey-fab"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          アンケート
        </a>
      )}

      {/* ── Tap counter ── */}
      {showTapCounter && (
        <div className="tap-counter">
          <span className="tap-count">{tapCount}</span>
        </div>
      )}

      {/* ── Fixed bottom stamp bar ── */}
      <div className="audience-stamp-bar">
        {stamps.map(stamp => (
          <button
            key={stamp.id}
            className={`stamp-bar-btn ${pressAnimations[stamp.id] ? 'stamp-pop' : ''}`}
            onClick={(e) => handleStamp(stamp, e)}
            disabled={!canStamp}
          >
            {stamp.image_url ? (
              <img src={stamp.image_url} alt={stamp.label} className="stamp-img" />
            ) : (
              <span className="stamp-emoji">{stamp.emoji}</span>
            )}
            <span className="stamp-label">{stamp.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
