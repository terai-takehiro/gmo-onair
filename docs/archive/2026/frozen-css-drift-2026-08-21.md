# 凍結4アプリ CSS ズレの原因調査 (2026-08-21)

## 背景

`docs/handoff-2026-08-20-v4-native-ui.md` の引き継ぎに以下の記載があり、
「既存のズレ」の原因が未調査のまま残っていた。

> `npm run check:frozen` — 凍結4アプリのCSSにズレはあるが、このセッション開始前から存在するズレとバイト数まで完全一致（今回の変更が原因でないことを複数回確認済み）

本ドキュメントはこのズレの**原因調査のみ**を行った記録（コード変更は一切していない）。

## 結論（先に要点）

- **原因を特定できた。** `shared/src/client/ui/crud-form-dialog.tsx` から
  `SIZE_CLASSES`（`sm:max-w-sm` / `sm:max-w-md` / `sm:max-w-lg` / `sm:max-w-2xl`
  という Tailwind クラス名の文字列リテラルを持つマップ）が削除されたことで、
  凍結4アプリのビルドが「他アプリのソース文字列を誤って拾っていた」規則を
  失った。**該当コミットは `b82467a`（PR #262
  `claude/mobile-optimization-uiux-eo5ho0`、2026-08-20 マージ、
  `fix(shared): CrudFormDialogを中央固定Dialogから下から出るSheetに載せ替えた`）。**
- **実害はない。** 消えた3つの規則（`.sm\:max-w-2xl` `.sm\:max-w-lg` `.sm\:max-w-sm`）は、
  いずれの凍結アプリの自前ソースからも使われていない（後述の実測）。
  そもそも凍結4アプリはどれも `CrudFormDialog` を1度も使っていない
  （`grep` で0件）。つまり**「他アプリのマップに書かれた文字列を Tailwind の
  文字列スキャンが誤検出して、使われもしない規則を凍結アプリのCSSに
  漏らしていた」だけ**で、これが消えても凍結アプリの見た目は1ピクセルも
  変わらない。基準ファイルの `history` に既に3件並んでいる `pt-1` /
  `md:block` / `px-0` の削除と**まったく同じ種類の「漏れの縮小」**である。

## 調査手順

1. `npm install`（`node_modules` が未インストールだったため）
2. `npm run build:all` → `npm run check:frozen` を実行し、実際にどのアプリの
   CSS がどれだけズレているかを確認
3. `scripts/check-frozen-css.mjs` を読み、比較対象を理解
   （`scripts/frozen-css-baseline.json` に保存された md5/バイト数 vs
   今回ビルドした `dist/assets/*.css` の突き合わせ。**実際のCSS本文は
   基準ファイルに残っておらず、md5だけ**なので、内容差分を取るには
   基準を作った時点のコミットまで戻ってもう一度ビルドする必要がある）
4. `scripts/frozen-css-baseline.json` の最終更新コミット
   （`26d0a0b` = PR #218 `release/4.1.6` のマージ）を特定
5. `/tmp/.../scratchpad/baseline-check` に **別クローン**を作り、`26d0a0b`
   をチェックアウトして `npm install` → 凍結4アプリを個別ビルド
   （本体の作業ディレクトリは触っていない）
6. そのビルドの CSS の md5/バイト数が `frozen-css-baseline.json` の値と
   **完全一致**することを確認（基準ファイルの再現性を検証）
7. 旧CSS（手順5）と新CSS（手順2）を `}` 区切りで1行1規則に展開し `diff` で
   実際に増減した規則を特定
8. 消えた規則の文字列（`sm:max-w-2xl` 等）を `git log -S` で検索し、
   それを含んでいたソースの変更コミットを特定
9. その規則が凍結4アプリの自前ソースで使われているかを `grep` で確認
   （＝実害があるかの判定）
10. 念のため `package-lock.json` の差分も見て、Tailwind/PostCSS/Vite の
    バージョン変更が絡んでいないかを確認

## 見つかった差分の詳細

### `npm run check:frozen` の実際の出力

