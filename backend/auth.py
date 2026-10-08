import os
import time
import httpx
from pathlib import Path
from dotenv import load_dotenv
from jose import jwt, JWTError
from fastapi import HTTPException, Header

load_dotenv(Path(__file__).with_name(".env"))


def _issuer() -> str:
    return os.getenv("SUPABASE_URL", "").rstrip("/") + "/auth/v1"

_jwks_cache: dict | None = None
_jwks_cache_time: float = 0
JWKS_CACHE_TTL = 3600  # 1 hour


async def _get_jwks() -> dict:
    global _jwks_cache, _jwks_cache_time
    now = time.time()
    if _jwks_cache and (now - _jwks_cache_time) < JWKS_CACHE_TTL:
        return _jwks_cache
    if not os.getenv("SUPABASE_URL"):
        raise HTTPException(status_code=503, detail="Authentication is not configured.")
    jwks_url = os.getenv("SUPABASE_JWKS_URL") or f"{_issuer()}/.well-known/jwks.json"
    async with httpx.AsyncClient() as client:
        response = await client.get(jwks_url, timeout=10.0)
        response.raise_for_status()
        _jwks_cache = response.json()
        _jwks_cache_time = now
    return _jwks_cache


async def verify_token(token: str) -> dict:
    try:
        header = jwt.get_unverified_header(token)
        algorithm = header.get("alg", "RS256")
        supported = {"RS256", "ES256"}
        if algorithm not in supported:
            raise HTTPException(status_code=401, detail=f"Unsupported algorithm: {algorithm}")

        jwks = await _get_jwks()
        kid = header.get("kid")

        # Never accept an unrelated key when a token's key ID is unknown.
        key = next(
            (k for k in jwks.get("keys", []) if k.get("kid") == kid),
            None,
        )
        if not key:
            raise HTTPException(status_code=401, detail="No matching JWKS key found")

        payload = jwt.decode(
            token,
            key,
            algorithms=["RS256", "ES256"],
            audience="authenticated",
            issuer=_issuer(),
            options={"require_exp": True, "require_sub": True, "require_aud": True, "require_iss": True},
        )
        if payload.get("role") != "authenticated" or not payload.get("sub"):
            raise HTTPException(status_code=401, detail="Expected an authenticated user token.")
        return payload

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication token.")
    except HTTPException:
        raise
    except Exception:
        raise HTTPException(status_code=401, detail="Unable to verify authentication token.")


async def get_current_user(authorization: str = Header(...)) -> dict:
    if not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Expected 'Bearer <token>' in Authorization header")
    return await verify_token(authorization[7:])
