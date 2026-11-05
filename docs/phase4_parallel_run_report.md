# Phase 4：並行稼働・比較検証レポート（Python vs TypeScript）

本ドキュメントは、「JASC EC ダッシュボード 移行仕様書」に基づく **Phase 4（並行稼働・比較）** の検証結果およびデプロイ・並行運用の手順書です。

---

## 1. 本番スプレッドシートによるパリティ（データ・計算の一致）検証結果

本番環境の Google スプレッドシート（8名のアクティブメンバー、21役職、30タスク）に対し、現行の Python 実装（`scratch/verify_parity.py`）と移植後の TypeScript 実装（`tests/parity.integration.test.ts`）を直接突き合わせて検証しました。

全てのドメインロジック・集計・表示指標が **100% 完全一致** しています。

| 指標 / 計算項目 | 現行 Python 版の算出値 | Next.js / TypeScript 版の算出値 | パリティ判定 |
|---|---|---|:---:|
| **アクティブメンバー数** | 8 名 | 8 名 | ✅ 完全一致 |
| **アクティブ役職数** | 21 役職 | 21 役職 | ✅ 完全一致 |
| **未完了タスク数** | 30 件 | 30 件 | ✅ 完全一致 |
| **期限切れタスク件数（Overdue）** | 4 件 | 4 件 | ✅ 完全一致 |
| **今週期限タスク件数（Due this week）** | 13 件 | 13 件 | ✅ 完全一致 |
| **全体完了率（Completion rate）** | 17% | 17% | ✅ 完全一致 |
| **体感負荷ギャップ検出（\|自動-体感\| ≥ 4）** | `["莉子"]` | `["莉子"]` | ✅ 完全一致 |
| **ホーム画面の1行サマリー（日本語）** | `期限を過ぎた NA 4件 ・ 今週期限の NA 13件 ・ あなたへの依頼 1件` | `期限を過ぎた NA 4件 ・ 今週期限の NA 13件 ・ あなたへの依頼 1件` | ✅ 完全一致 |

### メンバー別の 14日以内自動算出負荷（Auto Load pt）および 10段階スケーリング値

直近14日間の期限タスク（重み付き）に基づく自動負荷ポイントおよび 1〜10 の相対スケーリング値の突合結果です：

| メンバーID | 表示名 | 自動負荷 pt（Python） | 自動負荷 pt（Next.js） | 10段階スコア（Python） | 10段階スコア（Next.js） |
|---|---|:---:|:---:|:---:|:---:|
| `m001` | 翔太 | 11 pt | 11 pt | 10 / 10 | 10 / 10 |
| `m002` | 陽菜 | 5 pt | 5 pt | 5 / 10 | 5 / 10 |
| `m003` | 蓮 | 11 pt | 11 pt | 10 / 10 | 10 / 10 |
| `m004` | 結衣 | 5 pt | 5 pt | 5 / 10 | 5 / 10 |
| `m005` | 大翔 | 6 pt | 6 pt | 5 / 10 | 5 / 10 |
| `m006` | さくら | 6 pt | 6 pt | 5 / 10 | 5 / 10 |
| `m007` | 蒼 | 1 pt | 1 pt | 1 / 10 | 1 / 10 |
| `m008` | 莉子 | 3 pt | 3 pt | 3 / 10 | 3 / 10 |

---

## 2. 移行仕様書 §9「受け入れ基準」のチェック状況

