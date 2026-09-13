import pyotp
import requests
import base64
import httpx
import asyncio
import json

def generate_totp():
    url = 'https://code.thetadev.de/ThetaDev/spotify-secrets/raw/branch/main/secrets/secretDict.json'
    r = requests.get(url, timeout=5)
    secrets = r.json()
    version = max(secrets, key=int)
    secret_bytes = bytearray(secrets[version])
    transformed = [e ^ ((t % 33) + 9) for t, e in enumerate(secret_bytes)]
    joined = ''.join(str(num) for num in transformed)
    hex_str = joined.encode().hex()
    secret = base64.b32encode(bytes.fromhex(hex_str)).decode().rstrip('=')
    totp = pyotp.TOTP(secret).now()
    return totp, version

async def inspect_playlist_meta(playlist_id: str):
    totp, ver = generate_totp()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    }
    params = {'reason': 'init', 'productType': 'web-player', 'totp': totp, 'totpVer': ver, 'totpServer': totp}
    
    async with httpx.AsyncClient(headers=headers, timeout=10) as c:
        resp = await c.get('https://open.spotify.com/api/token', params=params)
        token = resp.json().get('accessToken')

        ct_payload = {
            "client_data": {
                "client_version": "1.2.40.589.gf195a69a",
                "client_id": "f6a40776580943a7bc5173125a1e8832",
                "js_sdk_data": {
                    "device_brand": "Apple",
                    "device_model": "iPhone",
                    "os": "iOS",
                    "os_version": "16.5",
                    "device_id": "8a7c2b3d4e5f6a7b8c9d0e1f2a3b4c5d",
                    "device_type": "mobile",
                    "platform_identifier": "web-player"
                }
            }
        }
        ct_resp = await c.post("https://clienttoken.spotify.com/v1/clienttoken", json=ct_payload)
        client_token = ct_resp.json().get("granted_token", {}).get("token")

        pf_headers = {
            "Authorization": f"Bearer {token}",
            "client-token": client_token,
            "Accept": "application/json",
            "app-platform": "WebPlayer",
            "spotify-app-version": "1.2.40.589.gf195a69a",
            "Content-Type": "application/json"
        }
        query_url = "https://api-partner.spotify.com/pathfinder/v1/query"
        query_params = {
            'operationName': 'queryPlaylist',
            'variables': json.dumps({'uri': f'spotify:playlist:{playlist_id}', 'offset': 0, 'limit': 1}),
            'extensions': json.dumps({'persistedQuery': {'version': 1, 'sha256Hash': '908a5597b4d0af0489a9ad6a2d41bc3b416ff47c0884016d92bbd6822d0eb6d8'}})
        }
        pf_resp = await c.get(query_url, params=query_params, headers=pf_headers)
        p_data = pf_resp.json().get("data", {}).get("playlistV2", {})
        # Remove content items to see metadata cleanly
        if "content" in p_data:
            p_data["content"] = {"totalCount": p_data["content"].get("totalCount")}
        with open("playlist_meta.json", "w", encoding="utf-8") as f:
            json.dump(p_data, f, indent=2)
        print("Written playlist_meta.json successfully")

if __name__ == '__main__':
    asyncio.run(inspect_playlist_meta("3NeVNY4FhQhYaPl54jfIJx"))
