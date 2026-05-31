# -*- coding: utf-8 -*-
"""
実アプリ画面の高精細再現ジェネレータ。
ユーザー提供のスクリーンショット（実データ）をもとに HTML を組み、
ローカル Chromium (Playwright) でレンダリングして PNG 化する。
出力: docs/presentation/screens/{projects,qsheet,equipment,techsheet,live,cg}.png
"""
import os
os.environ["PLAYWRIGHT_BROWSERS_PATH"] = "/opt/pw-browsers"
from playwright.sync_api import sync_playwright

CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome"
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "screens")
os.makedirs(OUT, exist_ok=True)

W, H = 1320, 825   # ≈16:10（ブラウザ枠の中身比に近い）

BASE_CSS = """
*{margin:0;padding:0;box-sizing:border-box;font-family:'Noto Sans JP',sans-serif;}
body{background:#f6f8fb;color:#1f2a37;width:__W__px;height:__H__px;overflow:hidden;}
.topbar{height:52px;background:#fff;border-bottom:1px solid #e6ebf1;display:flex;align-items:center;
  padding:0 18px;gap:14px;}
.grid3{display:grid;grid-template-columns:repeat(3,4px);grid-template-rows:repeat(3,4px);gap:3px;}
.grid3 i{width:4px;height:4px;background:#9aa6b2;border-radius:1px;display:block;}
.logo{font-weight:800;color:#005bac;font-size:18px;letter-spacing:.5px;font-style:italic;}
.mod{color:#5b6672;font-weight:700;font-size:14px;}
.sep{color:#c2ccd6;}
.search{flex:1;max-width:300px;height:30px;border:1px solid #e0e6ee;border-radius:8px;background:#fff;
  display:flex;align-items:center;padding:0 12px;color:#9aa6b2;font-size:12px;}
.user{display:flex;align-items:center;gap:7px;color:#5b6672;font-size:13px;font-weight:600;}
.ava{width:24px;height:24px;border-radius:50%;background:#dbe7f5;color:#005bac;display:flex;
  align-items:center;justify-content:center;font-size:11px;font-weight:800;}
.wrap{padding:22px 26px;height:calc(100% - 52px);}
.h1{font-size:24px;font-weight:800;}
.sub{color:#8a939e;font-size:12px;margin-top:3px;}
.btn{height:32px;border-radius:8px;padding:0 14px;font-size:12px;font-weight:700;display:inline-flex;
  align-items:center;gap:6px;border:1px solid #e0e6ee;background:#fff;color:#3a4654;}
.btn.primary{background:#005bac;color:#fff;border:none;}
.btn.amber{background:#f59e0b;color:#fff;border:none;}
.row{display:flex;align-items:center;}
.gap{gap:10px;}
.card{background:#fff;border:1px solid #eceff3;border-radius:12px;box-shadow:0 1px 3px rgba(31,42,55,.06);}
.tab{font-size:13px;font-weight:700;color:#8a939e;padding:7px 4px;border-bottom:2px solid transparent;}
.tab.on{color:#005bac;border-color:#005bac;}
.pill{font-size:11px;font-weight:800;border-radius:6px;padding:3px 9px;color:#fff;display:inline-block;}
""".replace("__W__", str(W)).replace("__H__", str(H))


def topbar(mod):
    return f"""
    <div class="topbar">
      <div class="grid3"><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
      <span style="color:#9aa6b2;font-size:18px">≡</span>
      <span class="logo">GMO ONAiR</span><span class="sep">/</span><span class="mod">{mod}</span>
      <div class="search">🔍 案件・顧客・仕入先...</div>
      <div class="user"><span class="ava">シ</span>システム管…&nbsp;⌄</div>
    </div>"""


def page(mod, body, extra_css="", show_top=True):
    top = topbar(mod) if show_top else ""
    return f"""<!doctype html><html><head><meta charset="utf-8">
    <style>{BASE_CSS}{extra_css}</style></head><body>{top}
    <div class="wrap">{body}</div></body></html>"""


