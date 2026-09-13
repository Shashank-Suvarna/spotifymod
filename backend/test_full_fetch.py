import pyotp
import requests
import base64
import httpx
import asyncio
import json
import logging

logger = logging.getLogger(__name__)

def generate_spotify_totp():
    try:
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
    except Exception as e:
        logger.warning(f"TOTP generation failed: {e}")
        return None, None

async def fetch_spotify_playlist_pathfinder(playlist_id: str):
    totp, ver = generate_spotify_totp()
    if not totp:
        return None

    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'Accept': 'application/json',
    }
    params = {'reason': 'init', 'productType': 'web-player', 'totp': totp, 'totpVer': ver, 'totpServer': totp}

    async with httpx.AsyncClient(headers=headers, timeout=15) as client:
        # 1. Get access token
        token_resp = await client.get('https://open.spotify.com/api/token', params=params)
        if token_resp.status_code != 200:
            return None
        access_token = token_resp.json().get('accessToken')
        if not access_token:
            return None

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
        ct_resp = await client.post("https://clienttoken.spotify.com/v1/clienttoken", json=ct_payload)
        client_token = ct_resp.json().get("granted_token", {}).get("token")

        pf_headers = {
            "Authorization": f"Bearer {access_token}",
            "Accept": "application/json",
            "app-platform": "WebPlayer",
            "spotify-app-version": "1.2.40.589.gf195a69a",
            "Content-Type": "application/json"
        }
        if client_token:
            pf_headers["client-token"] = client_token

        query_url = "https://api-partner.spotify.com/pathfinder/v1/query"
        query_hash = "908a5597b4d0af0489a9ad6a2d41bc3b416ff47c0884016d92bbd6822d0eb6d8"

        playlist_info = None
        all_tracks = []
        offset = 0
        limit = 100
        total_count = None

        while True:
            query_params = {
                'operationName': 'queryPlaylist',
                'variables': json.dumps({'uri': f'spotify:playlist:{playlist_id}', 'offset': offset, 'limit': limit}),
                'extensions': json.dumps({'persistedQuery': {'version': 1, 'sha256Hash': query_hash}})
            }

            resp = await client.get(query_url, params=query_params, headers=pf_headers)
            if resp.status_code != 200:
                break

            res_json = resp.json()
            if "errors" in res_json or not res_json.get("data", {}).get("playlistV2"):
                break

            p_data = res_json["data"]["playlistV2"]
            if not playlist_info:
                # Extract cover artwork
                img_items = p_data.get("images", {}).get("items", [])
                artwork_url = None
                if img_items and img_items[0].get("sources"):
                    artwork_url = img_items[0]["sources"][0].get("url")

                owner_name = (
                    p_data.get("ownerV2", {}).get("data", {}).get("name")
                    or p_data.get("ownerV2", {}).get("data", {}).get("username")
                    or "Spotify User"
                )

                content_obj = p_data.get("content", {})
                total_count = content_obj.get("totalCount", 0)

                playlist_info = {
                    "spotify_id": playlist_id,
                    "title": p_data.get("name") or "Spotify Playlist",
                    "description": p_data.get("description") or "",
                    "owner_name": owner_name,
                    "artwork_url": artwork_url,
                    "total_tracks": total_count
                }

            items = p_data.get("content", {}).get("items", [])
            if not items:
                break

            for item in items:
                t_wrapper = item.get("itemV2", {})
                t_data = t_wrapper.get("data", {})
                if not t_data:
                    continue

                # Could be Track
                t_uri = t_data.get("uri", "")
                t_id = t_uri.replace("spotify:track:", "") if "spotify:track:" in t_uri else f"spot_{playlist_id}_{len(all_tracks)+1}"

                # Artists
                artists_list = []
                for a in t_data.get("artists", {}).get("items", []):
                    a_name = a.get("profile", {}).get("name")
                    if a_name:
                        artists_list.append(a_name)
                artist_name = ", ".join(artists_list) if artists_list else "Unknown Artist"

                # Album & Cover
                album_obj = t_data.get("albumOfTrack", {})
                album_name = album_obj.get("name") or playlist_info["title"]
                cover_sources = album_obj.get("coverArt", {}).get("sources", [])
                track_art = cover_sources[0].get("url") if cover_sources else playlist_info["artwork_url"]

                # Preview
                previews = t_data.get("previews", {}).get("audioPreviews", {}).get("items", [])
                preview_url = previews[0].get("url") if previews else None

                # Duration
                duration_ms = t_data.get("duration", {}).get("totalMilliseconds", 180000)

                all_tracks.append({
                    "spotify_id": t_id,
                    "title": t_data.get("name") or "Unknown Track",
                    "artist_name": artist_name,
                    "album_name": album_name,
                    "duration_ms": duration_ms,
                    "artwork_url": track_art,
                    "preview_url": preview_url,
                    "track_number": len(all_tracks) + 1,
                    "isrc": None
                })

            offset += len(items)
            if total_count and offset >= total_count:
                break
            if len(items) < limit:
                break

        if playlist_info:
            playlist_info["total_tracks"] = len(all_tracks)
            return playlist_info, all_tracks
        return None

async def main():
    res = await fetch_spotify_playlist_pathfinder("3NeVNY4FhQhYaPl54jfIJx")
    if res:
        p_info, tracks = res
        print(f"Success! Title: {p_info['title'].encode('utf-8')}, Total fetched tracks: {len(tracks)}")
        print(f"Track 1: {tracks[0]['title']} by {tracks[0]['artist_name']}")
        print(f"Track 587: {tracks[-1]['title']} by {tracks[-1]['artist_name']}")
    else:
        print("Failed to fetch.")

if __name__ == '__main__':
    asyncio.run(main())
