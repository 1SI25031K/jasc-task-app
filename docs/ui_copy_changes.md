# UI 文言・コピー変更対応表（フェーズ 7.7）

フェーズ 7.7 の「AIが作った感じを減らす」方針（Google アカウント管理画面のトーン＆マナー）に基づき、文言を短縮・事実化し、「！」や過度な敬語・会話文・カッコ書き補足を整理した対応表です。

## 1. 共通（common / task_form）

| キー | 変更前 (ja) | 変更後 (ja) | 変更前 (en) | 変更後 (en) | 変更理由 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `common.save` | 保存する | 保存 | Save | Save | 動詞形から標準の事実表記へ |
| `common.archive_btn` | アーカイブする | アーカイブ | Archive | Archive | 簡潔化 |
| `common.restore_btn` | 復元する | 復元 | Restore | Restore | 簡潔化 |
| `common.update_na_btn` | NAを更新 | 更新 | Update NA | Update | 2クリック操作の簡潔化 |
| `common.edit_full_btn` | 詳細を編集・履歴 | 詳細・履歴 | Edit Details / History | Details & History | 簡潔化 |
| `common.overdue_badge` | 期限を過ぎたNA | 期限超過 | Past Due NA | Overdue | 単語の引き締め |
| `common.saved_toast` | 保存しました。 | 保存しました。 | Changes saved. | Saved. | 簡潔化 |
| `common.archived_toast` | タスクをアーカイブしました。 | アーカイブしました。 | Task archived. | Archived. | 簡潔化 |
| `common.restored_toast` | タスクを復元しました。 | 復元しました。 | Task restored. | Restored. | 簡潔化 |
| `task_form.create_title` | 新しいタスクを作成 | タスクの作成 | Create New Task | Create New Task | 簡潔化 |
| `task_form.tab_quick` | (新規) | クイック更新 | (New) | Quick Update | タブ用 |
| `task_form.tab_full` | (新規) | 詳細・履歴 | (New) | Details & History | タブ用 |
| `task_form.quick_na_expander` | :material/edit: NA・期限・ステータスをすぐ更新 | クイック更新 | :material/edit: Quick Update: NA, Due Date & Status | Quick Update | 絵文字撤廃・口語廃止 |
| `task_form.full_edit_expander` | :material/edit_note: 全項目の編集・アーカイブ・変更履歴 | 詳細・履歴 | :material/edit_note: Edit All Fields, Archive & History | Details & History | 絵文字撤廃・簡潔化 |
| `task_form.field_title` | タスク名（必須） | タスク名 | Task Title (Required) | Task Title | カッコ補足削除 |
| `task_form.field_roles` | 関係する役職（必須・複数選択可） | 担当役職 | Related Roles (Required, Multiple Allowed) | Roles | カッコ補足削除 |
| `task_form.field_owner` | 担当者（必須） | 担当者 | Owner (Required) | Owner | カッコ補足削除 |
| `task_form.field_weight` | 重さ（必須） | 重さ | Weight (Required) | Weight | カッコ補足削除 |
| `task_form.field_na` | 次のアクション（NA：すぐ動ける粒度の1行・必須） | 次のアクション (NA) | Next Action (NA: 1 actionable line, Required) | Next Action (NA) | 説明的カッコ削除 |
| `task_form.field_na_due` | NA の期限（必須） | NA 期限 | NA Due Date (Required) | NA Due Date | 簡潔化 |
| `task_form.field_task_due` | タスク全体の期限（任意） | 全体期限 | Overall Task Due Date (Optional) | Task Due Date | 簡潔化 |
| `task_form.field_enable_task_due` | タスク全体の期限を設定する | 全体期限を設定 | Set an overall task due date | Set task due date | 簡潔化 |
| `task_form.field_waiting_on` | 待っている相手（メンバーの場合） | 待ち相手 (メンバー) | Waiting On (If a member) | Waiting On | カッコ補足短縮 |
| `task_form.field_blocker` | 止まっている理由・依頼先（外部等の場合） | 保留理由・外部依頼先 | Blocker / Waiting On (If external) | Blocker / External | 簡潔化 |
| `task_form.field_notes` | メモ（任意） | メモ | Notes (Optional) | Notes | カッコ補足削除 |
| `task_form.notes_privacy_warning` | :material/warning: 応募者情報・健康情報・連絡先（メールアドレス・電話番号）などの個人情報は書かないでください。 | :material/warning: 個人情報（メール・電話番号・健康情報等）は記入しないでください。 | :material/warning: Please do not enter personal data such as applicant info, health details, email addresses, or phone numbers. | :material/warning: Do not enter personal information (emails, phone numbers, health info, etc.). | 1行で簡潔に警告 |
| `task_form.rerequest_btn` | 内容を調整して再依頼する | 再依頼 | Update & Re-send Request | Re-send Request | 簡潔化 |
| `task_form.history_section` | :material/history: 変更履歴（{count}件） | 変更履歴 ({count}) | :material/history: Activity History ({count}) | Activity History ({count}) | アイコン・件数表記統一 |

