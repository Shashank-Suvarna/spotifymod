from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from datetime import datetime, timedelta

from backend.app.database import get_db
from backend.app.models import User
from backend.app.schemas import UserProfileResponse
from backend.app.services.spotify_service import spotify_service
from backend.app.config import settings

router = APIRouter(prefix="/api/auth", tags=["Authentication"])

@router.get("/spotify/login")
async def spotify_login():
    """Returns the Spotify OAuth login redirect URL."""
    auth_url = spotify_service.get_auth_url()
    return {"auth_url": auth_url}

@router.get("/spotify/callback")
async def spotify_callback(
    code: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db)
):
    """Handles callback from Spotify OAuth redirect."""
    if error or not code:
        return RedirectResponse(f"{settings.FRONTEND_URL}?auth_error={error or 'cancelled'}")

    try:
        tokens = await spotify_service.exchange_code_for_token(code)
        access_token = tokens.get("access_token")
        refresh_token = tokens.get("refresh_token")
        expires_in = tokens.get("expires_in", 3600)

        profile = await spotify_service.get_current_user_profile(access_token)
        spotify_id = profile.get("id")
        display_name = profile.get("display_name") or "Spotify Explorer"
        email = profile.get("email")
        images = profile.get("images", [])
        avatar_url = images[0].get("url") if images else None

        # Find or create user
        stmt = select(User).where(User.spotify_id == spotify_id)
        res = await db.execute(stmt)
        user = res.scalar_one_or_none()

        if not user:
            user = User(
                spotify_id=spotify_id,
                display_name=display_name,
                email=email,
                avatar_url=avatar_url,
                access_token=access_token,
                refresh_token=refresh_token,
                token_expires_at=datetime.utcnow() + timedelta(seconds=expires_in),
                is_spotify_connected=True
            )
            db.add(user)
        else:
            user.display_name = display_name
            user.email = email
            user.avatar_url = avatar_url
            user.access_token = access_token
            if refresh_token:
                user.refresh_token = refresh_token
            user.token_expires_at = datetime.utcnow() + timedelta(seconds=expires_in)
            user.is_spotify_connected = True

        await db.commit()
        return RedirectResponse(f"{settings.FRONTEND_URL}?connected=true")

    except Exception as e:
        return RedirectResponse(f"{settings.FRONTEND_URL}?auth_error={str(e)}")

@router.get("/me", response_model=UserProfileResponse)
async def get_me(db: AsyncSession = Depends(get_db)):
    """Gets connected user profile."""
    stmt = select(User).order_by(User.created_at.desc()).limit(1)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        # Create default local user
        user = User(
            spotify_id=None,
            display_name="Guest Music Lover",
            is_spotify_connected=False
        )
        db.add(user)
        await db.commit()
        await db.refresh(user)

    return user

@router.post("/demo-login", response_model=UserProfileResponse)
async def demo_login(db: AsyncSession = Depends(get_db)):
    """Simulates immediate Spotify connection for demonstration and development."""
    stmt = select(User).order_by(User.created_at.desc()).limit(1)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()

    if not user:
        user = User()
        db.add(user)

    user.spotify_id = "spotify_premium_demo"
    user.display_name = "Alex Vance (Spotify Connected)"
    user.email = "alex.vance@soundvault.fm"
    user.avatar_url = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=300&h=300&fit=crop"
    user.is_spotify_connected = True
    user.access_token = "mock_spotify_token"
    
    await db.commit()
    await db.refresh(user)
    return user

@router.post("/disconnect", response_model=UserProfileResponse)
async def disconnect_spotify(db: AsyncSession = Depends(get_db)):
    """Disconnects Spotify account."""
    stmt = select(User).order_by(User.created_at.desc()).limit(1)
    res = await db.execute(stmt)
    user = res.scalar_one_or_none()
    if user:
        user.is_spotify_connected = False
        user.access_token = None
        user.refresh_token = None
        user.display_name = "Offline User"
        await db.commit()
        await db.refresh(user)
        return user
    raise HTTPException(status_code=404, detail="User not found")
