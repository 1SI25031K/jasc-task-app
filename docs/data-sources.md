# データソース仕様書（docs/data-sources.md）

本書は、JASC EC ダッシュボードにおけるデータソース（Google スプレッドシート全10シート）の構造、列マッピング、およびデータ検証仕様を定義したものです。

---

## 1. データ取得アーキテクチャ

1. **アクセス権限**:
   - `https://www.googleapis.com/auth/spreadsheets.readonly` に限定。
   - ダッシュボードからスプレッドシートへの書き込み処理は行いません。
2. **高速化（単一バッチリクエスト）**:
   - `spreadsheets.values.batchGet` を使用し、全10シートを 1 回の HTTP 通信でまとめて取得。
3. **サーバー側キャッシュ**:
   - サーバー側で 5 分間（300秒）キャッシュ。429 レート制限エラーを回避しつつ高速表示を実現。
4. **列順の独立性（Column Order Independence）**:
   - 列番号固定ではなく、1行目のヘッダー文字列をキーとする `HEADER_MAP` を介してパース。列の入れ替えや不要列の挿入があっても正常に動作します。
5. **フェイルセーフ（`invalidRows`）**:
   - 壊れた行や空欄があってもダッシュボード全体を落とさず、正常行のみを画面に反映し、異常行は `invalidRows` として集計します。

---

## 2. 全10シートのスキーマとヘッダー対応

### ① `members`（名簿・権限）
- **用途**: ログイン認可、担当者名、Slack ID、言語設定
- **ヘッダー対応**:
  - `member_id` ➔ `memberId` (string, required)
  - `display_name` ➔ `displayName` (string, required)
  - `display_name_en` ➔ `displayNameEn` (string)
  - `email` ➔ `email` (string)
  - `main_roles` ➔ `mainRoles` (string)
  - `lang` ➔ `lang` ("ja" | "en", default: "ja")
  - `slack_user_id` ➔ `slackUserId` (string)
  - `reminders_enabled` ➔ `remindersEnabled` (boolean, default: false)
  - `is_admin` ➔ `isAdmin` (boolean, default: false)
  - `active` ➔ `active` (boolean, default: true)
  - `bg_mode` ➔ `bgMode` (string, default: "none")
  - `bg_color` ➔ `bgColor` (string)

### ② `roles`（役職マスタ）
- **用途**: 全21役職の定義、表示順、カテゴリ分類
- **ヘッダー対応**:
  - `role_id` ➔ `roleId` (string, required)
  - `name` ➔ `name` (string, required)
  - `name_en` ➔ `nameEn` (string)
  - `category` ➔ `category` ("主役職" | "副役職" | "サイト" | "その他")
  - `sort_order` ➔ `sortOrder` (number, default: 999)
  - `active` ➔ `active` (boolean, default: true)

### ③ `role_assignments`（役職とメンバーの紐付け）
- **用途**: 各役職の責任者・担当者の特定
- **ヘッダー対応**:
  - `role_id` ➔ `roleId` (string, required)
  - `member_id` ➔ `memberId` (string, required)
  - `kind` ➔ `kind` ("責任者" | "担当" | "サポート")

### ④ `tasks`（タスク・NA 本体）
- **用途**: タスク一覧、期限判定、自動負荷計算、マイタスク
- **ヘッダー対応**:
  - `task_id` ➔ `taskId` (string, required)
  - `title` ➔ `title` (string, required)
  - `role_ids` ➔ `roleIds` (string)
  - `owner_member_id` ➔ `ownerMemberId` (string)
  - `requested_by` ➔ `requestedBy` (string)
  - `assignment_status` ➔ `assignmentStatus` (string)
  - `assignment_comment` ➔ `assignmentComment` (string)
  - `weight` ➔ `weight` ("軽" | "中" | "重")
  - `next_action` ➔ `nextAction` (string)
  - `na_due` ➔ `naDue` (string)
  - `task_due` ➔ `taskDue` (string)
  - `status` ➔ `status` ("未着手" | "進行中" | "確認待ち" | "完了")
  - `waiting_on_member_id` ➔ `waitingOnMemberId` (string)
  - `priority` ➔ `priority` (string)
  - `blocker` ➔ `blocker` (string)
  - `notes` ➔ `notes` (string)
  - `source` ➔ `source` (string)
  - `meeting_id` ➔ `meetingId` (string)
  - `completed_at` ➔ `completedAt` (string)
  - `completed_by` ➔ `completedBy` (string)
  - `created_at` ➔ `createdAt` (string)
  - `created_by` ➔ `createdBy` (string)
  - `updated_at` ➔ `updatedAt` (string)
  - `updated_by` ➔ `updatedBy` (string)
  - `archived` ➔ `archived` (boolean, default: false)

