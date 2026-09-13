import os
from abc import ABC, abstractmethod
from typing import Optional, BinaryIO
from backend.app.config import settings

class StorageInterface(ABC):
    @abstractmethod
    def save_file(self, relative_path: str, data: bytes) -> str:
        """Saves bytes to the destination path and returns the absolute or canonical uri."""
        pass

    @abstractmethod
    def get_file_path(self, relative_path: str) -> Optional[str]:
        """Returns local absolute path if available on disk, else None."""
        pass

    @abstractmethod
    def file_exists(self, relative_path: str) -> bool:
        """Checks if file exists."""
        pass

    @abstractmethod
    def get_file_size(self, relative_path: str) -> int:
        """Gets file size in bytes."""
        pass

    @abstractmethod
    def delete_file(self, relative_path: str) -> bool:
        """Deletes file."""
        pass


class LocalStorageProvider(StorageInterface):
    def __init__(self, base_path: Optional[str] = None):
        self.base_path = os.path.abspath(base_path or settings.STORAGE_PATH)
        os.makedirs(self.base_path, exist_ok=True)

    def _full_path(self, relative_path: str) -> str:
        # Sanitize path to prevent path traversal
        clean_rel = os.path.normpath(relative_path).lstrip("/\\")
        return os.path.join(self.base_path, clean_rel)

    def save_file(self, relative_path: str, data: bytes) -> str:
        full_path = self._full_path(relative_path)
        os.makedirs(os.path.dirname(full_path), exist_ok=True)
        with open(full_path, "wb") as f:
            f.write(data)
        return full_path

    def get_file_path(self, relative_path: str) -> Optional[str]:
        full_path = self._full_path(relative_path)
        if os.path.isfile(full_path):
            return full_path
        return None

    def file_exists(self, relative_path: str) -> bool:
        return os.path.isfile(self._full_path(relative_path))

    def get_file_size(self, relative_path: str) -> int:
        full_path = self._full_path(relative_path)
        if os.path.isfile(full_path):
            return os.path.getsize(full_path)
        return 0

    def delete_file(self, relative_path: str) -> bool:
        full_path = self._full_path(relative_path)
        if os.path.isfile(full_path):
            try:
                os.remove(full_path)
                return True
            except OSError:
                return False
        return False


class S3StorageProvider(StorageInterface):
    """S3 compatible storage provider stub for future cloud scale."""
    def __init__(self):
        self.bucket = settings.S3_BUCKET_NAME

    def save_file(self, relative_path: str, data: bytes) -> str:
        # In real AWS S3 environment, boto3.client('s3').put_object(...)
        # Fallback to local for now
        return LocalStorageProvider().save_file(relative_path, data)

    def get_file_path(self, relative_path: str) -> Optional[str]:
        return LocalStorageProvider().get_file_path(relative_path)

    def file_exists(self, relative_path: str) -> bool:
        return LocalStorageProvider().file_exists(relative_path)

    def get_file_size(self, relative_path: str) -> int:
        return LocalStorageProvider().get_file_size(relative_path)

    def delete_file(self, relative_path: str) -> bool:
        return LocalStorageProvider().delete_file(relative_path)


def get_storage() -> StorageInterface:
    if settings.STORAGE_BACKEND == "s3" and settings.S3_ACCESS_KEY:
        return S3StorageProvider()
    return LocalStorageProvider()
