/**
 * 「進んだら聞く」（案件作成・PC とスマホで**共通**）
 *
 * ご担当 ／ 継続区分 ／ 実施日 ／ 来場人数 ／ 案件内容 ／ 予算 ／ リード経路 ／
 * 最初のタスク ／ メモ ／ 会場の案内。
 *
 * ── ここに置いたものは全部「あとから足せる」──────────────────
 *
 * 必須は上の5つだけなので、この枠は畳んであります。**畳んだものを
 * 押さずに登録できる**のが要点で、電話を切る前に入れ終わるのが目標です。
 *
 * ── 無観客のときは来場人数の欄ごと出さない ──────────────────
 *
 * 出しておいて 0 を入れさせると、「0 名だった」と「聞いていない」が
 * 見分けられなくなります。
 */
import { Lock, MapPin, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { INTAKE_CHANNEL_LABEL } from '../projectList/intake';
import { asksAttendees } from '../../classification';
import { RECURRENCE_LABEL } from './fields';
import { Field } from './Field';
import type { NewProjectForm } from './useNewProjectForm';

/** 「進んだら聞く」に並ぶ数。**来場人数は無観客のとき出ない**ので数も変わる */
export function moreFieldCount(audience: string): number {
  return asksAttendees(audience) ? 9 : 8;
}

export function MoreFields({ f }: { f: NewProjectForm }) {
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

      <Field label="継続区分" hint="レギュラーは「回」を持ちます（第1回・7月分…）">
        <Select value={v.recurrence} onValueChange={(x) => set('recurrence', x as 'single' | 'regular')}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(Object.keys(RECURRENCE_LABEL) as ('single' | 'regular')[]).map((k) => (
              <SelectItem key={k} value={k}>{RECURRENCE_LABEL[k]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {/* **実施日は「足す」で飛び日を何日でも。** 以前はスマホだけ足せなかった */}
      <Field label="実施日" full hint="未定のままでも登録できます。飛び日は「足す」で何日でも入れられます">
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
            <Plus className="mr-1 h-4 w-4" aria-hidden="true" />足す
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

      <Field label="予算" htmlFor="np-amount" hint="見積をつくると金額はそちらが正になります">
        <div className="flex items-center gap-2">
          <span className="text-sub shrink-0 text-muted-foreground">¥</span>
          <Input
            id="np-amount" type="number" min="0" inputMode="numeric"
            value={v.expected_amount}
            onChange={(e) => set('expected_amount', e.target.value)}
            placeholder="1500000"
          />
        </div>
      </Field>

      <Field
        label="リード経路"
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
    </div>
  );
}
