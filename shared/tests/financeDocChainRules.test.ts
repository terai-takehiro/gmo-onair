/**
 * **受領書類のひとつづり — 画面を見ても気づけない決めごと**（migration 281）
 *
 * ここで固定するのは、**壊れても画面が何も言わない**類のものです。
 *
 *  ・登録済みの書類を直せてしまう → 台帳の金額と書類の金額が食い違い、
 *    **どちらが正しいか誰にも分からなくなる**（台帳側は直らない）
 *  ・販管費に切り替えても案件が残る → **原価と販管費の二重計上に見える**
 *  ・人が直した当て先が「AI が当てた」まま残る → **無修正採用率が実際より良く見える**
 *    （会社方針「AI を使い捨てにしない」条件2 の計測バグ）
 *  ・BOX に入らなかった添付を黙って捨てる → **入ったつもりで原本がどこにも無い**
 *
 * どれも「そのとき動いているように見える」ので、報告されません。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const read = (...p: string[]) => readFileSync(join(__dirname, '..', '..', ...p), 'utf8');

const inboxSvc = () => read('server', 'src', 'contexts', 'dailyops', 'services', 'inbox.service.ts');
const chainSvc = () => read('server', 'src', 'contexts', 'dailyops', 'services', 'finance-doc-chain.service.ts');
const handoff = () => read('server', 'src', 'contexts', 'finance', 'services', 'doc-handoff.service.ts');
const attach = () => read('server', 'src', 'shared', 'services', 'mail-attachment-box.service.ts');

describe('登録済みの書類は直せない', () => {
  it('中身の項目を直そうとしたら 409（画面がボタンを隠すだけでは足りない）', () => {
    const s = inboxSvc();
    expect(s).toMatch(/existing\.status === 'processed'/);
    expect(s).toContain('ALREADY_PROCESSED');
    // 金額と書類の種類は必ず含める（食い違うと台帳の突き合わせができなくなる）
    expect(s).toMatch(/CONTENT_FIELDS = \[[\s\S]{0,400}'amount'/);
    expect(s).toMatch(/CONTENT_FIELDS = \[[\s\S]{0,400}'doc_type'/);
  });

  it('束から別の束へ動かすのも止める（仕入の行が指す束と実際の束が食い違う）', () => {
    const s = chainSvc();
    expect(s).toMatch(/d\.status === 'processed'[\s\S]{0,200}ALREADY_PROCESSED/);
  });
});

describe('販管費に切り替えたら案件を外す', () => {
  it('サーバー（束の更新）', () => {
    const s = chainSvc();
    // 束の列と、中の書類の列の**両方**を外す（片方だけだと台帳へ渡すときにどちらを
    // 見るかで結果が変わる）
    expect(s).toMatch(/patch\.expense_kind === 'sga'\) put\('project_id', null\)/);
    expect(s).toMatch(/patch\.expense_kind === 'sga' \? null : \(patch\.project_id \?\? null\)/);
  });

  it('画面（当て先ダイアログ）も同じことをする', () => {
    const d = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'GroupEditDialog.tsx');
    expect(d).toMatch(/project_id: kind === 'purchase' \? \(projectId \|\| null\) : null/);
  });
});

describe('人が直した当て先は human として残る', () => {
  it('AI の印のまま残すと無修正採用率が実際より良く見える', () => {
    const s = inboxSvc();
    expect(s).toMatch(/input\.project_id !== undefined[\s\S]{0,400}set\('project_source', 'human'\)/);
    const c = chainSvc();
    expect(c).toMatch(/project_source = 'human'/);
  });

  it('AI は案件を決め打たない（候補が複数なら付けない）', () => {
    const c = chainSvc();
    // 複数当たったときは project_id を null で返し、理由だけ残す
    expect(c).toMatch(/rows\.length > 1[\s\S]{0,200}project_id: null/);
    expect(c).toMatch(/confidence: 'low'/);
  });
});

describe('見積書は台帳（仕入・販管費）に入らない', () => {
  it('一覧には出す（外すと「あの見積どうなった」を引く道が無くなる）', () => {
    const s = inboxSvc();
    // 既定の一覧から quote を外す条件が復活していないこと
    expect(s).not.toMatch(/conds\.push\(`d\.doc_type <> 'quote'`\)/);
    expect(s).not.toMatch(/status NOT IN \('processed','rejected'\) AND doc_type <> 'quote'/);
  });

  it('台帳へ書き込む境界で止める', () => {
    expect(handoff()).toContain('QUOTE_NOT_HANDOFFABLE');
  });

  it('ホームの受信箱も同じ条件（片方だけ直すと件数が食い違う）', () => {
    const d = read('server', 'src', 'contexts', 'platform', 'routes', 'dashboard.routes.ts');
    expect(d).not.toMatch(/FINANCE_DOC_BASE[\s\S]{0,200}doc_type <> 'quote'/);
  });
});

describe('BOX に入らなかった添付を黙って捨てない', () => {
  it('理由を返し、DB に残す', () => {
    const a = attach();
    for (const r of ['NOT_CONFIGURED', 'NO_FOLDER', 'UNAVAILABLE', 'TOO_LARGE', 'BAD_TYPE', 'BAD_CONTENT']) {
      expect(a).toContain(r);
    }
    expect(inboxSvc()).toMatch(/INSERT INTO finance_doc_attachments[\s\S]{0,300}failure_reason/);
  });

  it('取込そのものは止めない（BOX が落ちた日に請求書を記録できないのは本末転倒）', () => {
    // storeAttachment は投げずに理由を返す
    expect(attach()).toMatch(/const fail = \(reason: AttachmentFailure\): StoredAttachment/);
    // 記録に失敗しても取込は成功させる（ただし黙らない）
    expect(inboxSvc()).toMatch(/failed to record attachment/);
  });

  it('受け取る種類を絞る（MCP から任意のファイルを BOX に置ける口にしない）', () => {
    const a = attach();
    expect(a).toMatch(/ALLOWED_EXT = \['pdf'/);
    // パス区切りを落とす（`../` を含む名前をそのまま渡さない）
    expect(a).toContain("function safeFilename");
    expect(a).toContain("'_'");
  });
});

describe('Gmail の添付は「在り処」で受け取る', () => {
  /*
    メールの仕分けを Claude のルーティンで回すことにした結果、
    **Gmail コネクタが添付の中身を返さない**ことが分かった（実測。返るのは
    filename / id / mimeType だけで、FULL_CONTENT でも同じ）。
    AI が在り処だけ渡し、**サーバーが Gmail API から取りに行く**。
  */
  it('中身が無くても、Gmail の id があれば取りに行く', () => {
    const a = attach();
    expect(a).toMatch(/att\.gmail_message_id && att\.gmail_attachment_id/);
    expect(a).toMatch(/fetchGmailAttachment\(att\.gmail_message_id, att\.gmail_attachment_id\)/);
  });

  it('base64url を素の base64 として読まない（壊れた PDF は開くまで気づけない）', () => {
    const g = read('server', 'src', 'shared', 'services', 'gmail-attachment.service.ts');
    expect(g).toMatch(/replace\(\/-\/g, '\+'\)\.replace\(\/_\/g, '\/'\)/);
  });

  it('取りに行けなかった理由を分けて返す（NO_GMAIL_SCOPE は人の作業が要る）', () => {
    const g = read('server', 'src', 'shared', 'services', 'gmail-attachment.service.ts');
    for (const r of ['NO_GMAIL_ACCESS', 'NO_GMAIL_SCOPE', 'GMAIL_UNAVAILABLE']) {
      expect(g).toContain(r);
    }
    // 401/403 は「スコープが無い」— 落ちたのではなく人が直す話
    expect(g).toMatch(/status === 401 \|\| status === 403[\s\S]{0,200}NO_GMAIL_SCOPE/);
    // 画面に出す文言も用意してある（理由コードだけ出しても誰も直せない）
    expect(attach()).toContain('Google 連携をやり直してください');
  });

  it('認証の仕組みを2つ作らない（カレンダー連携の口を使い回す）', () => {
    const g = read('server', 'src', 'shared', 'services', 'gmail-attachment.service.ts');
    expect(g).toMatch(/getAccessTokenForAccount/);
    // OAuth のスコープに gmail.readonly が入っている（入れないと必ず 403）
    const o = read('server', 'src', 'contexts', 'schedule', 'routes', 'google-oauth.routes.ts');
    expect(o).toContain('gmail.readonly');
  });
});

