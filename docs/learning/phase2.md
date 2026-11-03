# フェーズ2：Streamlit による画面（UI）と多言語化の実装（学習ガイド）

このドキュメントは、フェーズ2（2-A・2-B）で作成した全10画面と多言語化（i18n）の仕組みを、プログラミング学習向けに解説したものです。

---

## 1. このフェーズで使った技術・概念の説明（なぜそれを使うのか）

### ① 国際化・多言語化（`i18n` と `locales/ja.toml`・`en.toml`）
- **何か**：
  画面に表示する文字（「役職ボード」「保存する」など）を Python のコードに直接書くのではなく、翻訳専用のファイル（`locales/ja.toml` と `locales/en.toml`）にまとめ、`t("board.title", lang)` という関数で呼び出す仕組みです。
- **なぜ使うのか**：
  日米学生会議（JASC）では、米国側実行委員が参加するときに英語 UI（`en`）に切り替えて使います。もし画面のあちこちに日本語を直接書いてしまうと、後から英語対応しようとしたときに何百か所も書き換えることになり、翻訳漏れが必ず起きます。最初から翻訳ファイルに分けておくことで、ラジオボタン1つで全画面を一瞬で日本語／英語に切り替えられます（要件 F11）。

### ② 画面（`pages/`）とロジック（`core/`）の分離
- **何か**：
  `pages/` フォルダのファイルには「どう表示するか（ボタンや表の配置）」だけを描き、「どう計算・判定するか（期限切れ判定・負荷の計算・状態遷移）」はすべて `core/` フォルダの関数を呼び出す設計です（`agent_rules.md` のコーディング規約）。
- **なぜ使うのか**：
  画面のコードの中に複雑な計算式を混ぜてしまうと、画面のレイアウトを少し変えただけで計算が壊れたり、自動テスト（`pytest`）が書きにくくなったりします。ロジックを `core/services.py` や `core/load.py` に分離したことで、画面からも定時処理スクリプトからも同じ計算関数を安全に使い回せます。

### ③ セッション状態（`st.session_state`）
- **何か**：
  Streamlit では、ボタンを押したりプルダウンを変えたりするたびに、Python ファイルが上から下まで再実行されます。そのとき、変数が消えずにページをまたいで記憶しておくための「共有メモ帳」が `st.session_state` です。
- **なぜ使うのか**：
  現在ログインしているメンバー（`current_member_id`）や、選択中の表示言語（`lang`）、インメモリで保持しているタスクデータ（`repo`）を `st.session_state` に入れておくことで、「タスク作成画面で追加したタスクが、役職ボードやマイタスク画面にもすぐ反映される」ようになります。

### ④ 心理的安全性を守る UI/UX デザイン（要件 6.3・F15）
- **何か**：
  - 負荷の画面で「遅れ」「未提出」といった責める言葉を使わず、「期限を過ぎた NA」「お返事待ちの依頼」と表現する。
  - 余力マップの上部に「この数字は評価には使いません。分担を話し合うための材料です」と常に表示する。
  - タスクを他の人に振るときは、いきなり確定させず「依頼中（承諾待ち）」にし、担当者の選択肢に現在の自動負荷と体感負荷を表示する。
- **なぜ使うのか**：
  タスク管理ツールが「監視や評価の道具」に見えてしまうと、メンバーが正直に体感負荷を書きづらくなり、結果として見えない不満やパンクにつながります。仕組み（UI）の側で「相談しやすさ」を作ることがこのアプリの最大の目的です。

---

## 2. 重要なコード3か所の読み方の解説

### ① `core/i18n.py`：翻訳ファイルを読み込んで文字を取り出す `t()` 関数

```python
def t(key: str, lang: LangCode = "ja", **kwargs: Any) -> str:
    """ドット区切りのキー（例：'board.title'）から翻訳文字列を取得し、変数を埋め込んで返す。"""
    data = load_locale(lang)
    current: Any = data
    for part in key.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return key
    if not isinstance(current, str):
        return key
    if kwargs:
        return current.format(**kwargs)
    return current
```

- `key.split(".")`：たとえば `"board.banner_requests"` というキーを `["board", "banner_requests"]` に分割し、TOML ファイルの `[board]` セクションにある `banner_requests` の文字列を取り出します。
- `current.format(**kwargs)`：翻訳文の中に `"🔔 あなたへの依頼が {count}件 あります"` のように `{count}` という穴が空いているとき、`t("board.banner_requests", lang, count=3)` と呼ぶだけで `{count}` に `3` を埋め込んでくれます。

