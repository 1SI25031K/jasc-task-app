# フェーズ3：Google スプレッドシート接続（学習ガイド）

このドキュメントは、フェーズ3で作成した「Google スプレッドシートへの接続（`SheetsRepository`）」とセキュリティ・高速化の仕組みを、プログラミング学習向けに解説したものです。

---

## 1. このフェーズで使った技術・概念の説明（なぜそれを使うのか）

### ① サービスアカウント（Service Account）
- **何か**：人間（あなた個人）の Google アカウントではなく、**「プログラム（このアプリ）専用のロボット用 Google アカウント」**です。
- **なぜ使うのか**：
  もしあなた個人の Google アカウントのパスワードでスプレッドシートに接続するように作ってしまうと、あなたの Google ドライブ内の他のファイルまでアプリから読めてしまったり、来年度の実行委員に引き継ぐときにアカウントごと渡せなかったりします。
  サービスアカウントを作り、**「このタスク管理スプレッドシート1つだけ」をサービスアカウントと共有**することで、万が一のときも他のファイルが守られ、引き継ぎも簡単になります（要件 S4）。

### ② 数式インジェクション対策（`value_input_option="RAW"`：要件 S5）
- **何か**：スプレッドシートに文字を書き込むとき、「`=` から始まっていても計算式（数式）として解釈せず、**ただの文字（RAW＝生データ）として保存してね**」と指定するオプションです。
- **なぜ使うのか**：
  もし通常のモード（`USER_ENTERED`）で書き込むと、誰かがタスク名やメモに `=HYPERLINK("https://危険なサイト", "ここをクリック")` や `=IMPORTDATA(...)` のような数式を入力したときに、スプレッドシート上で数式が勝手に発動してしまいます（これを**数式インジェクション攻撃**と呼びます）。`value_input_option="RAW"` を徹底することで、どんな文字が入力されてもただの文字列として安全に保存されます。

### ③ キャッシュ（`@st.cache_data(ttl=60)`）とキャッシュ破棄（要件 6.2）
- **何か**：
  - **キャッシュ**：一度インターネット経由で Google スプレッドシートから読み込んだデータを、60秒間（`ttl=60`：Time To Live 60秒）だけアプリのメモリに覚えておく仕組みです。
  - **キャッシュ破棄（`.clear()`）**：タスクの追加や更新など「書き込み」をした瞬間に、覚えている古いキャッシュを消去することです。
- **なぜ使うのか**：
  画面をクリックするたびに毎回 Google のサーバーへ通信していると、表示に毎回1〜2秒かかって操作が重くなり、さらに Google Sheets API の「1分あたりの通信回数制限（クォータ）」に達してエラーになることがあります。
  「普段の読み込みは60秒キャッシュで一瞬で表示し、**データを書き換えた直後だけキャッシュを破棄して最新データを読み直す**」ことで、速さと正確さを両立できます。

### ④ `Repository` パターンによる `InMemory` と `Sheets` の切り替え
- **何か**：`secrets.toml` の `repository_backend = "memory"` を `"sheets"` に書き換えるだけで、画面（`pages/`）や計算ロジック（`core/`）を**1行も変えずに**保存先をスプレッドシートに切り替えられる仕組みです。
- **なぜ使うのか**：
  フェーズ1から `Repository` という共通の窓口（抽象クラス）を守って作ってきたおかげで、画面側は相手が `InMemoryRepository` なのか `SheetsRepository` なのかを意識せずに動きます。これを専門用語で「**依存性の逆転（Dependency Inversion）**」や「**ポリモーフィズム（多態性）**」と呼びます。

---

## 2. 重要なコード3か所の読み方の解説

### ① `core/sheets_repository.py`：RAW 書き込みとキャッシュ破棄

```python
    def _append_row_raw(self, sheet_name: str, row_values: list[str]) -> None:
        """指定シートの末尾に value_input_option='RAW' で1行追加し、キャッシュを破棄する（S5・6.2）。"""
        ws = self._spreadsheet.worksheet(sheet_name)
        ws.append_row(row_values, value_input_option="RAW")
        clear_sheets_cache()
```

