"""Bootstrap or reset an interpretation system user.

Run after the first `alembic upgrade head` to create the initial admin.
Idempotent: if a user with the email already exists, the password is reset.

Usage:
  python -m scripts.bootstrap_user --email admin@example.com \
                                   --display-name "Takehiro Terai" \
                                   --role admin
  # password is read from stdin (or env BOOTSTRAP_PASSWORD)
"""

from __future__ import annotations

import argparse
import asyncio
import getpass
import os
import sys

from sqlalchemy import select

from app.auth import hash_password
from app.config import get_settings
from app.db import models as m
from app.db.session import make_engine, make_sessionmaker


async def upsert_user(
    email: str, password: str, display_name: str | None, role: str
) -> None:
    settings = get_settings()
    engine = make_engine(settings)
    sm = make_sessionmaker(engine)

    async with sm() as db:
        existing = (
            await db.execute(select(m.User).where(m.User.email == email))
        ).scalar_one_or_none()
        if existing is None:
            user = m.User(
                email=email.lower(),
                display_name=display_name,
                role=role,
                password_hash=hash_password(password),
            )
            db.add(user)
            action = "created"
        else:
            existing.password_hash = hash_password(password)
            if display_name:
                existing.display_name = display_name
            existing.role = role
            user = existing
            action = "updated"
        await db.commit()
        await db.refresh(user)
        print(f"[bootstrap_user] {action} {user.email} ({user.role}) id={user.id}")

    await engine.dispose()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--email", required=True)
    ap.add_argument("--display-name", default=None)
    ap.add_argument("--role", choices=["admin", "operator"], default="admin")
    args = ap.parse_args()

    pw = os.environ.get("BOOTSTRAP_PASSWORD")
    if not pw:
        if sys.stdin.isatty():
            pw = getpass.getpass("password: ")
        else:
            pw = sys.stdin.readline().strip()
    if not pw or len(pw) < 8:
        print("[bootstrap_user] password must be >= 8 chars", file=sys.stderr)
        return 2

    asyncio.run(upsert_user(args.email.lower(), pw, args.display_name, args.role))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
