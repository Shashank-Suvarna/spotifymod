import httpx
import re

headers = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}
r = httpx.get('https://open.spotify.com/playlist/3NeVNY4FhQhYaPl54jfIJx', headers=headers, follow_redirects=True)
scripts = re.findall(r'src="([^"]+\.js)"', r.text)

for s in scripts:
    url = s if s.startswith('http') else 'https://open.spotify.com' + s
    js = httpx.get(url, headers=headers).text
    pos = js.find('f952da037440f694cc6925b9e3f649d39077a744c4db7dfba01cb883723f4f77')
    if pos != -1:
        print("Found in", url)
        print("Snippet:", js[max(0, pos-200):min(len(js), pos+200)])
