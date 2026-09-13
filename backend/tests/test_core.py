import asyncio
import os
import sys

sys.path.insert(0, os.path.abspath("."))
from mutagen.id3 import ID3
from sqlalchemy import select

from backend.app.database import init_db, AsyncSessionLocal
from backend.app.models import Playlist, Track, DownloadJob, JobStatus
from backend.app.services.spotify_service import spotify_service
from backend.app.services.audio_service import audio_service, sanitize_filename
from backend.app.services.queue_engine import queue_engine

async def test_independent_job_creation():
    print("\n--- TEST 1: Initializing DB and Verifying Independent Job Creation ---")
    await init_db()

    # Verify mock 500-track generation
    p_info, tracks = spotify_service._generate_mock_playlist("demo_500_track_mega_playlist")
    assert len(tracks) == 500, f"Expected 500 tracks, got {len(tracks)}"
    print(f"Verified {len(tracks)} tracks generated for playlist '{p_info['title']}'")

    async with AsyncSessionLocal() as session:
        # Create test playlist
        p = Playlist(
            title="500 Independent Test",
            total_tracks=len(tracks)
        )
        session.add(p)
        await session.flush()

        # Insert 5 test tracks
        test_tracks = []
        for i in range(5):
            t = Track(
                title=f"Independent Track {i+1}",
                artist_name="Test Artist",
                album_name="Test Album",
                track_number=i+1
            )
            session.add(t)
            test_tracks.append(t)
        await session.flush()

        # CORE REQUIREMENT: Create 5 INDEPENDENT jobs (1 per track)
        for idx, t in enumerate(test_tracks):
            job = DownloadJob(
                track_id=t.id,
                playlist_id=p.id,
                status=JobStatus.PENDING,
                priority=idx+1
            )
            session.add(job)
        await session.commit()

        # Verify 5 distinct job records exist
        job_stmt = select(DownloadJob).where(DownloadJob.playlist_id == p.id)
        res = await session.execute(job_stmt)
        jobs = res.scalars().all()
        assert len(jobs) == 5, f"Expected 5 independent jobs, got {len(jobs)}"
        print(f"SUCCESS: Created {len(jobs)} independent track jobs for playlist {p.id}")

        # Test Per-Job Control: Pause Job 2, Cancel Job 3
        job2 = jobs[1]
        job3 = jobs[2]
        await queue_engine.pause_job(job2.id)
        await queue_engine.cancel_job(job3.id)

        # Re-check statuses in DB with fresh session
        async with AsyncSessionLocal() as check_session:
            res = await check_session.execute(select(DownloadJob).where(DownloadJob.id.in_([job2.id, job3.id])))
            updated_jobs = {j.id: j.status for j in res.scalars().all()}
            assert updated_jobs[job2.id] == JobStatus.PAUSED, f"Job 2 should be PAUSED, was {updated_jobs[job2.id]}"
            assert updated_jobs[job3.id] == JobStatus.CANCELLED, f"Job 3 should be CANCELLED, was {updated_jobs[job3.id]}"
            print(f"SUCCESS: Job {job2.id} paused independently, Job {job3.id} cancelled independently.")

            # Test Resume Job 2
            await queue_engine.resume_job(job2.id)
            res2 = await check_session.execute(select(DownloadJob).where(DownloadJob.id == job2.id))
            j2_res = res2.scalar_one()
            # If session is still holding it, expire or query fresh
        
        async with AsyncSessionLocal() as check_session2:
            res3 = await check_session2.execute(select(DownloadJob).where(DownloadJob.id == job2.id))
            j2_res = res3.scalar_one()
            assert j2_res.status == JobStatus.PENDING, f"Job 2 should be PENDING after resume, was {j2_res.status}"
            print(f"SUCCESS: Job {job2.id} resumed independently back to PENDING.")

async def test_audio_download_and_id3():
    print("\n--- TEST 2: Audio Synthesis, Download and ID3 Tagging ---")
    file_path = await audio_service.download_track_audio(
        title="Test Song With ID3",
        artist_name="Deepmind Acoustic",
        album_name="Neural Grooves",
        track_number=7,
        duration_ms=5000,
        artwork_url=None,
        preview_url=None
    )
    abs_path = audio_service.storage.get_file_path(file_path)
    assert abs_path is not None and os.path.isfile(abs_path), f"File should exist at {abs_path}"
    print(f"Audio file saved to {abs_path} (size: {os.path.getsize(abs_path)} bytes)")

    # Verify ID3 tags
    tags = ID3(abs_path)
    title = str(tags.get("TIT2"))
    artist = str(tags.get("TPE1"))
    album = str(tags.get("TALB"))
    track_num = str(tags.get("TRCK"))

    assert title == "Test Song With ID3", f"Expected title 'Test Song With ID3', got '{title}'"
    assert artist == "Deepmind Acoustic", f"Expected artist 'Deepmind Acoustic', got '{artist}'"
    assert album == "Neural Grooves", f"Expected album 'Neural Grooves', got '{album}'"
    assert track_num == "7", f"Expected track 7, got '{track_num}'"
    print("SUCCESS: ID3v2 tags verified accurately inside the saved MP3 file!")

async def run_all():
    await test_independent_job_creation()
    await test_audio_download_and_id3()
    print("\n================ ALL BACKEND CORE TESTS PASSED ================\n")

if __name__ == "__main__":
    asyncio.run(run_all())
