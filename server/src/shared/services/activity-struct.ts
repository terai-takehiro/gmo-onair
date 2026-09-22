/**
 * やり取りの本文を「話者ごとの構造」で持つ（migration 188）— 検査と正規化
 *
 * ── 何のためのものか ────────────────────────────────────────
 *
 * 取込メールは **先方の言ったことと当社が答えたことが交互に並ぶやり取り**です。
 * それを1本の HTML（`body_html`）にすると、どちらの発言かは文の中にしか残らず、
 * 読む人が毎回頭で分解することになります。
 *
 * ここは AI に**意味の単位**を返させ、**見せ方は画面が決める**という
 * この製品の決めごと（`rich-content.ts` の冒頭）を、やり取りに広げたものです。
 *
 * ── なぜサーバーで検査するか ────────────────────────────────
 *
 * 中身は **AI が組み立てたもの**で、材料は **取引先が送ってきたメール**です。
 * どちらも信用できないので、DB に入る前に形を確かめます。
 *
 * ・**知らない値は既定に倒す**（`tone` / `icon` / `side`）。画面が知らない値を
 *   受け取ると、色や記号の対応表を引けずに `undefined` を描くことになります
 * ・**文字列以外は文字列にしない。** `String(obj)` すると画面に
 *   `[object Object]` が出ます（v3.2.0 の内覧会で実際に起きた）
 * ・**長さの上限を持つ。** メール本文をまるごと1つの発言に入れられると、
 *   一覧の1件が画面何枚分にもなります（原文は `description` に別で残ります）
 *
 * ── 画面側と対になっている ──────────────────────────────────
 *
 * 描く側は `client/src/contexts/sales/pages/projectDetail/thread/` です。
 * **server は shared を import していない**ので型が2か所にありますが、
 * 描く側は知らない形を飛ばすので、片方だけ古くても画面は壊れません。
 */

/** 状態の色。**塗りピルにしない**（点＋文字で出す）ので、意味だけを持つ */
export type ActivityStatusTone = 'decided' | 'waiting' | 'risk' | 'info';

/** 事実に添えるアイコン。**画面が絵を決める**ので、ここは種類の名前だけ */
export type ActivityFactIcon = 'date' | 'people' | 'gear' | 'money' | 'place' | 'doc';

export interface ActivityTurn {
  /** `them` = 取引先 / `us` = 当社。**判断が付かないものは `them`**（下記） */
  side: 'them' | 'us';
  name: string | null;
  org: string | null;
  /** 原文に書かれている時刻。**推測しない**（無ければ null） */
  at: string | null;
  /** 原文の引用。AI が話を補っていないことを読む人がその場で確かめられる */
  quote: string | null;
  /** 引用に収まらない補足の1〜3文 */
  note: string | null;
  /** 「搬入」「申込」のような項目。**当社の回答でよく使う** */
  fields: { label: string; value: string }[];
}

export interface ActivityStruct {
  /** 形の版。**上げたら画面側の読み取りも直すこと** */
  v: 1;
  /** 件名の続き。件名は言い切りの短い部分だけを大きく出す */
  subtitle: string | null;
  statuses: { label: string; tone: ActivityStatusTone }[];
  facts: { icon: ActivityFactIcon; value: string }[];
  /** 全体の1〜3文。`**強調**` を書いてよい（画面が `<strong>` にする） */
  lead: string | null;
  turns: ActivityTurn[];
}

const TONES = new Set<string>(['decided', 'waiting', 'risk', 'info']);
const ICONS = new Set<string>(['date', 'people', 'gear', 'money', 'place', 'doc']);

/**
 * 上限。**超えたぶんは捨てます**（原文は `description` に丸ごと残る）。
 *
 * `turns` を 12 にしているのは、1件のやり取りの記録に 12 往復入っていたら
 * それは「1件の記録」ではなく議事録だからです（そちらは `project_minutes`）。
 *
 * ⚠️ **ここは「暴走を止める柵」で、「この長さに収めろ」ではありません。**
 * 上限を絞ると、**長いメールほど静かに中身が落ちます**（捨てた事実は
 * どこにも出ないので、画面を見ても「短い」としか分かりません）。
 * 実際、利用者から「きわめて短いテキストでしか残らない」とご指摘があったとき、
 * プロンプト側の件数の上限（`turns` 6件・`facts` 4件）とここの両方が効いていました。
 *
 * **絞るのはプロンプトの役目**（原文にあるものだけを、重複なく置かせる）で、
 * ここは**壊れた値・画面何枚分もの塊**を止めるためだけに持ちます。
 * だから上限はプロンプトが求める件数より**ひと回り大きく**取ってあります。
 */