```
✗ 制作資料 (Qシート) の CSS が変わっています
    基準 8e7f7a8f7b1a67ddea2570dadb2281c5  99952 バイト
    いま 0e1ab8e6902a5b75754cd522b8b3095c  99891 バイト（-61）

✗ 技術資料 の CSS が変わっています
    基準 4d6b48979731d5b9aa5b6e87266538b6  63972 バイト
    いま 20ac5fa4f136f46cff5890ba0ab727c3  63881 バイト（-91）

✗ 計時LIVE の CSS が変わっています
    基準 652fa685a0f91d5858d4d242bf66480e  66938 バイト
    いま 56740b19fcc77b8788e14c6f1ce695c7  66877 バイト（-61）

（リアルタイムCG は基準どおり・ズレなし）
```

引き継ぎ書に記載のとおり、`awards` だけは常にズレない
（`check-frozen-css.mjs` のコメントに「`awards` は共通 preset を継承していないので
本来 shared の影響を受けない」とある通り）。

### 基準時点 (`26d0a0b`) のビルドを再現し、規則単位で diff した結果

`26d0a0b` をチェックアウトしたクローンでビルドした CSS の md5/バイト数は
基準ファイルの値と **完全一致**（再現性を確認済み）。そのCSSと現在のCSSを
規則単位で突き合わせた結果、**差分はこれだけ**だった。

```
== client-qsheet ==
< .sm\:max-w-2xl{max-width:42rem}
< .sm\:max-w-sm{max-width:24rem}

== client-techsheet ==
< .sm\:max-w-2xl{max-width:42rem}
< .sm\:max-w-lg{max-width:32rem}
< .sm\:max-w-sm{max-width:24rem}

== client-live ==
< .sm\:max-w-2xl{max-width:42rem}
< .sm\:max-w-lg{max-width:32rem}

== client-awards ==
（差分なし）
```

バイト数も突合済み：
- `.sm\:max-w-2xl{max-width:42rem}` = 31 バイト、
  `.sm\:max-w-sm{max-width:24rem}` = 30 バイト、
  `.sm\:max-w-lg{max-width:32rem}` = 30 バイト
- qsheet: 31+30 = **61**（実測 -61 と一致）
- techsheet: 31+30+30 = **91**（実測 -91 と一致）
- live: 31+30 = **61**（実測 -61 と一致）

**3アプリぶんのズレ（-61 / -91 / -61）を1バイトの誤差もなく説明できた。**

## 原因

`shared/src/client/ui/crud-form-dialog.tsx` の旧版には、ダイアログサイズを
選ぶための以下のマップがあった。

```ts
const SIZE_CLASSES: Record<NonNullable<CrudFormDialogProps['size']>, string> = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-lg',
  xl: 'sm:max-w-2xl',
};
```

コミット `b82467a`（`fix(shared): CrudFormDialogを中央固定Dialogから下から出るSheetに載せ替えた`、
PR #262 `claude/mobile-optimization-uiux-eo5ho0`、2026-08-20 にマージ済み）で、
`CrudFormDialog` を中央固定 `Dialog` からスマホ向けの下から出る `Sheet` に
作り替えた際、サイズ指定自体が不要になり（`Sheet` はPCでも幅固定 560px）、
この `SIZE_CLASSES` ごと削除された。

Tailwind の JIT は「そのアプリのビルドが読み込む全ソースを正規表現で
文字列スキャンし、`sm:max-w-sm` のような**文字列として存在するクラス名**なら
文脈を問わず（コメントの中でも、使われていない定数の中でも）規則を生成する」
という仕組みで動く。凍結4アプリの Tailwind `content` は
`shared/src/client/**` も含むため、**shared 側のこのマップに書かれた文字列を
拾って、`sm:max-w-sm` `sm:max-w-lg` `sm:max-w-2xl` の規則を「使われてもいないのに」
凍結アプリのCSSに漏らしていた**。マップが消えたことで、この漏れも消えた。

`scripts/check-frozen-css.mjs` の冒頭コメントに書かれている仕組み
（「あちらが描かない部品のクラス名を1つ書き足すだけで、凍結アプリの CSS に
規則が増える」）と**まったく同じ現象の逆（減る）版**である。

### 他の候補の切り分け

- **Tailwind/PostCSS/Vite のバージョン変更**: `package-lock.json` の差分
  （基準コミット `26d0a0b` → 現在）を確認したが、変わっていたのは
  `@fullcalendar/*` 系と `preact`（カレンダー画面の作り直しに伴うもの、
  凍結アプリ非依存）のみ。`tailwindcss` `postcss` `vite` のバージョンは
  変化なし。→ **候補から除外**
