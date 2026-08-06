/**
 * 受付 (v4 ②) の「案件にするために、聞かないといけないこと」と「聞き方の下書き」
 *
 * ── ここは AI ではありません ────────────────────────────────
 *
 * モックはこの2つを AI が書く前提で描いています。ここでは**入っていない項目から
 * 機械的に組み立てて**います。理由は2つ:
 *
 *  ① **同じ入力なら必ず同じ結果になる**ので、下書きが変なときに原因が追える
 *  ② AI を1つ足すたびに、会社方針「AI を使い捨てにしない」の5条件
 *     (記録・修正差分・成果・還流・レビュー) を満たす経路が要る。
 *     **文面を自然にするためだけに増やすものではない**
 *
 * AI に書かせるなら、`ai_outputs` に下書き全文を残し、送る前に人が直した差分を
 * `ai_corrections` に入れる経路を同時に作ります (器は migration 134 にある)。
 *
 * ── 画面を持たない形にしてある ──────────────────────────────
 *
 * 「何が足りないか」の判定は要件そのもの (ここを間違えると、埋まっているのに
 * 聞いてしまう / 足りないのに案件にしてしまう) なので、**画面を立てずに
 * 素で試せる**ように分けてあります。
 */

/** 受付が見る案件の形 (`GET /projects/:id` のうち、この画面が使う分だけ) */
export interface IntakeProject {
  id: string;
  name: string;
  customer_id: string | null;
  customer_name: string | null;
  gls_category: string | null;
  gls_number: string | null;
  assigned_to_name: string | null;
  project_type: string | null;
  expected_amount: number | string | null;
  event_start: string | null;
  event_end: string | null;
  notes: string | null;
  source_channel: string | null;
  is_ai_created?: boolean | null;
  ai_requested_by?: string | null;
  ai_reviewed_at?: string | null;
}

export interface AskItem {
  key: string;
  /** お客様に聞く言葉。**そのまま文面に入る** */
  q: string;
  /** なぜ聞くか。聞く側が納得していないと聞けない */
  why: string;
}

/** 値が「入っていない」か。**0 は入っている**扱い (0円の見積もあり得る) */
function blank(v: unknown): boolean {
  return v === null || v === undefined || v === '' || v === 'other';
}

/**
 * お客様に聞くこと。**入っていない項目だけ**を返す。
 *
 * ここに並ぶのは「聞かないと案件にできない」ものだけ。
 * 「あると嬉しい」を混ぜると全部が任意に見えて、結局どれも聞かれません。
 */
export function asksFor(p: IntakeProject): AskItem[] {
  const out: AskItem[] = [];
  if (blank(p.event_start)) {
    out.push({
      key: 'event',
      q: '実施日はいつごろでしょうか（候補だけでも）',
      why: '日程が決まらないと部屋も機材も押さえられません',
    });
  }
  if (blank(p.customer_id) && blank(p.customer_name)) {
    out.push({
      key: 'customer',
      q: 'ご発注はどちらの会社さまになりますでしょうか',
      why: '見積の宛先とご請求先になります',
    });
  }
  if (blank(p.project_type)) {
    out.push({
      key: 'type',
      q: '配信でしょうか、収録でしょうか（両方もあります）',
      why: '機材と人の構成が変わります',
    });
  }
  if (blank(p.expected_amount) || Number(p.expected_amount) === 0) {
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
 * (混ぜると、社内の未設定をお客様に質問する文面ができる)。
 */
export function internalTodos(p: IntakeProject): AskItem[] {
  const out: AskItem[] = [];
  if (blank(p.gls_category)) {
    out.push({ key: 'category', q: '案件分類（スタジオ / ビジネス）を決める', why: 'GLS 番号の採番に要ります' });
  }
  if (blank(p.assigned_to_name)) {
    out.push({ key: 'assignee', q: '社内の担当を決める', why: '案件をつくるときに要ります' });
  }
  return out;
}

/** 案件にできるか。**できない理由を返す** (押せないボタンの隣に出す) */
export function blockedReason(p: IntakeProject): string | null {
  if (p.gls_number) return 'すでに GLS を発番しています';
  if (blank(p.gls_category)) return '案件分類（スタジオ / ビジネス）が未設定です';
  return null;
}

export type AskMode = 'mail' | 'phone';

/**
 * 聞き方の下書き。**チェックしたものだけ**が文面に入る。
 *
 * メールは送る文面、電話は聞く順のメモ。同じ質問でも並べ方が違うので分ける
 * (電話であいさつ文を読み上げる人はいない)。
 */
export function draftText(
  p: IntakeProject,
  asks: AskItem[],
  mode: AskMode,
  senderName: string,
): string {
  const lines = asks.map((a) => `・${a.q}`);
  if (mode === 'phone') {
    return [
      `【${p.name}】確認したいこと`,
      ...(lines.length ? lines : ['・（聞くことはありません。案件にできます）']),
    ].join('\n');
  }
  const to = p.customer_name ? `${p.customer_name} ご担当者さま` : 'ご担当者さま';
  return [
    to,
    '',
    'お世話になっております。GMOグローバルスタジオの' + (senderName || '担当') + 'です。',
    'お問い合わせありがとうございます。お見積のご用意にあたり、' +
      (lines.length ? `${lines.length}点うかがえますでしょうか。` : '確認させていただきたい点はございません。'),
    '',
    ...lines,
    '',
    '何卒よろしくお願いいたします。',
  ].join('\n');
}
