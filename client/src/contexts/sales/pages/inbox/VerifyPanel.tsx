/**
 * 受付の中央「確かめる」(v4 ②)
 *
 * 届いたネタ案件そのものと、**案件にするために聞かないといけないこと**、
 * その**聞き方の下書き**を出します。
 *
 * ── 下書きは AI ではありません ──────────────────────────────
 *
 * 入っていない項目から機械的に組み立てています (`ask.ts` の冒頭に理由)。
 * **「AIが書きました」と嘘を書かない** — 書いてしまうと、直しても AI 側に
 * 何も返らないのに「学習しているはず」と思われます。
 */
import { useMemo, useState } from 'react';
import { Mail, Phone, Copy, HelpCircle, Sparkles, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { notifySuccess } from '@gmo-onair/shared/src/client/notify';
import { asksFor, draftText, type IntakeProject, type AskMode } from './ask';

const MODES: { key: AskMode; label: string; icon: typeof Mail }[] = [
  { key: 'mail', label: 'メール', icon: Mail },
  { key: 'phone', label: '電話', icon: Phone },
];

export function VerifyPanel({ project, senderName }: { project: IntakeProject; senderName: string }) {
  const asks = useMemo(() => asksFor(project), [project]);
  // 既定は**全部チェック**。足りない項目は聞くのが既定で、外すのは例外
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [mode, setMode] = useState<AskMode>('mail');

  const isOn = (key: string) => checked[key] ?? true;
  const picked = asks.filter((a) => isOn(a.key));
  const draft = draftText(project, picked, mode, senderName);

  return (
    <div className="flex flex-col gap-3.5">
      {/* ── 届いた中身 ── */}
      <section className="rounded-card border border-border bg-card p-4 lg:px-5">
        <div className="flex items-start gap-3">
          <span className="rounded-control flex h-8 w-8 shrink-0 items-center justify-center bg-primary-surface">
            <Sparkles className="h-4 w-4 text-primary" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-cardtitle [overflow-wrap:anywhere]">{project.name}</h2>
            <p className="text-note mt-0.5 text-muted-foreground">
              {/*
                **`ai_requested_by`（AI に指示した人）は画面に出しません。**
                AI が名簿と突き合わせずメール本文から書く自由記述で、実際に
                「寺井 赳博」さんが「寺井武大」として記録されていました。
                誰が作ったかは「AI が起こしました」で足ります
                （`check-ui-tokens` の `ai-person-name` が止めます）。
              */}
              {[
                project.customer_name,
                project.source_channel ? `入口: ${project.source_channel}` : null,
                project.is_ai_created ? 'AI が起こしました' : null,
              ].filter(Boolean).join(' ・ ') || '（お客様 未設定）'}
            </p>
          </div>
        </div>
        {project.notes ? (
          <p className="text-sub mt-3 whitespace-pre-wrap border-t border-border-subtle pt-3 text-secondary-foreground">
            {project.notes}
          </p>
        ) : (
          <p className="text-sub mt-3 border-t border-border-subtle pt-3 text-muted-foreground">
            経緯が書かれていません。聞いたことは備考に足しておくと、次に開いた人が同じことを聞かずに済みます。
          </p>
        )}
      </section>

      {/* ── 聞かないといけないこと ── */}
      <section className="rounded-card border border-primary-border bg-card p-4 lg:px-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-cardtitle flex items-center gap-2">
            <HelpCircle className="h-4 w-4 text-primary" aria-hidden="true" />
            案件にするために、聞かないといけないこと
          </h2>
          <span className={`font-number rounded-chip inline-flex h-5 min-w-[20px] items-center justify-center px-1.5 text-sub-sm font-bold ${
            asks.length > 0 ? 'bg-destructive-surface text-destructive' : 'bg-success-surface text-success'
          }`}>
            {asks.length}
          </span>
          <div className="flex-1" />
          <p className="text-note text-muted-foreground">チェックしたものが下の文面に入ります</p>
        </div>

        {asks.length === 0 ? (
          <p className="text-sub mt-3 flex items-center gap-2 text-success">
            <Check className="h-4 w-4" aria-hidden="true" />
            必要なことは揃っています。右の「案件にする」を押せます。
          </p>
        ) : (
          <ul className="mt-1">
            {asks.map((a) => (
              <li key={a.key} className="border-t border-border-subtle">
                {/*
                  **「なぜ聞くか」は質問の下に置く。** 横に並べると、
                  長い理由 (「日程が決まらないと部屋も機材も押さえられません」) が
                  縮まないまま質問側を潰し、**1文字ずつの縦書き**になる (実ブラウザで発見)。
                */}
                <label className="min-h-tap flex cursor-pointer items-start gap-3 py-2">
                  <input
                    type="checkbox"
                    checked={isOn(a.key)}
                    onChange={(e) => setChecked((c) => ({ ...c, [a.key]: e.target.checked }))}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[rgb(var(--primary))]"
                  />
                  <span className="min-w-0 flex-1">
                    <span className={`text-list block ${isOn(a.key) ? '' : 'text-muted-foreground line-through'}`}>
                      {a.q}
                    </span>
                    <span className="text-note block text-muted-foreground">{a.why}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* ── 聞き方の下書き ── */}
      <section className="rounded-card border border-border bg-card p-4 lg:px-5">
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <h2 className="text-cardtitle">聞き方の下書き</h2>
          <p className="text-note text-muted-foreground">
            決まった型から組み立てています（AI ではありません）。送るのは自分で
          </p>
          <div className="flex-1" />
          <div className="flex overflow-hidden rounded-control border border-border">
            {MODES.map((m) => {
              const Icon = m.icon;
              return (
                <button
                  key={m.key}
                  type="button"
                  onClick={() => setMode(m.key)}
                  className={`min-h-tap flex items-center gap-1.5 px-3 text-sub font-bold lg:min-h-[32px] ${
                    mode === m.key ? 'bg-primary-surface text-primary' : 'bg-card text-secondary-foreground'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />{m.label}
                </button>
              );
            })}
          </div>
        </div>

        <pre className="rounded-note text-sub mt-3 whitespace-pre-wrap border border-primary-border bg-primary-surface-weak p-3.5 font-sans leading-[1.9] text-foreground">
          {draft}
        </pre>

        <div className="mt-2.5 flex justify-end">
          <Button
            variant="outline"
            onClick={() => {
              navigator.clipboard.writeText(draft)
                .then(() => notifySuccess('文面をコピーしました'))
                // クリップボードは権限で落ちることがある。**黙って何もしない**が
                // いちばん困るので、落ちたことを伝える
                .catch(() => notifySuccess('コピーできませんでした。文面を選んでコピーしてください'));
            }}
          >
            <Copy className="mr-2 h-4 w-4" aria-hidden="true" />文面をコピー
          </Button>
        </div>
      </section>
    </div>
  );
}
