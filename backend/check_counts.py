import sqlite3

con = sqlite3.connect('spotify.db')
cur = con.cursor()
cur.execute("SELECT id, total_tracks FROM playlists WHERE spotify_id='3NeVNY4FhQhYaPl54jfIJx'")
print("Playlist row:", cur.fetchall())

cur.execute("SELECT count(1) FROM playlist_tracks pt JOIN playlists p ON pt.playlist_id = p.id WHERE p.spotify_id='3NeVNY4FhQhYaPl54jfIJx'")
print("Playlist track associations count:", cur.fetchone())

cur.execute("SELECT count(1) FROM tracks")
print("Total tracks in DB:", cur.fetchone())
