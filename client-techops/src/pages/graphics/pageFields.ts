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

export interface PartFieldDef {
  key: string;
  label: string;
  type?: 'datetime-local';
  /** 目安の上限文字数（無指定＝カウンターを出さない。datetime 系には付けない） */
  limit?: number;
  /**
   * 通常の1行テキスト欄ではなく専用UIで編集する欄の種別。
   * `'entries'` = 対戦者/エントリーの可変長配列（{name, points}[]・スコアボード専用。
   * `client-techops/src/pages/graphics/ScoreEntriesEditor.tsx` が編集UIを持つ）。
   * `'choices'` = 投票・クイズの選択肢の可変長配列（{label, votes}[]・投票・クイズ専用。
   * `client-techops/src/pages/graphics/VoteChoicesEditor.tsx` が編集UIを持つ）。
   * 無指定＝従来どおりの1行テキスト欄（`limit` はこちらの対象）。
   */
  kind?: 'entries' | 'choices';
  /** kind:'entries' のときのエントリー数の目安上限（無指定は ScoreEntriesEditor の既定値） */
  maxEntries?: number;
  /** kind:'entries' のときの1件あたりの名前の文字数上限（無指定は ScoreEntriesEditor の既定値） */
  nameLimit?: number;
  /** kind:'choices' のときの選択肢数の目安上限（無指定は VoteChoicesEditor の既定値） */
  maxChoices?: number;
  /** kind:'choices' のときの1件あたりのラベルの文字数上限（無指定は VoteChoicesEditor の既定値） */
  choiceLabelLimit?: number;
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
  // 題字: outputPartsExtra.tsx FullscreenTitle が12字以下/超で90↔110pxを切り替える
  // （その閾値を目安の上限にした）。折り返しはするため保存は止めない・暫定値
  //
  // ⚠️ 既知の不整合（今回のタスクでは未修正・多言語対応と無関係のため触っていない）:
  // この欄のキーは `text` だが、FullscreenTitle（outputPartsExtra.tsx）は
  // `page.fields.title` を読んでおり、フォームに入力しても出力へ届かない
  // （常に `page.name` へフォールバックする）。段1の決め打ちのまま残っている既存差分。
  // `bilingual` を付けても `textEn` が出力側で読まれないため、ここでは付けていない
  title: [{ key: 'text', label: '題字', limit: 16 }],
  // 一覧表: 1行ずつ書く前提（outputPartsExtra.tsx FullscreenList・MAX_LIST_ITEMS=20）。
  // 1行あたり目安10字 × 20行の暫定値。
  // ⚠️ 上と同種の既知の不整合: FullscreenList は `page.fields.items`（配列）を読むが、
  // この欄のキーは `text`（1行テキスト）— 同じ理由で `bilingual` は付けていない
  list: [{ key: 'text', label: '内容（1行ずつ）', limit: 200 }],
  // ティッカー: 流れる文言なので長くても表示は破綻しない（尺を逆算する設計・
  // docs/design/v4/graphics.md §5「速度を固定し尺を逆算」）。読みやすさの目安としての暫定値
  ticker: [{ key: 'text', label: '流す文言', limit: 60, bilingual: true }],
  countdown: [
    // 枕詞: 左上に大きな数字と並ぶ短い前置き文言。暫定値
    { key: 'prefix', label: '枕詞（例: 開演まであと）', limit: 12 },
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
};

export const PART_KEYS = Object.keys(PART_FIELDS) as GraphicsPartKey[];
