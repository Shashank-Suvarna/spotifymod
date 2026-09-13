import httpx
import asyncio
import re

async def find_client_id():
    url = "https://open.spotifycdn.com/cdn/build/mobile-web-player/mobile-web-player.bb9677fe.js"
    async with httpx.AsyncClient() as c:
        js = await c.get(url)
        matches = re.findall(r'client(?:Id|ID):\s*"([a-zA-Z0-9_-]{10,40})"', js.text)
        print("clientIds in mobile-web-player:", matches)
        versions = re.findall(r'clientVersion:\s*"([^"]+)"', js.text)
        print("clientVersions:", versions)

if __name__ == '__main__':
    asyncio.run(find_client_id())
