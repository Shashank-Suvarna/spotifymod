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

async def test_partner_api(playlist_id: str):
    totp, ver = generate_totp()
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    }
    params = {'reason': 'init', 'productType': 'web-player', 'totp': totp, 'totpVer': ver, 'totpServer': totp}
    
    async with httpx.AsyncClient(headers=headers, timeout=10) as c:
        # 1. Get access token
        resp = await c.get('https://open.spotify.com/api/token', params=params)
        token = resp.json().get('accessToken')

        # 2. Get client token
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

        # 3. Call Pathfinder query
        pf_headers = {
            "Authorization": f"Bearer {token}",
            "client-token": client_token,
            "Accept": "application/json",
            "app-platform": "WebPlayer",
            "spotify-app-version": "1.2.40.589.gf195a69a",
            "Content-Type": "application/json"
        }
        query_url = "https://api-partner.spotify.com/pathfinder/v1/query"
        
        # Test offset 0 and offset 100
        for offset in [0, 100, 200, 300, 400, 500]:
            query_params = {
                'operationName': 'queryPlaylist',
                'variables': json.dumps({'uri': f'spotify:playlist:{playlist_id}', 'offset': offset, 'limit': 100}),
                'extensions': json.dumps({'persistedQuery': {'version': 1, 'sha256Hash': '908a5597b4d0af0489a9ad6a2d41bc3b416ff47c0884016d92bbd6822d0eb6d8'}})
            }
            pf_resp = await c.get(query_url, params=query_params, headers=pf_headers)
            if pf_resp.status_code == 200:
                res_json = pf_resp.json()
                data = res_json.get("data", {}).get("playlistV2", {})
                content = data.get("content", {})
                items = content.get("items", [])
                total = content.get("totalCount")
                print(f"Offset {offset}: fetched {len(items)} items. Total in playlist: {total}")
                if items and offset == 0:
                    with open("sample_track_item.json", "w", encoding="utf-8") as f:
                        json.dump(items[0], f, indent=2)
            else:
                print(f"Offset {offset} error: {pf_resp.status_code}")

if __name__ == '__main__':
    asyncio.run(test_partner_api("3NeVNY4FhQhYaPl54jfIJx"))
