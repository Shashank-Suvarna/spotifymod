import httpx
import asyncio
import re

async def check_html(playlist_id: str):
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    }
    async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=10.0) as client:
        r = await client.get(f"https://open.spotify.com/playlist/{playlist_id}")
        # Look for track links or track names in html
        track_links = re.findall(r'href=\"/track/([a-zA-Z0-9]{22})\"', r.text)
        print("Track links in html:", len(track_links), "Unique:", len(set(track_links)))
        
        # Look for meta tags
        music_songs = re.findall(r'property=\"music:song\" content=\"([^\"]+)\"', r.text)
        print("music:song meta tags count:", len(music_songs))

if __name__ == '__main__':
    asyncio.run(check_html('37i9dQZF1DXcBWIGoYBM5M'))
