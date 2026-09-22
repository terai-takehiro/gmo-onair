// テロップCG — ページ編集フォームの入力欄定義（部品ごと）。
//
// PageFormDialog.tsx から切り出した（ファイルサイズ規律・400行 —
// `node scripts/check-file-size.mjs`）。段1の決め打ちのままで、将来は
// テンプレートの公開フィールドに置き換わる（docs/design/v4/graphics.md §3・§5）。
//
// `limit` は「目安の上限文字数」（ソフトな警告のみ・保存は止めない）。
// 実測値の裏付けがある欄は根拠をコメントに残し、無い欄は「暫定値」と明記する
// （文字充填率 0.7〜0.8 が目標という実測 — graphics-design-specs.md §9.5・§9.7）。
import type { GraphicsPartKey } from '@/lib/graphicsApi';
import { normalizeScoreEntries } from './scoreEntries';
import { normalizeVoteChoices } from './voteChoices';
import { normalizeListItems } from './listItems';
import { normalizeRankingEntries, readAwardPattern, defaultRankingEntries } from './rankingFields';
import { readCountdownSeconds, readInteractiveQuestionId, readOpenedAt } from './voteInteractive';
import { defaultScoreEntries } from './scoreEntries';
import { defaultVoteChoices } from './voteChoices';
import { defaultListItems } from './listItems';

export interface PartFieldDef {
  key: string;
  label: string;
  type?: 'datetime-local' | 'select-number';
  /** 目安の上限文字数（無指定＝カウンターを出さない。datetime 系・select-number には付けない） */
  limit?: number;
  /**
   * 通常の1行テキスト欄ではなく専用UIで編集する欄の種別。
   * `'entries'` = 対戦者/エントリーの可変長配列（{name, points}[]・スコアボード専用。
   * `client-techops/src/pages/graphics/ScoreEntriesEditor.tsx` が編集UIを持つ）。
   * `'choices'` = 投票・クイズの選択肢の可変長配列（{label, votes}[]・投票・クイズ専用。
   * `client-techops/src/pages/graphics/VoteChoicesEditor.tsx` が編集UIを持つ）。
   * `'list-items'` = 一覧表の項目の可変長配列（{text, textEn?}[]・一覧表専用。ScoreEntry と
   * 同じ発想で項目ごとに英語版（任意・`?lang=en` で優先表示）を持てる。旧形式（string[]）の
   * 既存データも `normalizeListItems` が後方互換で読む。
   * `client-techops/src/pages/graphics/ListItemsEditor.tsx` が編集UIを持つ）。
   * `'image'` = 写真アップロード欄（string＝`/api/v1/internal/graphics/images/<filename>` の
   * URLを1本持つだけ・空文字は未設定。`client-techops/src/pages/graphics/ImageFieldEditor.tsx`
   * が編集UIを持つ。ページ保存前（`pageId` が無い新規作成中）はアップロードを呼べないため、
   * その間は案内表示のみになる — `server/src/contexts/graphics/routes/images.routes.ts` の
   * `POST /graphics/pages/:id/photo` を叩く）。
   * `'ranking'` = ランキング発表の受賞候補配列（`RankingEntry[]`・`ranking` 専用。
   * `client-techops/src/pages/graphics/RankingEntriesEditor.tsx` が編集UIを持つ。
   * 発表方式（`fields.awardPattern`）もこのエディタが直接読み書きする —
   * `PART_FIELDS.ranking` に別途フィールド定義は置かない。段6-5 第1弾。
   * `rankingFields.ts` 参照）。
   * 無指定＝従来どおりの1行テキスト欄（`limit` はこちらの対象）。
   */
  kind?: 'entries' | 'choices' | 'list-items' | 'image' | 'ranking';
  /** kind:'entries' のときのエントリー数の目安上限（無指定は ScoreEntriesEditor の既定値） */
  maxEntries?: number;
  /** kind:'entries' のときの1件あたりの名前の文字数上限（無指定は ScoreEntriesEditor の既定値） */
  nameLimit?: number;
  /** kind:'choices' のときの選択肢数の目安上限（無指定は VoteChoicesEditor の既定値） */
  maxChoices?: number;
  /** kind:'choices' のときの1件あたりのラベルの文字数上限（無指定は VoteChoicesEditor の既定値） */
  choiceLabelLimit?: number;
  /** kind:'list-items' のときの項目数の目安上限（無指定は ListItemsEditor の既定値） */
  maxListItems?: number;
  /** kind:'list-items' のときの1件あたりの文字数上限（無指定は ListItemsEditor の既定値） */
  itemLimit?: number;
  /** type:'select-number' のときの選択肢（数値の配列。セレクトの中身そのもの） */
  numberOptions?: number[];
  /** type:'select-number' のときの新規作成時の既定値（無指定なら numberOptions の先頭） */
  numberDefault?: number;
  /**
   * `true` のとき、本体の入力欄のすぐ下に英語版の入力欄（任意）を自動的に足す
   * （`docs/design/v4/graphics.md` §6・出力URLの `?lang=en` — `graphics-awards-migration-plan.md`
   * §2-2の7番）。フィールドキーは `${key}En` 規約（PageFormDialog.tsx が生成・読み書きし、
   * 各部品レンダラーは `langField.ts` の `pickLang` で読む）。氏名・肩書・題字・設問・
   * 選択肢ラベルなど「本番で英語表記が要りそうな欄」にだけ付ける — 枕詞・日付のような
   * 欄には付けない（無指定＝英語欄を出さない）
   */
  bilingual?: boolean;
}

