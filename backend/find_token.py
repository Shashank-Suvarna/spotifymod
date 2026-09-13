import httpx
import asyncio
import re

async def find_token_endpoint():
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }
    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15.0) as client:
        r = await client.get('https://open.spotify.com')
        # Find all script src
        scripts = re.findall(r'<script[^>]*src="([^"]+)"', r.text)
        print("Found scripts on open.spotify.com:", len(scripts))
        for s in scripts:
            if 'vendor' in s or 'web-player' in s or 'main' in s:
                s_url = s if s.startswith('http') else 'https://open.spotify.com' + s
                js_r = await client.get(s_url)
                # Find occurrences of get_access_token or clienttoken or token
                tokens = re.findall(r'"(https://[^"]*token[^"]*)"', js_r.text)
                if tokens:
                    print(f"Token URLs in {s_url.split('/')[-1]}:", set(tokens))
                endpoints = re.findall(r'"(/get_access_token[^"]*)"', js_r.text)
                if endpoints:
                    print("Endpoints:", endpoints)

if __name__ == '__main__':
    asyncio.run(find_token_endpoint())
