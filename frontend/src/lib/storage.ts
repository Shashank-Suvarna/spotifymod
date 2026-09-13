import { Track, Playlist, DownloadJob } from "@/types";

const DB_NAME = "aura_stream_db";
const DB_VERSION = 1;

export interface StorageEstimateInfo {
  usedBytes: number;
  quotaBytes: number;
  trackCount: number;
}

class LocalMusicStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  private getDB(): Promise<IDBDatabase> {
    if (typeof window === "undefined") {
      return Promise.reject(new Error("IndexedDB is only available in browser"));
    }

    if (this.dbPromise) return this.dbPromise;

    this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Metadata: Tracks store
        if (!db.objectStoreNames.contains("tracks")) {
          const trackStore = db.createObjectStore("tracks", { keyPath: "id" });
          trackStore.createIndex("title", "title", { unique: false });
          trackStore.createIndex("artist_name", "artist_name", { unique: false });
          trackStore.createIndex("is_offline", "is_offline", { unique: false });
        }

        // Metadata: Playlists store
        if (!db.objectStoreNames.contains("playlists")) {
          db.createObjectStore("playlists", { keyPath: "id" });
        }

        // Binary: Audio Blobs store (offline playable files)
        if (!db.objectStoreNames.contains("audioBlobs")) {
          db.createObjectStore("audioBlobs", { keyPath: "trackId" });
        }

        // Playback Positions
        if (!db.objectStoreNames.contains("playbackPositions")) {
          db.createObjectStore("playbackPositions", { keyPath: "trackId" });
        }

        // Offline Download Jobs state
        if (!db.objectStoreNames.contains("downloadJobs")) {
          db.createObjectStore("downloadJobs", { keyPath: "id" });
        }
      };

      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });

    return this.dbPromise;
  }

  // --- Track Storage ---
  async saveTrack(track: Track, audioBlob?: Blob): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["tracks", "audioBlobs"], "readwrite");
      const trackStore = tx.objectStore("tracks");
      const blobStore = tx.objectStore("audioBlobs");

      trackStore.put({ ...track, is_offline: true });

      if (audioBlob) {
        blobStore.put({
          trackId: track.id,
          blob: audioBlob,
          size: audioBlob.size,
          type: audioBlob.type || "audio/mpeg",
          savedAt: new Date().toISOString(),
        });
      }

      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getTrack(trackId: string): Promise<Track | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tracks", "readonly");
      const store = tx.objectStore("tracks");
      const req = store.get(trackId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAudioBlob(trackId: string): Promise<Blob | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("audioBlobs", "readonly");
      const store = tx.objectStore("audioBlobs");
      const req = store.get(trackId);
      req.onsuccess = () => {
        if (req.result && req.result.blob) {
          resolve(req.result.blob);
        } else {
          resolve(undefined);
        }
      };
      req.onerror = () => reject(req.error);
    });
  }

  async hasTrack(trackId: string): Promise<boolean> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("audioBlobs", "readonly");
      const store = tx.objectStore("audioBlobs");
      const req = store.count(trackId);
      req.onsuccess = () => resolve(req.result > 0);
      req.onerror = () => reject(req.error);
    });
  }

  async deleteTrack(trackId: string): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(["tracks", "audioBlobs", "playbackPositions"], "readwrite");
      tx.objectStore("tracks").delete(trackId);
      tx.objectStore("audioBlobs").delete(trackId);
      tx.objectStore("playbackPositions").delete(trackId);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getAllTracks(): Promise<Track[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("tracks", "readonly");
      const store = tx.objectStore("tracks");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Playlists Storage ---
  async savePlaylist(playlist: Playlist): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("playlists", "readwrite");
      const store = tx.objectStore("playlists");
      store.put(playlist);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPlaylist(id: string): Promise<Playlist | undefined> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("playlists", "readonly");
      const store = tx.objectStore("playlists");
      const req = store.get(id);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async getAllPlaylists(): Promise<Playlist[]> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("playlists", "readonly");
      const store = tx.objectStore("playlists");
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  // --- Playback Positions ---
  async savePlaybackPosition(trackId: string, positionSeconds: number): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("playbackPositions", "readwrite");
      tx.objectStore("playbackPositions").put({
        trackId,
        position: positionSeconds,
        updatedAt: Date.now(),
      });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }

  async getPlaybackPosition(trackId: string): Promise<number> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction("playbackPositions", "readonly");
      const req = tx.objectStore("playbackPositions").get(trackId);
      req.onsuccess = () => {
        resolve(req.result?.position || 0);
      };
      req.onerror = () => resolve(0);
    });
  }

  // --- Offline Search ---
  async searchOffline(query: string): Promise<{ tracks: Track[]; playlists: Playlist[] }> {
    const q = query.trim().toLowerCase();
    if (!q) return { tracks: [], playlists: [] };

    const [allTracks, allPlaylists] = await Promise.all([
      this.getAllTracks(),
      this.getAllPlaylists(),
    ]);

    const matchingTracks = allTracks.filter(
      (t) =>
        t.title.toLowerCase().includes(q) ||
        t.artist_name.toLowerCase().includes(q) ||
        t.album_name.toLowerCase().includes(q)
    );

    const matchingPlaylists = allPlaylists.filter(
      (p) =>
        p.title.toLowerCase().includes(q) ||
        (p.description && p.description.toLowerCase().includes(q))
    );

    return { tracks: matchingTracks, playlists: matchingPlaylists };
  }

  // --- Storage Estimation & Cleanup ---
  async estimateStorage(): Promise<StorageEstimateInfo> {
    let usedBytes = 0;
    let quotaBytes = 0;
    let trackCount = 0;

    if (typeof navigator !== "undefined" && navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        usedBytes = estimate.usage || 0;
        quotaBytes = estimate.quota || 0;
      } catch (e) {
        console.warn("Storage estimate error:", e);
      }
    }

    try {
      const tracks = await this.getAllTracks();
      trackCount = tracks.length;
      if (usedBytes === 0) {
        usedBytes = tracks.reduce((acc, t) => acc + (t.file_size_bytes || 8 * 1024 * 1024), 0);
      }
    } catch {
      // ignore
    }

    return { usedBytes, quotaBytes, trackCount };
  }

  async clearAllOfflineStorage(): Promise<void> {
    const db = await this.getDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(
        ["tracks", "audioBlobs", "playbackPositions", "downloadJobs"],
        "readwrite"
      );
      tx.objectStore("tracks").clear();
      tx.objectStore("audioBlobs").clear();
      tx.objectStore("playbackPositions").clear();
      tx.objectStore("downloadJobs").clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  }
}

export const localMusicStorage = new LocalMusicStorage();