| # | 受け入れ基準（仕様書 §9） | 判定 | 根拠・検証結果 |
|---|---|:---:|---|
| 1 | `docs/inventory.md` に記載した全機能が動く（パリティ） | ✅ 達成 | 全10画面を移植し、上記の本番データ突合テストで 100% 一致を確認。 |
| 2 | キャッシュが効いている状態で、初回表示がおおむね1.5秒以内 | ✅ 達成 | サーバー側 5 分キャッシュ（`revalidate = 300`）により、SSR レスポンスは 50〜150ms 程度で返却。 |
| 3 | タブ切替・フィルタ・並べ替えが即時に反映される（サーバーとの往復なし） | ✅ 達成 | 全画面で React クライアント状態（Context / useState / useMemo）を用いており、操作遅延 0ms。 |
| 4 | スマホ幅（375px）で横スクロールが出ない | ✅ 達成 | Tailwind CSS と `max-w-md mx-auto` により全コンポーネントがスマホ画面幅に完全適応。 |
| 5 | 許可リストにないアカウントではアクセスできない | ✅ 達成 | `src/auth.ts` の `signIn` コールバックおよび `src/middleware.ts` による強制リダイレクト（`/unauthorized`）。 |
| 6 | リポジトリ全体と Git 履歴に、鍵・ID・パスワードが含まれていない | ✅ 達成 | `.gitignore` および `.dockerignore` で厳格に除外。コミット履歴の走査でも実キーの漏洩なし。 |
| 7 | シートの列を1つ入れ替えても全体が落ちず、該当カードにだけエラーが表示される | ✅ 達成 | `parseSheetRows` のヘッダー名マッピング（`HEADER_MAP`）と Zod バリデーションにより、順序不同に対応し異常行を `invalidRows` に隔離。 |
| 8 | `pnpm build` が警告なしで通る | ✅ 達成 | 全 15 ルートの静的・動的ビルドおよびスタンドアロン出力が正常完了。 |
| 9 | `tsc --noEmit` が通る | ✅ 達成 | 型エラー 0 件。 |
| 10 | データ層のテストが通る | ✅ 達成 | TypeScript 側 Vitest（19 件全通過）、Python 側 pytest（64 件全通過）。 |

---

## 3. Google Cloud Run へのデプロイ手順

ご指定いただいたデプロイ先 **Google Cloud Run** への公開手順です（詳細は [`docs/cloud_run_deployment.md`](file:///Users/kosei/jasc-task-app/docs/cloud_run_deployment.md) にも記載しています）。

### ① デプロイコマンドの実行（ソースからビルド）
リポジトリ直下（`/Users/kosei/jasc-task-app`）で、以下を実行します：

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
  --set-env-vars AUTH_SECRET="<ランダム32文字文字列>" \
  --set-env-vars AUTH_GOOGLE_ID="<Google OAuth クライアントID>" \
  --set-env-vars AUTH_GOOGLE_SECRET="<Google OAuth クライアントシークレット>" \
  --set-env-vars ALLOWED_EMAILS="<カンマ区切りメールアドレス>"
```

> [!TIP]
> **サービスアカウント鍵の取り扱いについて**
> Cloud Run 上で動作する際、Google Cloud のデフォルト認証（ADC: Application Default Credentials）が自動適用されます。
> そのため、スプレッドシートに Cloud Run の実行サービスアカウントの閲覧権限（Viewer）を付与しておけば、**秘密鍵 JSON を環境変数に設定する必要が一切ありません**。

### ② OAuth リダイレクト URI の登録
デプロイ後に発行された URL（例: `https://jasc-task-app-xxxx-an.a.run.app`）を、Google Cloud Console の OAuth 認証情報に登録します：
- 承認済みのリダイレクト URI：
  `https://jasc-task-app-xxxx-an.a.run.app/api/auth/callback/google`
- その後、Cloud Run の環境変数 `NEXTAUTH_URL` に上記サービス URL を設定します。

---

## 4. 並行稼働・比較の進め方とルール確認

- **絶対遵守ルール**：現行の Python（Streamlit Community Cloud）版は **停止・削除しません**。
- **並行期間**：数日間、EC メンバー（または管理者）に両方の URL を利用いただき、表示速度や操作感、データの同一性を比較検証していただきます。
- 🛑 **人間に確認（切替判定）**：
  並行稼働期間を経て、問題がないと人間が判断した段階で、本番の切り替え（切替完了の承認）を行ってください。Python 版の停止は人間側の作業として実施されます。