# ---------------------------------------------------------------- 案件管理
def html_projects():
    css = """
    .ptabs{display:flex;gap:18px;margin:14px 0 14px;}
    .toolrow{display:flex;gap:10px;margin-bottom:14px;}
    .srch{flex:1;max-width:420px;height:34px;border:1px solid #e0e6ee;border-radius:9px;background:#fff;
      display:flex;align-items:center;padding:0 12px;color:#9aa6b2;font-size:12px;}
    .sort{height:34px;border:1px solid #e0e6ee;border-radius:9px;background:#fff;display:flex;align-items:center;
      padding:0 12px;color:#5b6672;font-size:12px;}
    .pcard{padding:16px 18px;margin-bottom:12px;}
    .code{color:#8a939e;font-size:12px;font-weight:700;}
    .pname{font-size:16px;font-weight:800;margin:4px 0 6px;}
    .meta{color:#5b6672;font-size:12px;}
    .fin{color:#5b6672;font-size:12px;margin-top:9px;border-top:1px solid #f0f3f7;padding-top:8px;}
    .fin b{color:#2ea06b;}
    .amt{font-size:18px;font-weight:800;color:#1f2a37;}
    """
    def card(code, badge, bc, name, date, comp, person, tag, sales, cost, gp, gprate, amt, est=False):
        fin = "" if sales is None else f'<div class="fin">売上 ¥{sales}　仕入 ¥{cost}　粗利 <b>¥{gp}（{gprate}%）</b></div>'
        amtline = f'{"（想定）" if est else ""}¥{amt}'
        return f"""<div class="card pcard">
          <div class="row" style="justify-content:space-between">
            <div><span class="code">{code}</span> <span class="pill" style="background:{bc}">{badge}</span></div>
            <div class="amt">{amtline}</div></div>
          <div class="pname">{name} <span style="color:#8a939e;font-weight:500;font-size:12px">({date})</span></div>
          <div class="meta">🏢 {comp}　👤 {person}　📅 {date}　🏷 {tag}</div>{fin}
        </div>"""
    body = f"""
    <div class="row" style="justify-content:space-between">
      <div class="h1">案件管理</div>
      <div class="row gap"><span class="btn">⬆ Excelインポート</span><span class="btn">⬇ Excel出力</span>
        <span class="btn primary">＋ 新規作成</span></div>
    </div>
    <div class="ptabs"><span style="color:#005bac;font-weight:800;border-bottom:2px solid #005bac;padding-bottom:6px">全て</span>
      <span style="color:#8a939e;font-weight:700">ヨミ</span><span style="color:#8a939e;font-weight:700">進行中</span>
      <span style="color:#8a939e;font-weight:700">完了</span><span style="color:#8a939e;font-weight:700">失注</span></div>
    <div class="toolrow"><div class="srch">🔍 案件名・コード・顧客名で検索...</div>
      <div class="sort">おすすめ (イベント日順 +…) ⌄</div></div>
    {card("GLS-A004","B 口頭決定","#f59e0b","PW 新サービス発表会","26/03/30","株式会社ペイメントワークス","佐藤 花子","ハイブリッドイベント","2,800,000","700,000","2,100,000","75","2,800,000")}
    {card("OPP-202603-0009","C 見積提案済","#2f80ed","PW IR動画制作","26/04/08","株式会社ペイメントワークス","高橋 美咲","GMO案件",None,None,None,None,"2,000,000",est=True)}
    {card("GLS-A006","B 口頭決定","#f59e0b","DA 社内イベント中継","26/04/10","株式会社デジタルアドバンス","高橋 美咲","生放送","1,500,000","400,000","1,100,000","73","1,500,000")}
    """
    return page("案件管理", body, css)


# ---------------------------------------------------------------- Qシート
def html_qsheet():
    css = """
    .qhead{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:8px;}
    .qtitle{font-size:17px;font-weight:800;}
    .chip{font-size:11px;font-weight:700;border-radius:6px;padding:4px 9px;background:#eef2f7;color:#5b6672;}
    .chip.green{background:#16a34a;color:#fff;}.chip.red{background:#e2483d;color:#fff;}
    .qmeta{color:#5b6672;font-size:12px;margin-bottom:12px;display:flex;gap:16px;flex-wrap:wrap;}
    .layout{display:flex;gap:14px;height:calc(100% - 96px);}
    .cuewrap{flex:1;}
    .cueblock{background:#2563a8;color:#fff;border-radius:9px 9px 0 0;padding:9px 14px;font-weight:800;font-size:13px;
      display:flex;gap:10px;align-items:center;}
    .cuebody{background:#fff;border:1px solid #eceff3;border-top:none;border-radius:0 0 9px 9px;}
    .crow{display:grid;grid-template-columns:1.7fr 1fr;border-bottom:1px solid #f0f3f7;}
    .scn{padding:11px 12px;font-size:12px;color:#1f2a37;display:flex;gap:8px;}
    .qtag{font-size:10px;font-weight:800;border-radius:5px;padding:2px 7px;color:#fff;height:18px;}
    .mic{padding:9px 12px;border-left:1px solid #f0f3f7;}
    .inherit{color:#e2483d;font-size:10px;font-weight:700;margin-bottom:5px;}
    .mrow{display:flex;align-items:center;gap:8px;font-size:11px;margin:3px 0;color:#5b6672;}
    .onoff{font-size:9px;font-weight:800;color:#fff;border-radius:4px;padding:2px 6px;width:30px;text-align:center;}
    .rpanel{width:210px;}
    .rtabs{display:flex;gap:14px;font-size:12px;font-weight:700;margin-bottom:12px;}
    .litem{display:flex;align-items:center;gap:8px;font-size:12px;color:#3a4654;margin:8px 0;}
    """
    def scn(tag, tcolor, text):
        t = f'<span class="qtag" style="background:{tcolor}">{tag}</span>' if tag else '<span class="qtag" style="background:#eef2f7;color:#8a939e">名前</span>'
        return f'<div class="scn"><b style="color:#8a939e">Q</b>{t}<span>{text}</span></div>'
    def mic(state, ch, who):
        col = "#e2483d" if state=="ON" else "#c2ccd6"
        return f'<div class="mrow"><span class="onoff" style="background:{col}">{state}</span> {ch} <b style="color:#1f2a37">{who}</b> <span style="margin-left:auto;color:#9aa6b2">マイク</span></div>'
    body = f"""
    <div class="qhead">
      <span style="color:#8a939e">‹</span><span class="qtitle">GMOスタジオ情報バラエティ #001</span>
      <span class="chip">保存済み</span><span class="chip" style="background:#005bac;color:#fff">💾 保存</span>
      <span class="chip">🗑 ゴミ箱 2</span><span class="chip">⬇ CSV</span><span class="chip">👁 印刷 / PDF</span>
      <span class="chip">🎤 音声共有</span><span class="chip">☰ ランダウン</span><span class="chip red">（•）ON AIR</span>
      <span style="margin-left:auto;color:#8a939e;font-size:12px">⏱ 00:37:00</span>
    </div>
    <div class="qmeta"><span>準備稿 ⌄</span><span>放送日 2026/05/10</span><span>収録日 2026/05/08</span>
      <span>開始 19:00:00</span><span>📍 用賀 WORLD STUDIO</span></div>
    <div class="layout">
      <div class="cuewrap">
        <div class="cueblock">⋮⋮ <span style="background:#fff;color:#2563a8;border-radius:5px;padding:1px 7px">1</span>
          19:00:00 <span style="background:#1c4f86;border-radius:5px;padding:1px 7px">2:30</span> 【OP】オープニング</div>
        <div class="cuebody">
          <div class="crow"><div class="scn"><b style="color:#8a939e">Q</b><span class="qtag" style="background:#1f2a37">NA</span>
            <span>毎週土曜よる7時！知って得する情報満載！GMOスタジオ情報バラエティ！</span></div>
            <div class="mic"><div class="inherit">↧ 前cueから継承</div>{mic("ON","Ch1","MC 佐藤")}{mic("ON","Ch2","MC 佐藤")}</div></div>
          <div class="crow">{scn("","", "テキスト...")}
            <div class="mic"><div class="inherit">↧ 前cueから継承</div>{mic("OFF","Ch1","WL1")}{mic("OFF","Ch2","WL2")}</div></div>
          <div class="crow">{scn("MC佐藤","#16a34a","皆さんこんばんは！GMOスタジオ情報バラエティ、MCの佐藤です！")}
            <div class="mic"><div class="inherit">↧ 前cueから継承</div>{mic("OFF","Ch1","MC 佐藤")}{mic("OFF","Ch2","MC 佐藤")}</div></div>
          <div class="crow">{scn("アシ鈴木","#7c5cd6","アシスタントの鈴木です！今日も楽しい1時間にしましょう！")}
            <div class="mic"><div class="inherit">↧ 前cueから継承</div>{mic("OFF","Ch1","WL1")}{mic("OFF","Ch2","WL2")}</div></div>
        </div>
      </div>
      <div class="rpanel card" style="padding:14px">
        <div class="rtabs"><span style="color:#005bac;border-bottom:2px solid #005bac;padding-bottom:5px">列</span>
          <span style="color:#8a939e">マスター</span><span style="color:#8a939e">メタ</span></div>
        <div style="color:#8a939e;font-size:11px;font-weight:700;margin-bottom:6px">∨ 列　＋</div>
        <div class="litem">⋮⋮ 👤 シナリオ</div>
        <div class="litem">⋮⋮ 🎤 マイク香盤</div>
      </div>
    </div>
    """
    return page("Qシート", body, css)