---

## 2. 役職ボード（board）/ 役職詳細（role_detail）

| キー | 変更前 (ja) | 変更後 (ja) | 変更前 (en) | 変更後 (en) | 変更理由 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `board.subtitle` | 各役職の現在のタスク状況と、最も期限が近い次のアクション（NA）を確認できます。 | 各役職のタスク状況と直近の NA 一覧。 | Overview of open tasks and the nearest Next Action (NA) for each role. | Overview of tasks and upcoming NAs by role. | 冗長な言い回しを短縮 |
| `board.banner_checkin` | :material/lightbulb: 本日の体感負荷が未回答です（1クリックで回答できます） | :material/lightbulb: 本日の体感負荷が未回答です | :material/lightbulb: Today's workload check-in is not yet submitted (1-click to answer) | :material/lightbulb: Today's workload check-in is pending | 「1クリックで回答できます」等の補足削除 |
| `board.banner_checkin_btn` | 体感負荷チェックインへ | 体感負荷チェックイン | Go to Check-in | Check-in | 簡潔化 |
| `board.overdue_nas` | 期限を過ぎたNA | 期限超過 NA | Past Due NAs | Past Due NAs | 統一 |
| `board.nearest_na` | 最も期限の近いNA | 直近の NA | Nearest NA | Nearest NA | 簡潔化 |
| `board.open_role_detail` | 役職詳細を見る | 役職詳細 | View Role Details | Role Details | 簡潔化 |
| `role_detail.select_role` | 表示する役職を選択 | 役職の選択 | Select a Role | Select a Role | 簡潔化 |
| `role_detail.assigned_members` | 担当メンバーと現在の負荷 | 担当メンバー | Assigned Members & Current Workload | Assigned Members | 簡潔化 |
| `role_detail.open_tasks_section` | 未完了タスク一覧（NA期限順） | 未完了タスク | Open Tasks (Sorted by NA Due Date) | Open Tasks | カッコ補足削除 |
| `role_detail.completed_tasks_expander` | 完了したタスクを表示（{count}件） | 完了タスク ({count}) | Show Completed Tasks ({count}) | Completed Tasks ({count}) | 簡潔化 |
| `role_detail.create_for_role_btn` | :material/add: この役職のタスクを作成 | :material/add: タスクを作成 | :material/add: Create Task for This Role | :material/add: Create Task | 簡潔化 |

---

## 3. マイタスク（my_tasks）/ 期限アラート（alerts）/ 全タスク（all_tasks）

