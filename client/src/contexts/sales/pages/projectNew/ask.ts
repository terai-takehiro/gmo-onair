/**
 * 「案件にする前に聞かないといけないこと」と「聞き方の下書き」
 *
 * ── ここは AI ではありません ────────────────────────────────
 *
 * モックはこの2つを AI が書く前提で描いています。ここでは**入っていない項目から
 * 機械的に組み立てて**います。理由は2つ:
 *
 *  ① **同じ入力なら必ず同じ結果になる**ので、下書きが変なときに原因が追える
 *  ② AI を1つ足すたびに、会社方針「AI を使い捨てにしない」の5条件
 *     （記録・修正差分・成果・還流・レビュー）を満たす経路が要る。
 *     **文面を自然にするためだけに増やすものではない**
 *
 * AI に書かせるなら、`ai_outputs` に下書き全文を残し、送る前に人が直した差分を
 * `ai_corrections` に入れる経路を同時に作ります（器は migration 134 にある）。
 *
 * ── 受付から持ち込むときに変えたこと ────────────────────────
 *
 * 旧 `inbox/ask.ts` は**保存済みの案件**（`GET /projects/:id`）を見ていました。
 * 受付を案件作成に畳んだので、見る先を**いま画面に入っている値**に変えています。
 * 手で入れている途中でも聞くことが出るようになり、**打ち込むそばから減っていく**
 * ので「あと何を聞けばいいか」が読めます。
 *
 * ── 画面を持たない形にしてある ──────────────────────────────
 *
 * 「何が足りないか」の判定は要件そのもの（ここを間違えると、埋まっているのに
 * 聞いてしまう／足りないのに案件にしてしまう）なので、**画面を立てずに
 * 素で試せる**ように分けてあります。
 */
import type { NewProjectValues } from './fields';

export interface AskItem {
  key: string;
  /** お客様に聞く言葉。**そのまま文面に入る** */
  q: string;
  /** なぜ聞くか。聞く側が納得していないと聞けない */
  why: string;
}

/** 値が「入っていない」か。**0 は入っている**扱い（0円の見積もあり得る） */
function blank(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * お客様に聞くこと。**入っていない項目だけ**を返す。
 *
 * ここに並ぶのは「聞かないと案件にできない」ものだけ。
 * 「あると嬉しい」を混ぜると全部が任意に見えて、結局どれも聞かれません。
 */
export function asksFor(v: NewProjectValues, customerName: string | null): AskItem[] {
  const out: AskItem[] = [];
  if (v.dates.length === 0) {
    out.push({
      key: 'event',
      q: '実施日はいつごろでしょうか（候補だけでも）',
      why: '日程が決まらないと部屋も機材も押さえられません',
    });
  }
  if (blank(v.customer_id) && blank(customerName)) {
    out.push({
      key: 'customer',
      q: 'ご発注はどちらの会社さまになりますでしょうか',
      why: '見積の宛先とご請求先になります',
    });
  }
  if (blank(v.audience)) {
    out.push({
      key: 'audience',
      q: '当日はお客様をお呼びになりますか（無観客でしょうか）',
      why: '客席と誘導の有無で、会場の作りと人の数が変わります',
    });
  }
  if (blank(v.project_category)) {
    out.push({
      key: 'category',
      q: '配信でしょうか、収録でしょうか（会場だけということもあります）',
      why: '機材と人の構成が変わります',
    });
  }
  if (v.audience === 'with_audience' && blank(v.attendee_count)) {
    out.push({
      key: 'attendees',
      q: '当日は何名さまくらいご来場の見込みでしょうか',
      why: '客席・受付・誘導の規模が決まります',
    });
  }
  if (blank(v.expected_amount) || Number(v.expected_amount) === 0) {
    out.push({
      key: 'amount',
      q: 'ご予算の目安はございますか',
      why: '概算をお出しする幅が決まります',
    });
  }
  return out;
}

/**
 * 社内で決めること。**お客様に聞くものではない**ので分けてある
 * （混ぜると、社内の未設定をお客様に質問する文面ができる）。
 */
export function internalTodos(v: NewProjectValues): AskItem[] {
  const out: AskItem[] = [];
  if (blank(v.assigned_to)) {
    out.push({ key: 'assignee', q: '社内の担当を決める', why: '案件を作成するときに要ります' });
  }
  if (blank(v.name)) {
    out.push({ key: 'name', q: '案件名を決める', why: '一覧・見積・BOX のフォルダ名になります' });
  }
  return out;
}

export type AskMode = 'mail' | 'phone';

/**
 * 聞き方の下書き。
 *
 * メールは送る文面、電話は聞く順のメモ。同じ質問でも並べ方が違うので分けます
 * （電話であいさつ文を読み上げる人はいない）。
 */
export function draftText(
  projectName: string,
  customerName: string | null,
  asks: AskItem[],
  mode: AskMode,
  senderName: string,
): string {
  const lines = asks.map((a) => `・${a.q}`);
  if (mode === 'phone') {
    return [
      `【${projectName || '（案件名 未定）'}】確認したいこと`,
      ...(lines.length ? lines : ['・（聞くことはありません。案件にできます）']),
    ].join('\n');
  }
  const to = customerName ? `${customerName} ご担当者さま` : 'ご担当者さま';
  return [
    to,
    '',
    'お世話になっております。GMOグローバルスタジオの' + (senderName || '担当') + 'です。',
    'お問い合わせありがとうございます。お見積のご用意にあたり、'
      + (lines.length ? `${lines.length}点うかがえますでしょうか。` : '確認させていただきたい点はございません。'),
    '',
    ...lines,
    '',
    '何卒よろしくお願いいたします。',
  ].join('\n');
}
