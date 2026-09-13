import httpx
import asyncio
import re
import json

async def check():
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }
    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15.0) as client:
        # Check Spotify oEmbed / API
        # 1. Check open.spotify.com/oembed
        oe = await client.get('https://open.spotify.com/oembed?url=https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M')
        print('oembed status:', oe.status_code)
        if oe.status_code == 200:
            print('oembed data:', oe.json())

        # 2. Check Spotify embed scripts for API endpoints
        resp = await client.get('https://open.spotify.com/embed/playlist/37i9dQZF1DXcBWIGoYBM5M')
        srcs = re.findall(r'<script[^>]*src="([^"]+)"', resp.text)
        print('Found script sources:', len(srcs))
        for src in srcs:
            url = src if src.startswith('http') else 'https://open.spotify.com' + src
            r = await client.get(url)
            # Find tokens, client_id, and endpoints
            client_ids = re.findall(r'clientId:"([a-f0-9]{32})"', r.text)
            if client_ids:
                print('Found clientIds in script:', set(client_ids))
            
            # Find api endpoints
            apis = re.findall(r'"(https://api\.spotify\.com/[^"]+)"', r.text)
            if apis:
                print('Found APIs:', set(apis)[:5])

if __name__ == "__main__":
    asyncio.run(check())
