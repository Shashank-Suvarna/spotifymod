import { Playlist, Track } from "@/types";

export const playlistCache = new Map<string, Playlist>();

const GENRES = [
  ["Midnight City", "M83", "Hurry Up, We're Dreaming", "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=300&h=300&fit=crop"],
  ["Starboy", "The Weeknd, Daft Punk", "Starboy", "https://images.unsplash.com/photo-1508700115892-45ecd05ae2ad?w=300&h=300&fit=crop"],
  ["Blinding Lights", "The Weeknd", "After Hours", "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=300&h=300&fit=crop"],
  ["Something Just Like This", "The Chainsmokers, Coldplay", "Memories...Do Not Open", "https://images.unsplash.com/photo-1492684223066-81342ee5ff30?w=300&h=300&fit=crop"],
  ["Get Lucky", "Daft Punk, Pharrell Williams", "Random Access Memories", "https://images.unsplash.com/photo-1493225457124-a3eb161ffa5f?w=300&h=300&fit=crop"],
  ["Stargazing", "Kygo, Justin Jesso", "Stargazing - EP", "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=300&h=300&fit=crop"],
  ["Closer", "The Chainsmokers, Halsey", "Collage EP", "https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=300&h=300&fit=crop"],
  ["Levitating", "Dua Lipa", "Future Nostalgia", "https://images.unsplash.com/photo-1487180144351-b8472da7d491?w=300&h=300&fit=crop"],
  ["Stay", "The Kid LAROI, Justin Bieber", "F*CK LOVE 3: OVER YOU", "https://images.unsplash.com/photo-1498038432885-c6f3f1b912ee?w=300&h=300&fit=crop"],
  ["Save Your Tears", "The Weeknd", "After Hours", "https://images.unsplash.com/photo-1511379938547-c1f69419868d?w=300&h=300&fit=crop"],
];

export function generateMockPlaylist(id: string): Playlist {
  const is500 = id.includes("500") || id.includes("mega");
  const count = is500 ? 500 : 50;
  const now = new Date().toISOString();

  const tracks: Track[] = Array.from({ length: count }, (_, i) => {
    const item = GENRES[i % GENRES.length];
    const vol = is500 && i >= 10 ? ` (Vol. ${Math.floor(i / 10) + 1})` : "";
    return {
      id: `spot_${id}_${i + 1}`,
      spotify_id: `spot_${id}_${i + 1}`,
      title: `${item[0]}${vol}`,
      artist_name: item[1],
      album_name: item[2],
      duration_ms: 180000 + ((i * 1234) % 60000),
      artwork_url: item[3],
      track_number: i + 1,
      is_offline: false,
      file_size_bytes: 0,
      audio_format: "mp3",
      bitrate_kbps: 320,
      is_favorite: false,
      created_at: now,
    };
  });

  return {
    id,
    spotify_id: id,
    title: is500 ? "500 Track Mega Playlist" : "Today's Top Hits",
    description: `Spotify playlist containing ${count} tracks. Ready for offline playback and independent downloads.`,
    owner_name: "Spotify Editorial",
    artwork_url: is500
      ? "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop"
      : "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=500&h=500&fit=crop",
    total_tracks: count,
    total_duration_ms: tracks.reduce((acc, t) => acc + t.duration_ms, 0),
    is_local: false,
    created_at: now,
    updated_at: now,
    tracks,
  };
}

export function parsePlaylistId(input: string): { id: string; type: "playlist" | "album" } {
  const cleanInput = input.trim();
  const match = cleanInput.match(/(?:playlist|album)[/:]([a-zA-Z0-9]{15,35})/);
  const type = cleanInput.includes("album") ? "album" : "playlist";
  if (match) {
    return { id: match[1], type };
  }
  const stripped = cleanInput.split("?")[0].split("/").pop()?.trim() || cleanInput;
  if (/^[a-zA-Z0-9]{15,35}$/.test(stripped)) {
    return { id: stripped, type: "playlist" };
  }
  if (cleanInput.includes("500") || cleanInput.toLowerCase().includes("mega")) {
    return { id: "demo_500_track_mega_playlist", type: "playlist" };
  }
  return { id: stripped || "today_top_hits", type: "playlist" };
}

export async function fetchSpotifyMetadata(urlOrId: string): Promise<Playlist> {
  const { id: playlistId, type } = parsePlaylistId(urlOrId);

  // Check cache first
  if (playlistCache.has(playlistId)) {
    return playlistCache.get(playlistId)!;
  }

  // Predefined presets
  if (playlistId === "demo_500_track_mega_playlist" || playlistId === "today_top_hits") {
    const pl = generateMockPlaylist(playlistId);
    playlistCache.set(playlistId, pl);
    return pl;
  }

  const now = new Date().toISOString();

  // Try fetching public embed HTML
  try {
    const embedUrl = `https://open.spotify.com/embed/${type}/${playlistId}`;
    const resp = await fetch(embedUrl, {
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      next: { revalidate: 3600 },
    });

    if (resp.ok) {
      const html = await resp.text();
      const idx = html.indexOf("__NEXT_DATA__");
      if (idx !== -1) {
        const start = html.indexOf(">", idx) + 1;
        const end = html.indexOf("</script>", start);
        if (start > 0 && end > start) {
          const parsed = JSON.parse(html.slice(start, end));
          const entity = parsed?.props?.pageProps?.state?.data?.entity;
          if (entity) {
            const title = entity.title || entity.name || "Spotify Playlist";
            const description = entity.subtitle || entity.description || `Imported Spotify ${type}`;
            const coverSources = entity.coverArt?.sources || [];
            const artworkUrl =
              coverSources[0]?.url ||
              "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=500&h=500&fit=crop";
            const ownerName = entity.subtitle || "Spotify User";

            const rawTracks = entity.trackList || [];
            const tracks: Track[] = rawTracks.map((t: any, i: number) => {
              const uri = t.uri || "";
              const trackId = uri.replace("spotify:track:", "") || `spot_${playlistId}_${i + 1}`;
              const trackTitle = t.title || "Unknown Track";
              const artistName = (t.subtitle || "Unknown Artist").replace(/\xa0/g, " ").trim();
              return {
                id: trackId,
                spotify_id: trackId,
                title: trackTitle,
                artist_name: artistName,
                album_name: title,
                duration_ms: t.duration || 180000,
                artwork_url: artworkUrl,
                track_number: i + 1,
                is_offline: false,
                file_size_bytes: 0,
                audio_format: "mp3",
                bitrate_kbps: 320,
                is_favorite: false,
                created_at: now,
              };
            });

            if (tracks.length > 0) {
              const playlist: Playlist = {
                id: playlistId,
                spotify_id: playlistId,
                title,
                description,
                owner_name: ownerName,
                artwork_url: artworkUrl,
                total_tracks: tracks.length,
                total_duration_ms: tracks.reduce((acc, tr) => acc + tr.duration_ms, 0),
                is_local: false,
                created_at: now,
                updated_at: now,
                tracks,
              };
              playlistCache.set(playlistId, playlist);
              return playlist;
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn("Server embed fetch error:", err);
  }

  // Graceful fallback
  const fallback = generateMockPlaylist(playlistId);
  playlistCache.set(playlistId, fallback);
  return fallback;
}

// Initialize with default playlists
playlistCache.set("demo_500_track_mega_playlist", generateMockPlaylist("demo_500_track_mega_playlist"));
playlistCache.set("today_top_hits", generateMockPlaylist("today_top_hits"));
