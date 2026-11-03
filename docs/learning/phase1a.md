# フェーズ1-A：コアロジックとインメモリデータの設計（学習ガイド）

このドキュメントは、フェーズ1-Aで作成した「アプリの頭脳（コアロジック）」の仕組みを、プログラミング学習向けに解説したものです。

---

## 1. このフェーズで使った技術・概念の説明（なぜそれを使うのか）

### ① データクラス（`@dataclass`）
- **何か**：データをひとまとめにして名前を付けるための Python の機能です（`core/models.py` で使用）。
- **なぜ使うのか**：
  もしタスクをただの辞書（`{"title": "予算策定", "status": "進行中"}`）で扱うと、`task["titel"]` のようにスペルミスをしても気づきにくく、どんな項目が入っているかも分かりづらくなります。
  `@dataclass` を使って `Task` クラスを定義しておくと、`task.title` のように入力補完が効き、日付（`date`）や文字列（`str`）といった**型ヒント**によってミスを事前に防げます。

### ② 抽象クラス（`Repository`）とインメモリ実装（`InMemoryRepository`）
- **何か**：
  - `Repository`：「データを取得する・保存する」という**窓口（メニュー表）だけ**を決めたクラスです。
  - `InMemoryRepository`：Google スプレッドシートの代わりに、パソコンのメモリ（変数）の中にデータを保存するクラスです。
- **なぜ使うのか**：
  最初から Google スプレッドシートにつなぐコードを書いてしまうと、インターネット環境がないとテストができなかったり、テストのたびに通信が発生して何十秒もかかったりします。
  窓口（`Repository`）を共通にしておくことで、普段の開発や自動テストは**0.5秒で終わる `InMemoryRepository`** を使い、本番で動かすときだけ Google スプレッドシート版（後のフェーズで作る `SheetsRepository`）に差し替えることができます。

### ③ 楽観的ロック（Optimistic Locking：要件 S7）
- **何か**：2人が同時に同じタスクを編集したときに、後から保存した人が前の人の変更を「うっかり上書きして消してしまう」のを防ぐ仕組みです。
- **なぜ使うのか**：
  タスクを開くときに「最終更新日時（`updated_at`）」を覚えておき、保存するときに「データベース上の `updated_at` が、自分が開いたときと同じままか？」をチェックします。もし他の人が先に保存して日時が変わっていたら、専用の例外 `OptimisticLockError` を出して保存をストップし、安全を守ります。

### ④ 境界値テスト（Boundary Value Testing）
- **何か**：「7日以内」「14日以内」「差が4以上」といった条件の**ギリギリの境目**を狙ってテストすることです。
- **なぜ使うのか**：
  プログラムのバグ（不具合）で最も多いのが、`<=`（以下）と `<`（未満）の間違いです。そのため、「昨日・今日・7日後・8日後」「差が3のとき・差が4のとき」のように境目の両側を `pytest` でテストすることで、計算ミスを確実に防げます。

---

## 2. 重要なコード3か所の読み方の解説

### ① `core/services.py`：今週期限の判定（日付の計算）

```python
def is_due_this_week(task: Task, today: date) -> bool:
    """今週期限の NA かどうかを判定する（5.5：status ≠ 完了、未アーカイブ、今日 <= na_due <= 今日+7日）。"""
    if task.archived or task.status == "完了":
        return False
    return today <= task.na_due <= today + timedelta(days=7)
```

- `if task.archived or task.status == "完了": return False`
  アーカイブ（削除扱い）されたタスクや、すでに完了したタスクは期限アラートに出さないため、最初に `False`（対象外）として弾いています。これを「早期リターン（ガード節）」と呼び、コードが読みやすくなります。
- `today + timedelta(days=7)`
  `timedelta(days=7)` は「7日間」という時間の長さを表します。`today`（今日の日付）に足すことで、月末や年末をまたいでも正確に「7日後の日付」を計算してくれます。
- `today <= task.na_due <= ...`
  Python では数学の不等式と同じように `A <= B <= C` と繋げて書くことができます。

