import httpx
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
r = httpx.get('https://open.spotify.com/playlist/3NeVNY4FhQhYaPl54jfIJx', headers=headers, follow_redirects=True)
scripts = re.findall(r'src="([^"]+\.js)"', r.text)
print('Found scripts:', len(scripts))

for s in scripts:
    url = s if s.startswith('http') else 'https://open.spotify.com' + s
    try:
        js = httpx.get(url, headers=headers).text
        # Search for sha256Hash
        matches = re.findall(r'operationName:"([^"]+)"[^}]+sha256Hash:"([a-f0-9]{64})"', js)
        if not matches:
            matches = re.findall(r'"([a-zA-Z0-9_]+)"[^}]*sha256Hash:"([a-f0-9]{64})"', js)
        for op, h in matches:
            if any(k in op.lower() for k in ['playlist', 'track', 'fetch', 'album']):
                print(f'{op} -> {h}')
        # Also let's search if any sha256Hash is near "query" or "fetchPlaylist"
        for m in re.finditer(r'([a-zA-Z0-9_]+).{1,50}sha256Hash:"([a-f0-9]{64})"', js):
            print(f'Near match: {m.group(1)} -> {m.group(2)}')
    except Exception as e:
        print(f"Error for {url}: {e}")
