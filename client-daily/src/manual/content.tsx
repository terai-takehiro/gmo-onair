// client-daily/src/manual/content.tsx — 日常業務アプリの利用マニュアル コンテンツ
// shared/src/client/manual/ManualModal に渡す ManualContent データ。
import {
  ClipboardList,
  CalendarCheck,
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
    "AI と人が一緒に日々の定型レポートを回すアプリです。第1弾はウィークリー活動報告とデイリーニュース報告の 2 メニュー。AI が下書きを作り、人が追記・確認して仕上げます。",
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
          text: "AI が定期的にレポートの下書きを投稿します。人はこのアプリでそれを読み、行 (項目) を追記・編集して、確認・確定します。今後もこの中に小さな業務メニューを追加していきます。",
        },
        {
          type: "flow",
          steps: [
            { icon: Bot, label: "AI が生成・収集", sub: "下書きを投稿", tone: "info" },
            { icon: Plus, label: "人間が追記", sub: "トピック・ニュース行", tone: "primary" },
            { icon: UserCheck, label: "確認・確定", sub: "レビュー記録", tone: "success" },
          ],
        },
        {
          type: "callout",
          tone: "info",
          title: "権限について",
          text: "閲覧には dailyops モジュールの閲覧 (reader) 権限、行の追記・編集・確認・確定には編集 (editor) 権限が必要です。",
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
          text: "全社で週に 1 本 (週は月曜始まり)。サーバーが ONAiR の営業活動・案件・売上データを自動集計し、AI がそれを文章化して下書き (draft) を投稿します。人間はトピック行を追記し、内容を確認して確定します。",
        },
        {
          type: "steps",
          items: [
            { title: "AI が下書きを投稿", text: "週次集計 (新規案件・活動内訳・パイプライン・売上・来週の予定) と AI 本文が自動で入ります。" },
            { title: "トピックを追記", text: "「トピックを追加」から カテゴリ (イベント / AI活用 / セールス・マーケティング 等)・内容・補足 を行単位で追加します。記入者は自動で自分の名前になります。" },
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
      id: "news",
      group: "メニュー",
      icon: Newspaper,
      title: "デイリーニュース報告",
      keywords: ["ニュース", "日次", "業界", "採用フラグ", "ピック"],
      blocks: [
        {
          type: "p",
          text: "AI が毎日、Web 上の業界ニュース (映像制作・配信・スタジオ・LED・照明・AR/XR 等) を収集・要約して投稿します。従来の Excel「業界ニュース」の記入表と同じ項目 (カテゴリ / AI活用 / 採用 / 1行要約 / URL / メモ / 記入者) で管理できます。",
        },
        {
          type: "bullets",
          items: [
            "日付ナビ (前日 / 翌日 / カレンダー) でその日のレポートに移動",
            "「ニュースを追加」で人間も行を追加可能 (AI が拾えなかったネタの手動登録)",
            "採用フラグ (1〜5) は星をタップして設定 — 週次のピックアップに使う",
            "AI 活用に関するニュースには「AI」バッジが付く",
            "「確認済みにする」でその日のレポートに既読を記録",
          ],
        },
        {
          type: "iconGrid",
          items: [
            { icon: Sparkles, label: "AI 投稿", text: "AI が収集した行には AI バッジ", tone: "info" },
            { icon: Star, label: "採用フラグ", text: "1〜5 のピックアップ", tone: "warning" },
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
            { term: "レポートが表示されない", def: "AI の定期実行がまだの可能性があります。ウィークリーは「この週のレポートを作成」、ニュースは「ニュースを追加」から人間が先に作り始めることもできます。" },
            { term: "追記・確定ボタンが出ない", def: "dailyops モジュールの編集 (editor) 権限が必要です。管理者に権限付与を依頼してください。" },
            { term: "AI の本文を直したい", def: "AI に修正指示を出して再投稿させるのが基本です (人間の追記行は保持されます)。急ぎの補足はトピック行やメモに書いてください。" },
            { term: "確定を取り消したい", def: "第1弾では取り消し機能はありません。追加のトピックが必要な場合は管理者に相談してください。" },
          ],
        },
      ],
    },
  ],
};
