import httpx
import asyncio
import re
import json
import sys

sys.stdout.reconfigure(encoding="utf-8")

PLAYLIST_ID = "3NeVNY4FhQhYaPl54jfIJx"

async def test_playlist():
    headers = {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    }
    url = f"https://open.spotify.com/embed/playlist/{PLAYLIST_ID}"
    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15.0) as client:
        resp = await client.get(url)
        match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', resp.text, re.DOTALL)
        if match:
            data = json.loads(match.group(1))
            props = data.get("props", {}).get("pageProps", {})
            state = props.get("state", {}).get("data", {}).get("entity", {})
            tracks = state.get("trackList", [])
            print(f"Title: {state.get('title') or state.get('name')}")
            print(f"Subtitle: {state.get('subtitle')}")
            print(f"Embed returned tracks: {len(tracks)}")

if __name__ == "__main__":
    asyncio.run(test_playlist())
