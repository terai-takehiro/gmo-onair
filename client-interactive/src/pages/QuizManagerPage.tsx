import { useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Plus, Play, Square, Trash2, Upload, Download, BarChart3, Check, X } from 'lucide-react';
import api from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

const TYPE_LABELS: Record<string, string> = { quiz: 'クイズ', survey: 'アンケート' };
const STATUS_LABELS: Record<string, string> = { draft: '未開始', active: '回答中', closed: '終了' };
const STATUS_COLORS: Record<string, string> = { draft: 'bg-slate-100 text-slate-700', active: 'bg-green-100 text-green-700', closed: 'bg-zinc-100 text-zinc-500' };

export default function QuizManagerPage() {
  const { id: eventId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newType, setNewType] = useState<'quiz' | 'survey'>('quiz');
  const [newQuestion, setNewQuestion] = useState('');
  const [newChoices, setNewChoices] = useState(['', '', '', '']);
  const [newCorrect, setNewCorrect] = useState(0);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const { data: questions, isLoading } = useQuery({
    queryKey: ['quiz-questions', eventId],
    queryFn: async () => (await api.get(`/interactive/events/${eventId}/questions`)).data.data,
    enabled: !!eventId,
  });

  const createQ = useMutation({
    mutationFn: async () => {
      const choices = newChoices.filter(c => c.trim());
      await api.post(`/interactive/events/${eventId}/questions`, {
        type: newType,
        correct_index: newType === 'quiz' ? newCorrect : null,
        texts: [{ language_code: 'ja', question_text: newQuestion, choices }],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quiz-questions', eventId] });
      setShowCreate(false);
      setNewQuestion('');
      setNewChoices(['', '', '', '']);
      setNewCorrect(0);
    },
  });

  const deleteQ = useMutation({
    mutationFn: (qId: string) => api.delete(`/interactive/questions/${qId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', eventId] }),
  });

  const activateQ = useMutation({
    mutationFn: (qId: string) => api.post(`/interactive/questions/${qId}/activate`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', eventId] }),
  });

  const closeQ = useMutation({
    mutationFn: (qId: string) => api.post(`/interactive/questions/${qId}/close`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['quiz-questions', eventId] }),
  });

  // Excel import (JSON format from parsed CSV/XLSX)
  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    try {
      const lines = text.split('\n').filter(l => l.trim());
      const header = lines[0].split(',');
      const questions = lines.slice(1).map(line => {
        const cols = line.split(',').map(c => c.replace(/^"|"$/g, '').trim());
        const type = cols[0] === 'survey' ? 'survey' : 'quiz';
        const questionText = cols[1] || '';
        const choices = cols.slice(2).filter(c => c && c !== '-');
        const correctIdx = type === 'quiz' ? parseInt(cols[cols.length - 1]) || 0 : null;
        return {
          type,
          correct_index: correctIdx,
          texts: [{ language_code: 'ja', question_text: questionText, choices: type === 'quiz' ? choices.slice(0, -1) : choices }],
        };
      });
      await api.post(`/interactive/events/${eventId}/questions/import`, { questions });
      queryClient.invalidateQueries({ queryKey: ['quiz-questions', eventId] });
      alert(`${questions.length}問をインポートしました`);
    } catch (err) {
      alert('インポートに失敗しました。CSV形式を確認してください。');
    }
    e.target.value = '';
  };

  return (
    <div className="max-w-4xl mx-auto px-3 sm:p-4 py-4 space-y-4 sm:space-y-6 pb-12">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => navigate(`/event/${eventId}`)}>
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h1 className="text-xl font-semibold truncate">クイズ / アンケート管理</h1>
          <p className="text-sm text-muted-foreground">{questions?.length || 0}問</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => fileRef.current?.click()}>
            <Upload className="h-4 w-4 mr-1" />CSV
          </Button>
          <input ref={fileRef} type="file" accept=".csv" className="hidden" onChange={handleImport} />
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4 mr-1" />追加
          </Button>
        </div>
      </div>

      {/* Create form */}
      {showCreate && (
        <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex gap-2">
              <select value={newType} onChange={e => setNewType(e.target.value as any)} className="border rounded-lg px-3 py-1.5 text-sm">
                <option value="quiz">クイズ</option>
                <option value="survey">アンケート</option>
              </select>
              <Button variant="ghost" size="sm" onClick={() => setShowCreate(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Input placeholder="問題文を入力..." value={newQuestion} onChange={e => setNewQuestion(e.target.value)} />
            <div className="space-y-2">
              <p className="text-xs text-muted-foreground">選択肢 (空欄は無視)</p>
              {newChoices.map((c, i) => (
                <div key={i} className="flex items-center gap-2">
                  {newType === 'quiz' && (
                    <button
                      onClick={() => setNewCorrect(i)}
                      className={`w-6 h-6 rounded-full border-2 flex items-center justify-center text-xs shrink-0 ${
                        newCorrect === i ? 'border-green-500 bg-green-500 text-white' : 'border-zinc-300'
                      }`}
                    >
                      {newCorrect === i && <Check className="h-3 w-3" />}
                    </button>
                  )}
                  <Input
                    placeholder={`選択肢 ${i + 1}`}
                    value={c}
                    onChange={e => { const arr = [...newChoices]; arr[i] = e.target.value; setNewChoices(arr); }}
                    className="h-9"
                  />
                </div>
              ))}
              <Button variant="ghost" size="sm" onClick={() => setNewChoices([...newChoices, ''])} className="text-xs">
                <Plus className="h-3 w-3 mr-1" />選択肢追加
              </Button>
            </div>
            <Button onClick={() => createQ.mutate()} disabled={!newQuestion.trim() || createQ.isPending} className="w-full">
              問題を作成
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Question list */}
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : questions?.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <BarChart3 className="h-12 w-12 mx-auto mb-3 opacity-30" />
          <p>問題がありません</p>
          <p className="text-xs mt-1">「追加」または「CSV」から問題を登録してください</p>
        </div>
      ) : (
        <div className="space-y-3">
          {questions?.map((q: any, idx: number) => {
            const texts = q.texts || [];
            const jaText = texts.find((t: any) => t.language_code === 'ja') || texts[0];
            const choices = typeof jaText?.choices === 'string' ? JSON.parse(jaText.choices) : (jaText?.choices || []);
            const isExpanded = expandedId === q.id;

            return (
              <Card key={q.id} className="overflow-hidden">
                <div
                  className="flex items-center gap-3 p-3 sm:p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                  onClick={() => setExpandedId(isExpanded ? null : q.id)}
                >
                  <span className="text-sm font-bold text-muted-foreground w-6 text-center shrink-0">Q{idx + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{jaText?.question_text || '(テキストなし)'}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <Badge variant="outline" className="text-xs">{TYPE_LABELS[q.type] || q.type}</Badge>
                      <Badge className={`text-xs ${STATUS_COLORS[q.status]}`}>{STATUS_LABELS[q.status]}</Badge>
                      <span className="text-xs text-muted-foreground">{q.answer_count || 0}回答</span>
                    </div>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    {q.status === 'draft' && (
                      <Button size="sm" variant="default" className="h-8 gap-1 text-xs" onClick={e => { e.stopPropagation(); activateQ.mutate(q.id); }}>
                        <Play className="h-3 w-3" />開始
                      </Button>
                    )}
                    {q.status === 'active' && (
                      <Button size="sm" variant="destructive" className="h-8 gap-1 text-xs" onClick={e => { e.stopPropagation(); closeQ.mutate(q.id); }}>
                        <Square className="h-3 w-3" />終了
                      </Button>
                    )}
                    {q.status === 'closed' && (
                      <Button size="sm" variant="outline" className="h-8 gap-1 text-xs" onClick={e => {
                        e.stopPropagation();
                        window.open(`/api/v1/internal/interactive/questions/${q.id}/results/json`, '_blank');
                      }}>
                        <Download className="h-3 w-3" />JSON
                      </Button>
                    )}
                  </div>
                </div>

                {/* Expanded: choices + results */}
                {isExpanded && (
                  <CardContent className="pt-0 pb-4 px-4 space-y-3 border-t">
                    <div className="grid gap-2 mt-3">
                      {choices.map((choice: string, ci: number) => (
                        <div key={ci} className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm ${
                          q.type === 'quiz' && q.correct_index === ci ? 'border-green-400 bg-green-50' : ''
                        }`}>
                          <span className="font-bold text-muted-foreground w-6">{String.fromCharCode(65 + ci)}</span>
                          <span className="flex-1">{choice}</span>
                          {q.type === 'quiz' && q.correct_index === ci && (
                            <Badge className="bg-green-500 text-white text-xs">正解</Badge>
                          )}
                        </div>
                      ))}
                    </div>

                    {/* Multi-language texts */}
                    {texts.length > 1 && (
                      <div className="space-y-1">
                        <p className="text-xs font-semibold text-muted-foreground">他の言語:</p>
                        {texts.filter((t: any) => t.language_code !== 'ja').map((t: any) => (
                          <p key={t.language_code} className="text-xs text-muted-foreground">
                            [{t.language_code}] {t.question_text}
                          </p>
                        ))}
                      </div>
                    )}

                    <div className="flex gap-2 pt-2">
                      <Button variant="ghost" size="sm" className="text-xs text-destructive" onClick={() => {
                        if (confirm('この問題を削除しますか？')) deleteQ.mutate(q.id);
                      }}>
                        <Trash2 className="h-3 w-3 mr-1" />削除
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
