# Google Cloud Run デプロイ手順書（docs/cloud_run_deployment.md）

「JASC EC ダッシュボード 移行仕様書」および要件定義書（`docs/requirements.md`）に基づき、Next.js 版ダッシュボードを Google Cloud Run（東京リージョン `asia-northeast1`）へデプロイする手順です。
本バージョンでは、Streamlit 版の全機能（タスク作成・編集・依頼・チェックイン・AI 抽出等の書き込み機能を含む）の完全な置き換えとして運用します。

---

## 1. Google Cloud Run を選定したメリットと無料枠（Always Free）

1. **コスト 0 円（常時無料枠内）**:
   - Google Cloud の Cloud Run（サービス向け）公式 Always Free 枠は以下の通りです：
     - **リクエスト数**: 毎月 **200 万リクエスト** まで無料
     - **CPU 使用時間**: 毎月 **180,000 vCPU 秒** まで無料
     - **メモリ使用量**: 毎月 **360,000 GiB 秒** まで無料
   - 15名規模の EC 業務ダッシュボードであれば、完全無料枠内で収まります。
2. **最高のセキュリティ（秘密鍵 JSON 不要・Secret Manager 連携）**:
   - Cloud Run の実行サービスアカウントに直接 Google スプレッドシートの編集権限を付与できるため、**環境変数やコンテナ内にサービスアカウントの秘密鍵ファイル（JSON）を持たせる必要がありません**。
   - OAuth クライアントシークレットや認証ハッシュ鍵、Gemini API キーは、Google Cloud Secret Manager で暗号化管理し、Cloud Run 起動時に安全に環境変数へマウントします。
3. **高速起動**:
   - Streamlit のスリープ復帰（約30秒〜1分）と比べ、Next.js コンテナのコールドスタートは 2〜3 秒と極めて高速です。

> [!IMPORTANT]
> **請求先アカウント（Billing Account）の登録と予算アラートについて**
> - Cloud Run の無料枠を利用する場合でも、GCP プロジェクトへの「請求先アカウント（クレジットカード等の支払い情報）」の紐付けが必須です。
> - 万が一のアクセス急増や設定ミスによる意図しない課金を未然に防ぐため、後述の「**§7 予算アラートの設定**」を必ず実施してください。

---

## 2. 専用サービスアカウント（task-app-run）の作成と権限設定

Cloud Run 実行用として、新しい専用サービスアカウント `task-app-run` を作成します（秘密鍵 JSON ファイルは作成・ダウンロードしません）。

### ① サービスアカウントの作成
```bash
gcloud iam service-accounts create task-app-run \
  --display-name="Cloud Run App Service Account" \
  --description="Runtime service account for JASC EC Task Manager on Cloud Run"
```
- 作成されるアカウント名：`task-app-run@jasc79-task-app.iam.gserviceaccount.com`

### ② デプロイを実行する管理者アカウントへの権限付与
デプロイを実行するあなたの Google アカウントに対して、Cloud Run へのデプロイおよびサービスアカウントの借用（ActAs）に必要な権限を付与します：
```bash
# 1. task-app-run に対する Service Account User 権限をあなたのアカウントに付与
gcloud iam service-accounts add-iam-policy-binding \
  task-app-run@jasc79-task-app.iam.gserviceaccount.com \
  --member="user:<あなたのGoogleアカウントメールアドレス>" \
  --role="roles/iam.serviceAccountUser"

# 2. プロジェクトに対する Cloud Run 管理者・ビルド権限の確認（すでにある場合は不要）
gcloud projects add-iam-policy-binding jasc79-task-app \
  --member="user:<あなたのGoogleアカウントメールアドレス>" \
  --role="roles/run.admin"

gcloud projects add-iam-policy-binding jasc79-task-app \
  --member="user:<あなたのGoogleアカウントメールアドレス>" \
  --role="roles/artifactregistry.writer"

gcloud projects add-iam-policy-binding jasc79-task-app \
  --member="user:<あなたのGoogleアカウントメールアドレス>" \
  --role="roles/cloudbuild.builds.editor"
```

### ③ スプレッドシートの権限設定
- **本番用スプレッドシートへの共有**:
  - `task-app-run@jasc79-task-app.iam.gserviceaccount.com` を **「編集者（Editor）」** として共有します（タスク作成・編集・依頼・チェックインの書き込みを行うため）。
  - ※ 既存の `task-app-bot@jasc79-task-app.iam.gserviceaccount.com` は、GitHub Actions の毎朝の定時処理（日次集計・Slack 送信）専用として **「編集者（Editor）」のまま残します**。

