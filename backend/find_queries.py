import httpx
import re

url = "https://open.spotifycdn.com/cdn/build/mobile-web-player/mobile-web-player.bb9677fe.js"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
js = httpx.get(url, headers=headers).text

# Look for usages of module 19305
matches = re.findall(r'new\s+[a-zA-Z0-9_$]+\.l\([^)]+\)', js)
print(f"new .l calls: {len(matches)}")
for m in matches[:20]:
    print(m)

# Also search for any 64 hex char strings in the whole js file!
hashes = set(re.findall(r'\"([a-f0-9]{64})\"', js))
print(f"Total 64-hex hashes in mobile-web-player: {len(hashes)}")
for h in hashes:
    pos = js.find(h)
    print(h, "->", js[max(0, pos-60):min(len(js), pos+100)])
