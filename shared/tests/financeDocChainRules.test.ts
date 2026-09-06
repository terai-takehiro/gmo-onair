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
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { decodeStrictBase64 } from '../../server/src/shared/services/mail-attachment-box.service';

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
    // 束から降ろすときも `human` の印を付ける（付けないと、人が直した行が
    // 「AI が当てた」まま残り、無修正採用率が実際より良く見える）
    const c = chainSvc();
    expect(c).toMatch(/downstream\.set\('project_source', 'human'\)/);
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
    // 4巡目で「処理月＋サイトから出した期日」も並びに入れた（下の節）
    expect(s).toMatch(/ORDER BY COALESCE\(agg\.next_due, g\.derived_payment_due\) ASC NULLS LAST, g\.updated_at DESC/);
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

describe('15秒ごとに取り直す画面に、メールの原文を運ばせない', () => {
  /*
    受領書類の画面は**絞り込み無しで全部の束**を引き（チップの件数を出すため）、
    **15秒ごとに取り直します**。原文は切り詰めずに持っている（1通 1〜3KB）ので、
    一覧に載せると**開きっぱなしの画面が1日中それを運び続けます**。
    読むのは「メールの原文を見る」を開いたときだけです。
  */
  it('束の一覧は原文そのものではなく有無だけ返す', () => {
    const s = chainSvc();
    expect(s).toMatch(/\(d\.body_text IS NOT NULL AND d\.body_text <> ''\) AS has_body_text/);
    // 列一覧に素の d.body_text を戻していないこと
    expect(s).not.toMatch(/d\.details, d\.body_text/);
  });

  it('開いたときだけ1件取りに行く口がある', () => {
    const r = read('server', 'src', 'contexts', 'dailyops', 'routes', 'inbox.routes.ts');
    expect(r).toMatch(/router\.get\('\/finance-docs\/:id', \.\.\.docsRead/);
    const d = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'DocDetails.tsx');
    // 開くまで取りに行かない
    expect(d).toMatch(/enabled: wantBody && !doc\.body_text/);
    expect(d).toMatch(/onToggle=\{\(e\) => setWantBody/);
  });

  it('一覧の列を並べたテンプレート文字列に逆クオートを書かない', () => {
    /*
      2026-09-06: 説明のつもりで `GET /…` と逆クオート付きで書いたら、
      そこでテンプレート文字列が閉じて型エラーになった
      （.claude/skills/pr-watch/references/pitfalls.md）。
      テンプレート文字列の中の注記は SQL のコメント（--）で書く。
    */
    const s = chainSvc();
    // **開きの逆クオートから数える。** 直前の説明コメントにも逆クオートがあるので、
    // 単に最初の1つを探すとコメントごと拾ってしまう（試験自体が嘘になる）
    const marker = 'const GROUP_DOC_COLS = `';
    const from = s.indexOf(marker);
    expect(from).toBeGreaterThan(-1);
    const start = from + marker.length;
    const body = s.slice(start, s.indexOf('`', start));
    expect(body).toContain('has_body_text');
    expect(body).not.toContain('${');
  });
});

describe('Codex 2巡目（8a047eb）で見つかった穴', () => {
  it('P1(High): 新しい MCP の読み取りツールに権限を掛ける', () => {
    /*
      `enforceToolPermissions` は**どちらの表にも無いツールを素通り**させる
      （個人スコープの読み取り用の逃がし）。表に足し忘れると、
      権限が1つも無い利用者でも取引先・案件・金額・支払期日・BOX の在り処まで読める。
    */
    const g = read('server', 'src', 'contexts', 'mcp', 'gate.ts');
    expect(g).toMatch(/list_finance_doc_groups: \{ module: \['dailyops', 'sales'\], level: 'reader' \}/);
  });

  it('登録した MCP ツールは、権限表か「個人スコープ」の名簿のどちらかに載っている', () => {
    /*
      **これが今回の穴の本体**（1本足し忘れただけで素通りした）。
      素通りを止める（fail closed）と、下の7本＝自分のものだけを読む道具が
      いきなり権限を要求し始めるので、**ここは名簿で守る**。
      新しい道具を足したら、どちらかに入れること。
    */
    const dir = join(__dirname, '..', '..', 'server', 'src', 'contexts', 'mcp', 'tools');
    const registered = new Set<string>();
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      const src = readFileSync(join(dir, f), 'utf8');
      for (const m of src.matchAll(/registerTool\(\s*'([a-z_0-9]+)'/g)) registered.add(m[1]);
    }
    const gate = read('server', 'src', 'contexts', 'mcp', 'gate.ts');
    const gated = new Set([...gate.matchAll(/^ {2}([a-z_0-9]+): \{ module/gm)].map((m) => m[1]));

    /** 自分のものだけを読む道具（権限で縛ると自分の仕事が見えなくなる） */
    const PERSONAL = new Set([
      'get_ai_feedback_digest', 'get_my_task_summary', 'get_task_intake',
      'list_my_delegations', 'list_my_tasks', 'list_task_intakes', 'list_users',
    ]);

    const ungated = [...registered].filter((n) => !gated.has(n) && !PERSONAL.has(n)).sort();
    expect(ungated).toEqual([]);
    expect(registered.size).toBeGreaterThan(100); // 抽出が壊れたら気づく
  });

  it('P1: 台帳に渡した書類がある束は行き先を変えられない', () => {
    // 台帳の行はこの操作では直らないので、変えると書類と台帳が食い違う
    const s = chainSvc();
    expect(s).toMatch(/const changesDestination = patch\.expense_kind !== undefined \|\| patch\.project_id !== undefined/);
    expect(s).toMatch(/status = 'processed'[\s\S]{0,300}ALREADY_PROCESSED/);
  });

  it('P1/P2: 束で決めたことを中の書類にも降ろす（登録済みは除く）', () => {
    /*
      束にだけ書いて降ろさないと、台帳へ渡すダイアログが古い値を読む
      （人が「販管費」に直したのに仕入として開く／人が直した処理月が効かない）。
    */
    const s = chainSvc();
    expect(s).toMatch(/downstream\.set\('expense_kind'/);
    expect(s).toMatch(/downstream\.set\('processing_month'/);
    expect(s).toMatch(/downstream\.set\('payment_terms_days'/);
    expect(s).toMatch(/AND status <> 'processed'/);
  });

  it('P1: 処理月と支払サイトは束（人が決めたほう）が先', () => {
    // 書類側の processing_month は取込時に受信日から当てた値なので、
    // 書類を先に見ると人が直した月がいつまでも効かない
    const h = handoff();
    expect(h).toMatch(/COALESCE\(g\.processing_month, d\.processing_month\)/);
    expect(h).toMatch(/COALESCE\(g\.payment_terms_days, d\.payment_terms_days\)/);
    // 案件は逆（書類ごとに人が付け替えられる欄がある）
    expect(h).toMatch(/COALESCE\(d\.project_id, g\.project_id\)/);
  });

  it('P1: 取り直しのときに、入らなかった添付を拾い直す', () => {
    /*
      Gmail の添付 id は毎回変わるので、取り直すには再取込しかない。
      素通りしていたので、一度失敗した原本は永久に入らなかった。
    */
    const s = inboxSvc();
    expect(s).toMatch(/await retryFailedAttachments\(String\(dup\.id\), input\)/);
    // 入っているものには触らない（BOX に無駄な版が増える）
    expect(s).toMatch(/box_file_id IS NOT NULL/);
    // 失敗の記録は消してから入れ直す（sha が空だと一意索引が効かず溜まる）
    expect(s).toMatch(/DELETE FROM finance_doc_attachments WHERE doc_id = \? AND box_file_id IS NULL/);
  });
});

describe('Codex 3巡目（1e0ddbc）で見つかった穴', () => {
  it('P2: 壊れた base64 を「保存しました」と言わない（実際に通して確かめる）', () => {
    /*
      Buffer.from(s, 'base64') は壊れた文字列でも投げず、知らない文字を捨てて
      それらしい長さのゴミを返す（'not base64' → 6バイト。実測）。
      長さだけ見ると通り、**壊れた PDF を BOX に上げて成功と報告する** —
      原本が壊れていることに、誰かが開くまで気づけない。

      ⚠️ **厳しくしすぎて正しい原本を落とすのも同じくらい困る**ので、
      詰め物なし・折り返し・URL 用の書き方は通すこと（両側を固定する）。
    */
    const pdf = Buffer.from('%PDF-1.4 hello world');
    const good = pdf.toString('base64');

    // 通すもの
    expect(decodeStrictBase64(good)?.toString()).toBe(pdf.toString());
    expect(decodeStrictBase64(good.replace(/=+$/, ''))?.toString()).toBe(pdf.toString());   // 詰め物なし
    expect(decodeStrictBase64(good.replace(/(.{8})/g, '$1\n'))?.toString()).toBe(pdf.toString()); // 折り返し
    expect(decodeStrictBase64('YWJjZGU')?.toString()).toBe('abcde');                        // 余り3（正しい）

    // 落とすもの
    expect(decodeStrictBase64('not base64')).toBeNull();
    expect(decodeStrictBase64(good.slice(0, good.length - 3))).toBeNull();                   // 途中で切れた
    expect(decodeStrictBase64('YWJjZ')).toBeNull();                                          // 余り1（ありえない）
    expect(decodeStrictBase64('こんにちは')).toBeNull();
    expect(decodeStrictBase64('')).toBeNull();

    // 素の Buffer.from に戻していないこと
    expect(attach()).not.toMatch(/buffer = Buffer\.from\(att\.content_base64, 'base64'\)/);
  });

  it('P2: 1件読みは一覧の上限（300）を通らない', () => {
    /*
      一覧を引いてから探すと、束が増えたときに古い束が 404 になり、
      直したあとに返す getGroup も「無い」を返す
      （保存できたのに画面が「見つかりません」と言う）。
    */
    const s = chainSvc();
    expect(s).toMatch(/GROUP_SELECT\} WHERE g\.id = \? AND g\.deleted_at IS NULL/);
    expect(s).not.toMatch(/const rows = await listGroups\(\);/);
    // 一覧と1件読みで同じ SELECT・同じ組み立てを使う
    expect(s).toMatch(/const GROUP_SELECT = /);
    expect(s).toMatch(/async function assembleGroups/);
  });

  it('P2: メール取込ログをニュースの成績に混ぜない', () => {
    /*
      取込ログの行に ops_news_item を付けていたため、ニュースの採用率が
      回すほど下がって見えていた（取込ログに pick は一生付かない）。
    */
    const t = read('server', 'src', 'contexts', 'mcp', 'tools', 'opsreports.tools.ts');
    expect(t).toMatch(/if \(added > 0 && args\.kind === 'daily_news'\)/);
  });

  it('P1: 捨てたメールにも印を付ける（付けないと取込の列が進まない）', () => {
    /*
      捨てたものに印が無いと毎回同じ検索に当たり、1回30通の枠を占めて、
      その裏で届いた請求書が3日間見られない。
    */
    const skill = read('.claude', 'skills', 'mail-intake', 'SKILL.md');
    const prompt = read('.claude', 'skills', 'mail-intake', 'references', 'routine-prompt.md');
    for (const doc of [skill, prompt]) {
      expect(doc).toContain('mail-intake-skipped');
      // 検索から除いていないと意味がない
      expect(doc).toMatch(/-label:studio-intake-done -label:inview-reg-done\s*\n?\s*-label:mail-intake-skipped|-label:inview-reg-done -label:mail-intake-skipped/);
    }
    // 「捨てたメールにはラベルを付けません」に戻っていないこと
    expect(skill).not.toContain('捨てたメールにはラベルを付けません');
  });
});

describe('Codex 4巡目（cb6abca）で見つかった穴', () => {
  it('P1: 台帳に渡した書類がある束は消せない（消すほうがもっと危ない）', () => {
    /*
      消すと仕入・販管費の行だけが台帳に残り、**どの書類から来たのかを辿れなくなる**
      （書類が消えているので、画面からも監査の記録からも消える）。
    */
    const s = chainSvc();
    const at = s.indexOf('export async function removeGroup');
    expect(at).toBeGreaterThan(-1);
    const fn = s.slice(at, at + 2200);
    // 数え方は「押さえたあとに JS で見る」に変えた（下の節で理由を書いている）
    expect(fn).toMatch(/d\.status === 'processed'/);
    expect(fn).toContain('ALREADY_PROCESSED');
  });

  it('P1: 期日が書いていない販管費を後ろに沈めない', () => {
    /*
      販管費は書類に期日が書いていないことのほうが多く、「処理月 + 何日サイト」で決まる。
      書類の payment_due だけで並べると、払う期日があるのに一番後ろに沈む。
    */
    const s = chainSvc();
    expect(s).toMatch(/ORDER BY COALESCE\(agg\.next_due, g\.derived_payment_due\) ASC NULLS LAST/);
    // 計算は TS で1回だけ（SQL に同じ式を書くと画面と食い違う）
    expect(s).toMatch(/function derivedDue\(month: string \| null, terms: number \| null\)/);
    expect(s).toMatch(/return paymentDueFromTerms\(month, terms\)/);
    // 画面も同じ根拠を使う（計算し直さない）
    const card = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'GroupCard.tsx');
    expect(card).toMatch(/dues\[0\] \?\? g\.derived_payment_due \?\? null/);
    // 月やサイトを直したら出し直す
    expect(s).toMatch(/assigned\.set\('derived_payment_due'/);
  });

  it('P2: 束で直した当て先が ai_corrections に残る', () => {
    /*
      **この PR の主目的そのもの**（AI の当て先を人が直す）なのに、
      束の editor は SQL を直接書いていて差分の記録が1件も走っていなかった。
      間違った当て先が「そのまま採用された」と数えられていた。
    */
    const s = chainSvc();
    expect(s).toMatch(/await recordFinanceDocCorrections\(String\(before\.id\), before, after, editedBy/);
    // before は書き換える前の行（取ってから書く）
    expect(s.indexOf('const targets = await queryAll')).toBeLessThan(s.indexOf('UPDATE finance_docs SET ${dsets'));

    // 比べる項目に当て先が入っていないと、記録しても差分が出ない
    const fb = read('server', 'src', 'contexts', 'dailyops', 'services', 'inbox-ai-feedback.service.ts');
    for (const f of ['project_id', 'expense_kind', 'vendor_name', 'processing_month', 'payment_terms_days']) {
      expect(fb).toMatch(new RegExp(`path: '${f}'`));
    }
    // 誰が直したかを渡している（渡さないと差分を読み解けない）
    const r = read('server', 'src', 'contexts', 'dailyops', 'routes', 'inbox.routes.ts');
    expect(r).toMatch(/updateGroup\(String\(req\.params\.id\), patch, req\.user!\.id\)/);
  });

  it('P2: 束で直した取引先が台帳に届く', () => {
    /*
      降ろさないと、台帳へ渡すダイアログが doc.sender（メール署名そのまま）を送り、
      handoffDoc はそれを優先するので、直した取引先が1文字も届かない。
    */
    const s = chainSvc();
    expect(s).toMatch(/patch\.vendor_name !== undefined\) downstream\.set\('vendor_name'/);
    const d = read('client', 'src', 'contexts', 'finance', 'pages', 'documents', 'HandoffDialog.tsx');
    expect(d).toMatch(/const vendorName = doc\.vendor_name \?\? doc\.sender \?\? ''/);
    expect(d).toMatch(/vendor_name: kind === 'sga' \? \(vendorName \|\| null\) : null/);
    expect(d).not.toMatch(/vendor_name: kind === 'sga' \? doc\.sender : null/);
  });
});

describe('自己レビュー（Codex が上限で見られなかったぶん）', () => {
  it('後から届いた書類の処理月・サイトで、束の空いているところを埋める', () => {
    /*
      束は最初の書類（多くは見積書）で作られるが、**処理月と支払サイトは
      請求書に書いてあることのほうが多い**。埋めないと束は最後まで期日を出せず、
      払う期日があるのに一番後ろに沈んだままになる。
      ⚠️ **すでに入っている値は上書きしない**（人が直した値かもしれない）。
    */
    const s = chainSvc();
    expect(s).toMatch(/if \(!found\.processing_month && input\.processing_month\)/);
    expect(s).toMatch(/if \(found\.payment_terms_days === null && input\.payment_terms_days !== null/);
    expect(s).toMatch(/fill\.set\('derived_payment_due'/);
  });

  it('束を消すときは、束の中の生きている書類を「全部」押さえてから状態を見る', () => {
    /*
      ⚠️ **登録済みだけを押さえても意味がない。** そのとき0行なので何も押さえられず、
      その隙に別の人が「仕入・販管費に登録」を通すと（あちらは書類の行を押さえてから
      状態を変える）**擦れ違って両方成功**し、台帳の行だけが消えた書類を指す。
      **全部押さえてから状態を見る**ので、どちらが先でも必ず待たされる。
    */
    const s = chainSvc();
    const at = s.indexOf('export async function removeGroup');
    const fn = s.slice(at, at + 2200);
    expect(fn).toMatch(/withTransaction/);
    // 絞り込みは deleted_at だけ。status で絞って FOR UPDATE してはいけない
    expect(fn).toMatch(/WHERE group_id = \? AND deleted_at IS NULL FOR UPDATE/);
    expect(fn).not.toMatch(/status = 'processed' FOR UPDATE/);
    expect(fn).toMatch(/docs\.filter\(\(d\) => d\.status === 'processed'\)/);
    expect(fn.indexOf('withTransaction')).toBeLessThan(fn.indexOf('FOR UPDATE'));
  });

  it('台帳へ渡すときは、押さえてから「消えていないか」も見る', () => {
    /*
      束ごと消す操作は書類を soft delete する。押さえたあとに見ないと、
      待たされて先に進んだあとに**消えた書類から作った仕入・販管費の行**ができ、
      どこからも辿れなくなる。
    */
    const h = handoff();
    expect(h).toMatch(/SELECT linked_id, status, deleted_at FROM finance_docs WHERE id = \? FOR UPDATE/);
    expect(h).toMatch(/if \(!locked \|\| locked\.deleted_at\)/);
    expect(h).toContain('ALREADY_DELETED');
  });
});
