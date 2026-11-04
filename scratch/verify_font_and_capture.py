"""フォント修正後のローカル起動・セッション接続確認およびスクリーンショット撮影スクリプト。"""

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
ST_PORT = 8504
CDP_PORT = 9232
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
        width: int = 1280,
        height: int = 800,
        wait_seconds: float = 4.0,
    ) -> None:
        await self.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "deviceScaleFactor": 2,
                "mobile": False,
            },
        )
        print(f"Navigating to {url} [{width}x{height}] -> {filename}")
        await self.call("Page.navigate", {"url": url})
        await asyncio.sleep(wait_seconds)

        # フォント情報のチェック
        font_info = await self.evaluate("""
            (() => {
                const bodyFont = window.getComputedStyle(document.body).fontFamily;
                const h1 = document.querySelector('h1, [data-testid="stHeading"], .app-title');
                const h1Font = h1 ? window.getComputedStyle(h1).fontFamily : 'not found';
                return { bodyFont, h1Font, title: document.title };
            })()
        """)
        print(f"  Computed font info: {font_info}")

        res = await self.call("Page.captureScreenshot", {"format": "png"})
        data = base64.b64decode(res["data"])
        out_path = ARTIFACT_DIR / filename
        out_path.write_bytes(data)
        print(f"  Saved screenshot ({len(data)} bytes) to {out_path}")


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
        "--user-data-dir=/tmp/chrome_font_test",
        "about:blank",
    ]

    print(f"Starting Chrome on CDP port {CDP_PORT}...")
    chrome_proc = subprocess.Popen(
        chrome_cmd,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        print("Waiting for Streamlit server...")
        wait_for_http(f"{BASE_URL}/_stcore/health", timeout=25.0)
        print("Streamlit server is healthy!")

        print("Waiting for Chrome CDP...")
        wait_for_http(f"http://127.0.0.1:{CDP_PORT}/json", timeout=15.0)
        print("Chrome CDP is ready!")

        with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json") as resp:
            targets = json.loads(resp.read().decode("utf-8"))
        page_target = next(t for t in targets if t.get("type") == "page")
        ws_url = page_target["webSocketDebuggerUrl"]

        async def run_captures():
            async with websockets.connect(ws_url) as ws:
                client = CDPClient(ws)
                await client.call("Page.enable")
                await client.call("DOM.enable")
                await client.call("Runtime.enable")

                # ホーム画面（日本語）
                await client.navigate_and_capture(
                    f"{BASE_URL}/",
                    "font_check_home_ja.png",
                    width=1280,
                    height=800,
                    wait_seconds=4.0,
                )

                # 言語切替（英語）
                await client.evaluate("""
                    (() => {
                        const btns = Array.from(document.querySelectorAll('button'));
                        const enBtn = btns.find(b => b.textContent && b.textContent.includes('EN'));
                        if (enBtn) enBtn.click();
                    })()
                """)
                await asyncio.sleep(2.0)

                await client.navigate_and_capture(
                    f"{BASE_URL}/",
                    "font_check_home_en.png",
                    width=1280,
                    height=800,
                    wait_seconds=2.0,
                )

        asyncio.run(run_captures())
        print("🎉 フォント検証とスクリーンショット撮影が完了しました！")

    except Exception as e:
        print(f"Exception during run: {e}")
        if st_proc.poll() is not None:
            out, err = st_proc.communicate()
            print(f"Streamlit process exited prematurely with code {st_proc.returncode}!")
            print(f"stdout: {out}")
            print(f"stderr: {err}")
        raise
    finally:
        print("Cleaning up processes...")
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

