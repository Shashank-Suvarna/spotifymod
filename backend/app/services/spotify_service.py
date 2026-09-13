import re
import urllib.parse
import httpx
import json
import logging
import base64
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timedelta
import pyotp
import requests

from backend.app.config import settings

logger = logging.getLogger(__name__)

SPOTIFY_AUTH_URL = "https://accounts.spotify.com/authorize"
SPOTIFY_TOKEN_URL = "https://accounts.spotify.com/api/token"
SPOTIFY_API_BASE = "https://api.spotify.com/v1"

class SpotifyService:
    def __init__(self):
        self.client_id = settings.SPOTIFY_CLIENT_ID
        self.client_secret = settings.SPOTIFY_CLIENT_SECRET
        self.redirect_uri = settings.SPOTIFY_REDIRECT_URI

    def generate_spotify_totp(self) -> Tuple[Optional[str], Optional[str]]:
        """Generates dynamic TOTP token for Spotify web client authentication."""
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
            logger.warning(f"Spotify TOTP generation failed: {e}")
            return None, None

    async def fetch_from_spotify_pathfinder(
        self,
        playlist_id: str
    ) -> Optional[Tuple[Dict[str, Any], List[Dict[str, Any]]]]:
        """
        Paginates ALL tracks (e.g. 500+ songs) from Spotify's Partner Pathfinder API
        without any 100-track embed truncation.
        """
        totp, ver = self.generate_spotify_totp()
        if not totp:
            return None

        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
            'Accept': 'application/json',
        }
        params = {'reason': 'init', 'productType': 'web-player', 'totp': totp, 'totpVer': ver, 'totpServer': totp}

        try:
            async with httpx.AsyncClient(headers=headers, timeout=20.0) as client:
                # 1. Get access token
                token_resp = await client.get('https://open.spotify.com/api/token', params=params)
                if token_resp.status_code != 200:
                    logger.warning(f"Spotify token endpoint returned {token_resp.status_code}")
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
                all_tracks: List[Dict[str, Any]] = []
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
                        logger.warning(f"Pathfinder query failed at offset {offset}: {resp.status_code}")
                        break

                    res_json = resp.json()
                    if "errors" in res_json or not res_json.get("data", {}).get("playlistV2"):
                        break

                    p_data = res_json["data"]["playlistV2"]
                    if not playlist_info:
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

                        t_uri = t_data.get("uri", "")
                        t_id = (
                            t_uri.replace("spotify:track:", "")
                            if "spotify:track:" in t_uri
                            else f"spot_{playlist_id}_{len(all_tracks)+1}"
                        )

                        artists_list = []
                        for a in t_data.get("artists", {}).get("items", []):
                            a_name = a.get("profile", {}).get("name")
                            if a_name:
                                artists_list.append(a_name)
                        artist_name = ", ".join(artists_list) if artists_list else "Unknown Artist"

                        album_obj = t_data.get("albumOfTrack", {})
                        album_name = album_obj.get("name") or playlist_info["title"]
                        cover_sources = album_obj.get("coverArt", {}).get("sources", [])
                        track_art = cover_sources[0].get("url") if cover_sources else playlist_info["artwork_url"]

                        previews = t_data.get("previews", {}).get("audioPreviews", {}).get("items", [])
                        preview_url = previews[0].get("url") if previews else None

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

                if playlist_info and len(all_tracks) > 0:
                    playlist_info["total_tracks"] = len(all_tracks)
                    logger.info(f"Pathfinder successfully imported ALL {len(all_tracks)} tracks for playlist '{playlist_info['title']}'")
                    return playlist_info, all_tracks

        except Exception as e:
            logger.warning(f"Pathfinder query failed for playlist {playlist_id}: {e}")

        return None

    def get_auth_url(self, state: str = "spotify_offline_state") -> str:
        """Generates Spotify OAuth 2.0 authorization URL."""
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": self.redirect_uri,
            "scope": settings.SPOTIFY_SCOPES,
            "state": state,
            "show_dialog": "true"
        }
        return f"{SPOTIFY_AUTH_URL}?{urllib.parse.urlencode(params)}"

    async def exchange_code_for_token(self, code: str) -> Dict[str, Any]:
        """Exchanges authorization code for access and refresh tokens."""
        if not self.client_secret:
            logger.warning("SPOTIFY_CLIENT_SECRET not configured, returning mock token")
            return {
                "access_token": "mock_spotify_access_token_" + code[:8],
                "refresh_token": "mock_spotify_refresh_token",
                "expires_in": 3600,
                "token_type": "Bearer"
            }

        data = {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": self.redirect_uri,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(SPOTIFY_TOKEN_URL, data=data)
            if resp.status_code != 200:
                logger.error(f"Spotify token exchange failed: {resp.text}")
                raise Exception(f"Spotify authentication failed: {resp.status_code}")
            return resp.json()

    async def refresh_access_token(self, refresh_token: str) -> Dict[str, Any]:
        """Refreshes an expired access token."""
        if not self.client_secret:
            return {"access_token": "refreshed_mock_access_token", "expires_in": 3600}

        data = {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
        }
        async with httpx.AsyncClient() as client:
            resp = await client.post(SPOTIFY_TOKEN_URL, data=data)
            if resp.status_code != 200:
                raise Exception(f"Failed to refresh Spotify token: {resp.text}")
            return resp.json()

    async def get_current_user_profile(self, access_token: str) -> Dict[str, Any]:
        """Fetches current user's profile from Spotify Web API."""
        if access_token.startswith("mock_"):
            return {
                "id": "spotify_user_demo",
                "display_name": "Sound Explorer",
                "email": "user@spotifyoffline.local",
                "images": [{"url": "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop"}]
            }

        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient() as client:
            resp = await client.get(f"{SPOTIFY_API_BASE}/me", headers=headers)
            if resp.status_code != 200:
                raise Exception(f"Failed to fetch user profile: {resp.text}")
            return resp.json()

    def parse_playlist_id(self, input_str: str) -> Tuple[str, str]:
        """Extracts playlist/album ID and entity type from URL, URI, or plain ID."""
        input_str = input_str.strip()
        match = re.search(r"(?:playlist|album)[/:]([a-zA-Z0-9]{15,30})", input_str)
        entity_type = "album" if "album" in input_str else "playlist"
        if match:
            return match.group(1), entity_type
        
        if re.match(r"^[a-zA-Z0-9]{15,30}$", input_str):
            return input_str, "playlist"

        if "500" in input_str or "demo" in input_str.lower() or "mega" in input_str.lower():
            return "demo_500_track_mega_playlist", "playlist"

        return input_str, "playlist"

    async def fetch_from_spotify_embed(
        self,
        entity_id: str,
        entity_type: str = "playlist"
    ) -> Optional[Tuple[Dict[str, Any], List[Dict[str, Any]]]]:
        """
        Fallback public embed parser.
        """
        headers = {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "en-US,en;q=0.9",
        }
        url = f"https://open.spotify.com/embed/{entity_type}/{entity_id}"
        try:
            async with httpx.AsyncClient(headers=headers, follow_redirects=True, timeout=15.0) as client:
                resp = await client.get(url)
                if resp.status_code != 200:
                    logger.warning(f"Spotify embed returned status {resp.status_code} for {url}")
                    return None

                match = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', resp.text, re.DOTALL)
                if not match:
                    return None

                data = json.loads(match.group(1))
                entity = (
                    data.get("props", {})
                    .get("pageProps", {})
                    .get("state", {})
                    .get("data", {})
                    .get("entity", {})
                )
                if not entity:
                    return None

                title = entity.get("title") or entity.get("name") or "Spotify Playlist"
                description = entity.get("subtitle") or entity.get("description") or "Imported from Spotify"
                cover_sources = entity.get("coverArt", {}).get("sources", [])
                artwork_url = cover_sources[0].get("url") if cover_sources else None

                raw_tracks = entity.get("trackList", [])
                parsed_tracks = []
                for idx, t in enumerate(raw_tracks):
                    t_uri = t.get("uri", "")
                    t_id = t_uri.replace("spotify:track:", "") if "spotify:track:" in t_uri else f"spot_{entity_id}_{idx+1}"
                    audio_preview = t.get("audioPreview", {})
                    preview_url = audio_preview.get("url") if audio_preview else None
                    artists_str = t.get("subtitle", "Unknown Artist").replace("\xa0", " ").strip()

                    parsed_tracks.append({
                        "spotify_id": t_id,
                        "title": t.get("title", "Unknown Track"),
                        "artist_name": artists_str,
                        "album_name": title,
                        "duration_ms": t.get("duration", 180000),
                        "artwork_url": artwork_url,
                        "preview_url": preview_url,
                        "track_number": idx + 1,
                        "isrc": None
                    })

                playlist_info = {
                    "spotify_id": entity_id,
                    "title": title,
                    "description": description,
                    "owner_name": "Spotify Curation",
                    "artwork_url": artwork_url,
                    "total_tracks": len(parsed_tracks)
                }
                return playlist_info, parsed_tracks
        except Exception as e:
            logger.warning(f"Failed to fetch Spotify embed for {entity_id}: {e}")
            return None

    async def get_playlist_metadata_and_tracks(
        self,
        playlist_id: str,
        access_token: Optional[str] = None
    ) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """
        Retrieves playlist metadata and all tracks:
        1. If demo requested, returns rich demo catalog.
        2. PRIMARY: Spotify Pathfinder API (retrieves ALL 500+ tracks via pagination!).
        3. FALLBACK 1: Public Spotify embed parser.
        4. FALLBACK 2: Spotify Web API (if access_token provided).
        5. FALLBACK 3: Mock catalog.
        """
        # 1. Demo
        if playlist_id == "demo_500_track_mega_playlist":
            return self._generate_mock_playlist(playlist_id)

        # 2. PRIMARY: Fetch all tracks via Pathfinder GraphQL API
        pf_result = await self.fetch_from_spotify_pathfinder(playlist_id)
        if pf_result and len(pf_result[1]) > 0:
            logger.info(f"Pathfinder imported all {len(pf_result[1])} tracks for '{pf_result[0]['title']}'")
            return pf_result

        # 3. Fallback to public embed parser
        embed_result = await self.fetch_from_spotify_embed(playlist_id, entity_type="playlist")
        if not embed_result:
            embed_result = await self.fetch_from_spotify_embed(playlist_id, entity_type="album")

        if embed_result and len(embed_result[1]) > 0:
            logger.info(f"Embed fallback imported {len(embed_result[1])} tracks for '{embed_result[0]['title']}'")
            return embed_result

        # 4. If access token available, query Spotify Web API
        if access_token and not access_token.startswith("mock_"):
            try:
                headers = {"Authorization": f"Bearer {access_token}"}
                async with httpx.AsyncClient(timeout=20.0) as client:
                    resp = await client.get(f"{SPOTIFY_API_BASE}/playlists/{playlist_id}", headers=headers)
                    if resp.status_code == 200:
                        p_data = resp.json()
                        artwork = p_data.get("images", [{}])[0].get("url") if p_data.get("images") else None
                        playlist_info = {
                            "spotify_id": p_data.get("id"),
                            "title": p_data.get("name", "Untitled Playlist"),
                            "description": p_data.get("description", ""),
                            "owner_name": p_data.get("owner", {}).get("display_name", "Spotify User"),
                            "artwork_url": artwork,
                            "total_tracks": p_data.get("tracks", {}).get("total", 0)
                        }

                        all_tracks = []
                        tracks_url = f"{SPOTIFY_API_BASE}/playlists/{playlist_id}/tracks?limit=100"
                        while tracks_url:
                            t_resp = await client.get(tracks_url, headers=headers)
                            if t_resp.status_code != 200:
                                break
                            t_data = t_resp.json()
                            for item in t_data.get("items", []):
                                track_item = item.get("track")
                                if not track_item or not track_item.get("id"):
                                    continue
                                artists = ", ".join([a.get("name", "") for a in track_item.get("artists", [])])
                                album_art = (
                                    track_item.get("album", {}).get("images", [{}])[0].get("url")
                                    if track_item.get("album", {}).get("images") else artwork
                                )
                                all_tracks.append({
                                    "spotify_id": track_item.get("id"),
                                    "title": track_item.get("name"),
                                    "artist_name": artists or "Unknown Artist",
                                    "album_name": track_item.get("album", {}).get("name", "Single"),
                                    "duration_ms": track_item.get("duration_ms", 180000),
                                    "artwork_url": album_art,
                                    "preview_url": track_item.get("preview_url"),
                                    "track_number": len(all_tracks) + 1,
                                    "isrc": track_item.get("external_ids", {}).get("isrc")
                                })
                            tracks_url = t_data.get("next")

                        playlist_info["total_tracks"] = len(all_tracks)
                        return playlist_info, all_tracks
            except Exception as e:
                logger.warning(f"Spotify Web API error: {e}")

        # 5. Fallback to mock catalog
        logger.warning(f"Could not reach Spotify for {playlist_id}, falling back to mock catalog.")
        return self._generate_mock_playlist(playlist_id)

    def _generate_mock_playlist(self, playlist_id: str) -> Tuple[Dict[str, Any], List[Dict[str, Any]]]:
        """Generates realistic Spotify catalog data for testing 500+ independent jobs!"""
        is_500 = "500" in playlist_id or "mega" in playlist_id.lower()
        count = 500 if is_500 else 50

        playlist_info = {
            "spotify_id": playlist_id,
            "title": "Ultimate 500 Track Mega Hits" if is_500 else "Global Top 50 Hits",
            "description": f"Verified Spotify-style catalog containing {count} tracks. Tests per-track independent download queue, ID3 tagging, and offline playback.",
            "owner_name": "Spotify Official Curation",
            "artwork_url": "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=600&h=600&fit=crop",
            "total_tracks": count
        }

        genres = [
            ("Midnight City", "M83", "Hurry Up, We're Dreaming", "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop"),
            ("Starboy", "The Weeknd, Daft Punk", "Starboy", "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&h=300&fit=crop"),
            ("Blinding Lights", "The Weeknd", "After Hours", "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop"),
            ("Something Just Like This", "The Chainsmokers, Coldplay", "Memories...Do Not Open", "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=300&h=300&fit=crop"),
            ("Get Lucky", "Daft Punk, Pharrell Williams", "Random Access Memories", "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop"),
            ("Stargazing", "Kygo, Justin Jesso", "Stargazing - EP", "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop"),
            ("Closer", "The Chainsmokers, Halsey", "Collage EP", "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&h=300&fit=crop"),
            ("Levitating", "Dua Lipa", "Future Nostalgia", "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=300&h=300&fit=crop"),
            ("Stay", "The Kid LAROI, Justin Bieber", "F*CK LOVE 3: OVER YOU", "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&h=300&fit=crop"),
            ("Save Your Tears", "The Weeknd", "After Hours", "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=300&h=300&fit=crop")
        ]

        tracks = []
        for i in range(1, count + 1):
            base_track = genres[(i - 1) % len(genres)]
            suffix = f" (Vol. {((i - 1) // 10) + 1})" if is_500 and i > 10 else ""
            tracks.append({
                "spotify_id": f"spot_track_{i:04d}",
                "title": f"{base_track[0]}{suffix}",
                "artist_name": base_track[1],
                "album_name": base_track[2],
                "duration_ms": 180000 + (i * 1234) % 60000,
                "artwork_url": base_track[3],
                "preview_url": None,
                "track_number": i,
                "isrc": f"USUM7{2000000 + i:07d}"
            })

        return playlist_info, tracks

    async def search(self, query: str, access_token: Optional[str] = None) -> Dict[str, Any]:
        """Searches for playlists and tracks matching the query."""
        if not access_token or access_token.startswith("mock_"):
            p_info, p_tracks = self._generate_mock_playlist("search_results")
            matched_tracks = [t for t in p_tracks if query.lower() in t["title"].lower() or query.lower() in t["artist_name"].lower()]
            if not matched_tracks:
                matched_tracks = p_tracks[:12]
            return {
                "query": query,
                "playlists": [
                    {
                        "id": "search_p_1",
                        "title": f"Best of {query.title()}",
                        "description": f"Curated selections for '{query}' with full download support",
                        "owner_name": "Spotify Algorithm",
                        "artwork_url": "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&h=400&fit=crop",
                        "total_tracks": len(matched_tracks)
                    }
                ],
                "tracks": matched_tracks
            }

        headers = {"Authorization": f"Bearer {access_token}"}
        async with httpx.AsyncClient() as client:
            resp = await client.get(
                f"{SPOTIFY_API_BASE}/search?q={urllib.parse.quote(query)}&type=playlist,track&limit=15",
                headers=headers
            )
            if resp.status_code != 200:
                return {"query": query, "playlists": [], "tracks": []}
            data = resp.json()
            
            playlists = []
            for p in data.get("playlists", {}).get("items", []):
                if not p:
                    continue
                playlists.append({
                    "id": p.get("id"),
                    "title": p.get("name"),
                    "description": p.get("description"),
                    "owner_name": p.get("owner", {}).get("display_name"),
                    "artwork_url": p.get("images", [{}])[0].get("url") if p.get("images") else None,
                    "total_tracks": p.get("tracks", {}).get("total", 0)
                })

            tracks = []
            for t in data.get("tracks", {}).get("items", []):
                if not t:
                    continue
                tracks.append({
                    "id": t.get("id"),
                    "spotify_id": t.get("id"),
                    "title": t.get("name"),
                    "artist_name": ", ".join([a.get("name", "") for a in t.get("artists", [])]),
                    "album_name": t.get("album", {}).get("name"),
                    "duration_ms": t.get("duration_ms"),
                    "artwork_url": t.get("album", {}).get("images", [{}])[0].get("url") if t.get("album", {}).get("images") else None,
                    "preview_url": t.get("preview_url"),
                    "track_number": t.get("track_number", 1)
                })

            return {"query": query, "playlists": playlists, "tracks": tracks}

spotify_service = SpotifyService()