---

### ② `core/services.py`：担当者選択肢に「自動負荷・体感負荷」を表示する関数

```python
def build_member_load_label(
    member: Member,
    tasks: Iterable[Task],
    checkins: Iterable[Checkin],
    today: date,
    lang: LangCode = "ja",
    settings: AppSettings | None = None,
) -> str:
    auto_pt = calc_member_auto_load(member.member_id, tasks, today, settings)
    latest_c, is_fresh = get_latest_checkin(member.member_id, checkins, today)
    subj_str = (
        str(latest_c.score)
        if (latest_c is not None and is_fresh)
        else t("common.unanswered", lang)
    )
    return t(
        "common.owner_option_format",
        lang,
        name=member.get_name(lang),
        auto_pt=auto_pt,
        subj=subj_str,
    )
```

- タスク作成（F7）・編集（F8）・議事メモからのNA生成（F14）のすべての担当者プルダウンで、この関数を使っています。
- メンバーの名前だけでなく、`メンバーC（自動 10pt／体感 7）` や `Member C (Auto 10pt / Subj 7)` のように**今どれくらい忙しいか**が選ぶ瞬間に見えるため、特定の人に仕事が偏るのを自然に防げます。

---

### ③ `pages/checkin.py`：1クリックで回答が完了する体感負荷ボタン（F16）

```python
    c_low = st.columns(4)
    for idx, val in enumerate([1, 2, 3, 4]):
        with c_low[idx]:
            if st.button(
                f"🟢 {val}",
                key=f"checkin_btn_{val}",
                use_container_width=True,
            ):
                _submit_score(val)
```

- 「数字を選んでから保存ボタンを押す（2ステップ）」ではなく、1〜10 のボタンそのものを押した瞬間に `_submit_score(val)` が呼ばれて保存される「**1クリック設計**」にしています（要件 6.3「主要操作は2クリック以内」）。
- 色だけに頼らず、`🟢 1`、`🟡 5`、`🔴 8` のように記号と数値を併記して誰にでも見やすくしています。

---

## 3. 理解度チェック（3問）

<details>
<summary>Q1. 新しい画面のメッセージを追加したいとき、Python ファイル（<code>pages/*.py</code>）に直接日本語を書くのではなく、<code>locales/ja.toml</code> と <code>locales/en.toml</code> の両方に追加するのはなぜでしょうか？（答えを見る）</summary>

**答え**：英語 UI に切り替えたときに日本語の文字が残ってしまうのを防ぎ、日英すべての文言を一箇所で管理できるようにするためです。なお、`tests/test_phase2a.py` の `test_i18n_keys_match_between_ja_and_en` というテストで、`ja.toml` と `en.toml` のキーに抜け漏れがないかを自動でチェックしています。
</details>

---

<details>
<summary>Q2. タスク作成画面で、担当者プルダウンから「自分以外のメンバー」を選ぶと、保存する前に青い案内ボックスで「依頼中として登録されます」と表示されるのはなぜでしょうか？（答えを見る）</summary>

**答え**：要件定義書 1. および 5.3 にある「勝手に仕事を振られたと感じて不満が生まれるのを防ぐ」ためです。自分以外を担当者にすると、相手が受信箱（F17）で「承諾」または「相談したい」を選ぶステップに入ることを、作成する側にもあらかじめ分かりやすく伝えています。
</details>

---

<details>
<summary>Q3. 画面にユーザーが入力したタスク名やメモを表示するとき、<code>st.markdown(..., unsafe_allow_html=True)</code> を使ってはいけない（要件 S6）のはなぜでしょうか？（答えを見る）</summary>

**答え**：もし悪意のある文字（例：<code>&lt;script&gt;...&lt;/script&gt;</code> のようなプログラムコード）がタスク名やメモに入力されていた場合、`unsafe_allow_html=True` を使うと他のメンバーのブラウザ上でその不正なプログラムが実行されてしまう危険（クロスサイトスクリプティング：XSS 攻撃）があるためです。Streamlit の標準表示（`unsafe_allow_html=False`）を守ることで、安全に表示できます。
</details>

