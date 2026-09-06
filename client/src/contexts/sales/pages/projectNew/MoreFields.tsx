/**
 * 「進んだら聞く」（**案件作成と案件を直す・PC とスマホで共通**）
 *
 * 作る画面 … ご担当 ／ 継続区分 ／ 実施日 ／ 来場人数 ／ 案件内容 ／ 予算 ／
 *            リード経路 ／ 最初のタスク ／ メモ ／ 会場の案内
 * 直す画面 … ご担当 ／ 継続区分 ／ 来場人数 ／ 案件内容 ／ 予算 ／
 *            リード経路 ／ グループ区分
 *
 * ── ここに置いたものは全部「あとから足せる」──────────────────
 *
 * 必須は上の5つだけなので、この枠は畳んであります。**畳んだものを
 * 押さずに登録できる**のが要点で、電話を切る前に入れ終わるのが目標です。
 * （直す画面では既に値が入っているので**開いた状態で出します**。
 *  枠と項目は同じで、初めから開いているかどうかだけが違います。）
 *
 * ── 無観客のときは来場人数の欄ごと出さない ──────────────────
 *
 * 出しておいて 0 を入れさせると、「0 名だった」と「聞いていない」が
 * 見分けられなくなります。
 *
 * ── 直す画面で出し入れするもの（`mode="edit"`）────────────────
 *
 *  ・**実施日を出さない** … 直す画面は「スタジオの日程」（本番日・リハーサル・
 *    飛び日）が `project_dates` の唯一のもとです。ここにも日付の欄を置くと
 *    **同じ列を2か所から全置換**することになり、片方で足した日が消えます
 *  ・**最初のタスクを出さない** … タスクは案件詳細のタスクタブが持ちます。
 *    直すたびに同じタスクがもう1件できます
 *  ・**メモを出さない** … メモはやり取り（`activity_logs`）の1件で、
 *    `projects.notes` の列はありません。開くたび空欄が出て、
 *    保存するたび同じ本文が1件ずつ増えます（書くのはやり取りタブ）
 *  ・**会場の案内を出さない** … 直す画面には本物の部屋の欄と予約の一覧があります
 *  ・**グループ区分を出す（読むだけ）** … 見積の単価（定価 / グループ内価格）が
 *    この値で決まるので、案件を直しに来た人がここで確かめられるようにします。
 *    **選べません** — 決めるのは取引先マスターの「グループ会社」の印です（migration 192）
 */
import { Lock, MapPin, Plus, X } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INTAKE_CHANNEL_LABEL } from '../projectList/intake';
import { asksAttendees } from '../../classification';
import { RECURRENCE_LABEL, type FieldsMode, type ProjectFieldsState } from './fields';
import { Field } from './Field';