- `ws.append_row(row_values, value_input_option="RAW")`：シートの一番下の行にデータを追加します。ここで必ず `value_input_option="RAW"` を指定しています。
- `clear_sheets_cache()`：書き込んだ直後にキャッシュを消去し、次の画面描画で必ず新しい行が読み込まれるようにしています。

---

### ② `core/sheets_repository.py`：60秒キャッシュ付きの読み込み関数

```python
@st.cache_data(ttl=60, show_spinner=False)
def _fetch_sheet_rows_cached(
    spreadsheet_id: str, sheet_name: str
) -> list[dict[str, str]]:
    ws = _ACTIVE_SPREADSHEET.worksheet(sheet_name)
    all_values: list[list[str]] = ws.get_all_values()
    if len(all_values) <= 1:
        return []
    headers = [h.strip() for h in all_values[0]]
    result: list[dict[str, str]] = []
    for row in all_values[1:]:
        if not any(str(cell).strip() for cell in row):
            continue
        result.append(_row_to_dict(headers, row))
    return result
```

- `@st.cache_data(ttl=60)`：この1行（デコレータ）を関数の上に付けるだけで、同じ `spreadsheet_id` と `sheet_name` で呼ばれたときに60秒間は通信をスキップして前回の結果を返してくれます。
- `all_values[0]` が1行目の列名（ヘッダー）、`all_values[1:]` が2行目以降のデータ本体です。`_row_to_dict` で `{"task_id": "t001", "title": "..."}` のような辞書に変換しています。

---

### ③ `core/sheets_repository.py`：スプレッドシート上での楽観的ロック（S7）

```python
        for idx, row in enumerate(all_values[1:], start=2):
            d = _row_to_dict(headers, row)
            if d.get("task_id", "").strip() == task.task_id:
                current_in_sheet = row_to_task(d)
                if _format_datetime(current_in_sheet.updated_at) != _format_datetime(
                    expected_updated_at
                ):
                    raise OptimisticLockError(...)
                self._update_row_raw("tasks", idx, task_to_row(task))
                return task
```

- `enumerate(all_values[1:], start=2)`：スプレッドシートの1行目はヘッダーなので、データは **2行目（`start=2`）** から始まります。`idx` にはスプレッドシート上の実際の行番号（2, 3, 4...）が入ります。
- 書き込む直前にシート上の最新の `updated_at` を確認し、編集開始時の日時（`expected_updated_at`）とズレていたら `OptimisticLockError` を出して上書きを防止します。

---

## 3. 理解度チェック（3問）

<details>
<summary>Q1. サービスアカウントの JSON 鍵を作っただけでは、そのサービスアカウントはあなたのスプレッドシートを読み書きできません。もう1つ、スプレッドシート側でどんな操作が必要でしょうか？（答えを見る）</summary>

**答え**：スプレッドシートの右上の「**共有（Share）**」ボタンから、サービスアカウントのメールアドレス（`xxx@xxx.iam.gserviceaccount.com`）を「**編集者**」として追加する操作が必要です。これにより、そのスプレッドシート1つだけにアクセス権が与えられます。
</details>

---

<details>
<summary>Q2. もし <code>st.cache_data(ttl=60)</code> だけを設定し、タスクを保存したあとに <code>clear_sheets_cache()</code>（キャッシュ破棄）を呼ばなかった場合、画面はどうなってしまうでしょうか？（答えを見る）</summary>

**答え**：スプレッドシート本体には新しいタスクが書き込まれているのに、アプリは最大60秒間「古いキャッシュ」を表示し続けてしまうため、「保存ボタンを押したのに画面に反映されない！」という状態になってしまいます。そのため、書き込み直後のキャッシュ破棄が必須になります。
</details>

---

<details>
<summary>Q3. <code>tests/test_sheets_repository.py</code> では、本物の Google スプレッドシートに通信する代わりに <code>FakeSpreadsheet</code> / <code>FakeWorksheet</code> というクラスを使っています。なぜでしょうか？（答えを見る）</summary>

**答え**：`agent_rules.md` のルール（「テストではダミー実装を使い、実際に通信しない」）に従い、インターネット環境や秘密の鍵がなくても0.1秒でテストが動き、かつ「すべての書き込みで `value_input_option="RAW"` が本当に指定されているか」をプログラムで100%確実に検査できるようにするためです。
</details>