---

### ② `core/assignments.py`：依頼の承諾とルール違反の防止

```python
def accept_assignment(
    task: Task, actor_member_id: str, now: datetime
) -> tuple[Task, ActivityLog]:
    if actor_member_id != task.owner_member_id:
        raise InvalidAssignmentTransitionError(
            "担当者本人以外は依頼を承諾できません。"
        )
    if task.assignment_status != "依頼中":
        raise InvalidAssignmentTransitionError(
            f"現在の状態が「{task.assignment_status}」のため承諾できません（「依頼中」のみ承諾可能）。"
        )

    updated_task = replace(
        task,
        assignment_status="承諾済",
        assignment_comment="",
        updated_at=now,
        updated_by=actor_member_id,
    )
```

- `raise InvalidAssignmentTransitionError(...)`
  ルール上ありえない操作（例：担当者ではない人が勝手に承諾ボタンを押す、すでに承諾済のものをもう一度承諾する）が起きたときに、処理を即座に中断してエラーを知らせます。
- `replace(task, ...)`
  元の `task` データを直接書き換えるのではなく、指定した項目（`assignment_status` など）だけを新しくしたコピーを作っています。こうすることで、万が一途中でエラーが起きても元のデータが壊れません。

---

### ③ `core/repository.py`：楽観的ロックのチェック（S7）

```python
    def update_task(
        self, task: Task, expected_updated_at: datetime
    ) -> Task:
        for idx, existing in enumerate(self._tasks):
            if existing.task_id == task.task_id:
                if existing.updated_at != expected_updated_at:
                    raise OptimisticLockError(
                        f"タスク（{task.task_id}）は他のメンバーによって先に更新されました。"
                    )
                copied = deepcopy(task)
                self._tasks[idx] = copied
                return deepcopy(copied)
```

- `expected_updated_at`：「編集画面を開いた時点での最終更新日時」を受け取ります。
- `if existing.updated_at != expected_updated_at:`
  今保存されているタスクの `updated_at` と見比べて、もし違っていたら「自分が編集している間に、他の誰かが保存した！」と判断し、`OptimisticLockError` を発生させて上書きを防ぎます。

---

## 3. 理解度チェック（3問）

<details>
<summary>Q1. 自動負荷（pt）を計算するとき、「依頼中（まだ本人が承諾していない）」のタスクも含めるのはなぜでしょうか？（答えを見る）</summary>

**答え**：要件定義書 5.3 にあるとおり、「これから来るかもしれない仕事」もその人の負荷として周りから見えた方が、「今あの人にさらに仕事を振って大丈夫か？」を正しく判断できるためです（なお、余力マップ画面では「承諾済の分」と「依頼中の分」を色分けして表示できるように内訳も計算しています）。
</details>

---

<details>
<summary>Q2. 期限判定の関数 <code>is_overdue_na(task, today)</code> で、関数の中で直接「今日の日付」を取得せず、外から引数 <code>today</code> として受け取るようにしているのはなぜでしょうか？（答えを見る）</summary>

**答え**：**テストをしやすくするため**です。もし関数の中で常に「今日（実行した瞬間）」の日付を勝手に取ってしまうと、明日や来週になったときにテストの結果が変わってしまいます。外から `today = date(2026, 11, 3)` のように基準日を渡せるようにしておくことで、いつでも確実に境界値テストが動かせるようになります。
</details>

---

<details>
<summary>Q3. AさんとBさんが同時に同じタスク（更新日時 10:00）を開き、Aさんが 10:05 に保存したあと、Bさんが 10:06 に保存ボタンを押すとどうなりますか？（答えを見る）</summary>

**答え**：Aさんが保存した時点でタスクの更新日時が `10:05` に変わっています。そのため、Bさんが「開いたときは `10:00` だったはず（`expected_updated_at=10:00`）」として保存しようとすると、日時が一致しないため **`OptimisticLockError`（楽観的ロックの例外）** が発生し、Aさんの変更が消えてしまうのを防ぎます。
</details>

