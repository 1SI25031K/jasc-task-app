# フェーズ8 学習ガイド：本番デプロイと受け入れ検証・試験運用準備

このドキュメントでは、フェーズ8で実施した **Streamlit Community Cloud への本番デプロイ**、**秘密情報のクラウド管理（Secrets）**、**Google OAuth 2.0 リダイレクト URI の完全一致原則**、**受け入れ条件（Acceptance Criteria）の検証チェックリスト**、および **試験運用に向けた不具合報告（Issue テンプレート）の設計** について、プログラミング学習者向けに分かりやすく解説します。

---

## 1. このフェーズで実施したこと（全体像）

1. **Streamlit Community Cloud へのデプロイ設計**:
   - GitHub の private リポジトリから、安全にクラウドへ Web アプリケーションを公開する手順を確立しました。
2. **クラウド環境での秘密情報管理（Secrets）**:
   - ローカルの `.streamlit/secrets.toml` を使わず、Streamlit Community Cloud の管理画面上の Secrets（暗号化ストレージ）から環境変数を安全に注入する運用を整備しました。
3. **Google OAuth 2.0 リダイレクト URI の本番登録**:
   - ローカル環境（`http://localhost:8501/oauth2callback`）と本番クラウド環境（`https://<app>.streamlit.app/oauth2callback`）の違いを理解し、GCP コンソールへの安全な登録方法をまとめました。
4. **受入検証チェックリスト（[`docs/release_checklist.md`](../release_checklist.md)）の策定**:
   - 要件定義書（`docs/requirements.md`）のリリース条件全14項目（セキュリティ S1〜S14、楽観的ロック、数式インジェクション防止、スマホ操作性、英語UI等）について、客観的な合格判定基準と確認手順を明文化しました。
5. **不具合報告用 GitHub Issue テンプレートの整備**:
   - 実行委員がパイロット運用中に発生したバグや違和感を迷わず報告できるよう、親しみやすい報告フォームを構築しました。

---

## 2. 新しく出てきた概念・ツールの解説

### ① PaaS（Platform as a Service）と Streamlit Community Cloud
- **従来の Web サーバー（IaaS / VPS）**:
  - Linux サーバー（AWS EC2 や さくらのVPS 等）を契約し、OS のアップデート、Python のインストール、Nginx によるリバースプロキシ設定、SSL 証明書（HTTPS）の更新、ポート開放などをすべて自分で行う必要がありました。初心者にはハードルが高く、セキュリティリスクもあります。
- **PaaS（Streamlit Community Cloud）**:
  - GitHub リポジトリを指定するだけで、サーバーの立ち上げ、HTTPS 化、Python 仮想環境の構築、依存ライブラリのインストールを**すべてクラウド側が自動実行**してくれます。
  - アプリの開発者は「コードを書くこと」と「Git に push すること」だけに集中できます。

### ② クラウドにおける Secrets 管理と多層防御
- **なぜローカルのファイルをアップロードしてはいけないのか**:
  - `.streamlit/secrets.toml` には、Google スプレッドシートを操作できるサービスアカウントの秘密鍵や、Gemini API キー、Slack Bot トークンなどの「最重要機密」が書かれています。
  - これらを誤って Git に push してしまうと、たとえ private リポジトリであっても、将来リポジトリの公開範囲を変更した際や第三者を招待した際に漏洩する危険があります。
- **Streamlit Community Cloud の Secrets 機構**:
  - クラウドのサーバー内に秘密のファイルとして暗号化保管され、アプリ実行時にメモリ上でのみ `st.secrets` として展開されます。コードには一切秘密情報を書かずに済みます。

### ③ OAuth 2.0 における「リダイレクト URI」の完全一致原則
- **リダイレクト URI（コールバック URL）とは**:
  - Google ログイン画面でユーザーが「同意する」を押したあと、Google が認証トークン（許可証）を届ける先の Web ページのアドレスです。
- **なぜ厳密な完全一致が求められるのか**:
  - もし Google が「似たような URL」や「ワイルドカード（`*.streamlit.app`）」へのリダイレクトを許してしまうと、悪意のある攻撃者が偽のサイトを用意し、認証トークンを横取りできてしまいます。
  - そのため Google Cloud Console では、**スキーム（`https://`）、ドメイン名、パス（`/oauth2callback`）が 1 文字の狂いもなく完全一致**していなければ、エラー `400: redirect_uri_mismatch` を出して処理を即時中断する厳格な仕様になっています。

### ④ 受け入れ基準（Acceptance Criteria）と品質保証
- **「動いた！」と「リリースできる」の違い**:
  - 自分の PC で開発者自身が操作して動くのは、開発の第一歩に過ぎません。
  - 「未登録の人がアクセスしたらどうなるか」「2 人が同時に保存したらどうなるか」「スマホで押せるか」「悪意のある数式が入力されたら防げるか」といった、**様々な例外状況やセキュリティ要件をクリアして初めて本番公開できます**。
  - これを第三者でも追試できるように手順化したものが「受入検証チェックリスト」です。

---

## 3. 重要コード・設定のウォークスルー

### ① Google OAuth リダイレクト URI の動的取得（`core/auth.py`）

```python
def get_redirect_uri() -> str:
    """設定からリダイレクト URI を取得する。"""
    try:
        # 1. secrets.toml または Streamlit Cloud Secrets の [auth] セクションから取得
        if "auth" in st.secrets and "redirect_uri" in st.secrets["auth"]:
            return st.secrets["auth"]["redirect_uri"]
    except Exception:
        pass
    # 2. 設定がない場合はローカル開発用のデフォルト値にフォールバック
    return "http://localhost:8501/oauth2callback"
```
- **解説**:
  - アプリは自分がローカル PC（`localhost:8501`）で動いているのか、本番クラウド（`xxx.streamlit.app`）で動いているのかを、Secrets の設定値から自律的に判断します。
  - 本番環境の Secrets に `redirect_uri = "https://あなたのサブドメイン.streamlit.app/oauth2callback"` を設定するだけで、コードを 1 行も書き換えることなく本番認証へと切り替わります。