| キー | 変更前 (ja) | 変更後 (ja) | 変更前 (en) | 変更後 (en) | 変更理由 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `my_tasks.title_with_name` | :material/person: マイタスク（{name}） | マイタスク | :material/person: My Tasks ({name}) | My Tasks | 自分の名前のカッコ書き・装飾アイコン削除 |
| `my_tasks.tab_pending_requests` | 依頼中（お返事待ち）（{count}） | 依頼中 ({count}) | Pending Requests ({count}) | Pending Requests ({count}) | 口語補足の削除 |
| `my_tasks.tab_active` | 進行中・未着手（{count}） | 進行中 ({count}) | In Progress / Not Started ({count}) | In Progress ({count}) | 簡潔化 |
| `my_tasks.tab_waiting` | 待ち（{count}） | 待ち ({count}) | Waiting ({count}) | Waiting ({count}) | 統一 |
| `my_tasks.tab_done` | 完了（直近）（{count}） | 完了 ({count}) | Completed (Recent) ({count}) | Completed ({count}) | カッコ補足削除 |
| `my_tasks.go_to_inbox_hint` | 届いている依頼には「依頼の受信箱」から1クリックで承諾・相談のお返事ができます。 | 依頼への対応は「依頼の受信箱」で行えます。 | You can accept or discuss incoming requests with 1 click in the Request Inbox. | Respond to requests in Request Inbox. | 丁寧すぎる会話調を事実調へ短縮 |
| `alerts.title` | 期限アラート（定例会確認用） | 期限アラート | Due Alerts (For Regular Meetings) | Due Alerts | カッコ補足削除 |
| `alerts.subtitle` | 定例会の冒頭で画面共有し、日程の再調整や分担のフォローを話し合うための画面です。 | 定例会での確認および日程再調整用。 | Share this screen at the start of regular meetings to coordinate schedules and support. | For coordination and schedule adjustments during regular meetings. | 簡潔な事実のみを1行で記述 |
| `alerts.metric_overdue` | ① 期限を過ぎた NA | 期限超過 NA | ① NAs Past Due Date | Past Due NAs | 丸数字撤廃 |
| `alerts.metric_due_week` | ② 今週が期限の NA | 今週期限 NA | ② NAs Due This Week | Due This Week | 丸数字撤廃 |
| `alerts.metric_stale` | ③ 1週間以上更新のないタスク | 未更新タスク (7日以上) | ③ No Update for 7+ Days | No Update (7+ Days) | 丸数字撤廃 |
| `alerts.metric_pending_req` | ④ お返事待ちの依頼（2日以上） | 未回答の依頼 (2日以上) | ④ Pending Requests (2+ Days) | Pending Requests (2+ Days) | 丸数字撤廃 |
| `alerts.sec_overdue` | ① 期限を過ぎた NA（日程の再調整や更新をお願いします） | 期限超過 NA | ① NAs Past Due Date (Please reschedule or update the next step) | Past Due NAs | 丸数字・会話調カッコ削除 |
| `alerts.sec_due_week` | ② 今週が期限の NA（今日〜7日後） | 今週期限 NA | ② NAs Due This Week (Today – Next 7 Days) | Due This Week | 丸数字・カッコ削除 |
| `alerts.sec_stale` | ③ 進捗の確認（1週間以上更新のないタスク） | 未更新タスク (7日以上) | ③ Status Check (Tasks with no updates for 7+ days) | No Update (7+ Days) | 丸数字・カッコ削除 |
| `alerts.sec_pending_req` | ④ お返事待ちの依頼 | 未回答の依頼 | ④ Requests Waiting for Response | Pending Requests | 丸数字削除 |
| `all_tasks.filter_expander` | :material/filter_list: 絞り込み条件 | :material/filter_list: 絞り込み | :material/filter_list: Filter Tasks | :material/filter_list: Filter | 簡潔化 |
| `all_tasks.filter_keyword` | キーワード（タイトル・NA・メモ） | キーワード検索 | Keyword (Title, NA, Notes) | Keyword Search | カッコ補足削除 |
| `all_tasks.result_count` | 該当件数：{count}件 | {count} 件 | Matching tasks: {count} | {count} tasks | 簡潔化 |

---

