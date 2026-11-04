# セキュリティ点検レポート（フェーズ7）

本ドキュメントは、JASC タスクマネージャーにおける `docs/requirements.md`「6.1 セキュリティ」（S1〜S14）の充足状況、Git 履歴監査結果、および依存パッケージ脆弱性診断（`pip-audit`）の結果をまとめたものです。

---

## 1. セキュリティ要件（S1〜S14）点検表

| # | 要件 | 判定 | 該当コード / 設定箇所 | 実装メカニズム・検証方法 |
|---|---|---|---|---|
| **S1** | **認証必須**<br>未ログイン・未登録ユーザーにはデータを一切表示しない（データ読み込み前に認証チェックで `st.stop()`） | **適合** | `app.py:28-29`<br>`core/auth.py:48-98` (`require_authenticated_member`) | 業務データ読み込みより前に必ず `require_authenticated_member()` を呼び出し。未ログイン時はログイン画面を表示して `st.stop()`、登録外メアド時はアクセス拒否画面を出して即座に `st.stop()` を実行。`tests/test_auth.py` で検証済。 |
| **S2** | **秘密情報の厳格管理**<br>OIDC シークレット、`cookie_secret`、サービスアカウント鍵、Slack Bot トークン、Gemini API キーを Git にコミットしない | **適合** | `.gitignore:17`<br>`.streamlit/secrets.toml.example` | `.gitignore` に `.streamlit/secrets.toml` を指定。Git にはダミープレースホルダーを含む `.example` のみを配置。全コミット履歴監査で秘密情報のコミットゼロ件を確認。 |
| **S3** | **実在個人情報の排除**<br>GitHub リポジトリは private。コード・テストデータに実在の個人名・メールアドレス・電話番号・Slack ID を含めない | **適合** | `core/repository.py:53-90`<br>`tests/fixtures/` | ダミーデータには `member_a`, `user_a@example.com`, `U12345678` などの抽象的な識別子のみを使用。全コミット差分の正規表現検索で実在情報の漏洩がないことを確認。 |
| **S4** | **スプレッドシート共有範囲の限定**<br>共有相手をサービスアカウントと実行委員（必要な人のみ）に限定する | **適合** | Google Drive 権限設定<br>`core/sheets.py:100-112`<br>`README.md` | 「リンクを知っている全員」等の一般公開を行わず、サービスアカウントのクライアントメールおよび承認された委員アカウントのみに編集権限を制限。 |
| **S5** | **数式インジェクション対策**<br>シート書き込みはすべて `value_input_option="RAW"`。AI 生成文字列も同様 | **適合** | `core/sheets.py:175, 186, 236, 257`<br>`tests/test_sheets_repository.py` | Google Sheets API 呼び出しの全書き込み（`append_row`, `update_row`, `batch_update`）で `value_input_option="RAW"` を強制指定。`=` や `+` で始まる悪意ある入力も数式として評価されず文字列として格納。 |
| **S6** | **XSS & mrkdwn インジェクション対策**<br>ユーザー入力・AI 出力を `unsafe_allow_html=True` で表示しない。Slack 送信文字列は `<` `>` `&` をエスケープ | **適合** | コードベース全体（grep 0件）<br>`core/notifier.py:35-39` (`escape_slack_text`) | Streamlit 標準関数で HTML を自動エスケープ。`unsafe_allow_html=True` の使用箇所ゼロ。Slack 投稿メッセージは `escape_slack_text` で mrkdwn 制御文字をエスケープ。`tests/test_notifier.py` で検証済。 |
| **S7** | **同時編集対策（楽観的ロック）**<br>保存時に `updated_at` を比較し、競合を検知する | **適合** | `core/models.py:OptimisticLockError`<br>`core/repository.py:SheetsRepository.update_task:280-295`<br>`core/session.py:516, 701, 742` | 更新実行時に `expected_updated_at` とストレージ側のタイムスタンプを照合。一致しない場合は `OptimisticLockError` を送出し、画面に親切なリロード案内を表示。`tests/test_repository_and_snapshots.py` で検証済。 |
| **S8** | **物理削除の禁止と変更履歴の記録**<br>物理削除なし（アーカイブのみ）＋全変更履歴の記録 | **適合** | `core/services.py:toggle_archive_task`<br>`core/repository.py:add_activity_log`<br>`core/session.py:743-795` | `tasks` シートの物理削除は行わず `archived=TRUE` を記録。作成・編集・簡易更新・アーカイブ・復元・依頼承諾/相談の全操作を `activity_logs` シートにタイムスタンプと実行者付きで追記保存。 |
| **S9** | **個人情報保護の入力注意書き**<br>応募者情報・健康情報・連絡先は扱わない。メモ・議事メモ・体感負荷の一言欄に注意書きを表示 | **適合** | `core/session.py:372`<br>`pages/minutes.py:54`<br>`pages/checkin.py:31`<br>`locales/ja.toml`, `en.toml` | タスク作成/編集モーダル（`notes_privacy_warning`）、議事メモ抽出画面（`minutes.privacy_warning`）、チェックイン画面（`checkin.privacy_notice`）の全入力欄直上にプライバシー注意文言を常時表示。 |
| **S10** | **依存パッケージのバージョン固定と脆弱性監査**<br>バージョン固定。リリース前に `pip-audit` で確認する | **適合** | `pyproject.toml`<br>`uv.lock`<br>`.github/workflows/test.yml` | 全パッケージのバージョンを `==` で固定。`uv run pip-audit` を実行し、解決済み 84 パッケージ全件において既知の脆弱性 0 件（No known vulnerabilities found）を確認。 |
| **S11** | **Gemini API のデータ保護とマスキング**<br>無料枠と有料枠のデータ取り扱い差の把握。送信前の個人情報マスキング | **適合** | `core/masking.py:10-23`<br>`core/na_extractor.py:190-210`<br>`tests/test_masking.py` | 議事メモ送信前に `mask_sensitive_text()` でメールアドレス（`[メール]`）および電話番号（`[電話番号]`）を正規表現置換。Gemini API 呼び出し時にはメンバーのメールアドレスは一切渡さず、表示名と ID のみを提供。 |
| **S12** | **AI 出力の提案扱いと人の承認**<br>AI には JSON 候補返却のみを許可。検証と人の確認を経てから保存する | **適合** | `core/na_extractor.py:104-180` (`validate_extracted_candidates`)<br>`pages/minutes.py:112-260` | JSON スキーマによる構造化出力に限定し、受け取り後に役職ID・メンバーIDの存在検証、日付正規化、文字数切り詰めを実施。画面上で人間が内容を確認・修正・チェックした項目のみを確定登録。 |
| **S13** | **Gemini API レート制限とクォータ上限**<br>1ユーザーあたり1分3回までの制限。API キーの上限・アラート設定 | **適合** | `core/na_extractor.py:74-101` (`check_and_record_rate_limit`)<br>`pages/minutes.py:88-92`<br>`tests/test_na_extractor.py` | セッション状態に基づく 60 秒スライディングウィンドウ方式で 1 分間に 3 回を超える呼び出しを遮断（`RateLimitExceededError`）。Google AI Studio 側での Quota 上限と予算アラート設定手順を策定。 |
| **S14** | **Slack Bot 権限の最小化と漏洩時対応**<br>権限は `chat:write` と `im:write` の最小限。トークン漏洩時の差し替え手順策定 | **適合** | Slack App Manifest (`requirements.md`)<br>`README.md`<br>`core/notifier.py` | Bot トークンスコープをメッセージ投稿（`chat:write`）および DM チャンネルオープン（`im:write`）の 2 権限のみに限定（会話履歴等の読み取り権限は不保持）。漏洩時の即時 Revoke と再発行手順を README に明記。 |

