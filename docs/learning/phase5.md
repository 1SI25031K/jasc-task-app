# フェーズ5 学習ガイド：Slack 連携（Bot 通知）と GitHub Actions による毎朝の定時処理

このドキュメントでは、フェーズ5で実装した **Slack Bot 連携（`slack_sdk`）**、**毎朝の定時処理スクリプト（`scripts/daily_job.py`）**、および **GitHub Actions（`.github/workflows/daily.yml`・`test.yml`）** の仕組みを解説します。

---

## 1. このフェーズで作ったもの（全体像）

1. **[`core/notifier.py`](../../core/notifier.py) の `SlackNotifier`**：
   - `slack_sdk.WebClient` を使い、チャンネル投稿（F12 毎朝のまとめ、F19 週次の完了まとめ）と個人 DM（F18 1人1通のリマインド）を実際に送信するクラスです。
   - 一時的な通信エラーに備え、失敗時は **1回だけ再試行（リトライ）** します。
2. **[`scripts/daily_job.py`](../../scripts/daily_job.py)**：
   - 毎朝 8:00（日本時間）に自動実行されるバッチスクリプトです。
   - 「① シート読み込み → ② `daily_snapshots` 更新 → ③ 毎朝のまとめ投稿 → ④ 個人 DM 送信 → ⑤ 月曜は週次の完了まとめ投稿」の順に処理します。
   - `--dry-run` オプションを付けると、Slack 送信やシート書き込みを一切行わずに「今日送られる予定のメッセージ全文」をターミナルで確認できます。
3. **[`.github/workflows/daily.yml`](../../.github/workflows/daily.yml) / [`test.yml`](../../.github/workflows/test.yml)**：
   - Streamlit Community Cloud の画面がスリープしていても、GitHub のサーバー上で毎朝 8:00 JST（23:00 UTC）に確実に `daily_job.py` を動かす仕組みと、コードを push するたびに `pytest` を自動実行する仕組み（CI）です。

---

## 2. 新しく出てきた概念・ツールの解説

### ① 最小権限の原則（S14：`chat:write` と `im:write`）
- **日常の例え**：「郵便配達員さんに『手紙をポストに入れる鍵』だけを渡し、『家の中の部屋を開ける鍵』は渡さない」というセキュリティの基本原則です。
- Slack アプリには様々な権限（チャンネルの過去ログを読む `channels:history` など）がありますが、このアプリに必要なのは以下の **2つだけ** です：
  - `chat:write`：メッセージを投稿する権限
  - `im:write`：メンバー個人との DM（ダイレクトメッセージ）を開く権限
- これにより、万が一トークンが漏洩しても、Slack 内の過去の会話やプライベートなやり取りが読み取られることはありません。

### ② 冪等性（べきとうせい / Idempotency）と二重送信防止
- **冪等性とは**：「同じ処理を1回実行しても、2回・3回と繰り返して実行しても、結果が同じになり悪影響（二重送信やデータの重複）が起きない性質」のことです。
- ネットワーク通信は途中で失敗することがあります。例えば「8人中3人目まで DM を送ったところで通信エラーになり、もう1回スクリプトを実行した」とき、1〜3人目にもう一度同じ DM が届いてしまったら困ります。
- そのため、`daily_job.py` では **「1人に DM 送信が成功するたびに、その場で `reminder_log` シートに記録する」** ように作られています。再実行したときは `reminder_log` に記録済みの人を自動でスキップするため、途中で止まっても安心して再実行できます。

### ③ GitHub Actions の cron と UTC（協定世界時）
- GitHub Actions のスケジュール実行（`cron`）は、世界中どこから使っても **UTC（協定世界時）** で時刻を指定する決まりになっています。
- 日本時間（JST）は UTC より **9時間進んで** います（`JST = UTC + 9時間`）。
- したがって、「日本時間の朝 8:00」を UTC に直すと「`8 - 9 = -1` → **前日の 23:00 UTC**」となり、cron 式は `'0 23 * * *'`（毎日 23時0分 UTC）と書きます。

---

## 3. 重要コードのウォークスルー

### ① 1回リトライ付きの Slack 送信（`core/notifier.py`）