## 4. 受信箱（inbox）/ チェックイン（checkin）/ 余力マップ（capacity_map）

| キー | 変更前 (ja) | 変更後 (ja) | 変更前 (en) | 変更後 (en) | 変更理由 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `inbox.title_with_name` | :material/inbox: 依頼の受信箱（{name}） | 依頼の受信箱 | :material/inbox: Request Inbox ({name}) | Request Inbox | カッコ・装飾アイコン削除 |
| `inbox.subtitle` | 他のメンバーからあなたに届いているタスクの依頼一覧です。 | 他メンバーから届いているタスク依頼一覧。 | Task requests sent to you by other members. | Pending task requests from other members. | 簡潔化 |
| `inbox.accept_btn` | :material/check_circle: 承諾する | 承諾 | :material/check_circle: Accept Request | Accept | 装飾アイコン撤廃・ボタン短縮 |
| `inbox.consult_btn` | :material/chat: 相談したい（コメントを送る） | 相談 | :material/chat: Discuss (Send Comment) | Discuss | 装飾アイコン撤廃・カッコ削除 |
| `inbox.consult_comment_label` | 相談したい場合のコメント（必須：時期や分担の希望などを入力） | 相談コメント（時期や分担の希望） | Comment if you'd like to discuss (Required for 'Discuss') | Discussion comment (timing, workload sharing) | 簡潔化 |
| `inbox.accepted_toast` | 依頼を承諾しました！依頼したメンバーに通知されます。 | 依頼を承諾しました。 | Request accepted! The requester will be notified. | Request accepted. | 「！」削除・簡潔化 |
| `inbox.consulted_toast` | 「相談中」としてコメントを記録しました。依頼したメンバーに通知されます。 | 相談コメントを記録しました。 | Marked as 'Discussing' with your comment. The requester will be notified. | Marked as discussing. | 簡潔化 |
| `inbox.consulting_section` | 現在「相談中」のタスク | 相談中のタスク | Tasks Currently in 'Discussing' Status | Tasks Under Discussion | 簡潔化 |
| `checkin.title_with_name` | :material/mood: 体感負荷チェックイン（{name}） | 体感負荷チェックイン | :material/mood: Workload Check-in ({name}) | Workload Check-in | カッコ・顔文字撤廃 |
| `checkin.subtitle` | 現在のあなたの余裕度・体感負荷（1＝かなり余裕がある 〜 10＝限界）を教えてください。 | 本日の体感負荷を 1〜10 で選択してください。 | How is your current workload capacity? (1 = Plenty of room, 10 = At full capacity) | Select today's workload capacity from 1 to 10. | 1行で事実を指示 |
| `checkin.comment_label` | 一言コメント（任意・最大100文字。例：「来週テスト」「岩手の調整が山場」） | 一言コメント（任意） | Short Note (Optional, max 100 chars, e.g., 'Exams next week', 'Iwate prep peak') | Short Note | 簡潔化 |
| `checkin.saved_message` | :material/check_circle: 体感負荷（{score}）を記録しました！ | :material/check_circle: 体感負荷 {score} を記録しました。 | :material/check_circle: Recorded your workload check-in ({score})! | :material/check_circle: Workload score {score} recorded. | 「！」削除 |
| `checkin.group_low` | :material/sentiment_satisfied: 1〜4：余裕がある | 1〜4：余裕あり | :material/sentiment_satisfied: 1–4: Plenty of capacity | 1–4: Plenty of room | 顔絵文字全廃 |
| `checkin.group_mid` | :material/sentiment_neutral: 5〜7：普通〜やや立て込んでいる | 5〜7：通常 | :material/sentiment_neutral: 5–7: Moderate / Busy | 5–7: Normal | 顔絵文字全廃 |
| `checkin.group_high` | :material/sentiment_dissatisfied: 8〜10：負荷が高い・相談したい | 8〜10：高負荷 | :material/sentiment_dissatisfied: 8–10: High load / Need support | 8–10: High load | 顔絵文字全廃 |
| `capacity_map.policy_banner` | :material/info: この数字は評価には使いません。分担を話し合うための材料です。 | 分担検討用の指標です。人事評価等には使用しません。 | :material/info: These numbers are never used for evaluation. They are a shared reference to discuss workload balance. | Shared reference for workload balancing, not evaluation. | 押し付けがましくない事実表記 |
| `capacity_map.help_expander` | :material/help: 自動負荷と「ずれ」の計算方法について | 計算方法 | :material/help: How Auto Load and 'Gap' are calculated | Calculation Details | 簡潔化 |
| `capacity_map.chart_title` | メンバー別の自動負荷（承諾済 ／ 依頼・相談中） | メンバー別自動負荷 | Auto Load by Member (Accepted vs. Pending/Discussing) | Auto Load by Member | 簡潔化 |
| `capacity_map.member_cards_title` | メンバー別の状況一覧 | メンバー状況一覧 | Member Capacity Overview | Member Capacity | 簡潔化 |

