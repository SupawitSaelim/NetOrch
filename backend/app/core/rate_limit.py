"""Simple in-memory rate limiter for critical endpoints.

Uses a sliding-window approach per client IP.
No external dependencies required.
"""

from __future__ import annotations

import time
from collections import defaultdict
from typing import Callable

from fastapi import HTTPException, Request, status


class RateLimiter:
    """In-memory sliding-window rate limiter."""

    def __init__(self, max_requests: int = 5, window_seconds: int = 60) -> None:
        self.max_requests = max_requests
        self.window = window_seconds
        self._hits: dict[str, list[float]] = defaultdict(list)

    def _cleanup(self, key: str) -> None:
        cutoff = time.monotonic() - self.window
        self._hits[key] = [t for t in self._hits[key] if t > cutoff]

    def check(self, key: str) -> None:
        """Raise 429 if the key has exceeded the rate limit."""
        self._cleanup(key)
        if len(self._hits[key]) >= self.max_requests:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Try again in {self.window} seconds.",
            )
        self._hits[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        """Reset rate limit for a key (e.g., on successful login)."""
        self._hits.pop(key, None)


# Pre-configured limiters
login_limiter = RateLimiter(max_requests=5, window_seconds=60)