describe('添付の中身を監査ログ・教師データに入れない', () => {
  it('base64 が 1000 文字の切り詰めを食い潰すと、差出人・件名・金額が消える', () => {
    const t = read('server', 'src', 'contexts', 'mcp', 'tools', 'inbox.tools.ts');
    // 監査ログにはファイル名だけ
    expect(t).toMatch(/attachments: \(args\.attachments \?\? \[\]\)\.map\(\(a\) => a\.filename\)/);
    // 教師データにも filename / mime_type だけ
    expect(t).toMatch(/attachments: \(args\.attachments \?\? \[\]\)\.map\(\(a\) => \(\{ filename: a\.filename, mime_type: a\.mime_type \}\)\)/);
  });
});

describe('メール取込ログの器', () => {
  it('落とした判断を残す kind がある（取り込んだものは各テーブルに残るが、落としたものは残らない）', () => {
    const s = read('server', 'src', 'contexts', 'dailyops', 'services', 'ops-report.service.ts');
    expect(s).toMatch(/OPS_REPORT_KINDS = \['weekly_activity', 'daily_news', 'mail_intake'\]/);
    // daily_news と同じく確定操作の無い閲覧型（published で作る）
    const t = read('server', 'src', 'contexts', 'mcp', 'tools', 'opsreports.tools.ts');
    expect(t).toMatch(/args\.kind === 'daily_news' \|\| args\.kind === 'mail_intake'/);
  });
});

