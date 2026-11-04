# JASC79 タスク・NA管理アプリ

日米学生会議（JASC79）実行委員会のタスク・次のアクション（NA）・体感負荷を統合管理し、特定のメンバーへの過負荷を防ぎながら全員で協力して会議を成功させるための Web アプリケーションです。

---

## 1. プロダクト概要

- **目的**: 
  - 各役職のタスク状況と直近の Next Action（NA）を可視化。
  - 「自動負荷（タスク件数×重さ）」と「体感負荷（1〜10のチェックイン）」のギャップを早期発見。
  - 「依頼 → 承諾 / 相談」のワークフローにより、合意に基づくスムーズな分担を実現。
  - 会議議事録からの Gemini AI による NA 自動抽出と、Slack 毎朝リマインドによる抜け漏れ防止。
- **アーキテクチャ**:
  - **フロントエンド / UI**: Streamlit（PC / スマートフォン対応・日英バイリンガル）
  - **データベース / バックエンド**: Google スプレッドシート（RAW モード書き込み、楽観的排他制御）
  - **認証**: Google OAuth 2.0 / OIDC（実行委員名簿に登録された Google アカウント限定アクセス）
  - **AI 連携**: Google Gemini API（構造化 JSON 出力、個人情報自動マスキング）
  - **通知 / 定時処理**: Slack SDK + GitHub Actions（毎朝 8:00 JST 自動配信、手動実行対応）

---

## 2. 必要要件・技術スタック

- **Python**: 3.12 以上
- **パッケージマネージャ**: `uv`（推奨）または `pip`
- **主要ライブラリ**:
  - `streamlit==1.66.1`
  - `authlib==1.9.3`
  - `google-genai==2.34.0`
  - `gspread==6.2.1`
  - `slack-sdk==3.46.0`
  - `altair==6.0.0`
  - `pydantic==2.12.5`
  - `pip-audit==2.10.1`（セキュリティ診断）
  - `pytest==9.2.0`（単体テスト）

---

## 3. ローカル開発環境のセットアップ

### ステップ 1: リポジトリのクローンと環境準備

```bash
# リポジトリのクローン
git clone https://github.com/your-org/jasc-task-app.git
cd jasc-task-app

# uv を用いた依存関係の同期（仮想環境の自動構築）
uv sync
```

### ステップ 2: 設定ファイル（secrets.toml）の作成

見本ファイルをコピーして `.streamlit/secrets.toml` を作成します。
（`.streamlit/secrets.toml` は `.gitignore` に含まれており、Git にはコミットされません）

```bash
cp .streamlit/secrets.toml.example .streamlit/secrets.toml
```

ローカルで手軽に動作確認する場合は、`.streamlit/secrets.toml` を以下のように設定します（外部 API や Google Cloud 不要）：

```toml
repository_backend = "memory"
na_extractor_backend = "dummy"

[auth]
redirect_uri = "http://localhost:8501/oauth2callback"
cookie_secret = "your-random-32-byte-secret-string-here"
```

### ステップ 3: ローカル起動

```bash
uv run streamlit run app.py
```

ブラウザで `http://localhost:8501` にアクセスします。
（インメモリモード時は、テスト用の Google ログイン画面が表示され、画面上のメンバー切替や各種機能をお試しいただけます）

---

## 4. 外部サービスの設定ガイド（本番・スプレッドシート連携時）

### 4.1 Google Cloud（GCP）サービスアカウントの作成

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、プロジェクトを作成します。
2. **API とサービス** > **ライブラリ** から以下を検索して有効化します：
   - `Google Sheets API`
   - `Google Drive API`
3. **IAM と管理** > **サービス アカウント** > **サービス アカウントを作成** をクリック：
   - アカウント名：`jasc-task-app-sa`
   - ロール付与はスキップして「完了」
4. 作成したサービスアカウントの **キー** タブ > **鍵を追加** > **新しい鍵を作成**（JSON 形式）を選択し、鍵ファイルを安全にダウンロードします。
5. 本番用 Google スプレッドシートを新規作成し、右上の「共有」ボタンからサービスアカウントのメールアドレス（`...@...iam.gserviceaccount.com`）に **編集者** 権限を付与します。
6. ダウンロードした JSON の内容を `.streamlit/secrets.toml` の `[gcp_service_account]` に転記し、`spreadsheet_id` にシートの ID を設定します。

