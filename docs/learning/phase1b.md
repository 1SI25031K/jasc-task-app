# フェーズ1-B：リマインド・通知文組み立て・マスキング・AI出力検証（学習ガイド）

このドキュメントは、フェーズ1-Bで作成した「リマインドの抽出」「通知文の組み立て」「個人情報のマスキング」「AI出力の検証」の仕組みを、プログラミング学習向けに解説したものです。

---

## 1. このフェーズで使った技術・概念の説明（なぜそれを使うのか）

### ① 外部サービスの抽象化（`Notifier` / `NaExtractor` とダミー実装）
- **何か**：
  フェーズ1-Aの `Repository` と同じく、「Slack にメッセージを送る（`Notifier`）」「AI で議事メモから NA を取り出す（`NaExtractor`）」という窓口だけを決めておき、テストでは通信しないダミー実装（`DummyNotifier` / `DummyNaExtractor`）を使う設計です。
- **なぜ使うのか**：
  もしテストを実行するたびに本物の Slack に何十通も DM が飛んだり、Gemini API の利用枠を消費したりすると大変です。ダミー実装を使えば、通信ゼロ・0.5秒で「誰にどんな文面が送られるか」「AIが変な値を返したときにどうなるか」を何度でも安全にテストできます。

### ② べき等性（Idempotency：二重送信の防止）
- **何か**：「同じ処理を1回実行しても、2回連続で実行しても、結果が同じになる（おかしな副作用が起きない）」という性質をプログラミング用語で**べき等性（べきとうせい）**と呼びます。
- **なぜ使うのか**：
  毎朝の定時処理がネットワークの一時的な不調などで途中終了し、もう一度実行し直すことがあります。このとき、すでに DM を送った人にまた同じ DM が届いてしまうと迷惑になります。
  そこで `reminder_log` に `(member_id, kind, task_id, date_key)` を記録しておき、同じ組み合わせがすでにあればスキップすることで、1日に何回実行しても**1日1回しか送られない**安全な仕組みにしています。

### ③ 正規表現（Regular Expression）によるマスキング
- **何か**：「`@` の前後に英数字がある文字列（＝メールアドレス）」や「`090-xxxx-xxxx` のような数字の並び（＝電話番号）」といった**文字のパターン**を表現する記法です（Python の `re` モジュール）。
- **なぜ使うのか**：
  議事メモの中にうっかり連絡先が含まれていた場合でも、外部の AI（Gemini）に送る前に自動で `[メール]` `[電話番号]` に伏せ字（マスキング）することで、個人情報の漏洩を防ぎます。

### ④ AI 出力の検証（バリデーション / サニタイズ：要件 S12）
- **何か**：AI（大規模言語モデル）が返してきたデータをそのまま信用せず、プログラムのルールで厳しく検査・補正することです。
- **なぜ使うのか**：
  AI はときどき、存在しないメンバーID（例：`m999`）や存在しない日付（例：`2026-02-30`）を勝手に作ってしまうことがあります（ハルシネーション）。そのため、「マスタに存在するIDか？」「正しい日付か？」「文字数が長すぎないか？」を必ずプログラム側で検証してから画面に出します。

---

## 2. 重要なコード3か所の読み方の解説

### ① `core/reminders.py`：二重送信防止と `reminders_enabled` のフィルタリング

```python
    def add_candidate(item: ReminderItem) -> None:
        """送信条件（active, reminders_enabled, 重複防止）を満たす場合のみ候補に追加する。"""
        m = member_map.get(item.member_id)
        if m is None:
            return
        # reminders_enabled=False の人には high_load_alert 以外の DM を送らない
        if not m.reminders_enabled and item.kind != "high_load_alert":
            return
        # 当日の二重送信防止（4.9）
        key = (item.member_id, item.kind, item.task_id, date_key)
        if key in sent_today:
            return
        sent_today.add(key)
        raw_items_by_member[item.member_id].append(item)
```