---

## 2. Git 履歴全体の秘密情報・個人情報監査

### 監査手法
Git の初期コミットから最新コミット（HEAD）までの全コミット差分を対象に、API キー、秘密鍵、および実在の個人情報パターンを検索しました。

1. **Google API / Gemini API キーパターン (`AIza`)**:
   - 検索対象: 全コミット差分
   - 結果: 該当箇所は `.streamlit/secrets.toml.example` 内のダミー文字列（`AIzaSy-your-gemini-api-key`）およびテストコード（`tests/test_na_extractor.py` 内のダミー引数）のみ。本物の API キーのコミットは **0 件**。
2. **秘密鍵ヘッダー (`BEGIN PRIVATE KEY` / `BEGIN RSA PRIVATE KEY`)**:
   - 検索対象: 全コミット差分
   - 結果: `.streamlit/secrets.toml.example` 内のプレースホルダーのみ。本物の GCP サービスアカウント秘密鍵のコミットは **0 件**。
3. **Google OAuth クライアントシークレット (`GOCSPX-`)**:
   - 検索対象: 全コミット差分
   - 結果: `.streamlit/secrets.toml.example` 内のプレースホルダーのみ。本物のシークレットのコミットは **0 件**。
4. **Slack Bot トークン (`xoxb-`)**:
   - 検索対象: 全コミット差分
   - 結果: `.streamlit/secrets.toml.example` およびテストコード内のダミートークンのみ。本物の Bot トークンのコミットは **0 件**。
5. **`.gitignore` の設定確認**:
   - `.streamlit/secrets.toml` が正しく登録されており、実運用時の機密情報ファイルが Git 追跡対象外であることを確認。

---

## 3. 依存パッケージ脆弱性診断（pip-audit）結果

2026年11月4日、`uv run pip-audit`（pip-audit 2.10.1）による診断を実施しました。

- **対象パッケージ数**: 84 パッケージ（推移的依存関係を含む全パッケージ）
- **脆弱性検出数**: **0 件**（`No known vulnerabilities found`）
- **評価**:
  - `streamlit` (1.66.1), `google-genai` (2.34.0), `slack-sdk` (3.46.0), `authlib` (1.9.3) を含む主要ライブラリに既知のセキュリティ脆弱性は確認されませんでした。
  - GitHub Actions（`.github/workflows/test.yml`）においても、継続的インテグレーション時に依存関係の健全性を担保しています。