```python
def _execute_with_single_retry(operation: Callable[[], Any]) -> Any:
    """指定された送信関数を実行し、例外が発生した場合は1回だけ再試行する（フェーズ5要件3）。"""
    try:
        return operation()
    except Exception:
        return operation()
```
- **2〜6行目**：Slack API への通信関数 `operation` をまず1回実行し、もし一時的なネットワーク瞬断などで例外（エラー）が起きた場合は `except Exception:` で受け止めて **もう1回だけ** `operation()` を実行します。2回目も失敗した場合は例外がそのまま外へ出て、呼び出し元（`daily_job.py`）に「送信失敗」として伝わります。

---

### ② 個人 DM を開いて送信する処理（`core/notifier.py`）

```python
        def _open_and_post() -> None:
            open_resp = self._client.conversations_open(users=[uid])
            channel_obj = open_resp.get("channel") if isinstance(open_resp, dict) or hasattr(open_resp, "get") else None
            dm_channel_id = (
                channel_obj.get("id")
                if channel_obj and hasattr(channel_obj, "get")
                else uid
            )
            self._client.chat_postMessage(channel=dm_channel_id, text=text)
```
- **2行目（`conversations_open`）**：メンバーの Slack ID（`U0123ABCD` など）を指定して、Bot とそのメンバーの 1対1 DM 部屋を開き（すでにあれば取得し）、DM チャンネル ID（`D...`）を受け取ります（ここに `im:write` 権限が使われます）。
- **9行目（`chat_postMessage`）**：開いた DM チャンネルに対してメッセージを送信します（ここに `chat:write` 権限が使われます）。

---

### ③ 送信成功分だけを直ちに `reminder_log` に記録するループ（`scripts/daily_job.py`）

```python
        try:
            notifier.send_dm(digest.member.slack_user_id, dm_text)
            # 送信に成功した人のみ直ちに reminder_log に記録する（途中失敗時の二重送信防止）
            for log_entry in digest.logs_to_record:
                repo.add_reminder_log(log_entry)
            result.sent_dm_member_ids.append(digest.member.member_id)
        except Exception as exc:
            print(
                f"⚠️ メンバー {digest.member.member_id} への DM 送信に失敗しました: {type(exc).__name__}",
                file=sys.stderr,
            )
            result.failed_dm_member_ids.append(digest.member.member_id)
```
- **2〜5行目**：`notifier.send_dm(...)` が成功した直後に、`for log_entry in digest.logs_to_record:` でスプレッドシートの `reminder_log` に送信済みログを書き込みます。
- **7〜12行目**：もし特定のメンバーへの送信が失敗しても、その場でプログラム全体をクラッシュさせず `failed_dm_member_ids` に記録して次のメンバーへ進み、最後にエラー終了（GitHub から管理者にメール通知）させます。これにより、他のメンバーへの通知を止めずに済み、再実行時には失敗した人だけに送ることができます。

---

## 4. 理解度チェック（3問）

1. **問題1**：Slack アプリに与える Bot Token Scopes（権限）を `chat:write` と `im:write` の2つだけに絞っているのはなぜでしょうか？
   - <details><summary>答えを見る</summary>セキュリティ要件 S14（最小権限の原則）を守るためです。メッセージを投稿する権限と DM を開く権限だけに限定しておくことで、万が一トークンが漏れても Slack 内の過去の会話履歴やプライベートチャンネルの内容を盗み見られるリスクを防げます。</details>

2. **問題2**：GitHub Actions で「日本時間の毎朝 9:00」に実行したい場合、cron 式は何時何分（UTC）と書けばよいでしょうか？
   - <details><summary>答えを見る</summary>日本時間（JST）は UTC より9時間進んでいるため、`9 - 9 = 0`（UTC の 0時0分）となり、`cron: '0 0 * * *'` と書きます（今回のアプリは朝 8:00 JST なので `'0 23 * * *'` です）。</details>

3. **問題3**：`scripts/daily_job.py` で、全員に DM を送り終わってからまとめて `reminder_log` を書くのではなく、1人に送るごとにすぐ `reminder_log` に書き込んでいるのはなぜですか？
   - <details><summary>答えを見る</summary>もし5人中3人目でエラーが起きて処理が止まった場合、最後にまとめて書く方式だと「1〜2人目に送信済み」という記録が残りません。1人成功するごとにすぐ `reminder_log` に記録しておけば、直後に再実行したときに1〜2人目は自動でスキップされ、二重送信を防げるからです。</details>