/** 部品ごとの入力欄（段1の決め打ち。テンプレートの公開フィールドに置き換わる予定） */
export const PART_FIELDS: Record<GraphicsPartKey, PartFieldDef[]> = {
  name: [
    // 賞名・役割: nameParts.tsx の CeremonyName は letterSpacing 0.34em の広い字間で
    // 短い金下線に収める前提（specs §9.5「見出しのみ広い字間」）。暫定値
    { key: 'label', label: '賞名・役割（金の見出し・任意）', limit: 10, bilingual: true },
    // 氏名: nameParts.tsx CeremonyName のプレート幅（1180-102=1078px）とフォント80px・
    // letterSpacing 0.1em から算出（1078 / (80*1.1) ≈ 12.2）。outputPartsExtra.tsx の
    // 題字サイズ分岐（12字以下で110px）とも符合する実測に基づく値
    { key: 'mainText', label: '氏名（主役の行）', limit: 12, bilingual: true },
    // 所属・肩書: 同プレート幅・フォント28px・letterSpacing 0.08emから算出
    // （1078 / (28*1.08) ≈ 35）。実際の所属名はこれより短いことが多いので余裕を持たせた暫定値
    { key: 'subText', label: '所属・肩書（下の小さな行）', limit: 24, bilingual: true },
  ],
  // 題字（式典題字・outputPartsExtra.tsx FullscreenTitle）:
  //
  // ⚠️ 直していた既知の不整合（背景メモ参照）: 以前この欄のキーは `text` の1つだけだったが、
  // FullscreenTitle は `page.fields.title`／`speaker`／`speakerTitle` の3キーを読んでおり、
  // フォームに入力しても出力へ一切届かなかった（常に `page.name` へフォールバック）。
  // レンダラーが読むキーに合わせて3欄に分けた（PartFieldDef 型はそのまま・kind無し＝
  // 通常の1行テキスト欄）。`title`/`speaker`/`speakerTitle` の3つに `bilingual: true` を
  // 付けた（`photoUrl` は対象外）。FullscreenTitle が `lang` prop を受け取り `pickLang`
  // を経由するようになったため、`${key}En` は出力側でも `?lang=en` 切替に反映される
  // （多言語対応 §2-2 の7番・対応済み）。
  //
  // 文字数上限はいずれも「暗幕の安全域（1920 - SAFE_X*2 = 1728px）に収まる目安」から逆算した
  // ソフト上限（保存は止めない）:
  //   ・題字: titleSize は12字以下→110px・超→92pxに分岐する。92px側（長い題）の1行分の
  //     容量が実質の上限になる — letterSpacing 0.14em を足すと1字あたり約 92*1.14≈104.9px、
  //     1728 / 104.9 ≈ 16.5字。12字以下の枝（110px）はさらに余裕がある（1728/125.4≈13.8字）
  //     ので、long側の上限をそのまま欄全体の目安にした
  //   ・発表者名（speaker）: 52px・letterSpacing 0.06em・maxWidth指定なし（中央寄せの
  //     可変幅divのため長いと安全域を超えうる）。1字あたり約 52*1.06≈55.1px、
  //     1728/55.1≈31.4字が理論上限。実際の氏名はこれよりずっと短いので、
  //     安全マージンを見て 24 を目安にした（他欄の「所属・肩書」と同じ考え方）
  //   ・発表者の肩書（speakerTitle）: 30px・letterSpacing 0.12em、
  //     1字あたり約 30*1.12≈33.6px、1728/33.6≈51.4字が理論上限。同じ安全マージンで 40 を目安にした
  title: [
    { key: 'title', label: '題字', limit: 16, bilingual: true },
    { key: 'speaker', label: '発表者名（任意）', limit: 24, bilingual: true },
    { key: 'speakerTitle', label: '発表者の肩書（任意・発表者名の上に小さく表示）', limit: 40, bilingual: true },
    // 写真（任意・段6-6 graphics-awards-migration-plan.md §2-2の9番）。必須にしない —
    // 写真無しの題字ページも従来どおり成立する。出力側レンダラー（outputPartsExtra.tsx）が
    // このキーをどう描画するかは別エージェントの並行実装が担う（このタスクの対象外）
    { key: 'photoUrl', label: '写真（任意）', kind: 'image' },
  ],
  // 一覧表（受賞者一覧など・outputPartsExtra.tsx FullscreenList）:
  //
  // ⚠️ 直していた既知の不整合（背景メモ参照）: 以前この欄はキー `text` の1行自由記述だけ
  // だったが、FullscreenList は `page.fields.items`（**文字列の配列**）と
  // `page.fields.columns`（列数）を読んでおり、`Array.isArray` に弾かれて一覧は常に空だった。
  // 配列は単純な1行テキストで表現できないため、専用UI（ListItemsEditor・
  // ScoreEntriesEditor/VoteChoicesEditor と同じ操作感の可変長リスト）に差し替えた。
  // 項目は {text, textEn?} の構造体配列（listItems.ts）— ScoreEntry と同じ発想で
  // 項目ごとに英語版（任意）を持てるようにし、多言語対応（§2-2の7番）済みにした。
  // 旧形式（文字列1本の配列・string[]）で保存済みの既存データも `normalizeListItems` が
  // 後方互換で読む（各要素が文字列ならレガシー形式として {text: 文字列, textEn: ''} に
  // 変換する）。`bilingual: true` フラグは付けない — この専用UI方式は本体入力欄の下に
  // `${key}En` を自動で足す汎用bilingual機構（PageFieldEditor.tsx）を経由しないため。
  //   ・項目の文字数上限: 既定4列でのセル幅から算出。セル幅 = (1728 - (4-1)*40) / 4 = 402px、
  //     フォント46px・letterSpacing 0.04emで1字あたり約 46*1.04≈47.8px、
  //     402/47.8≈8.4字。ellipsis で省略されるため厳密な上限ではないが、目安として10字とした
  //     （6列選択時はセルがさらに狭くなるが、ソフト警告のみなので保存は止めない）
  //   ・項目数の上限: FullscreenList の MAX_LIST_ITEMS（20）と揃えた。超過分は出力側で
  //     「ほか N名」に畳まれるため、20件を超えて追加しても入力そのものは止めない
  //   ・列数（columns）: FullscreenList は 1〜6 にクランプし、無効な値は既定4列にする実装
  //     （`Math.min(6, Math.floor(colRaw))`・`Number.isFinite` で弾いた既定4）。
  //     自由入力にすると範囲外の値を打ててしまうため、実際に効く範囲だけをセレクトにした
  list: [
    { key: 'items', label: '内容（1件ずつ）', kind: 'list-items', maxListItems: 20, itemLimit: 10 },
    { key: 'columns', label: '列数', type: 'select-number', numberOptions: [1, 2, 3, 4, 5, 6], numberDefault: 4 },
  ],
  // ティッカー: 流れる文言なので長くても表示は破綻しない（尺を逆算する設計・
  // docs/design/v4/graphics.md §5「速度を固定し尺を逆算」）。読みやすさの目安としての暫定値
  ticker: [{ key: 'text', label: '流す文言', limit: 60, bilingual: true }],
  countdown: [
    // 枕詞: 左上に大きな数字と並ぶ短い前置き文言。暫定値
    { key: 'prefix', label: '前に出す文言（例: 開演まであと）', limit: 12 },
    { key: 'targetAt', label: '目標時刻（空なら現在時刻の時計）', type: 'datetime-local' },
  ],
  // スコア: 対戦者/エントリーの可変長配列（構造化・graphics-design-specs.md §9.8）。
  // 1行テキストではなく ScoreEntriesEditor（専用UI）で編集する。上限は目安
  // （2〜6件・名前8字まで — scoreParts.tsx のセル幅から出した暫定値。保存は止めない）
  score: [{ key: 'entries', label: '対戦者・エントリー', kind: 'entries', maxEntries: 6, nameLimit: 8 }],
  // 速報: outputParts.tsx FlashBand の本文枠（1920px からラベル枠・左右セーフエリアを
  // 引いた実効幅・フォント58px）から算出した目安
  flash: [{ key: 'text', label: '速報の文言', limit: 22, bilingual: true }],
  // サイドの文言: スコアと同じ SideLabel の枠を使うため同じ上限
  side: [{ key: 'text', label: 'サイドの文言', limit: 16, bilingual: true }],
  // 投票・クイズ: 設問（1行テキスト）＋選択肢の可変長配列（構造化・
  // graphics-design-specs.md §9.9）。選択肢は1行テキストではなく VoteChoicesEditor
  // （専用UI）で編集する。上限は目安（8択・ラベル12字まで — voteParts.tsx の
  // 行幅から出した暫定値。保存は止めない）
  vote: [
    { key: 'question', label: '設問', limit: 40, bilingual: true },
    { key: 'choices', label: '選択肢', kind: 'choices', maxChoices: 8, choiceLabelLimit: 12 },
  ],
  // ランキング発表（RANKS段階発表・TOP3・Final Pitch・段6-5第1弾。出力レンダラーは別エージェント
  // の並行実装が担う——ここはデータ入力欄のみ）。`categoryName` は賞名・部門名の1行テキスト
  // （`limit` は他の見出し欄と同じ暫定値）。`entries` は受賞候補の可変長配列
  // （RankingEntriesEditor が発表方式=`fields.awardPattern` も併せて編集する）。
  ranking: [
    { key: 'categoryName', label: '賞名・部門名', limit: 16, bilingual: true },
    { key: 'entries', label: '受賞候補', kind: 'ranking' },
  ],
};

