import httpx
import asyncio
import re

async def find_all_hashes():
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    async with httpx.AsyncClient(headers=headers, follow_redirects=True) as c:
        r = await c.get('https://open.spotify.com/playlist/3NeVNY4FhQhYaPl54jfIJx')
        scripts = re.findall(r'src="([^"]+\.js)"', r.text)
        print("Scripts on playlist page:", len(scripts))
        for s in scripts:
            url = s if s.startswith('http') else 'https://open.spotify.com' + s
            js = await c.get(url)
            # Find all 64-char hex strings in js
            hex_hashes = re.findall(r'["\']([a-f0-9]{64})["\']', js.text)
            if hex_hashes:
                print(f"{url.split('/')[-1]} has {len(hex_hashes)} sha256 hashes")
                for h in hex_hashes[:5]:
                    # Find context around hash
                    pos = js.text.find(h)
                    print("  Context:", js.text[max(0, pos-40):min(len(js.text), pos+80)])

if __name__ == '__main__':
    asyncio.run(find_all_hashes())
