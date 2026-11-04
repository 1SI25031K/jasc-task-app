import asyncio, json, urllib.request, websockets
import subprocess, os, time

os.environ["no_proxy"] = "*"
os.environ["NO_PROXY"] = "*"
urllib.request.install_opener(urllib.request.build_opener(urllib.request.ProxyHandler({})))

env = os.environ.copy()
env['JASC_DEV_AUTH_EMAIL'] = 'member_a@example.com'
env['JASC_REPOSITORY_BACKEND'] = 'memory'

p1 = subprocess.Popen(['uv', 'run', 'streamlit', 'run', 'app.py', '--server.port', '8506', '--server.headless', 'true'], env=env, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
p2 = subprocess.Popen(['/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '--headless', '--disable-gpu', '--remote-debugging-port=9236', '--user-data-dir=/tmp/c_tmp_2', 'about:blank'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
time.sleep(3)

async def check():
    req = urllib.request.Request('http://127.0.0.1:9236/json')
    with urllib.request.urlopen(req) as r:
        info = json.loads(r.read().decode())
    target = next(t for t in info if t.get('type') == 'page')
    async with websockets.connect(target['webSocketDebuggerUrl']) as ws:
        await ws.send(json.dumps({'id': 1, 'method': 'Page.navigate', 'params': {'url': 'http://127.0.0.1:8506/?lang=ja'}}))
        await asyncio.sleep(4)
        await ws.send(json.dumps({'id': 2, 'method': 'Runtime.evaluate', 'params': {'expression': '''
            ({
                url: window.location.href,
                allRoundDivs: Array.from(document.querySelectorAll('div[style*="border-radius: 50%"]')).map(d => d.outerHTML)
            })
        ''', 'returnByValue': True}}))
        while True:
            res = json.loads(await ws.recv())
            if res.get('id') == 2:
                print(json.dumps(res['result']['result']['value'], indent=2, ensure_ascii=False))
                break

try:
    asyncio.run(check())
finally:
    p1.terminate()
    p2.terminate()
