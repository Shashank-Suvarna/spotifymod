import os
import asyncio
import time
import logging
from datetime import datetime
from typing import Dict, List, Optional, Set
from sqlalchemy import select, update, delete, func
from sqlalchemy.orm import selectinload

from backend.app.config import settings
from backend.app.database import AsyncSessionLocal
from backend.app.models import DownloadJob, Track, JobStatus, UserSettings
from backend.app.services.audio_service import audio_service
from backend.app.services.ws_manager import ws_manager

logger = logging.getLogger(__name__)

class QueueEngine:
    def __init__(self):
        self.concurrency_limit = 3
        self.running_jobs: Dict[str, asyncio.Task] = {}
        self.job_cancellation_flags: Dict[str, bool] = {}
        self.is_running = False
        self._worker_tasks: List[asyncio.Task] = []
        self._notify_event = asyncio.Event()

    async def start(self):
        """Starts background worker pool."""
        if self.is_running:
            return
        self.is_running = True
        logger.info(f"Starting QueueEngine with concurrency limit {self.concurrency_limit}")
        for i in range(self.concurrency_limit):
            task = asyncio.create_task(self._worker_loop(worker_id=i))
            self._worker_tasks.append(task)

    async def stop(self):
        """Stops background workers."""
        self.is_running = False
        self._notify_event.set()
        for task in self._worker_tasks:
            task.cancel()
        for job_id, task in list(self.running_jobs.items()):
            self.job_cancellation_flags[job_id] = True
            task.cancel()

    def set_concurrency(self, limit: int):
        self.concurrency_limit = max(1, min(limit, 10))
        logger.info(f"Concurrency limit updated to {self.concurrency_limit}")

    def notify_new_job(self):
        """Wakes up idle workers."""
        self._notify_event.set()

    async def _worker_loop(self, worker_id: int):
        logger.info(f"QueueEngine worker-{worker_id} started")
        while self.is_running:
            try:
                job_id = await self._acquire_next_job()
                if not job_id:
                    self._notify_event.clear()
                    try:
                        await asyncio.wait_for(self._notify_event.wait(), timeout=2.0)
                    except asyncio.TimeoutError:
                        pass
                    continue

                # Run this job
                await self._process_job(job_id)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Worker {worker_id} encountered error: {e}", exc_info=True)
                await asyncio.sleep(1.0)

    async def _acquire_next_job(self) -> Optional[str]:
        """Atomically picks next PENDING job ordered by priority and creation time."""
        async with AsyncSessionLocal() as session:
            # Check currently running count
            active_count = len(self.running_jobs)
            if active_count >= self.concurrency_limit:
                return None

            stmt = (
                select(DownloadJob.id)
                .where(DownloadJob.status == JobStatus.PENDING)
                .order_by(DownloadJob.priority.asc(), DownloadJob.created_at.asc())
                .limit(1)
            )
            result = await session.execute(stmt)
            job_id = result.scalar_one_or_none()

            if job_id and job_id not in self.running_jobs:
                # Mark as DOWNLOADING
                await session.execute(
                    update(DownloadJob)
                    .where(DownloadJob.id == job_id)
                    .values(
                        status=JobStatus.DOWNLOADING,
                        started_at=datetime.utcnow()
                    )
                )
                await session.commit()
                return job_id
            return None

    async def _process_job(self, job_id: str):
        self.job_cancellation_flags[job_id] = False
        current_task = asyncio.current_task()
        self.running_jobs[job_id] = current_task

        # Broadcast status changed
        await ws_manager.broadcast("JOB_STATUS_CHANGED", {
            "job_id": job_id,
            "status": JobStatus.DOWNLOADING.value
        })

        last_ws_emit = time.time()

        def progress_callback(downloaded: int, total: int, speed: float, eta: int):
            nonlocal last_ws_emit
            now = time.time()
            if now - last_ws_emit >= 0.25:
                pct = round((downloaded / total) * 100, 1) if total > 0 else 0.0
                asyncio.create_task(
                    ws_manager.broadcast("JOB_PROGRESS", {
                        "job_id": job_id,
                        "bytes_downloaded": downloaded,
                        "total_bytes": total,
                        "progress_percent": pct,
                        "speed_bytes_per_sec": speed,
                        "eta_seconds": eta
                    })
                )
                last_ws_emit = now

        def check_cancelled() -> bool:
            return self.job_cancellation_flags.get(job_id, False)

        try:
            # 1. Fetch track details
            async with AsyncSessionLocal() as session:
                job_stmt = select(DownloadJob).options(selectinload(DownloadJob.track)).where(DownloadJob.id == job_id)
                res = await session.execute(job_stmt)
                job = res.scalar_one_or_none()
                if not job or not job.track:
                    raise Exception("Track or Job not found in database")

                track = job.track
                track_title = track.title
                artist_name = track.artist_name
                album_name = track.album_name
                track_number = track.track_number
                duration_ms = track.duration_ms
                artwork_url = track.artwork_url
                preview_url = track.preview_url

            # 2. Perform audio download and ID3 tagging
            rel_file_path = await audio_service.download_track_audio(
                title=track_title,
                artist_name=artist_name,
                album_name=album_name,
                track_number=track_number,
                duration_ms=duration_ms,
                artwork_url=artwork_url,
                preview_url=preview_url,
                progress_callback=progress_callback,
                check_cancelled=check_cancelled
            )

            # 3. Update Database to COMPLETED
            async with AsyncSessionLocal() as session:
                job_stmt = select(DownloadJob).options(selectinload(DownloadJob.track)).where(DownloadJob.id == job_id)
                res = await session.execute(job_stmt)
                job = res.scalar_one_or_none()
                
                if job and not self.job_cancellation_flags.get(job_id, False):
                    job.status = JobStatus.COMPLETED
                    job.progress_percent = 100.0
                    job.completed_at = datetime.utcnow()
                    
                    if job.track:
                        job.track.is_offline = True
                        job.track.local_file_path = rel_file_path
                        job.track.audio_format = "m4a" if rel_file_path.endswith(".m4a") else "mp3"
                        job.track.bitrate_kbps = 256
                        abs_p = os.path.join(settings.STORAGE_PATH, rel_file_path)
                        if os.path.isfile(abs_p):
                            job.track.file_size_bytes = os.path.getsize(abs_p)

                    await session.commit()

                    await ws_manager.broadcast("JOB_STATUS_CHANGED", {
                        "job_id": job_id,
                        "track_id": job.track_id,
                        "status": JobStatus.COMPLETED.value,
                        "progress_percent": 100.0,
                        "is_offline": True,
                        "local_file_path": rel_file_path
                    })

        except Exception as e:
            err_msg = str(e)
            logger.warning(f"Job {job_id} stopped with message: {err_msg}")
            
            async with AsyncSessionLocal() as session:
                job_stmt = select(DownloadJob).where(DownloadJob.id == job_id)
                res = await session.execute(job_stmt)
                job = res.scalar_one_or_none()
                if job:
                    # If cancelled or paused flag was set
                    if "Job cancelled" in err_msg or self.job_cancellation_flags.get(job_id) == "CANCELLED":
                        job.status = JobStatus.CANCELLED
                    elif "Job paused" in err_msg or self.job_cancellation_flags.get(job_id) == "PAUSED":
                        job.status = JobStatus.PAUSED
                    else:
                        job.status = JobStatus.FAILED
                        job.error_message = err_msg

                    await session.commit()
                    await ws_manager.broadcast("JOB_STATUS_CHANGED", {
                        "job_id": job_id,
                        "status": job.status.value,
                        "error_message": job.error_message
                    })
        finally:
            self.running_jobs.pop(job_id, None)
            self.job_cancellation_flags.pop(job_id, None)
            # Wake up next pending job
            self.notify_new_job()

    # Per-Job Independent Control Actions
    async def pause_job(self, job_id: str) -> bool:
        """Independently pauses a track job."""
        if job_id in self.running_jobs:
            self.job_cancellation_flags[job_id] = "PAUSED"
            task = self.running_jobs[job_id]
            task.cancel()
        
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(status=JobStatus.PAUSED)
            )
            await session.commit()

        await ws_manager.broadcast("JOB_STATUS_CHANGED", {
            "job_id": job_id,
            "status": JobStatus.PAUSED.value
        })
        return True

    async def resume_job(self, job_id: str) -> bool:
        """Independently resumes a paused track job."""
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(status=JobStatus.PENDING)
            )
            await session.commit()

        self.notify_new_job()
        await ws_manager.broadcast("JOB_STATUS_CHANGED", {
            "job_id": job_id,
            "status": JobStatus.PENDING.value
        })
        return True

    async def cancel_job(self, job_id: str) -> bool:
        """Independently cancels an active or pending track job."""
        if job_id in self.running_jobs:
            self.job_cancellation_flags[job_id] = "CANCELLED"
            task = self.running_jobs[job_id]
            task.cancel()

        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(status=JobStatus.CANCELLED)
            )
            await session.commit()

        await ws_manager.broadcast("JOB_STATUS_CHANGED", {
            "job_id": job_id,
            "status": JobStatus.CANCELLED.value
        })
        return True

    async def skip_job(self, job_id: str) -> bool:
        """Independently skips a track job."""
        if job_id in self.running_jobs:
            self.job_cancellation_flags[job_id] = "CANCELLED"
            task = self.running_jobs[job_id]
            task.cancel()

        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(status=JobStatus.SKIPPED)
            )
            await session.commit()

        self.notify_new_job()
        await ws_manager.broadcast("JOB_STATUS_CHANGED", {
            "job_id": job_id,
            "status": JobStatus.SKIPPED.value
        })
        return True

    async def retry_job(self, job_id: str) -> bool:
        """Retries a failed, cancelled, or skipped track job."""
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.id == job_id)
                .values(
                    status=JobStatus.PENDING,
                    progress_percent=0.0,
                    bytes_downloaded=0,
                    error_message=None
                )
            )
            await session.commit()

        self.notify_new_job()
        await ws_manager.broadcast("JOB_STATUS_CHANGED", {
            "job_id": job_id,
            "status": JobStatus.PENDING.value
        })
        return True

    async def remove_job(self, job_id: str) -> bool:
        """Removes a job completely from the queue."""
        if job_id in self.running_jobs:
            self.job_cancellation_flags[job_id] = "CANCELLED"
            self.running_jobs[job_id].cancel()

        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(DownloadJob).where(DownloadJob.id == job_id)
            )
            await session.commit()

        await ws_manager.broadcast("JOB_REMOVED", {"job_id": job_id})
        return True

    async def reorder_jobs(self, job_ids: List[str]) -> bool:
        """Reorders jobs by updating their priority values."""
        async with AsyncSessionLocal() as session:
            for idx, job_id in enumerate(job_ids):
                await session.execute(
                    update(DownloadJob)
                    .where(DownloadJob.id == job_id)
                    .values(priority=idx + 1)
                )
            await session.commit()

        await ws_manager.broadcast("QUEUE_REORDERED", {"job_ids": job_ids})
        return True

    # Bulk actions
    async def pause_all(self):
        for jid in list(self.running_jobs.keys()):
            await self.pause_job(jid)
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.status == JobStatus.PENDING)
                .values(status=JobStatus.PAUSED)
            )
            await session.commit()
        await ws_manager.broadcast("QUEUE_BULK_ACTION", {"action": "PAUSE_ALL"})

    async def resume_all(self):
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.status == JobStatus.PAUSED)
                .values(status=JobStatus.PENDING)
            )
            await session.commit()
        self.notify_new_job()
        await ws_manager.broadcast("QUEUE_BULK_ACTION", {"action": "RESUME_ALL"})

    async def cancel_all(self):
        for jid in list(self.running_jobs.keys()):
            await self.cancel_job(jid)
        async with AsyncSessionLocal() as session:
            await session.execute(
                update(DownloadJob)
                .where(DownloadJob.status == JobStatus.PENDING)
                .values(status=JobStatus.CANCELLED)
            )
            await session.commit()
        await ws_manager.broadcast("QUEUE_BULK_ACTION", {"action": "CANCEL_ALL"})

    async def clear_completed(self):
        async with AsyncSessionLocal() as session:
            await session.execute(
                delete(DownloadJob).where(
                    DownloadJob.status.in_([JobStatus.COMPLETED, JobStatus.CANCELLED, JobStatus.SKIPPED])
                )
            )
            await session.commit()
        await ws_manager.broadcast("QUEUE_BULK_ACTION", {"action": "CLEAR_COMPLETED"})

queue_engine = QueueEngine()
