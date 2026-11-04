"""フェーズ7.5：M3 Expressive UI のスクリーンショット自動撮影スクリプト。
PC（1280x800）とスマホ（375x812）で全画面・英語・ダークテーマ・ログイン画面を完全撮影する。
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
ST_PORT = 8501
CDP_PORT = 9229
BASE_URL = f"http://127.0.0.1:{ST_PORT}"

# プロキシをバイパスして localhost に直接接続
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
        req_id = self._id
        payload = {"id": req_id, "method": method, "params": params or {}}
        await self.ws.send(json.dumps(payload))
        while True:
            raw = await self.ws.recv()
            data = json.loads(raw)
            if data.get("id") == req_id:
                if "error" in data:
                    raise RuntimeError(f"CDP Error for {method}: {data['error']}")
                return data.get("result", {})

    async def set_color_scheme(self, scheme: str = "light") -> None:
        await self.call(
            "Emulation.setEmulatedMedia",
            {
                "media": "screen",
                "features": [{"name": "prefers-color-scheme", "value": scheme}],
            },
        )
        await asyncio.sleep(0.5)

    async def set_viewport(self, width: int, height: int, is_mobile: bool) -> None:
        await self.call(
            "Emulation.setDeviceMetricsOverride",
            {
                "width": width,
                "height": height,
                "deviceScaleFactor": 1,
                "mobile": is_mobile,
            },
        )
        await asyncio.sleep(0.5)

    async def navigate_and_capture(
        self,
        url: str,
        filename: str,
        width: int = 1280,
        height: int = 800,
        is_mobile: bool = False,
        color_scheme: str = "light",
        wait_seconds: float = 4.0,
    ) -> None:
        await self.set_color_scheme(color_scheme)
        await self.set_viewport(width, height, is_mobile)
        await self.call("Page.navigate", {"url": url})
        await asyncio.sleep(wait_seconds)
        res = await self.call("Page.captureScreenshot", {"format": "png"})
        img_bytes = base64.b64decode(res["data"])
        out_path = ARTIFACT_DIR / filename
        out_path.write_bytes(img_bytes)
        print(f"Saved {filename} ({len(img_bytes)} bytes)")


def run_login_session() -> None:
    env = os.environ.copy()
    if "JASC_DEV_AUTH_EMAIL" in env:
        del env["JASC_DEV_AUTH_EMAIL"]

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
            "--user-data-dir=/tmp/chrome_cdp_jasc_m3_login",
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

        async def capture_login() -> None:
            async with websockets.connect(ws_url, max_size=50_000_000) as ws:
                cdp = CDPClient(ws)
                await cdp.call("Page.enable")
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/?lang=ja", "m3_login_pc_ja.png", 1280, 800, False
                )
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/?lang=ja", "m3_login_mobile_ja.png", 375, 812, True
                )

        asyncio.run(capture_login())
    finally:
        chrome_proc.terminate()
        st_proc.terminate()
        for p in (chrome_proc, st_proc):
            try:
                p.wait(timeout=5)
            except Exception:
                p.kill()
        time.sleep(1.0)


def run_authenticated_session() -> None:
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
            "--user-data-dir=/tmp/chrome_cdp_jasc_m3_auth",
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

        async def capture_all_auth() -> None:
            async with websockets.connect(ws_url, max_size=50_000_000) as ws:
                cdp = CDPClient(ws)
                await cdp.call("Page.enable")

                # ==========================================
                # 1. 全10画面（PC 日本語 1280x800 ライトモード）
                # ==========================================
                pc_pages = [
                    (f"{BASE_URL}/?lang=ja", "m3_board_pc_ja.png"),
                    (f"{BASE_URL}/role_detail?lang=ja", "m3_role_detail_pc_ja.png"),
                    (f"{BASE_URL}/my_tasks?lang=ja", "m3_my_tasks_pc_ja.png"),
                    (f"{BASE_URL}/alerts?lang=ja", "m3_alerts_pc_ja.png"),
                    (f"{BASE_URL}/all_tasks?lang=ja", "m3_all_tasks_pc_ja.png"),
                    (f"{BASE_URL}/inbox?lang=ja", "m3_inbox_pc_ja.png"),
                    (f"{BASE_URL}/capacity_map?lang=ja", "m3_capacity_map_pc_ja.png"),
                    (f"{BASE_URL}/checkin?lang=ja", "m3_checkin_pc_ja.png"),
                    (f"{BASE_URL}/progress?lang=ja", "m3_progress_pc_ja.png"),
                    (f"{BASE_URL}/minutes?lang=ja", "m3_minutes_pc_ja.png"),
                ]
                for url, filename in pc_pages:
                    await cdp.navigate_and_capture(
                        url, filename, 1280, 800, False, color_scheme="light"
                    )

                # ==========================================
                # 2. スマホ幅（375x812 日本語 ライトモード）
                # ==========================================
                mobile_pages = [
                    (f"{BASE_URL}/?lang=ja", "m3_board_mobile_ja.png"),
                    (f"{BASE_URL}/checkin?lang=ja", "m3_checkin_mobile_ja.png"),
                    (f"{BASE_URL}/capacity_map?lang=ja", "m3_capacity_mobile_ja.png"),
                    (f"{BASE_URL}/my_tasks?lang=ja", "m3_my_tasks_mobile_ja.png"),
                ]
                for url, filename in mobile_pages:
                    await cdp.navigate_and_capture(
                        url, filename, 375, 812, True, color_scheme="light"
                    )

                # ==========================================
                # 3. 英語 UI（PC 1280x800 & スマホ 375x812）
                # ==========================================
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/?lang=en", "m3_board_pc_en.png", 1280, 800, False, color_scheme="light"
                )
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/capacity_map?lang=en", "m3_capacity_pc_en.png", 1280, 800, False, color_scheme="light"
                )
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/capacity_map?lang=en", "m3_capacity_mobile_en.png", 375, 812, True, color_scheme="light"
                )
                await cdp.navigate_and_capture(
                    f"{BASE_URL}/all_tasks?lang=en", "m3_all_tasks_pc_en.png", 1280, 800, False, color_scheme="light"
                )

                # ==========================================
                # 4. ダークモード（PC 1280x800 ダークモード）
                # ==========================================
                dark_pages = [
                    (f"{BASE_URL}/?lang=ja", "m3_board_pc_ja_dark.png"),
                    (f"{BASE_URL}/capacity_map?lang=ja", "m3_capacity_pc_ja_dark.png"),
                    (f"{BASE_URL}/minutes?lang=ja", "m3_minutes_pc_ja_dark.png"),
                ]
                for url, filename in dark_pages:
                    await cdp.navigate_and_capture(
                        url, filename, 1280, 800, False, color_scheme="dark"
                    )

        asyncio.run(capture_all_auth())
    finally:
        chrome_proc.terminate()
        st_proc.terminate()
        for p in (chrome_proc, st_proc):
            try:
                p.wait(timeout=5)
            except Exception:
                p.kill()
        time.sleep(1.0)


def main() -> None:
    print("=== Step 1: Login Gate (Google Sign-In) ===")
    run_login_session()

    print("=== Step 2: 10 Pages, Mobile & English & Dark Mode ===")
    run_authenticated_session()

    print("All captures completed successfully!")


if __name__ == "__main__":
    main()
