"""進捗グラフ画面で English に切り替えた際のエラー再現スクリプト。"""

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
ST_PORT = 8505
CDP_PORT = 9233
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
        self.logs = []

    async def call(self, method: str, params: dict | None = None) -> dict:
        self._id += 1
        msg_id = self._id
        req = {"id": msg_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(req))
        while True:
            resp_raw = await self.ws.recv()
            resp = json.loads(resp_raw)
            if resp.get("method") == "Console.messageAdded":
                self.logs.append(resp["params"]["message"])
            elif resp.get("method") == "Runtime.consoleAPICalled":
                self.logs.append(resp["params"])
            elif resp.get("method") == "Runtime.exceptionThrown":
                self.logs.append(resp["params"])
            if resp.get("id") == msg_id:
                if "error" in resp:
                    raise RuntimeError(f"CDP error: {resp['error']}")
                return resp.get("result", {})

    async def evaluate(self, expression: str) -> any:
        res = await self.call("Runtime.evaluate", {"expression": expression, "returnByValue": True})
        return res.get("result", {}).get("value")


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

    print(f"Starting Streamlit on port {ST_PORT}...")
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
        "--user-data-dir=/tmp/chrome_progress_test",
        "about:blank",
    ]

    print(f"Starting Chrome on CDP port {CDP_PORT}...")
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

        async def run_test():
            async with websockets.connect(ws_url, max_size=50_000_000) as ws:
                client = CDPClient(ws)
                await client.call("Page.enable")
                await client.call("DOM.enable")
                await client.call("Runtime.enable")
                await client.call("Console.enable")

                print(f"Navigating to {BASE_URL}/progress...")
                await client.call("Page.navigate", {"url": f"{BASE_URL}/progress"})
                await asyncio.sleep(4.0)

                # 画面の内容を確認
                page_text = await client.evaluate("document.body.innerText")
                print("Progress page (ja) initial load text preview:")
                print(page_text[:300] if page_text else "None")

                # アバター popover を開いて言語を EN に切り替え
                print("Clicking topbar avatar popover...")
                await client.evaluate("""
                    (() => {
                        const popoverBtn = document.querySelector('.st-key-topbar_user_popover button');
                        if (popoverBtn) popoverBtn.click();
                    })()
                """)
                await asyncio.sleep(1.0)

                print("Selecting English radio...")
                await client.evaluate("""
                    (() => {
                        const labels = Array.from(document.querySelectorAll('label'));
                        const enLabel = labels.find(l => l.innerText && l.innerText.includes('English'));
                        if (enLabel) enLabel.click();
                    })()
                """)
                await asyncio.sleep(4.0)

                page_text_after = await client.evaluate("document.body.innerText")
                print("Progress page after switching to EN text preview:")
                print(page_text_after[:500] if page_text_after else "None")

                res = await client.call("Page.captureScreenshot", {"format": "png"})
                data = base64.b64decode(res["data"])
                out_path = ARTIFACT_DIR / "progress_en_error_repro.png"
                out_path.write_bytes(data)
                print(f"Saved screenshot to {out_path}")

                print("Captured browser logs:")
                for log in client.logs:
                    print(" LOG:", log)

        asyncio.run(run_test())

    finally:
        try:
            chrome_proc.terminate()
            chrome_proc.wait(timeout=3)
        except Exception:
            chrome_proc.kill()

        try:
            st_proc.terminate()
            out, err = st_proc.communicate(timeout=3)
            print("Streamlit stderr:")
            print(err)
        except Exception:
            st_proc.kill()


if __name__ == "__main__":
    main()

