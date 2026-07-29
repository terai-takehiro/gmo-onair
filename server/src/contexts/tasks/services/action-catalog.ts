/**
 * AI が提案できる ONAiR の操作の一覧 (行動カタログ)
 *
 * ── なぜカタログを 1 ファイルに置くか ────────────────────────
 *
 * 「AI が何をできるか」は 3 か所で必要になる:
 *   1. プロンプト  … AI に選べる操作を教える
 *   2. 実行器      … 受け取った kind をどの service に流すか
 *   3. 画面        … 提案の見た目 (名札・色・何が起きるか) を出す
 *
 * これを別々に書くと必ずずれて、**AI が提案できるのに実行できない操作**や、
 * 逆に**実行できるのに画面が名前を知らない操作**ができる。ここを正とする。
 *
 * ── 権限をここに書く理由 ─────────────────────────────────
 *
 * AI が提案しても、**実行するのは押した人の権限**で行う。AI を通せば権限が
 * 増えるということが絶対に起きてはいけない (MCP 側で同じ穴を v2.9.207 で塞いだ)。
 * module / level は対応する HTTP ルートの requirePermission と揃えてある。
 *
 * ── needsConfirm を分ける理由 ────────────────────────────
 *
 * 「番号を1本使う」「取り消せない」操作は、他の提案と同じ既定チェック ON では
 * 出せない。GLS 発番のような操作は既定 OFF にして、人が明示的に入れる。
 */

export type ActionKind =
  | 'create_task'
  | 'create_project'
  | 'create_customer'
  | 'change_project_stage'
  | 'issue_gls'
  | 'create_estimate'
  | 'create_studio_booking'
  | 'create_activity_log'
  | 'record_inquiry'
  | 'upsert_meeting_minutes'
  | 'append_project_note';

export interface ActionSpec {
  kind: ActionKind;
  /** 画面に出す名前 */
  label: string;
  /** 実行に必要な ONAiR の権限 */
  module: 'sales' | 'dailyops' | 'studio';
  level: 'editor' | 'manager';
  /** AI に渡す説明。「いつこれを選ぶか」を書く (何をするかだけでは選べない) */
  when: string;
  /** この操作に必ず要るもの (揃っていなければ人に聞く) */
  requires: string[];
  /** 実行すると一緒に起きること。画面にそのまま出す */
  effects: string[];
  /**
   * 既定でチェックを外すか。
   * 取り消せない / 番号を消費する操作は、人が明示的に入れたときだけ実行する。
   */
  optOut?: boolean;
}

