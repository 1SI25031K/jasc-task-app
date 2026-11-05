# 現行 Python（Streamlit）版 棚卸し書（docs/inventory.md）

本ドキュメントは、「JASC EC ダッシュボード 移行仕様書（Python → TypeScript / Next.js）」Phase 1 に基づき、現行の Python（Streamlit）版アプリケーションの全容（画面・データ元・認証・ホスティング・ボトルネック・特殊処理）を棚卸ししたものです。

---

## 1. 画面一覧（全画面・表示要素・操作）

現行版は全10画面（＋共通ヘッダー・上部バー）で構成されています。
新 Next.js 版では**読み取り専用ダッシュボード**として機能・データの一致（パリティ）を目指します。

| # | 画面名 | 内部パス | 主要な表示要素（カード・表・グラフ） | ユーザー操作（フィルタ・ソート・切替等） |
|---|---|---|---|---|
| **0** | **ホーム（あいさつ）** | `app_pages/home.py` | ・ユーザーアバター（名前頭文字）<br>・時間帯別の挨拶文（おはよう/こんにちは/こんばんは）<br>・状況1行サマリー（期限超過・今週期限・依頼件数）<br>・横並びアクションチップ（各画面へのショートカット）<br>・お知らせカード（期限超過NA、未回答体感負荷、未対応依頼） | ・クイック遷移チップ押下<br>・お知らせカードの「開く」「後で」 |
| **1** | **役職ボード** | `app_pages/board.py` | ・役職カードグリッド（全21役職）<br>・各役職の責任者名、残タスク数、期限切れNA数、直近NA内容と期限日<br>・負荷レベル指標 | ・カテゴリ切替（すべて／主役職／副役職／サイト／その他）<br>・役職カードクリック（役職詳細への遷移） |
| **2** | **役職詳細** | `app_pages/role_detail.py` | ・選択中役職の概要、担当メンバー一覧<br>・所属タスク一覧（タスク名、担当者、重さ、NA、期限、ステータス） | ・ステータス絞り込み（未完了／すべて）<br>・タスク詳細の展開 |
| **3** | **マイタスク** | `app_pages/my_tasks.py` | ・ログイン中メンバーが担当するタスク一覧<br>・期限切れ警告表示、直近 NA | ・ステータス絞り込み（未完了／進行中／すべて）<br>・詳細展開 |
| **4** | **期限アラート** | `app_pages/alerts.py` | ・4つの集計指標カード（期限切れ件数、今週期限件数、停滞タスク件数、返事のない依頼件数）<br>・タブ別タスク一覧カード | ・4つのタブ切替（期限切れ／今週期限／停滞タスク／返事待ち依頼） |
| **5** | **全タスク一覧** | `app_pages/all_tasks.py` | ・全タスクのテーブル/リスト表示<br>・役職、担当者、NA、期限、ステータス、重さ | ・キーワード検索<br>・役職フィルタ（マルチセレクト）<br>・ステータスフィルタ<br>・並べ替え（期限昇順・降順、更新日順） |
| **6** | **余力マップ** | `app_pages/capacity_map.py` | ・メンバー一覧と各メンバーの自動負荷（pt）、体感負荷（1〜10）<br>・負荷ギャップ注意バッジ（差分4以上）<br>・役職・Slack ID・直近回答日 | ・ギャップありメンバーの絞り込み表示<br>・自動負荷計算ロジックの説明表示 |
| **7** | **進捗グラフ** | `app_pages/progress.py` | ・①全体完了率の推移（折れ線グラフ / Altair）<br>・②役職別の現在の完了率（横棒グラフ / Altair）<br>・③役職別の期限切れ NA 数（横棒グラフ / Altair）<br>・④メンバー別の自動負荷推移（複数折れ線グラフ / Altair） | ・期間切替ラジオボタン（直近4週間／直近12週間／全期間） |
| **8** | **体感負荷チェックイン** | `app_pages/checkin.py` | ・現在の体感負荷回答状況<br>・直近の回答履歴テーブル（日付、スコア、コメント） | ・過去履歴の閲覧 |
| **9** | **依頼の受信箱** | `app_pages/inbox.py` | ・自分宛てに依頼されているタスク一覧<br>・自分が依頼中のタスク一覧<br>・相談中のタスク一覧 | ・タブ切替（自分宛て／依頼中／相談中） |
| **-** | **共通上部バー** | `core/ui/top_bar.py` | ・アプリタイトル「JASC タスクマネージャー」<br>・ヘルプポップオーバー<br>・背景設定ポップオーバー（カラー9色 / Bing壁紙）<br>・ユーザーアバター（プロフィール表示、言語切替 ja/en、ログアウト） | ・言語切替（日本語／English）<br>・ログアウト |

