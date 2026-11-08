# Google Cloud Run デプロイ手順書（docs/cloud_run_deployment.md）

「JASC EC ダッシュボード 移行仕様書」Phase 4 に基づき、Next.js 版ダッシュボードを Google Cloud Run（東京リージョン `asia-northeast1`）へデプロイする手順です。

---

## 1. Google Cloud Run を選定したメリットと無料枠（Always Free）

1. **コスト 0 円（常時無料枠内）**:
   - Google Cloud の Cloud Run（サービス向け）公式 Always Free 枠は以下の通りです：
     - **リクエスト数**: 毎月 **200 万リクエスト** まで無料
     - **CPU 使用時間**: 毎月 **180,000 vCPU 秒** まで無料
     - **メモリ使用量**: 毎月 **360,000 GiB 秒** まで無料
   - 15名規模の EC 業務ダッシュボードであれば、完全無料枠内で収まります。
2. **最高のセキュリティ（秘密鍵 JSON 不要・Secret Manager 連携）**:
   - Cloud Run の実行サービスアカウントに直接 Google スプレッドシートの閲覧権限を付与できるため、**環境変数やコンテナ内にサービスアカウントの秘密鍵ファイル（JSON）を持たせる必要がありません**。
   - OAuth クライアントシークレットや認証ハッシュ鍵は、Google Cloud Secret Manager で暗号化管理し、Cloud Run 起動時に安全に環境変数へマウントします。
3. **高速起動**:
   - Streamlit のスリープ復帰（約30秒〜1分）と比べ、Next.js コンテナのコールドスタートは 2〜3 秒と極めて高速です。

> [!IMPORTANT]
> **請求先アカウント（Billing Account）の登録と予算アラートについて**
> - Cloud Run の無料枠を利用する場合でも、GCP プロジェクトへの「請求先アカウント（クレジットカード等の支払い情報）」の紐付けが必須です。
> - 万が一のアクセス急増や設定ミスによる意図しない課金を未然に防ぐため、後述の「**§6 予算アラートの設定**」を必ず実施してください。

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
  sheets.googleapis.com \
  secretmanager.googleapis.com
```

### ③ 実行用サービスアカウントとスプレッドシート権限方針
- **実行用サービスアカウント**:
  Compute Engine の既定サービスアカウント（`PROJECT_NUMBER-compute@developer.gserviceaccount.com`）はデフォルトでプロジェクト全体の編集権限を持っているため使用せず、既存の専用サービスアカウント：
  `task-app-bot@jasc79-task-app.iam.gserviceaccount.com`
  を実行アカウントとして明示的に指定します。
- **スプレッドシートの権限方針**:
  - **方針：並行稼働中・本番運用後ともに「閲覧者（Viewer）」に固定**。
  - **理由**：
    本ダッシュボードは「完全読み取り専用」として設計されており、ダッシュボードからスプレッドシートへの書き込み処理は一切存在しません（タスク追加やチェックインは Google フォーム・シート側で入力）。
    編集者権限を与えることは不要なセキュリティリスク（最小特権の原則違反）となるため、本番用スプレッドシートの共有設定で `task-app-bot@jasc79-task-app.iam.gserviceaccount.com` を **「閲覧者（Viewer）」** として共有します。

---

## 3. Secret Manager への機密情報登録

`AUTH_SECRET`（セッション暗号化鍵）および `AUTH_GOOGLE_SECRET`（Google OAuth クライアントシークレット）を Secret Manager に登録し、実行サービスアカウントにのみアクセス権を付与します。

### ① シークレットの作成と値の保存
```bash
# 1. AUTH_SECRET（ランダム32バイト文字列）を作成して保存
echo -n "$(openssl rand -base64 32)" | gcloud secrets create auth-secret \
  --replication-policy="automatic" \
  --data-file=-

# 2. AUTH_GOOGLE_SECRET（Google OAuth クライアントシークレット）を作成して保存
echo -n "<Google OAuth クライアントシークレット>" | gcloud secrets create auth-google-secret \
  --replication-policy="automatic" \
  --data-file=-
```

### ② 実行サービスアカウントへの読み取り権限（Secret Accessor）付与
実行サービスアカウント `task-app-bot` に対してのみ、これらのシークレットを読み取る権限を付与します：
```bash
gcloud secrets add-iam-policy-binding auth-secret \
  --member="serviceAccount:task-app-bot@jasc79-task-app.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding auth-google-secret \
  --member="serviceAccount:task-app-bot@jasc79-task-app.iam.gserviceaccount.com" \
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
  --service-account=task-app-bot@jasc79-task-app.iam.gserviceaccount.com \
  --min-instances 0 \
  --max-instances 2 \
  --memory 512Mi \
  --cpu 1 \
  --set-secrets="AUTH_SECRET=auth-secret:latest,AUTH_GOOGLE_SECRET=auth-google-secret:latest" \
  --set-env-vars SPREADSHEET_ID="<本番用スプレッドシートID>" \
  --set-env-vars AUTH_GOOGLE_ID="<Google OAuth クライアントID>" \
  --set-env-vars AUTH_TRUST_HOST="true"
```

> [!NOTE]
> **アクセス制御とセキュリティについて**
> - `--allow-unauthenticated` を指定していますが、インターネット全体に公開されるわけではありません。アプリケーション手前の Next.js Middleware および Auth.js により、Google ログイン認証と **`members` シート（`active=TRUE`）による厳格なアクセス制御** が常に適用されます（未登録アカウントや `active=FALSE` のユーザーは `/unauthorized` へ即座にリダイレクトされ閲覧できません）。
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

## 7. 並行稼働時の確認チェックリスト（パリティ確認）

Streamlit 版（現行）と Next.js 版（Cloud Run）を並行して開き、以下が完全に一致することを確認します。

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
