"""
Targeted backfill by conversation created_at (ingest.py only does updated_at).
Pulls CR-inbox conversations CREATED within [BACKFILL_START, BACKFILL_END) and
upserts them (new ones become pending_scoring, then run scoring_worker.py).

Usage:
    BACKFILL_START=2025-04-01 BACKFILL_END=2025-04-24 python backfill_range.py
"""
from __future__ import annotations
import asyncio
import calendar
import datetime
import os

from dotenv import load_dotenv

from intercom_client import IntercomClient
import ingest

load_dotenv()


def to_ts(s: str) -> int:
    y, m, d = (int(x) for x in s.split("-"))
    return calendar.timegm(datetime.date(y, m, d).timetuple())


async def search_created(client: IntercomClient, inbox: str, lo: int, hi: int,
                         page_size: int = 50, max_pages: int = 2000) -> list[dict]:
    filters = [
        {"field": "team_assignee_id", "operator": "=", "value": inbox},
        {"field": "created_at", "operator": ">", "value": lo},
        {"field": "created_at", "operator": "<", "value": hi},
    ]
    query = {"operator": "AND", "value": filters}
    out: list[dict] = []
    starting_after = None
    for _ in range(max_pages):
        pagination = {"per_page": page_size}
        if starting_after:
            pagination["starting_after"] = starting_after
        data = await client._post("/conversations/search", {"query": query, "pagination": pagination})
        convs = data.get("conversations", [])
        out.extend(convs)
        nxt = data.get("pages", {}).get("next", {}) or {}
        starting_after = nxt.get("starting_after")
        if not starting_after or not convs:
            break
    return out


async def main() -> None:
    start = os.getenv("BACKFILL_START")
    end = os.getenv("BACKFILL_END")
    if not start or not end:
        raise SystemExit("Set BACKFILL_START and BACKFILL_END (YYYY-MM-DD).")
    lo, hi = to_ts(start), to_ts(end)
    print(f"Backfilling conversations created {start} .. {end}")

    async with IntercomClient(ingest.INTERCOM_API_TOKEN, ingest.INTERCOM_API_VERSION) as client:
        writer = ingest.SupabaseWriter(ingest.SUPABASE_URL, ingest.SUPABASE_SERVICE_KEY)

        admins = await client.list_admins()
        bot_ids = {a.id for a in admins if a.email and "@intercom.io" in a.email}
        await writer.upsert_agents([
            {"id": a.id, "name": a.name, "email": a.email, "avatar_url": a.avatar_url} for a in admins
        ])
        teams = await client.list_teams()
        await writer.upsert_inboxes(teams)

        cr = set(ingest.CR_INBOX_IDS)
        inboxes = [t for t in teams if str(t["id"]) in cr] if cr else teams

        synced = skipped = failed = 0
        for t in inboxes:
            inbox_id, name = str(t["id"]), t.get("name", "?")
            raw = await search_created(client, inbox_id, lo, hi, ingest.PAGE_SIZE)
            print(f"  [{name}] {len(raw)} conversations in range")
            for i, rc in enumerate(raw):
                try:
                    full = await client.get_conversation(str(rc["id"]))
                    parsed = IntercomClient.parse_conversation(full, bot_admin_ids=bot_ids)
                    if parsed.admin_reply_count == 0:
                        skipped += 1
                        continue
                    if await writer.upsert_conversation(parsed):
                        synced += 1
                    else:
                        failed += 1
                except Exception as e:  # noqa: BLE001
                    failed += 1
                    print(f"    x {rc.get('id')}: {e}")
                if (i + 1) % 50 == 0:
                    print(f"    {name}: {i+1}/{len(raw)} (synced {synced}, skipped {skipped}, failed {failed})")

        print(f"\nDone. synced={synced} skipped(no human)={skipped} failed={failed}")


if __name__ == "__main__":
    asyncio.run(main())
