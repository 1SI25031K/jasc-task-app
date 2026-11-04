# フェーズ4 学習ガイド：Google ログイン（OIDC）とメンバー名簿によるアクセス制御

このドキュメントでは、フェーズ4で実装した **Google OIDC ログイン（`st.login("google")`）** と、**メンバー名簿（`members`）によるアクセス制御（F1 / S1）** の仕組みを解説します。

---

## 1. このフェーズで作ったもの（全体像）

フェーズ3までは開発確認のために「仮にメンバーAとしてログインしている状態」で動かしていましたが、フェーズ4では本物の **Google アカウントによるログイン** を導入しました。

1. **[`core/auth.py`](../../core/auth.py)**：
   - Streamlit の OIDC 機能（`st.login("google")`, `st.logout()`, `st.user`）を使って Google ログインを行います。
   - ログインしたメールアドレスを小文字（lowercase）に統一し、`members` シートで `active = TRUE` になっているメンバーと照合します。
   - 未ログイン、または名簿にないアカウントの場合は、`st.stop()` を呼んでその場で処理を止め、タスクなどの業務データを一切読み込ませません（**セキュリティ要件 S1**）。
2. **[`app.py`](../../app.py) / [`core/session.py`](../../core/session.py)**：
   - 仮ログイン（「メンバーA」固定や開発用の操作メンバー切替メニュー）を廃止し、ログインした本人を「マイタスク（F4）」「作成者・更新者（`created_by` / `updated_by`）」「初期表示言語（`members.lang`）」に紐づけました。
3. **[`tests/test_auth.py`](../../tests/test_auth.py)**：
   - メールアドレスの大文字・小文字の違いを吸収できること、未登録アカウントや `active=FALSE` のメンバーが確実に拒否され、`list_tasks()` が一度も呼ばれないことを自動テストで検証しています。

---

## 2. 新しく出てきた概念・ツールの解説

### ① OAuth 2.0 / OIDC（OpenID Connect）とリダイレクト URI
- **日常の例え**：「Google という信頼できる身分証発行所で『この人は本当に `xxx@gmail.com` の持ち主ですよ』という証明書を発行してもらい、アプリ側に渡す仕組み」です。アプリ側でパスワードを預かる必要がないため安全です。
- **リダイレクト URI（Redirect URI）**：Google のログイン画面で認証が終わったあと、Google がユーザーを「アプリのどの URL に戻すか」を指定する住所です。事前に Google Cloud に登録した URI 以外には戻せない仕組みになっており、偽サイトへの誘導を防ぎます。
  - ローカル開発用：`http://localhost:8501/oauth2callback`
  - Community Cloud 本番用：`https://<あなたのサブドメイン>.streamlit.app/oauth2callback`

### ② 「認証（Authentication）」と「認可（Authorization）」の違い
- **認証（Authentication）**：「あなたは誰ですか？」を確かめること（Google ログインで「この人は `taro@gmail.com` だ」と確認する段階）。
- **認可（Authorization）**：「あなたにこの画面を見る権限がありますか？」を確かめること（`taro@gmail.com` が JASC79 の `members` シートに登録されており、かつ `active=TRUE` かどうかを調べる段階）。
- **なぜ両方必要か**：`st.login("google")` だけでは「世界中のどの Google アカウントでもログインできてしまう」ため、必ず直後に `members` シートとの照合（認可）を行う必要があります。

### ③ S1：データ読み込み前の認証ゲート（`st.stop()`）
- Streamlit は上から下へ順番に Python コードを実行します。もし先に `repo.list_tasks()` でタスク一覧を読み込んでからログインチェックをしてしまうと、プログラムのミスで未認証の人にデータが漏れるリスクがあります。
- そのため、`app.py` の一番最初（および `get_current_member()` の中）で `require_authenticated_member()` を呼び出し、権限がない場合は **`st.stop()`** で即座に実行を打ち切る「関所（ゲート）」を作っています。

---

## 3. 重要コードのウォークスルー

### ① メールアドレスの小文字正規化と `active` 照合（`core/auth.py`）