- `if not m.reminders_enabled and item.kind != "high_load_alert": return`
  個人 DM リマインドを OFF にしている人でも、「体感負荷が2回連続で限界に近いとき（`high_load_alert`）」だけは安全のために通知を届ける、という要件（5.6）を1行で表しています。
- `key = (item.member_id, item.kind, item.task_id, date_key)`
  「誰に・何の種類で・どのタスクについて・いつの日付で」という4つの組み合わせを1つのタプル（組）にし、`sent_today` という集合（`set`）に入っているかをチェックして二重送信を防いでいます。

---

### ② `core/notifier.py`：完了0件の役職を載せない週次まとめ（F19）

```python
        if completed_last_week:
            lines.append("\n*■ 役職別の完了タスク*")
            for role in active_roles:
                role_done = [
                    t
                    for t in completed_last_week
                    if role.role_id in t.role_ids
                ]
                # 完了0件の役職は載せない（F19）
                if not role_done:
                    continue
                role_name = escape_slack_text(role.get_name("ja"))
                lines.append(f"*{role_name}（{len(role_done)}件）*")
```

- `if not role_done: continue`
  先週完了したタスクが0件だった役職について、「○○役職：0件」と書いてしまうと、時期によって作業がない役職まで責められているような印象になります。`continue` でその役職をスキップし、完了があった役職だけをポジティブに紹介する仕組みです。

---

### ③ `core/na_extractor.py`：存在しない ID を空にする検証処理

```python
        owner_raw = raw.get("owner_member_id", "")
        owner_id = (
            owner_raw.strip()
            if isinstance(owner_raw, str)
            and owner_raw.strip() in valid_member_ids
            else ""
        )
```

- `valid_member_ids` には、現在の名簿にある有効なメンバーID（`{"m001", "m002", ...}`）が入っています。
- AI が返してきた `owner_member_id` がその中に含まれているときだけ採用し、もし存在しない ID だったら空文字 `""` にリセットします。これにより、存在しない担当者でタスクが壊れるのを防ぎ、画面上で人間が選び直せるようにしています。

---

## 3. 理解度チェック（3問）

<details>
<summary>Q1. 毎朝の個人 DM リマインドで、期限切れタスクが3件ある人に DM を3通に分けて送るのではなく、「1人1通」にまとめて送るのはなぜでしょうか？（答えを見る）</summary>

**答え**：項目ごとに別々のメッセージが何通も届くと通知が多すぎて見づらくなり、重要な連絡が埋もれたり通知をミュートされたりしやすくなるためです。1人1日1通のダイジェストにまとめることで、毎朝1つのメッセージを見るだけで今日やることが一目でわかるようになります。
</details>

---

<details>
<summary>Q2. Slack に送る文字列に対して、<code>escape_slack_text</code> 関数で <code>&lt;</code> や <code>&gt;</code>、<code>&amp;</code> を変換しているのはなぜでしょうか？（答えを見る）</summary>

**答え**：Slack のメッセージ形式では、`<https://...>` や `<@U0123>`、`<!channel>` のように `<` と `>` がリンクやメンションの特別な記号として使われるためです。タスク名やコメントに `<` が含まれていたときに、意図しないメンションや表示崩れが起きないようエスケープ（無害化）しています（セキュリティ要件 S6）。
</details>

---

<details>
<summary>Q3. 期限切れから3日以上経ったタスクについて、役職の責任者に知らせるリマインド（<code>overdue_escalation</code>）は、なぜ「最初の1回だけ」送るルールになっているのでしょうか？（答えを見る）</summary>

**答え**：担当者本人には毎朝リマインドが届きますが、責任者（リーダー）にまで毎朝同じタスクの通知が飛び続けると、過度なプレッシャーや通知疲れになってしまうためです。「3日過ぎた時点で責任者にも一度共有し、あとは声かけや日程調整をしてもらう」という、見守りとフォローのための設計になっています。
</details>