---

## 2. データ元一覧（スプレッドシート・シート・列構成）

データ元は Google スプレッドシート（ID: 環境変数 `SPREADSHEET_ID`）の全10シートです。

| シート名 | 用途 | 使用している列 | 読み込み方法・頻度 |
|---|---|---|---|
| `members` | 実行委員名簿・権限 | `member_id`, `display_name`, `display_name_en`, `email`, `main_roles`, `lang`, `slack_user_id`, `reminders_enabled`, `is_admin`, `active`, `bg_mode`, `bg_color` | `gspread` 全行取得 (`get_all_values()`)。TTL 60秒キャッシュ |
| `roles` | 役職マスタ（全21役職） | `role_id`, `name`, `name_en`, `category`, `sort_order`, `active` | 同上 |
| `role_assignments` | 役職とメンバーの紐付け | `role_id`, `member_id`, `kind`（責任者 / 担当 / サポート） | 同上 |
| `tasks` | タスク・NA 本体 | `task_id`, `title`, `role_ids`, `owner_member_id`, `requested_by`, `assignment_status`, `assignment_comment`, `weight`, `next_action`, `na_due`, `task_due`, `status`, `waiting_on_member_id`, `priority`, `blocker`, `notes`, `source`, `meeting_id`, `completed_at`, `completed_by`, `created_at`, `created_by`, `updated_at`, `updated_by`, `archived` | 同上 |
| `checkins` | 体感負荷回答記録 | `checkin_id`, `member_id`, `date`, `score` (1-10), `comment`, `auto_load_at_checkin` | 同上 |
| `daily_snapshots` | 進捗グラフ用日次データ | `date`, `scope_type` (ALL/member/role), `scope_id`, `total`, `done`, `open`, `overdue`, `completion_rate`, `auto_load` | 同上 |
| `settings` | 運用パラメータ | `key`, `value`（`load_window_days`, `weight_points`, `stale_days`, `high_load_score` 等） | 同上 |
| `activity_log` | 変更履歴（監査用） | `timestamp`, `member_id`, `task_id`, `action`, `field`, `old_value`, `new_value` | 同上 |
| `meetings` | 議事録メタ情報 | `meeting_id`, `meeting_date`, `title`, `created_by`, `created_at`, `generated_count`, `saved_count` | 同上 |
| `reminder_log` | Slack リマインド記録 | `reminder_id`, `date`, `member_id`, `channel_id`, `item_hash`, `sent_at` | 同上 |

---

## 3. 認証方式

- **現行の方式**: Google OAuth 2.0 / OpenID Connect（`authlib`）
- **アクセス制御（認可）**:
  - Google ログインで取得したメールアドレスを、`members` シートの `email` 列と大文字小文字を無視して照合。
  - `active == TRUE` かつ名簿に存在するユーザーのみ閲覧を許可。未登録・非アクティブ時は `st.stop()` で即時遮断。
- **セッション管理**: `itsdangerous.URLSafeTimedSerializer` による署名付き Cookie。

---

## 4. ホスティングと運用

- **ホスティング環境**: Streamlit Community Cloud（Private GitHub リポジトリから自動デプロイ）。
- **バックグラウンド処理**: GitHub Actions（`.github/workflows/daily.yml`）。毎朝 08:00 JST に `scripts/daily_job.py` を実行して Slack まとめ投稿・個人 DM 配信・日次スナップショット集計を実施。

---

## 5. 環境変数・シークレット一覧（キー名のみ）

### アプリケーション設定（Secrets）
- `repository_backend`
- `spreadsheet_id`
- `slack_bot_token`
- `na_extractor_backend`
- `gemini_api_key`
- `gemini_model`
- `[gcp_service_account]`
  - `type`, `project_id`, `private_key_id`, `private_key`, `client_email`, `client_id`, `auth_uri`, `token_uri`, `auth_provider_x509_cert_url`, `client_x509_cert_url`, `universe_domain`
- `[auth]`
  - `redirect_uri`, `cookie_secret`
- `[auth.google]`
  - `client_id`, `client_secret`, `server_metadata_url`

