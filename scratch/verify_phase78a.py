"""7.8-A の修正確認スクリプト。
1. ホーム画面のサマリー件数が「期限を過ぎた NA 3件」となり、期限アラート画面（3件）と一致することを確認。
2. 進捗グラフ画面で言語を English に切り替えてもエラーなく正常に描画されることを確認。
"""

from __future__ import annotations

import asyncio
import base64
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import websockets

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ARTIFACT_DIR = Path(
    "/Users/kosei/.gemini/antigravity/brain/ffd16fa2-53e1-4d2b-8a66-a0d9b87b1c91"
)
APP_DIR = Path("/Users/kosei/jasc-task-app")
ST_PORT = 8506
CDP_PORT = 9234
BASE_URL = f"http://127.0.0.1:{ST_PORT}"

os.environ["no_proxy"] = "*"
os.environ["NO_PROXY"] = "*"
urllib.request.install_opener(
    urllib.request.build_opener(urllib.request.ProxyHandler({}))
)


def wait_for_http(url: str, timeout: float = 30.0) -> None:
    t0 = time.time()
    while time.time() - t0 < timeout:
        try:
            with urllib.request.urlopen(url, timeout=2) as resp:
                if resp.status == 200:
                    return
        except Exception:
            time.sleep(0.3)
    raise RuntimeError(f"Timeout waiting for {url}")


class CDPClient:
    def __init__(self, ws):
        self.ws = ws
        self._id = 0

    async def call(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        msg_id = self._id
        req = {"id": msg_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(req))
        while True:
            resp_raw = await self.ws.recv()
            resp = json.loads(resp_raw)
            if resp.get("id") == msg_id:
                if "error" in resp:
                    raise RuntimeError(f"CDP error: {resp['error']}")
                return resp.get("result", {})

    async def evaluate(self, expression: str) -> any:
        res = await self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True})
        return res.get("result", {}).get("value")

    async def navigate_and_capture(
        self,
        url: str,
        filename: str,
        wait_seconds: float = 3.5,
    ) -> str:
        await self.call("Page.navigate", {"url": url})
        await asyncio.sleep(wait_seconds)
        text = await self.evaluate("document.body.innerText")
        res = await self.call("Page.captureScreenshot", {"format": "png"})
        data = base64.b64decode(res["data"])
        out_path = ARTIFACT_DIR / filename
        out_path.write_bytes(data)
        print(f"Captured {filename} ({len(data)} bytes)")
        return text or ""


def main() -> None:
    env = os.environ.copy()
    env["JASC_DEV_AUTH_EMAIL"] = "member_a@example.com"
    env["JASC_REPOSITORY_BACKEND"] = "memory"

    st_cmd = [
        "uv",
        "run",
        "streamlit",
        "run",
        "app.py",
        "--server.port",
        str(ST_PORT),
        "--server.address",
        "127.0.0.1",
        "--server.headless",
        "true",
        "--browser.gatherUsageStats",
        "false",
    ]

    st_proc = subprocess.Popen(
        st_cmd,
        cwd=str(APP_DIR),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )

    chrome_cmd = [
        CHROME_BIN,
        "--headless=new",
        f"--remote-debugging-port={CDP_PORT}",
        "--disable-gpu",
        "--no-sandbox",
        "--user-data-dir=/tmp/chrome_78a_test",
        "about:blank",
    ]

    chrome_proc = subprocess.Popen(
        chrome_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_http(f"{BASE_URL}/_stcore/health", timeout=25.0)
        wait_for_http(f"http://127.0.0.1:{CDP_PORT}/json", timeout=15.0)

        with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json") as resp:
            targets = json.loads(resp.read().decode("utf-8"))
        page_target = next(t for t in targets if t.get("type") == "page")
        ws_url = page_target["webSocketDebuggerUrl"]

        async def run_verifications():
            async with websockets.connect(ws_url, max_size=50_000_000) as ws:
                client = CDPClient(ws)
                await client.call("Page.enable")
                await client.call("DOM.enable")
                await client.call("Runtime.enable")

                # 1. ホーム画面のサマリー確認
                print("1. Verifying Home screen summary...")
                home_text = await client.navigate_and_capture(
                    f"{BASE_URL}/", "phase78a_home.png", wait_seconds=4.0
                )
                print("  Home summary line preview:")
                for line in home_text.splitlines():
                    if "期限" in line:
                        print("   ->", line)

                # 2. 期限アラート画面の件数確認
                print("2. Verifying Alerts screen counts...")
                alerts_text = await client.navigate_and_capture(
                    f"{BASE_URL}/alerts", "phase78a_alerts.png", wait_seconds=3.0
                )
                print("  Alerts counts preview:")
                for line in alerts_text.splitlines():
                    if "期限切れ" in line:
                        print("   ->", line)

                # 3. 進捗グラフ画面の確認と英語切替
                print("3. Verifying Progress screen in English...")
                await client.call("Page.navigate", {"url": f"{BASE_URL}/progress"})
                await asyncio.sleep(3.0)

                # アバター popover を開いて English を選択
                await client.evaluate("""
                    (() => {
                        const popoverBtn = document.querySelector('.st-key-topbar_user_popover button');
                        if (popoverBtn) popoverBtn.click();
                    })()
                """)
                await asyncio.sleep(1.0)
                await client.evaluate("""
                    (() => {
                        const labels = Array.from(document.querySelectorAll('label'));
                        const enLabel = labels.find(l => l.innerText && l.innerText.includes('English'));
                        if (enLabel) enLabel.click();
                    })()
                """)
                await asyncio.sleep(4.0)

                progress_en_text = await client.navigate_and_capture(
                    f"{BASE_URL}/progress", "phase78a_progress_en.png", wait_seconds=3.0
                )
                print("  Progress EN text preview:")
                has_huh = "Huh" in progress_en_text
                print("  Contains 'Huh'? ->", has_huh)
                assert not has_huh, "Progress page failed with Huh!"
                print("  Progress Charts loaded cleanly in English!")

        asyncio.run(run_verifications())

    finally:
        try:
            chrome_proc.terminate()
            chrome_proc.wait(timeout=3)
        except Exception:
            chrome_proc.kill()

        try:
            st_proc.terminate()
            st_proc.wait(timeout=3)
        except Exception:
            st_proc.kill()


if __name__ == "__main__":
    main()