# ---------------------------------------------------------------- 機材管理
def html_equipment():
    css = """
    .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin:16px 0;}
    .kpi{padding:15px 16px;}
    .kpi .lab{color:#5b6672;font-size:12px;font-weight:700;display:flex;align-items:center;gap:6px;}
    .kpi .val{font-size:30px;font-weight:800;margin-top:6px;}
    .kpi .val span{font-size:13px;font-weight:700;color:#1f2a37;}
    .kpi .note{color:#8a939e;font-size:11px;margin-top:4px;}
    .sec{padding:16px 18px;margin-bottom:14px;}
    .sec h3{font-size:15px;font-weight:800;margin-bottom:3px;}
    .qa{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:12px;}
    .qab{height:46px;border:1px solid #e6ebf1;border-radius:10px;display:flex;align-items:center;
      justify-content:center;gap:8px;font-size:13px;font-weight:700;color:#3a4654;}
    .small2{display:grid;grid-template-columns:1fr 1fr;gap:14px;}
    """
    def kpi(lab, icon, val, unit, note, vc="#1f2a37"):
        return f"""<div class="card kpi"><div class="lab">{icon} {lab}</div>
          <div class="val" style="color:{vc}">{val}<span> {unit}</span></div><div class="note">{note}</div></div>"""
    body = f"""
    <div class="row" style="justify-content:space-between"><div class="h1">機材ダッシュボード</div>
      <span class="btn">⟳ 更新</span></div>
    <div class="sub">機材台帳・貸出・メンテナンスの状況を一望できます。</div>
    <div class="kpis">
      {kpi("総機材数","🟦","462","件","稼働中 462 件")}
      {kpi("貸出中","⇄","1","件","遅延 1 件",vc="#2ea06b")}
      {kpi("修理・メンテ中","🔧","0","件","未対応 0 件",vc="#f59e0b")}
      {kpi("棚卸し","☑","0","件","未完了の棚卸し")}
    </div>
    <div class="card sec"><h3>クイックアクション</h3><div class="sub">よく使う操作を1タップで。</div>
      <div class="qa"><div class="qab" style="color:#005bac">＋ 貸出登録</div><div class="qab" style="color:#f59e0b">＋ メンテ記録</div>
        <div class="qab">🟦 機材一覧</div><div class="qab">🧵 ケーブル管理</div>
        <div class="qab">🔌 コネクタ管理</div><div class="qab">▦ QRスキャン</div><div class="qab">🗄 ラック実装</div></div>
    </div>
    <div class="small2">
      <div class="card sec"><div class="lab" style="color:#5b6672;font-size:12px;font-weight:700">🧵 ケーブル</div>
        <div style="font-size:26px;font-weight:800">0 <span style="font-size:13px">本</span></div>
        <div class="note" style="color:#8a939e;font-size:11px">0 種類</div></div>
      <div class="card sec"><div class="lab" style="color:#5b6672;font-size:12px;font-weight:700">🔌 コネクタ</div>
        <div style="font-size:26px;font-weight:800">0 <span style="font-size:13px">個</span></div>
        <div class="note" style="color:#8a939e;font-size:11px">0 種類</div></div>
    </div>
    """
    return page("機材管理", body, css)