describe('Codex レビュー #595 で見つかった穴（戻さない）', () => {
  it('P1: 同じ列を2回 SET しない（販管費として確定する操作が必ず失敗していた）', () => {
    /*
      画面は行き先と案件を**必ず両方**送る。`expense_kind='sga'` は
      「案件を外す」も意味するので、素直に積むと
      `SET project_id = ?, project_id = ?` になり PostgreSQL が弾く。
    */
    const s = chainSvc();
    expect(s).toMatch(/const assigned = new Map<string, unknown>\(\)/);
    expect(s).toMatch(/const put = \(col: string, val: unknown\) => \{ assigned\.set\(col, val\); \}/);
    // 配列に push して join する形（＝重複が通る形）に戻っていないこと
    expect(s).not.toMatch(/const put = \(col: string, val: unknown\) => \{ sets\.push/);
  });

  it('P1: 束の一覧が返す書類の列を間引かない（メモが消える・販管費に倒れる）', () => {
    /*
      画面はこの行をそのまま `FinanceDoc` として扱い、書類を直すダイアログ・
      台帳へ渡すダイアログ・「中身を読む」の3つが同じ行を読む。
      `notes` が来ないと金額だけ直したつもりでメモが消え、
      `gls_number` が来ないと台帳へ渡すとき必ず販管費に倒れる。
    */
    const s = chainSvc();
    for (const col of ['d.notes', 'd.gls_number', 'd.details', 'd.body_text', 'd.content']) {
      expect(s).toContain(col);
    }
    expect(s).toMatch(/AND o\.kind = 'finance_doc_intake'\) AS is_ai/);
  });

  it('P1: 移行で既存の書類を束に入れる（当てた瞬間に画面から消えていた）', () => {
    /*
      画面は束から引くので、`group_id` が空の行はどの束にも属さず一覧に出ない。
      ところがホームの受信箱は `finance_docs` を直接数えるので、
      「9件あります」と出ているのに開くと空、になる。
    */
    const m = read('server', 'src', 'shared', 'db', 'migrations', '281_finance_doc_chain.sql');
    expect(m).toMatch(/INSERT INTO finance_doc_groups[\s\S]{0,600}FROM finance_docs d/);
    expect(m).toMatch(/UPDATE finance_docs SET group_id = id/);
    expect(m).toContain('ON CONFLICT (id) DO NOTHING');
  });

  it('P2: 並びは支払期日が近い順（さっき触った先の取引を上に出さない）', () => {
    const s = chainSvc();
    expect(s).toMatch(/ORDER BY agg\.next_due ASC NULLS LAST, g\.updated_at DESC/);
    expect(s).toMatch(/MIN\(d\.payment_due\) FILTER \(WHERE d\.status NOT IN \('processed','rejected'\)\)/);
  });

  it('P2: 上限より先に絞り込む（古い未処理が上限に押し出されていた）', () => {
    const s = chainSvc();
    // pendingOnly は SQL の WHERE に入る（在庫を運んでから画面で捨てない）
    expect(s).toMatch(/filter\.pendingOnly\) conds\.push\('\(agg\.doc_count = 0 OR agg\.live_count > 0\)'\)/);
    expect(s).not.toMatch(/filter\.pendingOnly \? rows\.filter/);
    // 書類を足したら束の時刻も進める（進めないと新着が後ろに沈む）
    expect(inboxSvc()).toMatch(/UPDATE finance_doc_groups SET updated_at = NOW\(\) WHERE id = \?/);
  });

  it('P2: 添付が入らなかった理由を画面に出す（直し方が分からないと同じ）', () => {
    // 文言はサーバーが付ける（2か所に散ると片方だけ直る）
    expect(chainSvc()).toMatch(/failure_label: attachmentFailureLabel/);
    const card = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'GroupCard.tsx');
    expect(card).toMatch(/a\.failure_label \? `（\$\{a\.failure_label\}）` : ''/);
  });

  it('台帳へ渡すとき、人が決めた当て先を最優先にする', () => {
    const d = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'HandoffDialog.tsx');
    expect(d).toMatch(/doc\.expense_kind \?\? \(doc\.project_id \|\| doc\.gls_number \? 'purchase' : 'sga'\)/);
    expect(d).toMatch(/useState\(doc\.project_id \?\? ''\)/);
  });
});
