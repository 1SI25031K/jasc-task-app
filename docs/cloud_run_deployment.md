# Google Cloud Run デプロイ手順書（docs/cloud_run_deployment.md）

「JASC EC ダッシュボード 移行仕様書」Phase 4 に基づき、Next.js 版ダッシュボードを Google Cloud Run（東京リージョン `asia-northeast1`）へデプロイする手順です。

---

## 1. Google Cloud Run を選定したメリット

1. **コスト 0 円（無料枠内）**:
   - Cloud Run は毎月 200万リクエスト、360,000 vCPU秒、180,000 GiB秒が永久無料です。
   - 15名の業務ダッシュボードであれば、完全無料枠内で収まります。
2. **最高のセキュリティ（秘密鍵 JSON 不要）**:
   - Cloud Run の実行サービスアカウントに直接 Google スプレッドシートの閲覧権限を付与できるため、**環境変数やファイルにサービスアカウントの秘密鍵を持たせる必要がありません**。
3. **高速起動**:
   - Streamlit の約30秒〜1分のスリープ復帰と比べ、Next.js コンテナのコールドスタートは 2〜3 秒と極めて高速です。

---

## 2. デプロイの前提準備

### ① gcloud CLI の確認
ローカル端末で Google Cloud SDK が利用可能であることを確認します：
```bash
gcloud --version
gcloud auth login
gcloud config set project jasc79-task-app
```

### ② 必要な API の有効化（初回のみ）
```bash
gcloud services enable \
  run.googleapis.com \
  cloudbuild.googleapis.com \
  artifactregistry.googleapis.com \
  sheets.googleapis.com
```

### ③ スプレッドシートへの権限付与
Cloud Run のデフォルト実行サービスアカウント（例: `PROJECT_NUMBER-compute@developer.gserviceaccount.com`）、または既存のサービスアカウント（`task-app-bot@jasc79-task-app.iam.gserviceaccount.com`）が、本番用スプレッドシートの **閲覧者（Viewer）** として共有されていることを確認します。

---

## 3. デプロイの実行手順（ソースからの直接ビルド）

リポジトリ直下（`/Users/kosei/jasc-task-app`）で、以下のコマンドを実行します。
Google Cloud Build が自動的に `Dockerfile` を検出してビルドし、Cloud Run にデプロイします。

```bash
gcloud run deploy jasc-task-app \
  --source . \
  --region asia-northeast1 \
  --platform managed \
  --allow-unauthenticated \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --set-env-vars SPREADSHEET_ID="<本番用スプレッドシートID>" \
  --set-env-vars AUTH_SECRET="<ランダム32バイト文字列>" \
  --set-env-vars AUTH_GOOGLE_ID="<Google OAuth クライアントID>" \
  --set-env-vars AUTH_GOOGLE_SECRET="<Google OAuth クライアントシークレット>" \
  --set-env-vars ALLOWED_EMAILS="<カンマ区切りの許可メールアドレス一覧>" \
  --set-env-vars NEXTAUTH_URL="https://jasc-task-app-..."
```

> [!NOTE]
> `--allow-unauthenticated` を指定していますが、インターネット全体に公開されるわけではありません。アプリケーション手前の `src/middleware.ts` および Auth.js により、Google ログイン認証と `ALLOWED_EMAILS` による厳格なアクセス制御が常に適用されます。

---

## 4. Google OAuth のリダイレクト URI の追加

デプロイ完了後、Cloud Run のサービス URL（例: `https://jasc-task-app-xxxxxxxxxx-an.a.run.app`）が表示されます。

1. [Google Cloud Console - 認証情報](https://console.cloud.google.com/apis/credentials) を開く。
2. 作成済みの **OAuth 2.0 クライアント ID** をクリックして編集画面を開く。
3. **「承認済みのリダイレクト URI」** に、以下を追加して保存する：
   ```
   https://jasc-task-app-xxxxxxxxxx-an.a.run.app/api/auth/callback/google
   ```
4. Cloud Run の環境変数 `NEXTAUTH_URL` を、発行されたサービス URL（`https://jasc-task-app-xxxxxxxxxx-an.a.run.app`）に更新する。

---

## 5. 並行稼働時の確認チェックリスト（パリティ確認）

Streamlit 版（現行）と Next.js 版（Cloud Run）を並行して開き、以下が完全に一致することを確認します。

| 確認項目 | Streamlit 版（現行） | Next.js 版（新） | 一致確認 |
|---|---|---|---|
| ホームの1行サマリー | 期限切れ ○件・今週 ○件・依頼 ○件 | 同左 | [ ] |
| 役職ボードの役職数 | 全21役職 | 全21役職 | [ ] |
| 役職ごとの未完了タスク数 | 各役職の件数 | 同左 | [ ] |
| 期限アラートの各件数 | 期限切れ・今週・停滞・依頼待ち | 同左 | [ ] |
| 全タスク一覧の総件数 | 全件数 | 同左 | [ ] |
| 余力マップの自動負荷 pt | 各メンバーの pt | 同左 | [ ] |
| 余力マップのギャップ表示 | 差分4以上のメンバー | 同左 | [ ] |
| 進捗グラフの完了率推移 | 完了率折れ線グラフ | 同左 | [ ] |