---

## 3. Secret Manager への機密情報登録とアクセス権付与

機密情報（`auth-secret`, `auth-google-secret`, `gemini-api-key`）を Secret Manager で管理し、実行アカウント `task-app-run` にのみ読み取り権限（`secretAccessor`）を付与します。

### ① シークレットの作成・登録（未登録の場合）
```bash
# 1. Secret Manager API の有効化
gcloud services enable secretmanager.googleapis.com

# 2. シークレットの作成（すでに登録済みのものは再作成不要）
# AUTH_SECRET（ランダム32バイト文字列）
echo -n "$(openssl rand -base64 32)" | gcloud secrets create auth-secret \
  --replication-policy="automatic" \
  --data-file=-

# AUTH_GOOGLE_SECRET（Google OAuth クライアントシークレット）
echo -n "<Google OAuth クライアントシークレット>" | gcloud secrets create auth-google-secret \
  --replication-policy="automatic" \
  --data-file=-

# GEMINI_API_KEY（Gemini API キー）
echo -n "<Google AI Studio の API キー>" | gcloud secrets create gemini-api-key \
  --replication-policy="automatic" \
  --data-file=-
```

### ② 実行サービスアカウント（task-app-run）への権限付与
実行サービスアカウント `task-app-run` に対してのみ、シークレットを読み取る権限を付与します：
```bash
gcloud secrets add-iam-policy-binding auth-secret \
  --member="serviceAccount:task-app-run@jasc79-task-app.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding auth-google-secret \
  --member="serviceAccount:task-app-run@jasc79-task-app.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding gemini-api-key \
  --member="serviceAccount:task-app-run@jasc79-task-app.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

---

## 4. デプロイの実行手順（ソースからの直接ビルド）

リポジトリ直下（`/Users/kosei/jasc-task-app`）で、以下のコマンドを実行します。
Google Cloud Build が自動的に `Dockerfile` を検出してビルドし、Cloud Run にデプロイします。

```bash
gcloud run deploy jasc-task-app \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --service-account=task-app-run@jasc79-task-app.iam.gserviceaccount.com \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --set-secrets="AUTH_SECRET=auth-secret:latest,AUTH_GOOGLE_SECRET=auth-google-secret:latest,GEMINI_API_KEY=gemini-api-key:latest" \
  --set-env-vars SPREADSHEET_ID="<本番用スプレッドシートID>" \
  --set-env-vars AUTH_GOOGLE_ID="<Google OAuth クライアントID>" \
  --set-env-vars AUTH_TRUST_HOST="true"
```

> [!NOTE]
> **アクセス制御とセキュリティについて**
> - `--allow-unauthenticated` を指定していますが、インターネット全体に公開されるわけではありません。Next.js Middleware および Auth.js により、Google ログイン認証と **`members` シート（`active=TRUE`）による厳格なアクセス制御** が常に適用されます（未登録アカウントや `active=FALSE` のユーザーは `/unauthorized` へ即座にリダイレクトされ閲覧・書き込みができません）。
> - Auth.js v5 はコンテナ環境でプロキシヘッダーを自動信頼するために `AUTH_TRUST_HOST="true"` を必要とします。また、`x-forwarded-proto` および `x-forwarded-host` からベース URL を自動判定するため、旧仕様の `NEXTAUTH_URL` や `AUTH_URL` の環境変数の手動指定は不要です。

---

## 5. Google OAuth のリダイレクト URI の登録

デプロイ完了後、Cloud Run のサービス URL（例: `https://jasc-task-app-xxxxxxxxxx-an.a.run.app`）が表示されます。