- **フォント同梱 (`npm run fonts`)**: `scripts/vendor-fonts.mjs` は
  v4対象3アプリ（`client` `client-daily` `client-equipment`）専用で、
  生成物は `tokens-v4.css` 経由のみ（凍結4アプリはこの経路を通らない）。
  実際、凍結4アプリのソースツリーに `.woff` 等は1つも無い。→ **候補から除外**
- **ビルド環境 (Node.js バージョン等) の違い**: 同一環境（Node v22.22.2）で
  新旧2つのコミットを別々にビルドし、旧コミット側のビルド結果が基準ファイルの
  md5と完全一致することを確認済み。環境差なら旧コミットのビルドが基準と
  一致しないはずなので、**候補から除外**
- **他アプリの変更が凍結アプリの Tailwind content 設定に意図せず影響**:
  これが実際の原因（上述）。ただし「凍結アプリの `tailwind.config` が
  変更された」のではなく、「`shared/src/client/**` という**もともと
  content に含まれている場所**に置かれた文字列が変わった」だけ。

## 実害の有無

**実害なし。** 根拠:

1. 凍結4アプリはいずれも `CrudFormDialog` を1度も import/使用していない
   （`grep -rl "CrudFormDialog" client-qsheet/src client-techsheet/src
   client-live/src client-awards/src` は0件）。そもそも `SIZE_CLASSES` は
   凍結アプリの描画パスに一度も乗ったことがない。
2. 消えた3規則（`sm:max-w-2xl` / `sm:max-w-lg` / `sm:max-w-sm`）を、
   各アプリの自前ソースで使っているかを個別に確認した:
   - `sm:max-w-sm`: `client-live/src/pages/TimerAdminPage.tsx` が使用
     → live のCSSにはこの規則が**残っている**（実際に diff にも出ていない）
   - `sm:max-w-lg`: `client-qsheet/src/components/editor/CsvImportDialog.tsx`
     が使用 → qsheet のCSSにはこの規則が**残っている**
   - `sm:max-w-2xl`: どの凍結アプリの自前ソースにも使用箇所なし
     （4アプリとも消えている、または元々存在しない=awards）
   - つまり**「そのアプリ自身が使っている規則は1つも消えていない」**。
     消えたのは「そのアプリが使っていない、他アプリ由来の漏れ規則」だけ。
3. `check-frozen-css.mjs` の既存の `history`（`pt-1` / `md:block` / `px-0` の
   削除）と同じパターン。過去の運用でも「使っていない規則が減っただけなら
   実害なしとして基準を更新する」という判断基準が既にある。

## 次にやるなら（提案）

- **基準の更新**: このドキュメントの内容を `--update` の理由として、
  `npm run check:frozen -- --update "PR #262 (b82467a) が CrudFormDialog の
  SIZE_CLASSES を削除し、凍結4アプリが誤って拾っていた sm:max-w-2xl/lg/sm の
  漏れ規則が消えた。凍結4アプリはいずれも CrudFormDialog を使っておらず、
  各アプリが自前で使っている sm:max-w-* は個別に残存を確認済みなので
  描画は不変（docs/investigations/frozen-css-drift-2026-08-21.md 参照）"`
  を実行すれば、`npm run check:frozen` は再び緑になる。
  **本タスクの制約（コード変更をしない）に従い、今回はこの更新自体は
  実施していない。** 必要ならユーザーの承認を得たうえで別タスクとして行う。
- **再発防止**: この種の「他アプリ向けの文字列リテラルを凍結アプリの
  Tailwind content が拾ってしまう」問題は、`shared/src/client/**` を触る
  PR のたびに構造的に起こり得る。`check-frozen-css.mjs` は既に機械的に
  検知できているので、今のところ追加の仕組みは不要と考えられる。
  もし今後 CI で `check:frozen` を毎回自動実行したいなら、
  ビルドに約2分かかる制約（`npm run lint` に混ぜていない理由）を踏まえて
  実行タイミングの検討が要る。

## 検証コマンド

```bash
npm install
npm run build:all
npm run check:frozen   # 現状: 3本ズレる（qsheet/techsheet/live）ことを再現できる
```