# ---------------------------------------------------------------- 技術資料
def html_techsheet():
    css = """
    .thead{display:flex;align-items:center;gap:10px;margin-bottom:12px;}
    .ttabs{display:flex;gap:22px;border-bottom:1px solid #eceff3;margin-bottom:18px;padding-bottom:2px;}
    table{width:100%;border-collapse:collapse;background:#fff;border-radius:10px;overflow:hidden;
      border:1px solid #eceff3;}
    th{background:#fafbfd;color:#8a939e;font-size:12px;font-weight:700;text-align:left;padding:11px 12px;
      border-bottom:1px solid #eceff3;}
    td{padding:10px 12px;border-bottom:1px solid #f2f4f7;font-size:12px;}
    .inp{border:1px solid #e6ebf1;border-radius:7px;padding:7px 9px;font-size:12px;color:#1f2a37;background:#fff;}
    .camtag{font-size:11px;font-weight:800;color:#7c5cd6;}
    """
    def inp(v): return f'<div class="inp">{v}</div>'
    body = f"""
    <div class="thead"><span style="color:#8a939e">←</span>
      <span style="font-weight:800;font-size:16px">サイエンス・フロンティア #001</span>
      <span class="chip" style="background:#eef2f7;color:#5b6672;font-size:11px;padding:3px 8px;border-radius:6px">Ver.1.0</span>
      <span style="margin-left:auto"></span><span class="btn">🖨 印刷</span>&nbsp;<span class="btn primary">💾 保存</span></div>
    <div class="ttabs">
      <span class="tab">基本情報・スタッフ</span><span class="tab on">📷 カメラプラン</span>
      <span class="tab">🖥 映像系統</span><span class="tab">🎵 音声系統</span><span class="tab">((•)) 通信系統</span></div>
    <div class="row" style="justify-content:space-between;margin-bottom:10px">
      <div style="font-size:16px;font-weight:800">カメラプラン</div><span class="btn">＋ カメラ追加</span></div>
    <table>
      <tr><th>No.</th><th>カメラ機種</th><th>レンズ</th><th>担当者</th><th>設置場所</th><th>ケーブル/備考</th></tr>
      <tr><td><span class="camtag">CAM</span></td><td>{inp("Blackmagic URSA Mini")}</td><td>{inp("Canon CN-E 50mm T1.")}</td>
        <td>{inp("鈴木 一郎")}</td><td>{inp("MCバスト (センター)")}</td><td>{inp("SDI 12G → SW IN1")}</td></tr>
      <tr><td><span class="camtag">CAM</span></td><td>{inp("Sony PXW-FX6")}</td><td>{inp("Sony 24-70mm f/2.8 GⅡ")}</td>
        <td>{inp("高橋 美咲")}</td><td>{inp("ゲスト寄り (下手)")}</td><td>{inp("SDI 6G → SW IN2")}</td></tr>
      <tr><td><span class="camtag">CAM</span></td><td>{inp("Sony PXW-FX6")}</td><td>{inp("Sony 16-35mm f/2.8 GⅡ")}</td>
        <td>{inp("固定")}</td><td>{inp("セット全景 (上手奥)")}</td><td>{inp("SDI 6G → SW IN3")}</td></tr>
    </table>
    """
    return page("技術資料", body, css)


# ---------------------------------------------------------------- 計時LIVE（タイマー送出）
def html_live():
    css = """
    body{background:#10161e;}
    .wrap{padding:0;height:100%;}
    .liveinner{padding:26px 32px;display:flex;gap:24px;height:100%;}
    .leftcol{flex:1;display:flex;flex-direction:column;}
    .lvhead{color:#ced7e2;font-weight:800;font-size:18px;display:flex;align-items:center;gap:12px;}
    .lvbadge{background:#16a34a;color:#fff;font-size:12px;font-weight:800;border-radius:20px;padding:5px 12px;}
    .timer{font-size:120px;font-weight:800;color:#fff;letter-spacing:2px;margin-top:auto;font-variant-numeric:tabular-nums;}
    .tsub{color:#9fb0c2;font-size:14px;margin-bottom:8px;}
    .vpanels{width:430px;display:grid;grid-template-columns:1fr 1fr;grid-template-rows:1fr 1fr;gap:14px;}
    .vp{background:#1b2432;border:1px solid #2c394c;border-radius:14px;padding:16px;}
    .vp .l{color:#9fb0c2;font-size:12px;font-weight:700;}
    .vp .v{font-size:34px;font-weight:800;margin-top:8px;font-variant-numeric:tabular-nums;}
    """
    body = """
    <div class="liveinner">
      <div class="leftcol">
        <div class="lvhead">本番進行 ｜ PW 新サービス発表会 <span class="lvbadge">● LIVE</span></div>
        <div class="timer">01:24:36</div>
        <div class="tsub">経過時間 ・ 次の転換まで 03:12</div>
      </div>
      <div class="vpanels">
        <div class="vp"><div class="l">視聴者数（合算）</div><div class="v" style="color:#2ea06b">12,480</div></div>
        <div class="vp"><div class="l">Zoom</div><div class="v" style="color:#4a9de0">3,210</div></div>
        <div class="vp"><div class="l">YouTube</div><div class="v" style="color:#e2483d">8,940</div></div>
        <div class="vp"><div class="l">Teams</div><div class="v" style="color:#7c5cd6">330</div></div>
      </div>
    </div>
    """
    return page("計時LIVE", body, css, show_top=False)


