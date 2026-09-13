import httpx

url = "https://open.spotifycdn.com/cdn/build/mobile-web-player/mobile-web-player.bb9677fe.js"
headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
js = httpx.get(url, headers=headers).text

pos = js.find('queryPlaylist')
if pos != -1:
    print(js[max(0, pos-400):min(len(js), pos+1500)])