### 4.2 Google OAuth 2.0（ログイン認証）の設定

1. Google Cloud Console の **API とサービス** > **OAuth 同意画面** を設定：
   - User Type：**外部**（または Workspace 内のみなら「内部」）
   - アプリ名、ユーザーサポートメールを入力して保存
2. **認証情報** > **認証情報を作成** > **OAuth クライアント ID**:
   - アプリケーションの種類：**ウェブ アプリケーション**
   - 名前：`JASC79 Task App OAuth`
   - **承認済みのリダイレクト URI**:
     - ローカル用: `http://localhost:8501/oauth2callback`
     - 本番用: `https://<あなたのサブドメイン>.streamlit.app/oauth2callback`
3. 発行された **クライアント ID** と **クライアント シークレット** を `.streamlit/secrets.toml` の `[auth.google]` に設定します。

### 4.3 Google AI Studio（Gemini API）の設定

1. [Google AI Studio](https://aistudio.google.com/) にアクセスし、**Get API key** からキーを発行します。
2. **利用上限（Quota）と予算アラートの設定**:
   - Google Cloud Console の **お支払い** > **予算とアラート** にて月額予算（例：\$10）を設定し、アラート通知先を指定します。
3. **無料枠と有料枠の規約（S11）**:
   - **無料枠**: 入力データが Google の製品改善や人間のレビュアーによる確認対象となる可能性があります。運用時は自動マスキング（`core/masking.py`）によりメール・電話番号を除去しますが、センシティブなメモの送信には注意が必要です。
   - **有料枠（推奨）**: Google Workspace / Cloud の顧客データ保護規約が適用され、モデルの学習には使用されません。
4. API キーを `.streamlit/secrets.toml` の `gemini_api_key` に設定し、モデル名に `gemini-2.5-flash` を指定します。

### 4.4 Slack アプリ（Bot）の設定

1. [Slack API: Your Apps](https://api.slack.com/apps) にアクセスし、**Create New App** > **From scratch** を選択。
2. **OAuth & Permissions** の **Bot Token Scopes** に以下の **2つの最小権限（S14）のみ** を付与：
   - `chat:write`（チャンネルおよび DM へのメッセージ送信）
   - `im:write`（個人宛てダイレクトメッセージの会話開始）
3. **Install to Workspace** をクリックしてワークスペースにインストールし、発行された **Bot User OAuth Token**（`xoxb-...`）をコピーします。
4. Slack 上で定時まとめを投稿したいチャンネル（例：`#jasc79-task-bot`）を作成し、Bot を招待（`/invite @アプリ名`）します。
5. チャンネル詳細の最下部から **チャンネル ID**（`C0...`）をコピーし、スプレッドシートの `settings` シート内の `summary_channel_id` に入力します。

---

## 5. スプレッドシートの構成と初期化

### 5.1 シートの自動初期化

サービスアカウントとスプレッドシート ID を設定後、以下のスクリプトを実行することで、全10シート・列名ヘッダー・初期設定値を自動構築できます。

```bash
uv run python scripts/init_sheet.py
```

### 5.2 全10シートの構成

| シート名 | 用途 | 主要な列 |
|---|---|---|
| `members` | 実行委員名簿・権限・Slack ID | `member_id`, `display_name`, `email`, `lang`, `slack_user_id`, `reminders_enabled`, `is_admin`, `active` |
| `roles` | 役職マスター | `role_id`, `name`, `name_en`, `category`, `sort_order`, `active` |
| `role_assignments` | 役職とメンバーの紐付け | `role_id`, `member_id`, `kind`（責任者 / 担当 / サポート） |
| `tasks` | 全タスクと NA の本体 | `task_id`, `title`, `role_ids`, `owner_member_id`, `requested_by`, `assignment_status`, `weight`, `next_action`, `na_due`, `status`, `updated_at`, `archived` |
| `checkins` | 体感負荷のチェックイン記録 | `checkin_id`, `member_id`, `date`, `score` (1-10), `comment`, `auto_load_at_checkin` |
| `activity_log` | 変更履歴（追記専用） | `timestamp`, `member_id`, `task_id`, `action`, `field`, `old_value`, `new_value` |
| `meetings` | 議事メモ抽出元の会議メタ情報 | `meeting_id`, `date`, `title`, `created_at` |
| `daily_snapshots` | 日次進捗グラフ用データ | `date`, `scope_type`, `scope_id`, `completion_rate`, `total_tasks`, `overdue_nas`, `auto_load_points` |
| `reminder_log` | 送信済 Slack リマインド記録（二重送信防止） | `reminder_id`, `date`, `member_id`, `channel_id`, `item_hash`, `sent_at` |
| `settings` | 運用パラメータ | `key`, `value` |

### 5.3 `settings` シートの運用パラメータ

| パラメータ名 | 既定値 | 説明 |
|---|---|---|
| `checkin_weekdays` | `月,水,金` | 体感負荷チェックインのリマインドを送信する曜日 |
| `daily_job_time` | `08:00` | 毎朝の定時処理実行目安時刻（JST） |
| `load_window_days` | `14` | 自動負荷の計算に含める NA 期限の未来日数（日以内） |
| `weight_points` | `軽=1,中=2,重=3` | タスクの重さごとの自動負荷換算ポイント |
| `overdue_escalation_days` | `3` | 期限切れ NA を役職責任者へエスカレーション通知するまでの日数 |
| `stale_days` | `7` | タスクが「停滞」とみなされる最終更新からの日数 |
| `request_reminder_days` | `2` | 依頼中のタスクへの返事待ちリマインドを出すまでの日数 |
| `high_load_score` | `8` | 体感負荷アラートを発動する基準スコア（以上） |
| `high_load_consecutive` | `2` | 体感負荷アラートを発動する連続回答回数 |
| `summary_channel_id` | （任意） | 毎朝のまとめ投稿先 Slack チャンネル ID |
| `app_url` | （任意） | Slack メッセージ内に記載する本番 Web アプリの URL |

---

## 6. テストの実行

すべての単体テスト・モック検証を実行するには以下を実行します：

```bash
uv run pytest -v
```

- 全 48 テスト（i18n キー整合性、排他ロック、依頼状態遷移、自動負荷計算、Slack 通知、Gemini マスキング・スキーマ検証等）が自動実行されます。
- 依存関係のセキュリティ監査は以下で実行できます：

```bash
uv run pip-audit
```

---

## 7. Streamlit Community Cloud へのデプロイ

1. [Streamlit Community Cloud](https://share.streamlit.io/) にログインし、**New app** を選択。
2. GitHub の本リポジトリ、ブランチ（`main`）、メインファイルパス（`app.py`）を指定。
3. **Advanced settings** > **Secrets** に、ローカルの `.streamlit/secrets.toml` の内容を貼り付けます：
   - `repository_backend = "sheets"`
   - `na_extractor_backend = "gemini"`
   - `[auth]` の `redirect_uri` を本番 URL（例：`https://jasc79-task-app.streamlit.app/oauth2callback`）に変更。
4. Google Cloud Console の OAuth クライアント設定の「承認済みのリダイレクト URI」に、上記の本番リダイレクト URI を追加します。
5. デプロイ完了後、メンバー名簿に登録された Google アカウントでログインできることを確認します。

---

## 8. GitHub Actions による毎朝の定時処理

`.github/workflows/daily.yml` により、毎朝 8:00 JST に `scripts/daily_job.py` が自動実行されます。

- **Cron 設定**: `0 23 * * *`（UTC 23:00 ＝ 日本時間 JST 翌朝 08:00）
- **登録が必要な GitHub Repository Secrets**:
  - `GCP_SERVICE_ACCOUNT_JSON`: サービスアカウントの JSON 鍵ファイル全文
  - `SPREADSHEET_ID`: 本番スプレッドシートの ID
  - `SLACK_BOT_TOKEN`: Slack Bot トークン（`xoxb-...`）
- **実行内容**:
  1. Google スプレッドシート読み込み
  2. `daily_snapshots` の集計と更新（進捗グラフ用）
  3. 毎朝の全体まとめを Slack チャンネルへ投稿
  4. 該当メンバーへ 1人1通にまとめた個人 DM を送信（明日期限、今日期限、期限切れ、依頼待ち等）
  5. 月曜日の場合は「先週の完了まとめ」もチャンネルへ追加投稿
- **二重送信防止**: 送信内容は `reminder_log` シートに記録されるため、手動再実行（`workflow_dispatch`）しても同じ日に同じリマインドが二重送信されることはありません。
- **ドライラン確認**: ローカルで `--dry-run` を付与して実行することで、実際には送信せず送信予定内容をターミナルで確認できます：

```bash
uv run python scripts/daily_job.py --dry-run
```

---

## 9. API キー・機密情報管理マトリクス（S14対応）

機密情報は最小限の管理者に限定し、万が一漏洩が疑われる場合は速やかに再発行・無効化を実施します。

| 秘密情報項目 | 主任管理者 | 保管場所 | 漏洩が疑われる場合の即時失効・差し替え手順 |
|---|---|---|---|
| **GCP サービスアカウント鍵** | 業務効率化担当 | `secrets.toml`<br>GitHub Secrets | 1. GCP Console > IAM > 該当サービスアカウント > **キー** から該当キーを即時削除。<br>2. 新しいキー（JSON）を発行。<br>3. `secrets.toml` および GitHub Secrets（`GCP_SERVICE_ACCOUNT_JSON`）を更新。 |
| **OAuth クライアントシークレット** | 業務効率化担当 | `secrets.toml`<br>Community Cloud | 1. GCP Console > 認証情報 > 該当 OAuth 2.0 クライアントのシークレットを再作成（リセット）。<br>2. `secrets.toml` / Community Cloud の `[auth.google]` を差し替え。 |
| **Slack Bot トークン** (`xoxb-`) | 業務効率化担当 / Slack 主管理者 | `secrets.toml`<br>GitHub Secrets | 1. [Slack API: Your Apps](https://api.slack.com/apps) > 該当アプリ > **OAuth & Permissions** を開く。<br>2. **Revoke Tokens** をクリックして既存トークンを即時失効。<br>3. **Reinstall to Workspace** で再発行し、Secrets を更新。 |
| **Gemini API キー** (`AIza...`) | 業務効率化担当 | `secrets.toml`<br>Community Cloud | 1. [Google AI Studio](https://aistudio.google.com/) > **Get API key** で漏洩したキーを削除。<br>2. 新規キーを作成し、Secrets の `gemini_api_key` を差し替え。 |
| **セッション署名鍵 (`cookie_secret`)** | 業務効率化担当 | `secrets.toml`<br>Community Cloud | 1. 任意の 32 バイト以上の乱数文字列を再生成。<br>2. Secrets の `cookie_secret` を書き換え（全アクティブセッションが自動ログアウトされます）。 |

---

## 10. 運用ルール（実行委員会合意事項）

1. **体感負荷は評価・査定には絶対に使わない**:
   - 余力マップの数値は「無理をさせないための助け合いの目安」であり、人事・評価目的での閲覧や比較は禁止します。
2. **週3回（月・水・金）のチェックイン**:
   - 1クリック（1〜10）で回答可能です。体調やプライベートの詳細な理由は書かなくて構いません。状況が大きく変化した日は曜日に関わらずいつでも更新可能です。
3. **定例会冒頭での画面共有**:
   - 定例会の冒頭 5 分で「期限アラート（F5）」および「余力マップ（F15）」を画面共有し、遅れが生じている箇所や負荷が集中しているメンバーのフォローを話し合います。
4. **口頭・チャット依頼のアプリ登録**:
   - 他のメンバーにタスクを依頼する場合は、必ずアプリ上で「依頼」として起票します。口頭や Slack で合意した場合も、後からアプリに登録して相手の承諾を受ける運用とします。