# ---------------------------------------------------------------- リアルタイムCG（送出出力）
def html_cg():
    css = """
    body{background:#0a0c12;}
    .wrap{padding:0;height:100%;position:relative;}
    .spot{position:absolute;left:30%;top:4%;width:40%;height:52%;border-radius:50%;
      background:radial-gradient(closest-side,#171b27,transparent);}
    .winhdr{position:absolute;top:9%;left:0;right:0;text-align:center;color:#e7c96b;letter-spacing:.5em;
      font-weight:700;font-size:18px;font-family:'Roboto Condensed',sans-serif;}
    .wincard{position:absolute;top:18%;left:50%;transform:translateX(-50%);width:300px;height:180px;
      background:#14182433;border:2px solid #c9a961;border-radius:14px;display:flex;flex-direction:column;
      align-items:center;justify-content:center;gap:12px;}
    .wincard .ph{width:84px;height:84px;border-radius:50%;background:#2a3145;}
    .wincard .nm{color:#fff;font-weight:800;font-size:17px;}
    .lt{position:absolute;left:4%;right:4%;bottom:10%;height:96px;background:#10141e;border-left:6px solid #c9a961;
      display:flex;align-items:center;padding:0 18px;gap:16px;}
    .lt .ph{width:64px;height:64px;border-radius:50%;background:#2a3145;}
    .lt .nm{color:#fff;font-weight:800;font-size:22px;}
    .lt .af{color:#c9a961;font-size:13px;font-weight:700;margin-top:4px;}
    .lt .af span{color:#adb7c4;font-weight:500;}
    .bars{position:absolute;right:5%;top:16%;display:flex;flex-direction:column;gap:9px;}
    .bar{height:14px;border-radius:3px;}
    """
    body = """
    <div class="spot"></div>
    <div class="winhdr">— THE WINNER —</div>
    <div class="wincard"><div class="ph"></div><div class="nm">グローバルスタジオ賞</div></div>
    <div class="bars">
      <div class="bar" style="width:200px;background:#e7c96b"></div>
      <div class="bar" style="width:140px;background:#4a9de0"></div>
      <div class="bar" style="width:96px;background:#c45a5a"></div>
    </div>
    <div class="lt"><div class="ph"></div>
      <div><div class="nm">田中 太郎</div>
        <div class="af">GMOグローバルスタジオ　<span>｜　制作部 部長</span></div></div></div>
    """
    return page("リアルタイムCG", body, css, show_top=False)


# ---------------------------------------------------------------- 予算ダッシュボード
def html_budget():
    css = """
    .cond{padding:14px 16px;margin:14px 0;}
    .cond h3{font-size:14px;font-weight:800;}
    .fields{display:flex;gap:18px;margin-top:10px;}
    .fld{flex:0 0 auto;}
    .fld .l{color:#5b6672;font-size:11px;font-weight:700;margin-bottom:4px;}
    .fld .b{border:1px solid #e0e6ee;border-radius:8px;padding:8px 12px;font-size:12px;color:#1f2a37;background:#fff;min-width:150px;}
    .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin:14px 0;}
    .kpi{padding:14px;}
    .kpi .l{color:#5b6672;font-size:11px;font-weight:700;}
    .kpi .v{font-size:26px;font-weight:800;margin-top:6px;}
    .pl{padding:16px 18px;}
    .pl h3{font-size:14px;font-weight:800;margin-bottom:2px;}
    .plrow{display:flex;justify-content:space-between;padding:9px 8px;border-bottom:1px solid #f2f4f7;font-size:13px;}
    .plrow.ind{padding-left:26px;color:#5b6672;}
    .plrow.sum{font-weight:800;}
    """
    def kpi(l,v,vc="#1f2a37"): return f'<div class="card kpi"><div class="l">{l}</div><div class="v" style="color:{vc}">{v}</div></div>'
    body = f"""
    <div class="row" style="justify-content:space-between"><div class="h1">予算ダッシュボード</div><span class="btn">⟳ 更新</span></div>
    <div class="sub">月次の売上・仕入・粗利・販管費・営業利益を単一画面で確認します。　2026年05月</div>
    <div class="card cond"><h3>集計条件</h3>
      <div class="fields"><div class="fld"><div class="l">年月</div><div class="b">2026年05月 📅</div></div>
        <div class="fld"><div class="l">案件（任意）</div><div class="b">— 全案件（販管費含む） —　⌄</div></div></div></div>
    <div class="kpis">
      {kpi("売上","¥6,300,000")}{kpi("仕入","¥1,800,000")}{kpi("粗利","¥4,500,000",vc="#2ea06b")}
      {kpi("販管費","¥1,200,000")}{kpi("営業利益","¥3,300,000",vc="#2ea06b")}</div>
    <div class="card pl"><h3>📑 損益詳細</h3><div class="sub">インデント式で費目の階層を表します。</div>
      <div style="margin-top:10px">
        <div class="plrow sum"><span>売上合計</span><span>¥6,300,000</span></div>
        <div class="plrow ind"><span>仕入合計</span><span>¥1,800,000</span></div>
        <div class="plrow sum"><span>粗利</span><span style="color:#2ea06b">¥4,500,000</span></div>
        <div class="plrow ind"><span>販管費合計</span><span>¥1,200,000</span></div>
        <div class="plrow sum"><span>営業利益</span><span style="color:#2ea06b">¥3,300,000</span></div></div></div>
    """
    return page("予算管理", body, css)