export const PART_KEYS = Object.keys(PART_FIELDS) as GraphicsPartKey[];

/**
 * 各部品の「これが空なら未完成」の主フィールド（再設計 §4-1・§12-3。
 * docs/design/v4/graphics-redesign.md「校正（未完成／未確認／確認済） →
 * 『確認済み』のチェック1つにする。『未完成』は必須の文言が空なら自動でバッジが付く」）。
 *
 * `PART_FIELDS[partKey][0]` を機械的に使わない — `name` の先頭（`label`＝賞名・役割）は
 * 任意項目で、必須なのは2番目の `mainText`（氏名）。部品ごとに「これが無いと絵にならない」
 * フィールドを明示する。`countdown` は `null`＝このチェックの対象外（枕詞も目標時刻も
 * 空のままで「現在時刻の時計」として成立するため — pageFields.ts の countdown 定義コメント参照）。
 */
export const PRIMARY_FIELD_KEY: Partial<Record<GraphicsPartKey, string>> = {
  name: 'mainText',
  title: 'title',
  list: 'items',
  ticker: 'text',
  // countdown: 対象外（意図的に未設定）
  score: 'entries',
  flash: 'text',
  side: 'text',
  vote: 'question',
  ranking: 'entries',
};

function isFieldValueEmpty(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === 'string') return value.trim() === '';
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/** 主フィールドが空（＝未完成）かどうか。対象外の部品（countdown）は常に false */
export function isPageContentEmpty(partKey: GraphicsPartKey, fields: Record<string, unknown>): boolean {
  const key = PRIMARY_FIELD_KEY[partKey];
  if (!key) return false;
  return isFieldValueEmpty(fields[key]);
}