---

## 5. NA 生成（minutes）/ 進捗グラフ（progress）/ ホーム（home）

| キー | 変更前 (ja) | 変更後 (ja) | 変更前 (en) | 変更後 (en) | 変更理由 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `minutes.ai_note` | (新規) | AI が候補を作ります。内容を確認してから登録してください。 | (New) | AI generates candidate next actions. Review before saving. | 要件で指定された1行注記 |
| `minutes.extract_btn` | :material/auto_awesome: NA 候補を作成する | :material/add_task: NA 候補を作成 | :material/auto_awesome: Generate NA Candidates | :material/add_task: Generate NA Candidates | キラキラ（auto_awesome）アイコン撤廃 |
| `minutes.candidates_section` | 抽出された NA 候補（内容を確認・修正し、登録する行にチェックを入れてください） | 抽出された NA 候補 | Generated NA Candidates (Review, edit, and check the rows to register) | Generated NA Candidates | 説明的カッコ削除 |
| `minutes.save_selected_btn` | :material/move_to_inbox: チェックした候補をまとめて登録する | 選択した候補を登録 | :material/move_to_inbox: Register Selected Candidates | Register Selected Candidates | 簡潔化 |
| `minutes.saved_count_toast` | {count}件のタスクを登録しました！ | {count} 件のタスクを登録しました。 | Registered {count} task(s)! | {count} task(s) registered. | 「！」削除 |
| `progress.chart1_title` | ① 全体の完了率の推移（%） | 全体完了率の推移 (%) | ① Overall Completion Rate Trend (%) | Overall Completion Rate Trend (%) | 丸数字撤廃 |
| `progress.chart2_title` | ② 役職別の現在の完了率（%） | 役職別完了率 (%) | ② Current Completion Rate by Role (%) | Completion Rate by Role (%) | 丸数字撤廃 |
| `progress.chart3_title` | ③ 役職別の期限を過ぎた NA 数（件） | 役職別 期限超過 NA 数 | ③ NAs Past Due Date by Role | Past Due NAs by Role | 丸数字撤廃 |
| `progress.chart4_title` | ④ メンバー別の自動負荷の推移（pt） | メンバー別自動負荷の推移 (pt) | ④ Auto Load Trend by Member (pt) | Auto Load Trend by Member (pt) | 丸数字撤廃 |
| `home.alert_inbox_desc` | 他メンバーからあなた宛ての依頼を確認し、承諾または相談のお返事をしてください。 | 未対応の依頼があります。承諾または相談を行ってください。 | Please review tasks requested from other members and accept or consult. | You have pending requests. Accept or consult. | 丁寧すぎる会話調から事実調へ短縮 |
| `home.alert_checkin_desc` | 1クリックで今日の余裕度・体感負荷を記録できます。 | 本日の体感負荷を選択してください。 | Record your workload and capacity in one click. | Select today's workload capacity. | 1クリック等の誇張削除 |