### GitHub Actions Secrets
- `GCP_SERVICE_ACCOUNT_JSON`
- `SPREADSHEET_ID`
- `SLACK_BOT_TOKEN`

---

## 6. 主要な依存ライブラリ（Python 版）

- `streamlit==1.66.1`: Web アプリケーション基盤
- `altair==6.3.0` & `pandas==3.1.0`: グラフ描画およびデータ加工
- `gspread==6.2.1`: Google スプレッドシート API クライアント
- `authlib>=1.9.3` & `itsdangerous>=2.2.0`: OAuth 認証およびセッション署名
- `slack-sdk>=3.46.0`: Slack 通知（定時処理用）
- `google-genai>=2.34.0`: Gemini API 連携（議事録抽出用）

---

## 7. 現行版の「遅さ」の原因分析（技術的根拠）

| 原因要因 | 技術的背景・該当コード箇所 | 影響 |
|---|---|---|
| **① 毎回のスクリプト全体再実行 (Full Script Rerun)** | Streamlit の基本設計により、タブ切替・ラジオ選択・検索入力のたびに `app.py` から各画面ファイルが毎回 Python プロセス内で頭から再実行される（`app.py:114`）。 | タブ切替やフィルタ操作に 1〜3 秒の待機時間が発生する。 |
| **② Google Sheets API の逐次取得 (Over-the-wire Latency)** | `core/sheets_repository.py` にて、`members`, `roles`, `tasks`, `checkins` などのシートを個別の API 呼び出し（`ws.get_all_values()`）で順次読み込んでいる。キャッシュミス時に数秒の API レイテンシが重なる。 | 初回読み込みや更新時の画面描画が重くなる。 |
| **③ サーバー側ステートと WebSocket 通信の往復** | 全ての UI 状態（選択中のタブ、開閉状態、言語）がクライアント（ブラウザ）内で完結せず、WebSocket 経由でサーバー側と往復通信して確定する。 | 操作のレスポンスがネットワーク状態に大きく依存し、引っかかりを感じる。 |
| **④ クラウドのスリープ（コールドスタート）** | Streamlit Community Cloud は約12時間無アクセスでスリープする。復帰時にコンテナのウェイクアップと Python 起動が走り、30秒以上の待機が発生する。 | 朝一番などのアクセス時に大きな待ち時間が発生する。 |

---

## 8. 暗黙の特殊データ処理・業務ロジック

Next.js 版に移植する際に完全再現すべき重要なビジネスロジックです。

### ① 日付と期限判定（`core/services.py:29-50`）
- **タイムゾーン**: すべて `Asia/Tokyo`（JST）で計算。
- **期限切れ NA**: `status != "完了"` かつ `archived == False` かつ `na_due < today`。
- **今週期限 NA**: `status != "完了"` かつ `archived == False` かつ `today <= na_due <= today + 7日`。
- **停滞タスク**: `status != "完了"` かつ `archived == False` かつ `(now - updated_at) >= 7日`。

### ② 自動負荷ポイントの計算（`core/load.py`）
- 対象タスク: 担当者が自分で、`status != "完了"`、`archived == False`、かつ「期限切れ」または「`na_due` が今日から `load_window_days`（14日）以内」。
- 重さポイント換算: `軽` = 1pt、`中` = 2pt、`重` = 3pt の合算。

### ③ 負荷ギャップ判定（`core/load.py`）
- 全アクティブメンバーの自動負荷を 1〜10 に換算：
  $\text{換算スコア} = \text{round}\left(\frac{\text{本人の自動負荷}}{\text{全メンバー中の最大自動負荷}} \times 9\right) + 1$ （最大負荷が 0 の場合は全員 1）。
- 最新の体感負荷（7日以内の checkin スコア 1〜10）との絶対差分が 4 以上の場合に「ギャップあり」フラグを付与。

### ④ 完了率の計算（`core/services.py:52-60`）
- 完了率 = `完了タスク数 / (全タスク数 - アーカイブタスク数)`。対象 0 件時は `None`（画面表示は「—」）。

### ⑤ 役職マスタとカテゴリ（`core/repository.py:build_dummy_roles`）
- 21 役職は `主役職`（5）、`副役職`（12）、`サイト`（3）、`その他`（1: CVC）の 4 カテゴリに分類される。
- 各役職には英語名（`name_en`）が定義されており、言語設定に応じて切り替わる。