/**
 * 部品を選んだ直後（新規作成のマウント時／部品切替 `pickPart` の両方）の `fields` 既定値を
 * 組み立てる。`PageFormDialog.tsx` から切り出した（400行規律の副産物・2箇所で同じロジックを
 * 持たないための共通化でもある）。
 */
export function buildDefaultFields(partKey: GraphicsPartKey, firstFieldValue?: string): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  (PART_FIELDS[partKey] ?? []).forEach((def, i) => {
    if (def.kind === 'entries') next[def.key] = defaultScoreEntries();
    else if (def.kind === 'choices') next[def.key] = defaultVoteChoices();
    // 発注（テロ原）からの変換で detail が来ているときは、空欄より1件目に
    // 入れて渡したほうが情報が残る（列配列なので firstFieldValue をそのまま代入できない）
    else if (def.kind === 'list-items') {
      next[def.key] = i === 0 && firstFieldValue ? [{ text: firstFieldValue, textEn: '' }] : defaultListItems();
    } else if (def.kind === 'ranking') next[def.key] = defaultRankingEntries();
    else if (def.type === 'select-number') {
      next[def.key] = String(def.numberDefault ?? def.numberOptions?.[0] ?? '');
    } else if (i === 0 && firstFieldValue) next[def.key] = firstFieldValue;
    if (def.bilingual) next[`${def.key}En`] = '';
  });
  // `awardPattern` は ranking 専用の def を持たない（PART_FIELDS.ranking 参照）。
  // 新規作成・部品切替のどちらも「新規作成扱い」なので、発表方式の既定値を direct にする
  if (partKey === 'ranking') next.awardPattern = 'direct';
  return next;
}

