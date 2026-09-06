// client-daily/src/manual/content.tsx — 日常業務アプリの利用マニュアル コンテンツ
// shared/src/client/manual/ManualModal に渡す ManualContent データ。
import {
  ClipboardList,
  CalendarCheck,
  Table2,
  Newspaper,
  Bot,
  UserCheck,
  Sparkles,
  HelpCircle,
  Plus,
  CheckCircle2,
  Star,
} from "lucide-react";
import type { ManualContent } from "@gmo-onair/shared/src/client/manual/types";

export const DAILY_MANUAL: ManualContent = {
  appLabel: "日常業務",
  appIcon: ClipboardList,
  intro:
    "AI が作り、人が確かめて仕上げる、日々の定型業務レポートのアプリです。第1弾はウィークリー活動報告とデイリーニュース報告の 2 メニュー。AI が集めて下書きし、人が追記・確認して仕上げます。",
  sections: [
    {
      id: "intro-overview",
      group: "はじめに",
      icon: ClipboardList,
      title: "日常業務アプリとは",
      keywords: ["概要", "AI", "レポート"],
      blocks: [
        {
          type: "p",
          text: "AI が決まった時間にレポートを作ります。人はこのアプリでレポートを読み、行 (項目) を追加・編集し、確認・確定します。今後もこの中に小さな業務メニューを追加していきます。",
        },
        {
          type: "flow",
          steps: [
            { icon: Bot, label: "AI作成", sub: "決まった時間に作ります", tone: "info" },
            { icon: Plus, label: "人が追加", sub: "トピック・ニュース行", tone: "primary" },
            { icon: UserCheck, label: "確認・確定", sub: "レビュー記録", tone: "success" },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "権限について",
          text: "閲覧には日常業務の「閲覧」が必要です。行の追加・編集・確認・確定には「編集」が必要です。",
        },
      ],
    },
    {
      id: "weekly",
      group: "メニュー",
      icon: CalendarCheck,
      title: "ウィークリー活動報告",
      keywords: ["週報", "週次", "活動報告", "トピック", "確定"],
      blocks: [
        {
          type: "p",
          text: "全社で週に 1 本 (週は月曜始まり)。サーバーが ONAiR の営業活動・案件・売上データを自動集計し、AI がそれを文章化して下書き (draft) を投稿します。人はトピック行を追加し、内容を確認して確定します。",
        },
        {
          type: "steps",
          items: [
            { title: "AI作成", text: "週次集計 (新規案件・活動内訳・パイプライン・売上・来週の予定) と AI 本文が自動で入ります。" },
            { title: "トピックを追加", text: "「トピックを追加」から カテゴリ (イベント / AI活用 / セールス・マーケティング 等)・内容・補足 を行単位で追加します。記入者は自動で自分の名前になります。" },
            { title: "確認・確定", text: "内容を確認したら「確認・確定」ボタンで公開 (published) にします。確定後は確定者と日時が記録されます。" },
          ],
        },
        {
          type: "callout",
          tone: "success",
          title: "AI と人間の分担",
          text: "AI の再投稿はレポート本文だけを更新し、人間が追記した行には一切触れません。安心して追記できます。",
        },
      ],
    },
    {
      id: "keep",
      group: "メニュー",
      icon: Table2,
      title: "隔週キープの数字",
      keywords: ["隔週", "キープ", "数値報告", "着地", "見込", "ヨミ表", "稼働率", "資料"],
      blocks: [
        {
          type: "p",
          text: "ウィークリー活動報告の2つ目のタブ。隔週の業績報告（橋口社長キープ）の数値部分を、資料と同じ切り口（着地表・着地見込表・進捗のグラフ・ヨミ表・稼働カレンダー・案件実施報告・定期内覧会）で見られます。目標は「お金のルール」の月次予算、着地は確定売上・仕入・販管費・償却相当額で、判定・対目標比・対目標はサーバーが毎回計算します（手計算しません）。",
        },
        {
          type: "bullets",
          items: [
            "上の絞り込みで 会議日・計上会社（全体／GMOサムライスタジオ ＝ グループ内のお客様／GMOサムライコンテンツスタジオ ＝ 外部のお客様／GMOインターネットグループ ＝ グループ本体）・お客様の区分 を切り替えられます。計上会社は案件が持つ値（2026年10月の切替前はすべて GMOサムライスタジオ）",
            "数字は「いま ONAiR にある数字」です。この週の報告を確定すると、その時点の数字が凍り、資料・Slack・AI につなぐ口は凍った版を読みます",
            "ヨミ表の「資料」に印を付けた案件だけが、資料の案件ページになります（案件詳細のふりかえりタブと同じ印）",
            "定期内覧会の満足度だけは ONAiR に無い数字なので、鉛筆から手で入れます（日常業務の「編集」が必要）",
            "「JSON を見る」で、資料や Slack が読む元データ（定例報告パック）をそのまま確かめられます",
            "スマホは要約だけ（4つの数字・未確定の注意・ヨミ表のカード）。「資料をつくる」は PC で開きます",
          ],
        },
      ],
    },
    {
      id: "news",
      group: "メニュー",
      icon: Newspaper,
      title: "デイリーニュース報告",
      keywords: ["ニュース", "日次", "業界", "注目度", "ピック"],
      blocks: [
        {
          type: "p",
          text: "AI が毎日、Web 上の業界ニュース (映像制作・配信・スタジオ・LED・照明・AR/XR 等) を収集・要約して投稿します。従来の Excel「業界ニュース」の記入表と同じ項目 (カテゴリ / AIの話題 / 注目度 / 1行要約 / URL / メモ / 記入者) で管理できます。",
        },
        {
          type: "bullets",
          items: [
            "日付ナビ (前日 / 翌日 / カレンダー) でその日のレポートに移動",
            "「ニュースを追加」で人も行を追加できる (AI が拾えなかったネタの手動登録)",
            "注目度 (1〜5) は星をタップして設定 — 週次のピックアップに使う",
            "AI の話題には「AI」の印が付く",
            "「確認した」でその日のレポートに既読を記録",
          ],
        },
        {
          type: "iconGrid",
          items: [
            { icon: Sparkles, label: "AI作成", text: "AI が集めた行には AI 作成の印", tone: "info" },
            { icon: Star, label: "注目度", text: "1〜5 のピックアップ", tone: "warning" },
            { icon: CheckCircle2, label: "確認済み", text: "既読の記録", tone: "success" },
          ],
        },
      ],
    },
    {
      id: "faq",
      group: "困ったときは",
      icon: HelpCircle,
      title: "FAQ",
      keywords: ["よくある質問", "権限", "エラー"],
      blocks: [
        {
          type: "glossary",
          items: [
            { term: "レポートが表示されない", def: "AI の定期実行がまだの可能性があります。ウィークリーは「この週のレポートを作成」、ニュースは「ニュースを追加」から人が先に作り始めることもできます。" },
            { term: "追加・確定ボタンが出ない", def: "日常業務の「編集」が必要です。権限の変更はシステム管理者に依頼してください。" },
            { term: "AI の本文を直したい", def: "AI に修正指示を出して作り直させるのが基本です (人が追加した行は残ります)。急ぎの補足はトピック行やメモに書いてください。" },
            { term: "確定を取り消したい", def: "第1弾では取り消し機能はありません。追加のトピックが必要な場合は管理者に相談してください。" },
          ],
        },
      ],
    },
  ],
};
