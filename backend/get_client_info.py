import httpx
import asyncio
import re

async def get_client_info():
    url = "https://open.spotifycdn.com/cdn/build/mobile-web-player/vendor~mobile-web-player.62a9bb12.js"
    async with httpx.AsyncClient() as c:
        js = await c.get(url)
        pos = js.text.find("clienttoken.spotify.com")
        print(js.text[pos-600:pos+200])

if __name__ == '__main__':
    asyncio.run(get_client_info())