export const ACTION_CATALOG: Record<ActionKind, ActionSpec> = {
  create_task: {
    kind: 'create_task',
    label: 'タスク・依頼をつくる',
    module: 'dailyops',
    level: 'editor',
    when: '誰かに何かを頼んだ / 自分がやることが書かれている。「〜をお願いした」「〜しておく」',
    requires: ['title', 'assignee_id'],
    effects: ['担当者のタスク一覧に出る', '自分以外が担当なら依頼として相手に届く'],
  },
  create_project: {
    kind: 'create_project',
    label: '案件をつくる (ネタ)',
    module: 'sales',
    level: 'editor',
    when:
      '新しい引き合い・相談・問い合わせで、まだ ONAiR に案件が無い。' +
      '「○○社から△△の相談が来た」「新規で□□の収録をやりたいと連絡があった」',
    requires: ['title', 'customer_id', 'gls_category'],
    effects: ['ヨミ (ネタ) として登録される', 'BOX に案件フォルダが作られる'],
  },
  create_customer: {
    kind: 'create_customer',
    label: 'お客様を登録する',
    module: 'sales',
    level: 'editor',
    when: '文中の会社名が ONAiR のお客様一覧に無い。案件をつくる前段として必要なとき',
    requires: ['customer_name'],
    effects: ['お客様一覧に増える', '同じ名前が既にあれば登録しない'],
  },
  change_project_stage: {
    kind: 'change_project_stage',
    label: 'ヨミ (ステージ) を動かす',
    module: 'sales',
    level: 'editor',
    when:
      '既存案件の状況が進んだ / 決まった / 流れた。' +
      '「□□の件、口頭で決まった」「△△は先方の予算が合わず見送り」',
    requires: ['project_id', 'stage'],
    effects: ['ステージ変更が案件の履歴に残る', '段によって必要な項目が足りないと止まる'],
  },
  issue_gls: {
    kind: 'issue_gls',
    label: 'GLS番号を発番する',
    module: 'sales',
    level: 'editor',
    when: '受注が固まった案件に番号を出すと明確に書かれているときだけ。推測で選ばない',
    requires: ['project_id'],
    effects: [
      'GLS番号が1本消費される (取り消せません)',
      'ステージが「口頭決定」まで自動で上がる',
      '概算見積が確定売上に変わる',
    ],
    // 番号を1本使う取り消せない操作。人が明示的にチェックを入れたときだけ実行する
    optOut: true,
  },
  create_estimate: {
    kind: 'create_estimate',
    label: '見積の下書きをつくる',
    module: 'sales',
    level: 'editor',
    when:
      '金額・構成・必要な機材や人員が書かれていて、見積を出す話になっている。' +
      '「カメラ3台・2日で見積を出して」',
    requires: ['project_id', 'estimate_items'],
    effects: ['案件の見積が下書きとして保存される (確定ではない)', '粗利がその場で出る'],
  },
  create_studio_booking: {
    kind: 'create_studio_booking',
    label: 'スタジオを押さえる',
    module: 'studio',
    level: 'editor',
    when: '日付とスタジオ利用が書かれている。「9/10 にワールドスタジオを仮で押さえたい」',
    requires: ['date'],
    effects: ['カレンダーに予約が入る (既定は仮押さえ)', '部屋が読み取れなければ部屋なしで入る'],
  },
  create_activity_log: {
    kind: 'create_activity_log',
    label: '営業活動を記録する',
    module: 'sales',
    level: 'editor',
    when:
      '訪問・打合せ・電話・メールのやり取りが書かれている。' +
      '「○○社と打合せ。予算感は300万、次回は再来週」',
    requires: ['activity_type', 'title', 'date'],
    effects: ['案件・お客様のやり取りに残る', '次回アクションを書けば期限として追える'],
  },
  record_inquiry: {
    kind: 'record_inquiry',
    label: '問い合わせとして記録する',
    module: 'dailyops',
    level: 'editor',
    when: '外から来た問い合わせで、まだ案件にするか決まっていないもの',
    requires: ['text'],
    effects: ['日常業務の「問い合わせ」に未対応として並ぶ'],
  },
  upsert_meeting_minutes: {
    kind: 'upsert_meeting_minutes',
    label: '議事録として残す',
    module: 'sales',
    level: 'editor',
    when: '会議の決定事項・話題が並んでいる (投入が議事録のとき)',
    requires: ['date'],
    effects: ['その日付の議事録に決定事項と話題が入る', '同じ日付があれば上書きになる'],
  },
  append_project_note: {
    kind: 'append_project_note',
    label: '案件のメモに書き足す',
    module: 'sales',
    level: 'editor',
    when:
      '既存案件についての共有事項・注意点で、タスクでも活動記録でもないもの。' +
      '**どの操作にも当てはまらない内容の受け皿にはしない** (それは提案しない)',
    requires: ['project_id', 'text'],
    effects: ['案件のメモの末尾に「AIが追記」の見出し付きで足される (既存の文は消さない)'],
  },
};

export const ACTION_KINDS = Object.keys(ACTION_CATALOG) as ActionKind[];

export function isActionKind(v: unknown): v is ActionKind {
  return typeof v === 'string' && Object.prototype.hasOwnProperty.call(ACTION_CATALOG, v);
}

/** プロンプトに載せるカタログ (AI が選べる操作の一覧) */
export function describeCatalogForPrompt(): string {
  return ACTION_KINDS.map((k) => {
    const s = ACTION_CATALOG[k];
    return `- ${k} (${s.label})\n  選ぶとき: ${s.when}\n  必ず要る: ${s.requires.join(' / ')}`;
  }).join('\n');
}