const LIMITS = {
  subtitle: 120,
  // プロンプトは「多くて6件」。柵はそのひと回り外側
  statuses: 8,
  statusLabel: 24,
  // プロンプトは「多くて8件」
  facts: 10,
  // 「8/10 5:00–20:00 サムライスタジオ」程度は1件に収まるように
  factValue: 80,
  lead: 700,
  turns: 12,
  name: 40,
  org: 40,
  at: 24,
  quote: 1_200,
  note: 800,
  // プロンプトは「多くて10件」
  fields: 12,
  fieldLabel: 16,
  fieldValue: 400,
};

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  return s.length > max ? s.slice(0, max) : s;
};

function normalizeTurn(raw: unknown): ActivityTurn | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const t = raw as Record<string, unknown>;

  const quote = str(t.quote, LIMITS.quote);
  const note = str(t.note, LIMITS.note);
  const fields = (Array.isArray(t.fields) ? t.fields : [])
    .map((f): { label: string; value: string } | null => {
      if (!f || typeof f !== 'object') return null;
      const it = f as Record<string, unknown>;
      const label = str(it.label, LIMITS.fieldLabel);
      const value = str(it.value, LIMITS.fieldValue);
      return label && value ? { label, value } : null;
    })
    .filter((f): f is { label: string; value: string } => !!f)
    .slice(0, LIMITS.fields);

  // **中身が1つも無い発言は捨てる。** 名前だけの吹き出しが並ぶと、
  // 「読み取れなかった」ことが「相手が何も言わなかった」ように見える
  if (!quote && !note && fields.length === 0) return null;

  return {
    // **知らない値は `them` に倒す。** 当社の発言を先方のものとして出すほうが、
    // 先方の発言を当社のものとして出すより取り返しがつく（対外的な言質にならない）
    side: t.side === 'us' ? 'us' : 'them',
    name: str(t.name, LIMITS.name),
    org: str(t.org, LIMITS.org),
    at: str(t.at, LIMITS.at),
    quote,
    note,
    fields,
  };
}

/**
 * 受け取った構造を DB に入れられる形にする。
 *
 * **中身が薄いときは `null` を返します** — `lead` も `turns` も無いものを
 * 「整えた」として保存すると、画面には件名だけが残り、
 * **待ち行列からも外れるのでもう二度と整いません**。
 * 呼ぶ側は `null` を失敗として扱ってください。
 *
 * ネットワークにも DB にも触らないので素で試せます
 * （`shared/tests/activityStruct.test.ts`）。
 */
export function normalizeActivityStruct(raw: unknown): ActivityStruct | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const s = raw as Record<string, unknown>;

  const statuses = (Array.isArray(s.statuses) ? s.statuses : [])
    .map((x): { label: string; tone: ActivityStatusTone } | null => {
      if (!x || typeof x !== 'object') return null;
      const it = x as Record<string, unknown>;
      const label = str(it.label, LIMITS.statusLabel);
      if (!label) return null;
      const tone = typeof it.tone === 'string' && TONES.has(it.tone)
        ? (it.tone as ActivityStatusTone) : 'info';
      return { label, tone };
    })
    .filter((x): x is { label: string; tone: ActivityStatusTone } => !!x)
    .slice(0, LIMITS.statuses);

  const facts = (Array.isArray(s.facts) ? s.facts : [])
    .map((x): { icon: ActivityFactIcon; value: string } | null => {
      if (!x || typeof x !== 'object') return null;
      const it = x as Record<string, unknown>;
      const value = str(it.value, LIMITS.factValue);
      if (!value) return null;
      const icon = typeof it.icon === 'string' && ICONS.has(it.icon)
        ? (it.icon as ActivityFactIcon) : 'doc';
      return { icon, value };
    })
    .filter((x): x is { icon: ActivityFactIcon; value: string } => !!x)
    .slice(0, LIMITS.facts);

  const turns = (Array.isArray(s.turns) ? s.turns : [])
    .map(normalizeTurn)
    .filter((t): t is ActivityTurn => !!t)
    .slice(0, LIMITS.turns);

  const lead = str(s.lead, LIMITS.lead);
  if (!lead && turns.length === 0) return null;

  return {
    v: 1,
    subtitle: str(s.subtitle, LIMITS.subtitle),
    statuses,
    facts,
    lead,
    turns,
  };
}

/**
 * 画面に出せる文字量。**「整えたのに中身が薄い」を数えるため**に持ちます
 * （`richContentLength` と同じ役割）。
 */
export function activityStructLength(s: ActivityStruct | null): number {
  if (!s) return 0;
  let n = (s.lead ?? '').length + (s.subtitle ?? '').length;
  for (const f of s.facts) n += f.value.length;
  for (const t of s.turns) {
    n += (t.quote ?? '').length + (t.note ?? '').length;
    n += t.fields.reduce((a, f) => a + f.label.length + f.value.length, 0);
  }
  return n;
}
