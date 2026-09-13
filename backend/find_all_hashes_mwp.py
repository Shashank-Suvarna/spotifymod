import httpx
import re

url = "https://open.spotifycdn.com/cdn/build/mobile-web-player/mobile-web-player.bb9677fe.js"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
js = httpx.get(url, headers=headers).text

matches = [m.start() for m in re.finditer(r'sha256Hash', js)]
print(f"Total occurrences of sha256Hash: {len(matches)}")
for idx, pos in enumerate(matches):
    start = max(0, pos - 250)
    end = min(len(js), pos + 250)
    print(f"--- MATCH {idx+1} ---")
    print(js[start:end])