### ② 定時処理の二重送信を防ぐ「冪等性」ロジック（`scripts/daily_job.py`）

```python
# 送信対象アイテムのユニークなハッシュ値を生成
item_hash = compute_item_hash(date_str, member.member_id, reminder_type)

# reminder_log シートにすでに記録があるか確認
if repo.has_reminder_been_sent(item_hash):
    logger.info(f"すでに送信済みのためスキップ: {member.display_name} ({reminder_type})")
    continue

# 未送信の場合のみ Slack に送信し、記録を残す
notifier.send_dm(member.slack_user_id, message)
repo.record_reminder_log(ReminderLogEntry(item_hash=item_hash, sent_at=now))
```
- **解説**:
  - クラウドの定時処理（GitHub Actions 等）では、ネットワーク瞬断やサーバーのリトライによって同じ処理が 2 回実行される可能性があります。
  - 「何回実行しても結果が 1 回分と同じになる性質」を**冪等性（べきとうせい / Idempotence）**と呼びます。送信履歴シート（`reminder_log`）とハッシュ値を用いて重複送信を根本から防いでいます。

### ③ クラウド休止（スリープ）と定時処理の分離（`.github/workflows/daily.yml`）

```yaml
name: Daily Morning Job
on:
  schedule:
    # 毎日 UTC 23:00（日本時間 JST 朝 08:00）に自動起動
    - cron: '0 23 * * *'
  workflow_dispatch: # 手動実行ボタンも許可
jobs:
  run-daily-job:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: astral-sh/setup-uv@v5
      - run: uv sync
      - run: uv run python scripts/daily_job.py
        env:
          GCP_SERVICE_ACCOUNT_JSON: ${{ secrets.GCP_SERVICE_ACCOUNT_JSON }}
          SPREADSHEET_ID: ${{ secrets.SPREADSHEET_ID }}
          SLACK_BOT_TOKEN: ${{ secrets.SLACK_BOT_TOKEN }}
```
- **解説**:
  - Streamlit Community Cloud は無料利用枠のため、約 12 時間アクセスがないと自動的にスリープ（一時休止）します。
  - しかし、毎朝のリマインドや日次集計を「Streamlit アプリの内部」ではなく、**GitHub Actions という独立した cron 実行基盤**に任せることで、Web アプリが眠っていても毎朝 8:00 に確実に Slack 通知とシート集計が行われます。

---

## 4. 理解度チェック（質問と解答）

以下の質問について、まずは自分で答えを考えてから「解答を見る」をクリックしてみてください。

<details>
<summary><b>Q1: Streamlit Community Cloud でアプリのサブドメイン（URL）を変更したところ、Google ログインを押すと「エラー 400: redirect_uri_mismatch」が表示されてログインできなくなりました。なぜですか？また、どの2箇所を修正すれば直りますか？</b></summary>

**【解答】**
- **理由**:
  - Google OAuth はセキュリティ上、事前に登録された「承認済みのリダイレクト URI」と完全に一致するアドレスにしか認証トークンを返しません。サブドメインが変わったことで URL が不一致となったため、Google が攻撃の疑いとして遮断したからです。
- **修正が必要な2箇所**:
  1. **Google Cloud Console（GCP）**: 「API とサービス」>「認証情報」> OAuth 2.0 クライアント ID の「承認済みのリダイレクト URI」に、新しい URL（`https://新サブドメイン.streamlit.app/oauth2callback`）を追加して保存する。
  2. **Streamlit Community Cloud の Secrets**: `[auth]` セクションの `redirect_uri` を新しい URL（`https://新サブドメイン.streamlit.app/oauth2callback`）に書き換えて保存する。
</details>

<details>
<summary><b>Q2: スプレッドシート連携において、タスク名に <code>=SUM(A1:A10)</code> や <code>=HYPERLINK(...)</code> と入力された場合、なぜ <code>value_input_option="RAW"</code> で書き込むことが安全で、<code>USER_ENTERED</code> だと危険なのですか？</b></summary>

**【解答】**
- **理由**:
  - `USER_ENTERED` は、スプレッドシートが文字列を自動解析し、先頭が `=` であれば「計算式（数式）」として解釈・実行してしまいます。これにより、外部サーバーへデータを送信する悪意のある数式（数式インジェクション攻撃）が実行される危険があります。
  - 一方、`value_input_option="RAW"` を指定すると、Google スプレッドシートはすべての入力を「ただのプレーンテキスト文字列」としてそのまま格納します。そのため、先頭に `=` があっても計算や外部通信が行われず、安全に保存・表示されます。
</details>

<details>
<summary><b>Q3: Streamlit Community Cloud は無料プランの場合、約12時間アクセスがないと自動でスリープします。なぜ実行委員会への毎朝 8:00 の Slack リマインドは、アプリが休止中でも問題なく届くのですか？</b></summary>

**【解答】**
- **理由**:
  - 毎朝の定時処理（`scripts/daily_job.py`）は Streamlit のサーバー上で動いているのではなく、**GitHub Actions** という別の独立したクラウド環境で動いているからです。
  - GitHub Actions が毎朝 8:00 JST に自律的に起動し、Google スプレッドシートと Slack API と直接通信して処理を完結させるため、Web アプリ（Streamlit）がアクセス休止中であっても影響を受けずにリマインドが届きます。
</details>