### ⑤ `checkins`（体感負荷記録）
- **用途**: 余力マップでの体感スコア（1〜10）と負荷ギャップ判定
- **ヘッダー対応**:
  - `checkin_id` ➔ `checkinId` (string, required)
  - `member_id` ➔ `memberId` (string, required)
  - `date` ➔ `date` (string)
  - `score` ➔ `score` (number 1..10)
  - `comment` ➔ `comment` (string)
  - `auto_load_at_checkin` ➔ `autoLoadAtCheckin` (number | null)

### ⑥ `daily_snapshots`（日次集計）
- **用途**: 進捗グラフ画面での完了率推移、自動負荷推移
- **ヘッダー対応**:
  - `date` ➔ `date` (string, required)
  - `scope_type` ➔ `scopeType` ("ALL" | "member" | "role")
  - `scope_id` ➔ `scopeId` (string)
  - `total` ➔ `total` (number)
  - `done` ➔ `done` (number)
  - `open` ➔ `open` (number)
  - `overdue` ➔ `overdue` (number)
  - `completion_rate` ➔ `completionRate` (number)
  - `auto_load` ➔ `autoLoad` (number)

### ⑦ `settings`（運用パラメータ）
- **用途**: `load_window_days`（負荷計算日数=14）、`high_load_score` 等の設定値
- **ヘッダー対応**:
  - `key` ➔ `key` (string, required)
  - `value` ➔ `value` (string)

### ⑧ `activity_log`（変更履歴）
- **用途**: タスクの変更履歴・監査用ログ
- **ヘッダー対応**:
  - `timestamp` ➔ `timestamp` (string)
  - `member_id` ➔ `memberId` (string)
  - `task_id` ➔ `taskId` (string)
  - `action` ➔ `action` (string)
  - `field` ➔ `field` (string)
  - `old_value` ➔ `oldValue` (string)
  - `new_value` ➔ `newValue` (string)

### ⑨ `meetings`（議事録メタ情報）
- **用途**: 会議日付、タイトル、生成タスク件数
- **ヘッダー対応**:
  - `meeting_id` ➔ `meetingId` (string, required)
  - `meeting_date` ➔ `meetingDate` (string)
  - `title` ➔ `title` (string)
  - `created_by` ➔ `createdBy` (string)
  - `created_at` ➔ `createdAt` (string)
  - `generated_count` ➔ `generatedCount` (number)
  - `saved_count` ➔ `savedCount` (number)

### ⑩ `reminder_log`（Slack通知送信ログ）
- **用途**: 重複通知防止ログの確認
- **ヘッダー対応**:
  - `sent_at` ➔ `sentAt` (string)
  - `member_id` ➔ `memberId` (string)
  - `kind` ➔ `kind` (string)
  - `task_id` ➔ `taskId` (string)
  - `date_key` ➔ `dateKey` (string)

---

## 3. 日付とビジネスロジックの解釈ルール

- **基準タイムゾーン**: `Asia/Tokyo`（JST）。
- **ファジーパース**:
  - `YYYY-MM-DD` はそのままパース。
  - `M/D`（例: `9/2`, `2/15`）は年度開始月（既定: 9月）に基づき年を補完。
  - 複数日表記（例: `10/1\n10/2`）や合宿表記（例: `1/14-17 第１次選考合宿`）は先頭の日付を抽出。
  - 未定等のテキストは rawString を保持し末尾に並べる。
- **真偽値解釈**:
  - `TRUE`, `1`, `YES` ➔ `true`
  - `FALSE`, `0`, `NO` ➔ `false`