1. [Google Cloud Console - 認証情報](https://console.cloud.google.com/apis/credentials) を開く。
2. 作成済みの **OAuth 2.0 クライアント ID** をクリックして編集画面を開く。
3. **「承認済みのリダイレクト URI」** に、以下を追加して保存する：
   ```
   https://jasc-task-app-xxxxxxxxxx-an.a.run.app/api/auth/callback/google
   ```

---

## 6. 予算アラートの設定（費用の安全対策）

万が一の外部アクセス集中や設定ミスにより Always Free 枠を超過した場合の課金を未然に防ぐため、予算アラートを設定します。

1. [Google Cloud Console - お支払い（Billing）](https://console.cloud.google.com/billing) を開く。
2. 左メニューから **「予算とアラート」** を選択し、**「予算を作成」** をクリックする。
3. 以下の内容を設定する：
   - **スコープ**: プロジェクト `jasc79-task-app`
   - **予算タイプ**: 指定額（例: `1,000 円` または `500 円`）
   - **アラートしきい値**:
     - 実コストが予算の `50%`、`90%`、`100%` に達したとき
   - **通知設定**:
     - 「請求先アカウント管理者およびユーザーにメール通知を送信する」にチェックを入れる。
4. **「終了」** をクリックして保存します。

---

## 7. 並行稼働時の確認チェックリスト（読み取り ＋ 書き込み機能）

Streamlit 版（現行）と Next.js 版（Cloud Run）を並行して開き、以下が完全に動作することを確認します。

### ① 読み取り・表示機能（パリティ確認）
| 確認項目 | Streamlit 版（現行） | Next.js 版（新） | 一致確認 |
|---|---|---|:---:|
| ログイン制限 | members シートの active=TRUE のみ | members シートの active=TRUE のみ | [ ] |
| 未登録/休止アカウント | アクセス拒否（unauthorized） | アクセス拒否（unauthorized） | [ ] |
| ホームの1行サマリー | 期限切れ ○件・今週 ○件・依頼 ○件 | 同左 | [ ] |
| 役職ボードの役職数 | 全21役職 | 全21役職 | [ ] |
| 役職ごとの未完了タスク数 | 各役職の件数 | 同左 | [ ] |
| 期限アラートの各件数 | 期限切れ・今週・停滞・依頼待ち | 同左 | [ ] |
| 全タスク一覧の総件数 | 全件数 | 同左 | [ ] |
| 余力マップの自動負荷 pt | 各メンバーの pt | 同左 | [ ] |
| 余力マップのギャップ表示 | 差分4以上のメンバー | 同左 | [ ] |
| 進捗グラフの完了率推移 | 完了率折れ線グラフ | 同左 | [ ] |

### ② 書き込み・更新機能（新機能パリティ確認）
| 確認項目 | 操作内容 | 期待結果 | 一致確認 |
|---|---|---|:---:|
| タスク新規作成（自分担当） | 自分を担当者にして作成 | `assignment_status=承諾済`, `requested_by=""`, activity_log に create 記録 | [ ] |
| タスク新規作成（他人担当） | 他人を担当者にして作成 | `assignment_status=依頼中`, `requested_by=作成者`, activity_log に create 記録 | [ ] |
| タスク全項目編集 | タイトル・重さ・期限等を変更 | シート即時反映, activity_log に update 記録 | [ ] |
| NA 簡易更新 | NA・期限・ステータスのみ変更 | 2クリック以内で更新成功 | [ ] |
| 楽観的ロック（S7） | 他タブで更新後に古い画面から保存 | 上書きされず「他の人が更新しました」警告 | [ ] |
| アーカイブ／復元（S8） | タスクをアーカイブ・復元 | 物理削除されず `archived` フラグ更新, activity_log 記録 | [ ] |
| 依頼の承諾（F17） | 依頼された本人が「承諾」 | `承諾済` に遷移, 依頼元に反映, activity_log 記録 | [ ] |
| 依頼の相談（F17） | 依頼された本人が「相談」＋コメント | `相談中` に遷移, コメント保存, activity_log 記録 | [ ] |
| 依頼の権限チェック | 担当者本人以外が承諾/相談を試行 | サーバー側で 403 拒否（ボタン非表示＋防御） | [ ] |
| 体感負荷チェックイン（F16） | 1〜10 のスコアと一言メモ送信 | シート即時反映, 当該時点の自動負荷も保存 | [ ] |
| チェックイン同日上書き（4.5） | 同じ日に再度チェックイン | 新規行追加されず同日行が最新値で上書き | [ ] |
| 議事メモ NA 生成（F14） | メモ貼り付け → Gemini 候補抽出 | 個人情報マスキング後抽出, レート制限, 選択行の一括登録 | [ ] |
| 言語・背景設定保存（F11） | アバターメニューから設定変更 | `members` シートの `lang`/`bg_mode`/`bg_color` に即時保存 | [ ] |