/**
 * 保存済みの `fields`（DB からの生値）を、フォームで扱える形に正規化する。
 * `PageFormDialog.tsx` の単一部品／複数部品（各レイヤー）の両方から共用する。
 */
export function normalizeFieldsForPart(
  partKey: GraphicsPartKey,
  raw: Record<string, unknown> | null | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const def of PART_FIELDS[partKey] ?? []) {
    const v = raw?.[def.key];
    next[def.key] = def.kind === 'entries'
      ? normalizeScoreEntries(v)
      : def.kind === 'choices'
      ? normalizeVoteChoices(v)
      : def.kind === 'list-items'
      ? normalizeListItems(v)
      : def.kind === 'ranking'
      ? normalizeRankingEntries(v)
      : typeof v === 'string' ? v : v == null ? '' : String(v);
    if (def.bilingual) {
      const ev = raw?.[`${def.key}En`];
      next[`${def.key}En`] = typeof ev === 'string' ? ev : ev == null ? '' : String(ev);
    }
  }
  // `awardPattern` は `PART_FIELDS.ranking` に専用の def を持たない（RankingEntriesEditor が
  // fields 全体越しに直接読み書きするため）。正規化を素通りさせると編集ダイアログを開き直す
  // たびに読み込んだ値が消えるので、ranking パーツのときだけここで拾っておく。
  if (partKey === 'ranking') next.awardPattern = readAwardPattern(raw);
  // `countdownSeconds`/`interactiveQuestionId`/`openedAt`（段6-6・6-7）も `PART_FIELDS.vote`
  // に専用の def を持たない（`VoteInteractiveSection.tsx` が fields 全体越しに直接読み書き
  // する——awardPattern と同じ理由）。ここで拾っておかないと、非テンプレートページの保存が
  // `fields: { ...fields }` の**丸ごと置き換え**（`savePageForm.ts`）のため、フォームを
  // 開いて保存し直すだけで interactiveQuestionId/openedAt が消えてしまう
  // （openedAt/interactiveQuestionId はサーバー専用の書き込み経路——ここでは「今の値を
  // そのまま持ち越す」だけで、フォーム操作で書き換えることはない）。値が無ければキー自体を
  // 持たせない（`readCountdownSeconds` 等の「未指定は null」という契約をそのまま保つ）。
  if (partKey === 'vote') {
    const cd = readCountdownSeconds(raw);
    if (cd != null) next.countdownSeconds = cd;
    const qid = readInteractiveQuestionId(raw);
    if (qid != null) next.interactiveQuestionId = qid;
    const opened = readOpenedAt(raw);
    if (opened != null) next.openedAt = opened;
  }
  return next;
}