# ---------------------------------------------------------------- カンバン（タスク）
def html_kanban():
    css = """
    .ktabs{display:flex;align-items:center;gap:18px;margin:12px 0 16px;font-size:13px;color:#8a939e;font-weight:700;}
    .ktabs .on{color:#1f2a37;}
    .board{padding:14px 16px;}
    .bhead{font-weight:800;font-size:14px;margin-bottom:12px;display:flex;align-items:center;gap:10px;}
    .badge{background:#dbe7f5;color:#005bac;font-size:11px;font-weight:800;border-radius:20px;padding:2px 10px;}
    .cols{display:grid;grid-template-columns:repeat(6,1fr);gap:10px;}
    .col .ch{font-size:11px;font-weight:800;color:#5b6672;display:flex;justify-content:space-between;margin-bottom:8px;}
    .dot{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:5px;}
    .tk{background:#f7f9fc;border:1px solid #eceff3;border-radius:8px;padding:8px 9px;font-size:11px;margin-bottom:7px;color:#1f2a37;}
    .tk.done{color:#b6bfca;text-decoration:line-through;background:#fafbfc;}
    """
    cols = [("未着手","#9aa6b2","1",["請求書作成"]),
            ("台本作成","#2f80ed","2",["スタッフ弁当手配","台本クライアント確認"]),
            ("素材準備","#16a34a","3",["スタジオ機材手配","テロップ素材制作","VTR素材収集"]),
            ("収録","#f59e0b","3",["台本第1稿","本番収録","リハーサル"]),
            ("確認中","#f59e0b","2",["編集・MA確認","クライアント最終試写"]),
            ("完了","#16a34a","",["企画書作成","クライアント事前打合せ"])]
    colhtml=""
    for name,c,n,cards in cols:
        cs="".join(f'<div class="tk{" done" if name=="完了" else ""}">{t}</div>' for t in cards)
        colhtml+=f'<div class="col"><div class="ch"><span><span class="dot" style="background:{c}"></span>{name}</span><span>{n}</span></div>{cs}</div>'
    body=f"""
    <div class="ktabs"><span>▦ <span class="on">カンバン</span></span><span>☰ タスクリスト</span><span>≡ ガント</span>
      <span style="color:#8a939e">18案件 ・ 81タスク</span><span style="margin-left:auto">⟳ 更新</span></div>
    <div class="card board">
      <div class="bhead">GLS-A004 PW 新サービス発表会 <span class="badge">11件</span> <span style="color:#16a34a;font-size:11px;font-weight:700">完了2件</span></div>
      <div class="cols">{colhtml}</div></div>
    <div class="card board" style="margin-top:12px">
      <div class="bhead">GLS-A006 DA 社内イベント中継 <span class="badge">11件</span> <span style="color:#16a34a;font-size:11px;font-weight:700">完了2件</span></div>
      <div class="cols">{colhtml}</div></div>
    """
    return page("案件管理", body, css)


# ---------------------------------------------------------------- ガント
def html_gantt():
    css = """
    .gtabs{display:flex;align-items:center;gap:18px;margin:12px 0 14px;font-size:13px;color:#8a939e;font-weight:700;}
    .gtabs .on{color:#1f2a37;}
    .gwrap{display:grid;grid-template-columns:230px 1fr;border:1px solid #eceff3;border-radius:10px;overflow:hidden;background:#fff;}
    .gleft .r,.gright .r{height:34px;border-bottom:1px solid #f2f4f7;display:flex;align-items:center;padding:0 12px;font-size:12px;}
    .gleft .grp{font-weight:800;background:#fafbfd;}
    .gright{position:relative;background:linear-gradient(#fff,#fff);}
    .gright .hd{height:30px;border-bottom:1px solid #eceff3;color:#8a939e;font-size:11px;display:flex;align-items:center;padding-left:12px;}
    .bar{position:absolute;height:18px;border-radius:5px;color:#fff;font-size:10px;display:flex;align-items:center;padding:0 7px;}
    .dotc{width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:8px;}
    """
    tasks=[("スタジオ機材手配","#2f80ed",58,20),("テロップ素材制作","#2f80ed",66,18),("VTR素材収集","#2f80ed",54,16),
           ("企画書作成","#16a34a",10,16),("クライアント事前打合せ","#16a34a",24,18),("台本第1稿","#f59e0b",40,22),
           ("台本クライアント確認","#7c5cd6",62,16),("本番収録","#f59e0b",78,12),("編集・MA確認","#f59e0b",84,10)]
    left='<div class="r grp">GLS-A004 PW 新サービス発表会</div>'+ "".join(f'<div class="r"><span class="dotc" style="background:{c}"></span>{t}</div>' for t,c,_,_ in tasks)
    rows='<div class="hd">2026/05</div>'
    for i,(t,c,x,w) in enumerate(tasks):
        top=30+i*34+8
        rows+=f'<div class="r" style="border:none"></div>' if False else ''
        rows+=f'<div class="bar" style="top:{top}px;left:{x}%;width:{w}%;background:{c}">{t if w>14 else ""}</div>'
    # baseline rows for grid lines on right
    rightrows="".join('<div class="r" style="border-bottom:1px solid #f4f6f9"></div>' for _ in tasks)
    body=f"""
    <div class="gtabs"><span>▦ カンバン</span><span>☰ タスクリスト</span><span>≡ <span class="on">ガント</span></span>
      <span style="color:#8a939e">18案件 ・ 81タスク</span></div>
    <div class="gwrap"><div class="gleft">{left}</div>
      <div class="gright"><div class="hd">2026 / 05</div>{rightrows}{rows}</div></div>
    """
    return page("案件管理", body, css)


