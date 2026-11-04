import asyncio
import base64
import json
import os
from pathlib import Path
import subprocess
import sys
import time
import urllib.request
import websockets

CHROME_BIN = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
ARTIFACT_DIR = Path("/Users/kosei/.gemini/antigravity/brain/ffd16fa2-53e1-4d2b-8a66-a0d9b87b1c91")
APP_DIR = Path("/Users/kosei/jasc-task-app")
ST_PORT = 8503
CDP_PORT = 9230
BASE_URL = f"http://127.0.0.1:{ST_PORT}"

os.environ["no_proxy"] = "*"
os.environ["NO_PROXY"] = "*"
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

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

    async def capture(self, filename: str) -> None:
        res = await self.call("Page.captureScreenshot", {"format": "png"})
        img_bytes = base64.b64decode(res["data"])
        out_path = ARTIFACT_DIR / filename
        out_path.write_bytes(img_bytes)
        print(f"Saved {filename} ({len(img_bytes)} bytes)")

async def run_bg_capture():
    with urllib.request.urlopen(f"http://127.0.0.1:{CDP_PORT}/json") as resp:
        targets_info = json.loads(resp.read().decode())
    page_target = next(t for t in targets_info if t.get("type") == "page")
    ws_url = page_target["webSocketDebuggerUrl"]

    async with websockets.connect(ws_url, max_size=50_000_000) as ws:
        cdp = CDPClient(ws)
        await cdp.call("Page.enable")
        await cdp.call("Emulation.setDeviceMetricsOverride", {
            "width": 1280, "height": 800, "deviceScaleFactor": 1, "mobile": False
        })
        
        # 1. 壁紙ポップオーバーを開いた状態の撮影
        await cdp.call("Page.navigate", {"url": f"{BASE_URL}/?lang=ja"})
        await asyncio.sleep(3.5)
        
        # 壁紙ボタン（Popover ボタン）をクリック（col_help: 0, col_bg: 1, col_user: 2）
        click_popover_js = """
        const popovers = Array.from(document.querySelectorAll('div[data-testid="stPopover"]'));
        if (popovers.length >= 2) {
            const btn = popovers[1].querySelector('button');
            if (btn) btn.click();
        }
        """
        await cdp.call("Runtime.evaluate", {"expression": click_popover_js})
        await asyncio.sleep(1.0)
        await cdp.capture("m3_wallpaper_popover.png")
        
        # 2. ブルー背景 (#E8F0FE) をクリックして適用・撮影
        click_blue_js = """
        const swatches = Array.from(document.querySelectorAll('div[class*="st-key-bg_btn_"] button'));
        if (swatches.length >= 2) {
            swatches[1].click(); // 2番目が Blue
        }
        """
        await cdp.call("Runtime.evaluate", {"expression": click_blue_js})
        await asyncio.sleep(2.5)
        await cdp.capture("m3_home_bg_blue.png")
        
        # 3. 役職ボード画面に遷移してブルー背景を確認
        await cdp.call("Page.navigate", {"url": f"{BASE_URL}/board?lang=ja"})
        await asyncio.sleep(3.0)
        await cdp.capture("m3_board_bg_blue.png")

def main():
    env = os.environ.copy()
    env["JASC_DEV_AUTH_EMAIL"] = "member_a@example.com"
    env["JASC_REPOSITORY_BACKEND"] = "memory"

    st_proc = subprocess.Popen([
        "uv", "run", "streamlit", "run", "app.py",
        "--server.port", str(ST_PORT),
        "--server.address", "127.0.0.1",
        "--server.headless", "true",
        "--browser.gatherUsageStats", "false"
    ], cwd=str(APP_DIR), env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    chrome_proc = subprocess.Popen([
        CHROME_BIN, "--headless", "--disable-gpu", "--no-first-run",
        "--no-default-browser-check", "--user-data-dir=/tmp/chrome_cdp_bg",
        f"--remote-debugging-port={CDP_PORT}", "about:blank"
    ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)

    try:
        wait_for_http(BASE_URL)
        wait_for_http(f"http://127.0.0.1:{CDP_PORT}/json")
        asyncio.run(run_bg_capture())
    finally:
        chrome_proc.terminate()
        st_proc.terminate()
        for p in (chrome_proc, st_proc):
            try: p.wait(timeout=5)
            except Exception: p.kill()

if __name__ == "__main__":
    main()
