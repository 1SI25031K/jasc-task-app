"""フェーズ7.6-B：ホーム（あいさつ画面）のスクリーンショット撮影スクリプト。
PC（1280x800）とスマホ（375x812）で、日本語・英語・ダークモードを撮影する。
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
ST_PORT = 8502
CDP_PORT = 9230
BASE_URL = f"http://127.0.0.1:{ST_PORT}"

os.environ["no_proxy"] = "*"
os.environ["NO_PROXY"] = "*"
urllib.request.install_opener(
    urllib.request.build_opener(urllib.request.ProxyHandler({}))
)


def wait_for_http(url: str, timeout: float = 25.0) -> None:
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

    async def navigate_and_capture(
        self,
        url: str,
        filename: str,
        width: int,
        height: int,
        mobile: bool = False,
        color_scheme: str = "light",
        wait_seconds: float = 3.5,
    ) -> None:
        await self.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "deviceScaleFactor": 2,
                "mobile": mobile,
            },
        )
        await self.call(
            "Emulation.setEmulatedMedia",
            {"features": [{"name": "prefers-color-scheme", "value": color_scheme}]},
        )
        print(f"Navigating to {url} [{width}x{height}, {color_scheme}] -> {filename}")
        await self.call("Page.navigate", {"url": url})
        await asyncio.sleep(wait_seconds)

        res = await self.call("Page.captureScreenshot", {"format": "png"})
        data = base64.b64decode(res["data"])
        out_path = ARTIFACT_DIR / filename
        out_path.write_bytes(data)
        print(f"  Saved ({len(data)} bytes) to {out_path}")


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
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    chrome_proc = subprocess.Popen(
        [
            CHROME_BIN,
            "--headless",
            "--disable-gpu",
            "--no-first-run",
            "--no-default-browser-check",
            "--user-data-dir=/tmp/chrome_cdp_jasc_home",
            f"--remote-debugging-port={CDP_PORT}",
            "about:blank",
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        wait_for_http(BASE_URL)
        wait_for_http(f"http://127.0.0.1:{CDP_PORT}/json")

        with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json") as resp:
            targets_info = json.loads(resp.read().decode())
        page_target = next(t for t in targets_info if t.get("type") == "page")
        ws_url = page_target["webSocketDebuggerUrl"]

        async def capture_all() -> None:
            async with websockets.connect(ws_url, max_size=50_000_000) as ws:
                cdp = CDPClient(ws)
                await cdp.call("Page.enable")

                # 1. PC 日本語 ホーム（1280x800）
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/?lang=ja", "m3_home_pc_ja.png", 1280, 800, False, color_scheme="light"
                )

                # 1-2. PC 日本語 役職ボード（1280x800）
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/board?lang=ja", "m3_board_pc_ja.png", 1280, 800, False, color_scheme="light"
                )

                # 2. スマホ 日本語 ホーム（375x812）
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/?lang=ja", "m3_home_mobile_ja.png", 375, 812, True, color_scheme="light"
                )

                # 2-2. スマホ 日本語 役職ボード（375x812）
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/board?lang=ja", "m3_board_mobile_ja.png", 375, 812, True, color_scheme="light"
                )

                # 3. PC 英語（1280x800）
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/?lang=en", "m3_home_pc_en.png", 1280, 800, False, color_scheme="light"
                )

                # 4. PC ダークモード（1280x800）
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/?lang=ja", "m3_home_pc_ja_dark.png", 1280, 800, False, color_scheme="dark"
                )

        asyncio.run(capture_all())
    finally:
        chrome_proc.terminate()
        st_proc.terminate()
        for p in (chrome_proc, st_proc):
            try:
                p.wait(timeout=5)
            except Exception:
                p.kill()
        time.sleep(1.0)
    print("Screenshots captured successfully!")


if __name__ == "__main__":
    main()