export function MoreFields({
  f, mode = 'create', amountExtra,
}: {
  f: ProjectFieldsState;
  mode?: FieldsMode;
  /**
   * 予算の欄のすぐ下に置くもの。直す画面が料金シミュレーションと
   * AI の見積下書きを差し込みます — **金額の欄から離すと、
   * 「確定する」を押した結果がどこに入ったのか分かりません**。
   */
  amountExtra?: ReactNode;
}) {
  const { v, set } = f;
  const [newDate, setNewDate] = useState('');
  const addDate = () => {
    if (!newDate || v.dates.includes(newDate)) return;
    set('dates', [...v.dates, newDate].sort());
    setNewDate('');
  };

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Field label="ご担当" htmlFor="np-contact" hint="この案件の窓口。会社の代表窓口とは別に持ちます">
        <Input id="np-contact" value={v.contact_name} onChange={(e) => set('contact_name', e.target.value)} placeholder="宮田 里香 様（広報部）" />
      </Field>

      <Field label="回のある案件か" hint="レギュラーは「回」を持ちます（第1回・7月分…）">
        <Select value={v.recurrence} onValueChange={(x) => set('recurrence', x as 'single' | 'regular')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RECURRENCE_LABEL) as ('single' | 'regular')[]).map((k) => (
              <SelectItem key={k} value={k}>{RECURRENCE_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* **実施日は「足す」で飛び日を何日でも。** 以前はスマホだけ足せなかった。
          直す画面では出しません（「スタジオの日程」が同じ列を持つ。冒頭の理由） */}
      {mode === 'create' && (
      <Field label="実施日" full hint="未定のままでも登録できます。飛び日は「追加」で何日でも入れられます">
        <div className="flex flex-wrap items-center gap-2">
          <Input
            type="date"
            value={newDate}
            onChange={(e) => setNewDate(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addDate(); } }}
            className="w-auto"
            aria-label="実施日"
          />
          <Button variant="outline" onClick={addDate} disabled={!newDate}>
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />追加
          </Button>
          {v.dates.map((d) => (
            <span key={d} className="rounded-chip flex items-center gap-1 bg-muted px-2.5 py-1 text-sub">
              <span className="font-number">{d}</span>
              <button
                type="button"
                onClick={() => set('dates', v.dates.filter((x) => x !== d))}
                aria-label={`${d} を外す`}
                className="text-muted-foreground hover:text-destructive"
              >
                <X className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            </span>
          ))}
        </div>
      </Field>
      )}

      {asksAttendees(v.audience) && (
        <Field label="来場人数" htmlFor="np-scale" hint="何名か。数で持つので、あとで規模別に数えられます">
          <div className="flex items-center gap-2">
            <Input
              id="np-scale" type="number" min="0" inputMode="numeric"
              value={v.attendee_count}
              onChange={(e) => set('attendee_count', e.target.value)}
              placeholder="150"
            />
            <span className="text-sub shrink-0 text-muted-foreground">名</span>
          </div>
        </Field>
      )}

      <Field label="案件内容" htmlFor="np-goal" hint="お客様の言葉のままで大丈夫です">
        <Input id="np-goal" value={v.goal} onChange={(e) => set('goal', e.target.value)} placeholder="式典のライブ配信と収録" />
      </Field>

      <Field label="予算" htmlFor="np-amount" hint="見積を作成すると金額はそちらが正になります">
        <div className="flex items-center gap-2">
          <span className="text-sub shrink-0 text-muted-foreground">¥</span>
          <Input
            id="np-amount" type="number" min="0" inputMode="numeric"
            value={v.expected_amount}
            onChange={(e) => set('expected_amount', e.target.value)}
            placeholder="1500000"
          />
        </div>
        {amountExtra}
      </Field>

      <Field
        label="どこから来た話か"
        hint={f.isGroup
          ? '取引先マスターでグループ会社になっているので、選べません'
          : 'あとで集計します。分からなければ空のままで大丈夫です'}
      >
        {f.isGroup ? (
          <p className="min-h-tap flex items-center gap-2 rounded-control border border-ai-border bg-ai-surface px-3 text-sub font-bold text-ai lg:min-h-[40px]">
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />グループ案件
          </p>
        ) : (
          <Select value={v.intake_channel || 'none'} onValueChange={(x) => set('intake_channel', x === 'none' ? '' : x)}>
            <SelectTrigger><SelectValue placeholder="選ぶ" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="none">分からない</SelectItem>
              {Object.entries(INTAKE_CHANNEL_LABEL)
                // 「グループ案件」は人が選ぶものではない（マスターが決める）
                .filter(([k]) => k !== 'group')
                .map(([k, label]) => (
                  <SelectItem key={k} value={k}>{label}</SelectItem>
                ))}
            </SelectContent>
          </Select>
        )}
      </Field>

      {/*
        **グループ会社価格（旧「グループ区分」）は選ぶ欄をやめました**（ご指示・migration 192）。

        見積の単価（定価 / グループ会社価格）がこの値で決まるのに、**選び忘れても
        画面には何も出ません** — グループ会社の案件に定価が並んでも、気づくのは
        見積を送ったあとです。決めるのは**取引先マスターのチェックボックス1か所**に
        して、ここはその結果を出すだけにしました。

        **消さずに出しておく**のは、見積の単価がどちらで出るかを、案件を直しに来た
        人がここで確かめられるようにするためです（欄ごと消すと、なぜグループ会社価格に
        ならないのかを調べる取っかかりがどこにも無くなります）。
        直したいときの行き先も書いておきます。
      */}
      {mode === 'edit' && (
        <Field
          label="グループ会社価格"
          hint="取引先マスターの「グループ会社」の印から決まります（案件ごとには選べません）"
        >
          <p className={`min-h-tap flex items-center gap-2 rounded-control border px-3 text-sub font-bold lg:min-h-[40px] ${
            f.isGroup
              ? 'border-ai-border bg-ai-surface text-ai'
              : 'border-border bg-muted/40 text-secondary-foreground'
          }`}>
            <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
            {f.isGroup ? 'グループ会社価格' : '定価'}
          </p>
          <p className="text-note mt-1 text-muted-foreground">
            {f.isGroup
              ? '見積の単価はグループ会社価格になります。'
              : '見積の単価は定価になります。'}
            違うときは
            <Link to="/sales/companies" className="mx-0.5 -my-[13px] inline-block py-[13px] text-primary underline">
              取引先マスター
            </Link>
            でこのお客様の印を直してください。
          </p>
        </Field>
      )}

      {/* 以下は作るときだけ。直す画面での理由は冒頭に書いてあります */}
      {mode === 'create' && (
      <>
      <Field label="最初のタスク" full hint="入れなくても大丈夫です。期限は日付だけ入れると 18:00 になります">
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Input
            value={v.first_task_title}
            onChange={(e) => set('first_task_title', e.target.value)}
            placeholder="見積を送る"
          />
          <Input
            type="date"
            value={v.first_task_due}
            onChange={(e) => set('first_task_due', e.target.value)}
            aria-label="最初のタスクの期限"
          />
        </div>
      </Field>

      {/*
        メモは**やり取りの1件**として残ります（migration 184）。案件の列ではありません。
        書いた本人と日付が付いて、あとから足したメモや電話の記録と同じ時系列に並びます。
        **そう書いてあるのは、どこに残るのかが分からないと書きにくいから**です
      */}
      <Field label="メモ" full htmlFor="np-notes" hint="やり取りに「メモ」として残ります">
        <Textarea id="np-notes" rows={3} value={v.notes} onChange={(e) => set('notes', e.target.value)} placeholder="会場はこれから探すとのこと。" />
      </Field>

      {/* 会場・スタジオ。**ここでは押さえない** — 空きの確認が要る操作なので */}
      <div className="sm:col-span-2">
        <p className="rounded-note flex items-start gap-2 border border-primary-border bg-primary-surface-weak px-3 py-2 text-sub text-secondary-foreground">
          <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          <span>
            部屋はここでは押さえません（空きの確認が要るためです）。
            つくったあと<strong className="font-bold">案件詳細の「予約」</strong>か
            <strong className="font-bold">カレンダー</strong>から押さえてください。
          </span>
        </p>
      </div>
      </>
      )}
    </div>
  );
}