# ---------------------------------------------------------------- スタジオ予約
def html_studio():
    css = """
    .stop{display:flex;align-items:center;justify-content:space-between;}
    .legend{display:flex;flex-wrap:wrap;gap:14px;margin:14px 0;font-size:11px;color:#5b6672;}
    .legend i{width:9px;height:9px;border-radius:50%;display:inline-block;margin-right:5px;}
    .calhd{display:flex;align-items:center;justify-content:space-between;margin:10px 0;}
    .seg{display:flex;gap:6px;}
    .seg span{border:1px solid #e0e6ee;border-radius:7px;padding:5px 11px;font-size:12px;color:#5b6672;font-weight:700;}
    .nav span{background:#475569;color:#fff;border-radius:7px;padding:6px 11px;font-size:12px;font-weight:700;margin-right:6px;}
    .cal{border:1px solid #eceff3;border-radius:10px;overflow:hidden;background:#fff;}
    .wk{display:grid;grid-template-columns:repeat(7,1fr);background:#fafbfd;}
    .wk div{padding:9px;text-align:center;font-size:12px;font-weight:700;color:#5b6672;border-right:1px solid #f2f4f7;}
    .days{display:grid;grid-template-columns:repeat(7,1fr);}
    .day{height:62px;border-right:1px solid #f2f4f7;border-top:1px solid #f2f4f7;padding:6px 8px;font-size:11px;color:#5b6672;text-align:right;}
    .recent{padding:13px 16px;margin:12px 0;color:#8a939e;font-size:12px;text-align:center;}
    """
    LEG=[("本番","#e2483d"),("リハーサル","#f59e0b"),("仮押さえ","#2f80ed"),("相談","#16a34a"),
         ("メンテナンス","#475569"),("内覧","#7c5cd6"),("社内利用","#0ea5b7"),("設営/準備","#f59e0b"),("その他","#9aa6b2")]
    leg="".join(f'<span><i style="background:{c}"></i>{n}</span>' for n,c in LEG)
    # 5月カレンダー（4/26始まり）
    cells=[("26",1),("27",0),("28",0),("29",1),("30",0),("1",0),("2",2)]
    rows=""
    start=26; cur=[]
    seq=[("26",0.06),("27",0),("28",0),("29",0.06),("30",0),("1",0),("2",0.05),
         ("3",0.06),("4",0.05),("5",0),("6",0.05),("7",0),("8",0),("9",0.05),
         ("10",0.06),("11",0.05),("12",0.05),("13",0),("14",0),("15",0.05),("16",0.05),
         ("17",0.06),("18",0.05),("19",0),("20",0),("21",0),("22",0),("23",0.05)]
    cellhtml=""
    for d,tint in seq:
        bg = f"background:rgba(226,72,61,{tint})" if tint else ""
        cellhtml+=f'<div class="day" style="{bg}">{d}日</div>'
    body=f"""
    <div class="stop"><div><div class="h1">スタジオ予約</div><div class="sub">カレンダーをタップして予約を追加</div></div>
      <div class="row gap"><span class="btn">▽ 部屋</span><span class="btn">🗓 カレンダー連携</span><span class="btn">⚙ 部屋管理</span><span class="btn primary">＋ 予約追加</span></div></div>
    <div class="card recent">📅 直近の予定（今日から7日間）<br><span style="display:block;margin-top:8px">直近7日間に予定はありません</span></div>
    <div class="legend">{leg}　<span style="color:#9aa6b2">※斜体・薄色は未確定の予約</span></div>
    <div class="calhd"><div class="nav"><span>‹ ›</span><span style="background:#e0e6ee;color:#3a4654">今日</span></div>
      <div style="font-weight:800">2026年5月</div>
      <div class="seg"><span style="background:#475569;color:#fff">月</span><span>週</span><span>日</span><span>一覧</span></div></div>
    <div class="cal"><div class="wk"><div>日</div><div>月</div><div>火</div><div>水</div><div>木</div><div>金</div><div style="border:none">土</div></div>
      <div class="days">{cellhtml}</div></div>
    """
    return page("カレンダー", body, css)


# ---------------------------------------------------------------- ユーザー管理
def html_users():
    css = """
    table{width:100%;border-collapse:collapse;}
    th{text-align:left;color:#8a939e;font-size:12px;font-weight:700;padding:12px 10px;border-bottom:1px solid #eceff3;}
    td{padding:14px 10px;border-bottom:1px solid #f2f4f7;font-size:13px;}
    .rl{font-size:11px;font-weight:800;border-radius:20px;padding:4px 12px;}
    .rl.admin{background:#f8d7d5;color:#c0392b;}.rl.staff{background:#dbe7f5;color:#2f6fb0;}
    .st{font-size:11px;font-weight:700;border-radius:20px;padding:4px 12px;background:#ddf1e7;color:#2ea06b;}
    .act{color:#9aa6b2;font-size:14px;}
    """
    def row(n,m,role,admin=False):
        rl=f'<span class="rl admin">システム管理者</span>' if admin else f'<span class="rl staff">スタッフ</span>'
        return f'<tr><td style="font-weight:700">{n}</td><td style="color:#5b6672">{m}</td><td>{rl}</td><td><span class="st">有効</span></td><td style="color:#5b6672">2026/04/14</td><td class="act">🔑 ✏ 🗑</td></tr>'
    body=f"""
    <div class="row" style="justify-content:space-between"><div><div class="h1">ユーザー管理</div>
      <div class="sub">ロールは「管理者」または「スタッフ」の2種類。アプリ別の権限は 🔑 ボタンで設定します。</div></div>
      <div class="row gap"><span class="btn">🔑 権限修復</span><span class="btn primary">＋ 新規追加</span></div></div>
    <div class="card" style="padding:6px 14px;margin-top:16px"><table>
      <tr><th>名前</th><th>メール</th><th>ロール</th><th>ステータス</th><th>作成日</th><th></th></tr>
      {row("システム管理者","account@gmo-globalstudio.com","",admin=True)}
      {row("佐藤 花子","sato@globalstudio.example.com","")}
      {row("外部 クライアント","client@example.com","")}
      {row("田中 健二","tanaka@globalstudio.example.com","")}
      {row("鈴木 一郎","suzuki@globalstudio.example.com","")}
      {row("高橋 美咲","takahashi@globalstudio.example.com","")}
    </table></div>
    """
    return page("システム管理", body, css)


