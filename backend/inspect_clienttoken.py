import httpx
import asyncio
import re

async def check_all():
    headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
    async with httpx.AsyncClient(headers=headers) as c:
        r = await c.get('https://open.spotify.com')
        scripts = re.findall(r'src="([^"]+\.js)"', r.text)
        for s in scripts:
            url = s if s.startswith('http') else 'https://open.spotify.com' + s
            js = await c.get(url)
            pos = js.text.find("clienttoken.spotify.com")
            if pos != -1:
                print("Found in", url)
                snippet = js.text[max(0, pos - 150):min(len(js.text), pos + 300)]
                print(snippet)

if __name__ == '__main__':
    asyncio.run(check_all())
