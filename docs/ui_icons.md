# Material Symbols（Rounded）アイコン対応表

本ドキュメントは、フェーズ7.5（UI 刷新）において画面上の絵文字を Google Material Symbols（Rounded スタイル）へ移行した際の対応マトリクスと、色覚多様性（アクセシビリティ）への配慮仕様をまとめたものです。

Streamlit 1.35 以降で公式サポートされている `:material/icon_name:` 記法を採用しています。

---

## 1. 絵文字 → Material Symbols 対応表

### ナビゲーション・画面タイトル
| 絵文字 | Material Symbol | 記法 | 用途 / 画面名 |
|---|---|---|---|
| 🏠 | Dashboard | `:material/dashboard:` | 役職ボード（ホーム画面） |
| 📂 | Folder | `:material/folder:` | 役職詳細画面 |
| 🙋 | Person | `:material/person:` | マイタスク画面 |
| ⏰ | Alarm | `:material/alarm:` | 期限アラート画面 |
| 📑 | Format List Bulleted | `:material/format_list_bulleted:` | 全タスク一覧画面 |
| 📬 | Inbox | `:material/inbox:` | 依頼の受信箱画面 |
| 💚 | Mood | `:material/mood:` | 体感負荷チェックイン画面 |
| 🗺️ | Map | `:material/map:` | 余力マップ画面 |
| 📈 | Trending Up | `:material/trending_up:` | 進捗グラフ画面 |
| 📝 | Edit Note | `:material/edit_note:` | 議事メモからNA生成画面 |
| 📋 | Assignment | `:material/assignment:` | アプリケーションヘッダー |

### 主要操作・アクション
| 絵文字 | Material Symbol | 記法 | 用途 |
|---|---|---|---|
| ➕ | Add | `:material/add:` | 新しいタスクを作成 |
| ✏️ | Edit | `:material/edit:` | NA の簡易更新 |
| 📝 | Edit | `:material/edit_note:` | 全項目の編集・履歴 |
| 📦 | Archive | `:material/archive:` | タスクのアーカイブ |
| ♻️ | Unarchive | `:material/unarchive:` | タスクの復元 |
| ✅ | Check Circle | `:material/check_circle:` | 承諾する・保存完了 |
| 💬 | Chat | `:material/chat:` | 相談したい・コメント |
| 🚪 | Logout | `:material/logout:` | ログアウトボタン |
| 🔑 | Login | `:material/login:` | ログインボタン |
| 📥 | Move to Inbox | `:material/move_to_inbox:` | 選択した候補をまとめて登録 |
| ✨ | Auto Awesome | `:material/auto_awesome:` | NA 候補を作成する（AI 抽出） |
| 📌 | Push Pin | `:material/push_pin:` | 根拠となるメモの引用 |
| 👉 | Arrow Forward | `:material/arrow_forward:` | NA 項目表示・画面遷移リンク |

### バナー・通知・補助情報
| 絵文字 | Material Symbol | 記法 | 用途 |
|---|---|---|---|
| 🔔 | Notifications | `:material/notifications:` | あなたへの依頼通知バナー |
| 💡 | Lightbulb | `:material/lightbulb:` | 体感負荷未回答バナー・負荷ずれの印 |
| ⚠️ | Warning | `:material/warning:` | 個人情報警告・未入力警告 |
| ℹ️ | Info | `:material/info:` | 運用ポリシー・自動負荷説明 |
| ❓ | Help | `:material/help:` | 負荷計算・ずれの判定ヘルプ |
| 📊 | Bar Chart | `:material/bar_chart:` | 自動負荷グラフサブヘッダー |
| 📜 | History | `:material/history:` | 変更履歴セクション |
| 👥 | Group | `:material/group:` | 担当メンバー一覧 |
| ✉️ | Mail | `:material/mail:` | メールアドレス表示 |
| 👤 | Person | `:material/person:` | ログイン中ユーザー名 |

---

## 2. 色覚アクセシビリティ対応（色＋アイコン＋テキストの二重エンコーディング）

「色だけ」に頼った情報伝達を排し、色覚の多様性やモノクロ表示環境でも状態を瞬時に判別できるよう、すべてのステータスバッジおよび体感負荷バッジに固有の Material Symbol とテキストを併記しています。

### ステータスバッジ
| ステータス | アイコン | バッジ表示（Markdown） | カラー | 意味 |
|---|---|---|---|---|
| **未着手** | `:material/radio_button_unchecked:` | `:gray-badge[:material/radio_button_unchecked: 未着手]` | グレー | まだ着手していない |
| **進行中** | `:material/play_circle:` | `:blue-badge[:material/play_circle: 進行中]` | ブルー | 作業進行中 |
| **待ち** | `:material/hourglass_empty:` | `:orange-badge[:material/hourglass_empty: 待ち]` | オレンジ | 相手や外部からの連絡待ち |
| **完了** | `:material/check_circle:` | `:green-badge[:material/check_circle: 完了]` | グリーン | 完了済 |
| **期限切れ** | `:material/error:` | `:red-badge[:material/error: 期限を過ぎたNA]` | レッド | NA 期限超過 |
| **今週期限** | `:material/schedule:` | `:orange-badge[:material/schedule: 今週期限]` | オレンジ | 今週中に期限を迎える |
| **依頼中** | `:material/forward_to_inbox:` | `:violet-badge[:material/forward_to_inbox: 依頼中]` | バイオレット | 相手の承諾待ち |
| **相談中** | `:material/chat:` | `:orange-badge[:material/chat: 相談中]` | オレンジ | 条件等の相談・調整中 |
| **アーカイブ** | `:material/archive:` | `:gray-badge[:material/archive: アーカイブ済]` | グレー | アーカイブされたタスク |

### 体感負荷バッジ
| スコア範囲 | アイコン | バッジ表示（Markdown） | カラー | 状態の説明 |
|---|---|---|---|---|
| **未回答** | `:material/help_outline:` | `:gray-badge[:material/help_outline: 未回答]` | グレー | 7日以上チェックインなし |
| **1〜4** | `:material/sentiment_satisfied:` | `:green-badge[:material/sentiment_satisfied: 余裕あり（{score}/10）]` | グリーン | 余裕がある |
| **5〜7** | `:material/sentiment_neutral:` | `:orange-badge[:material/sentiment_neutral: 普通（{score}/10）]` | オレンジ | 普通〜やや立て込んでいる |
| **8〜10** | `:material/sentiment_dissatisfied:` | `:red-badge[:material/sentiment_dissatisfied: 負荷高（{score}/10）]` | レッド | 負荷が高い・相談したい |