```python
def verify_member_access(
    is_logged_in: bool,
    email: str | None,
    members: Iterable[Member],
) -> AuthResult:
    if not is_logged_in or not email or not email.strip():
        return AuthResult(status="unauthenticated", member=None, email="")

    normalized_email = email.strip().lower()
    for m in members:
        if m.email.strip().lower() == normalized_email:
            if m.active:
                return AuthResult(
                    status="authorized",
                    member=m,
                    email=normalized_email,
                )
            return AuthResult(
                status="unauthorized",
                member=None,
                email=normalized_email,
            )

    return AuthResult(
        status="unauthorized",
        member=None,
        email=normalized_email,
    )
```
- **1〜2行目**：未ログインや空文字列の場合は即座に `unauthenticated`（未認証）を返します。
- **4行目（`email.strip().lower()`）**：Google アカウントや名簿の手入力で `Taro@Example.com` のように大文字が混ざっていても確実に一致させるため、両方を小文字に変換してから比較します。
- **7〜16行目**：メールアドレスが一致しても、`m.active` が `False`（退任・休止メンバーなど）であれば `unauthorized`（権限なし）として拒否します。

---

### ② S1 認証ゲートと `st.stop()` による即時停止（`core/auth.py`）

```python
    # 名簿照合のために members のみを取得する（tasks 等の業務データは一切読み込まない：S1）
    all_members = repo.list_members(active_only=False)
    result = verify_member_access(is_logged_in, raw_email, all_members)

    if result.status != "authorized" or result.member is None:
        st.title(t("auth.unauthorized_title", lang))
        st.error(
            t(
                "auth.unauthorized_message",
                lang,
                email=result.email or "(unknown)",
            )
        )
        if st.button(
            t("auth.logout_btn", lang),
            key="auth_unauthorized_logout_btn",
        ):
            st.logout()
        st.stop()
```
- **2〜3行目**：照合に必要な `members` だけを読み込み、`tasks` や `checkins` は一切読み込みません。
- **5〜18行目**：未登録アカウントだった場合、要件 F1 のメッセージ（「このアカウントにはアクセス権がありません。メンバー名簿に登録されたメールアドレスでログインしてください。」）と「ログアウト」ボタンだけを描画し、**18行目の `st.stop()`** でそれ以降のすべての画面描画・データ取得を止めます。

---

### ③ 未登録アカウントで `list_tasks()` が呼ばれないことを保証するスパイテスト（`tests/test_auth.py`）

```python
    class SpyRepository(InMemoryRepository):
        """list_tasks 等が呼ばれたら記録するスパイリポジトリ。"""

        def __init__(self, *args, **kwargs) -> None:
            super().__init__(*args, **kwargs)
            self.tasks_loaded = False

        def list_tasks(self, include_archived: bool = False):
            self.tasks_loaded = True
            return super().list_tasks(include_archived=include_archived)
```
- テストの中で `InMemoryRepository` を継承した `SpyRepository` を作り、`list_tasks()` が呼ばれたら `self.tasks_loaded = True` になる仕掛け（スパイ）を入れています。
- 未登録メール（`outsider@example.com`）で画面を実行したあと、`assert spy_repo.tasks_loaded is False` を確認することで、「画面に見えないだけでなく、裏側でもタスクデータが1件も読み込まれていないこと（S1）」を証明しています。

---

## 4. 理解度チェック（3問）

1. **問題1**：Google Cloud で OAuth クライアント ID を作るとき、「承認済みのリダイレクト URI」にローカル用と Community Cloud 用の2つを登録します。末尾につけるパス（`/oauth2...`）は何でしょうか？
   - <details><summary>答えを見る</summary>`/oauth2callback` です（例：`http://localhost:8501/oauth2callback`）。Streamlit の `st.login()` はこのパスで Google からの認証結果を受け取ります。</details>

2. **問題2**：`st.login("google")` で Google ログインに成功したにもかかわらず、アプリ側でさらに `members` シートとメールアドレスを照合しているのはなぜですか？
   - <details><summary>答えを見る</summary>`st.login("google")` は「その Google アカウントの持ち主であること（認証）」しか確認しないため、そのままでは世界中のどの Google アカウントでもアプリに入れてしまいます。JASC79 の実行委員メンバー（`members` シートで `active=TRUE` の人）だけにアクセスを限定する「認可」が必要だからです。</details>

3. **問題3**：もしメンバーが途中で退任したとき、過去の作成履歴（`created_by` など）を残したままアプリへのログインだけを止めたい場合は、スプレッドシートの `members` シートをどう変更すればよいでしょうか？
   - <details><summary>答えを見る</summary>そのメンバーの行を削除するのではなく、`active` 列を `FALSE` に変更します。これで過去のタスク履歴の名前表示は保ったまま、ログイン時のアクセス権だけを停止できます。</details>