# ---------------------------------------------------------------- DBビューア
def html_dbviewer():
    css = """
    .dwrap{display:grid;grid-template-columns:230px 1fr;gap:16px;height:calc(100% - 10px);}
    .tlist{border:1px solid #eceff3;border-radius:10px;background:#fff;padding:10px;overflow:hidden;}
    .tlist .hd{font-size:12px;font-weight:800;color:#5b6672;margin-bottom:8px;}
    .ti{display:flex;justify-content:space-between;align-items:center;padding:7px 9px;border-radius:7px;font-size:12px;color:#3a4654;}
    .ti.on{background:#005bac;color:#fff;}
    .ti .c{font-size:10px;opacity:.7;}
    .ti small{display:block;font-size:9px;color:#9aa6b2;}
    .ti.on small{color:#cfe0f2;}
    .dmain{border:1px solid #eceff3;border-radius:10px;background:#fff;padding:12px 14px;}
    .dtop{display:flex;align-items:center;gap:10px;margin-bottom:10px;}
    table{width:100%;border-collapse:collapse;}
    th{text-align:left;color:#8a939e;font-size:11px;font-weight:700;padding:9px 8px;border-bottom:1px solid #eceff3;}
    td{padding:9px 8px;border-bottom:1px solid #f4f6f9;font-size:11px;color:#1f2a37;}
    """
    TBLS=[("案件","projects","28",True),("顧客","customers","10",False),("仕入先","vendors","9",False),
          ("会社","companies","18",False),("パートナー(個人)","partners","5",False),("売上","revenues","38",False),
          ("売上明細","revenue_items","124",False),("売上按分","revenue_allocations","4",False),
          ("仕入","purchases","17",False),("仕入按分","purchase_allocations","4",False),
          ("費用按分グループ","project_groups","2",False)]
    ti="".join(f'<div class="ti{" on" if on else ""}"><span>{j}<small>{e}</small></span><span class="c">{c}</span></div>' for j,e,c,on in TBLS)
    rows=[("febec1c9","OPP-202603-0031","GLS-B002","PW 動画戦略コンサルティング"),
          ("efae7af8","OPP-202603-0008","","富士見 バラエティ撮影"),
          ("e98414d3","OPP-202603-0003","","DA 動画配信スタジオ定期利用"),
          ("e26bde09","OPP-202603-0022","GLS-A003","SN 生放送「ナイトトーク」"),
          ("d3f80fb1","OPP-202604-0002","GLS-A010","テストテスト掛田"),
          ("d1236ddd","OPP-202603-0009","","PW IR動画制作"),
          ("d01ba34f","OPP-202603-0020","GLS-A001","GH IR説明会 2026春"),
          ("bfa069d6","OPP-202603-0025","GLS-A006","DA 社内イベント中継")]
    tr="".join(f'<tr><td>✏ 🗑</td><td>{i}</td><td>{c}</td><td>{e}</td><td style="font-weight:600">{n}</td></tr>' for i,c,e,n in rows)
    body=f"""
    <div class="dwrap">
      <div class="tlist"><div class="hd">🗄 テーブル一覧</div>
        <div style="font-size:10px;color:#9aa6b2;font-weight:700;margin:4px 0 4px">🏛 案件管理</div>{ti}</div>
      <div class="dmain">
        <div class="dtop"><b style="font-size:15px">案件</b><span style="color:#9aa6b2;font-size:12px">projects</span>
          <span class="badge" style="background:#dbe7f5;color:#005bac;font-size:11px;font-weight:800;border-radius:20px;padding:2px 9px">28件</span>
          <span style="margin-left:auto"></span><span class="btn">🔍 検索...</span>&nbsp;<span class="btn">50件 ⌄</span>&nbsp;<span class="btn">⬇ CSV</span></div>
        <table><tr><th></th><th>ID ↕</th><th>code ↕</th><th>イベントコード ↕</th><th>名前 ↕</th></tr>{tr}</table>
        <div style="color:#9aa6b2;font-size:11px;margin-top:10px">全 28 件中 1〜28 件（ページ 1 / 1）</div></div>
    </div>
    """
    return page("システム管理", body, css)


SCREENS = {
    "projects": html_projects, "qsheet": html_qsheet, "equipment": html_equipment,
    "techsheet": html_techsheet, "live": html_live, "cg": html_cg,
    "budget": html_budget, "kanban": html_kanban, "gantt": html_gantt,
    "studio": html_studio, "users": html_users, "dbviewer": html_dbviewer,
}


def main():
    with sync_playwright() as p:
        b = p.chromium.launch(executable_path=CHROME, args=["--no-sandbox"])
        for key, fn in SCREENS.items():
            pg = b.new_page(viewport={"width": W, "height": H}, device_scale_factor=2)
            pg.set_content(fn(), wait_until="networkidle")
            pg.wait_for_timeout(250)
            out = os.path.join(OUT, key + ".png")
            pg.screenshot(path=out)
            pg.close()
            print("rendered", out)
        b.close()


if __name__ == "__main__":
    main()
