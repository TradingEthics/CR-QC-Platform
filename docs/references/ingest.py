"""
CR QC Platform — Intercom → Supabase Ingestion Worker

Syncs conversations from 12 CR inboxes into Supabase.
Designed to run on a cron schedule (e.g., every 4 hours).

Usage:
    # Full sync (first run — fetches all conversations)
    python ingest.py --full

    # Incremental sync (default — fetches only new/updated since last sync)
    python ingest.py

    # Sync specific inbox only
    python ingest.py --inbox-id 12345

    # Dry run (fetch but don't write to DB)
    python ingest.py --dry-run
"""

import asyncio
import argparse
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Optional

from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from supabase import create_client, Client

from intercom_client import IntercomClient, IntercomConversation

load_dotenv()
console = Console()

# ============================================================
# Configuration
# ============================================================

INTERCOM_API_TOKEN = os.getenv("INTERCOM_API_TOKEN", "")
INTERCOM_API_VERSION = os.getenv("INTERCOM_API_VERSION", "2.11")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_KEY = os.getenv("SUPABASE_SERVICE_KEY", "")
PAGE_SIZE = int(os.getenv("INGESTION_PAGE_SIZE", "50"))
LOOKBACK_HOURS = int(os.getenv("INGESTION_LOOKBACK_HOURS", "6"))
MAX_PAGES = int(os.getenv("INGESTION_MAX_PAGES", "100"))

# Scope: the CR inboxes this project actually covers. Intercom exposes ~70 teams;
# syncing all of them pulls inboxes outside the QC remit and makes thousands of
# extra API calls. Set CR_INBOX_IDS in .env (comma-separated team IDs) to the 12
# Case Resolution inboxes once confirmed. Empty = no scoping (syncs everything).
CR_INBOX_IDS = [x.strip() for x in os.getenv("CR_INBOX_IDS", "").split(",") if x.strip()]


# ============================================================
# Supabase Writer
# ============================================================

class SupabaseWriter:
    """Writes parsed Intercom data to Supabase."""
    
    def __init__(self, url: str, key: str):
        self.client: Client = create_client(url, key)
        self._agent_cache: dict[str, str] = {}   # intercom_id → uuid
        self._inbox_cache: dict[str, str] = {}    # intercom_id → uuid
    
    # --------------------------------------------------------
    # Agent Management
    # --------------------------------------------------------
    
    async def upsert_agents(self, agents: list[dict]) -> dict[str, str]:
        """
        Upsert agents from Intercom admin list.
        Returns mapping of intercom_id → supabase uuid.
        """
        for agent in agents:
            intercom_id = str(agent["id"])
            
            # Check if exists
            result = (self.client.table("agents")
                      .select("id")
                      .eq("intercom_id", intercom_id)
                      .execute())
            
            if result.data:
                # Update existing
                self.client.table("agents").update({
                    "name": agent.get("name", "Unknown"),
                    "email": agent.get("email"),
                    "avatar_url": agent.get("avatar_url"),
                }).eq("intercom_id", intercom_id).execute()
                
                self._agent_cache[intercom_id] = result.data[0]["id"]
            else:
                # Insert new
                insert_result = (self.client.table("agents").insert({
                    "intercom_id": intercom_id,
                    "name": agent.get("name", "Unknown"),
                    "email": agent.get("email"),
                    "avatar_url": agent.get("avatar_url"),
                }).execute())
                
                if insert_result.data:
                    self._agent_cache[intercom_id] = insert_result.data[0]["id"]
        
        console.print(f"  [green]✓[/green] Synced {len(agents)} agents")
        return self._agent_cache
    
    # --------------------------------------------------------
    # Inbox Management
    # --------------------------------------------------------
    
    async def upsert_inboxes(self, teams: list[dict]) -> dict[str, str]:
        """
        Upsert inboxes from Intercom teams.
        Returns mapping of intercom_id → supabase uuid.
        """
        for team in teams:
            intercom_id = str(team["id"])
            
            result = (self.client.table("inboxes")
                      .select("id")
                      .eq("intercom_id", intercom_id)
                      .execute())
            
            if result.data:
                self.client.table("inboxes").update({
                    "name": team.get("name", "Unknown"),
                }).eq("intercom_id", intercom_id).execute()
                
                self._inbox_cache[intercom_id] = result.data[0]["id"]
            else:
                insert_result = (self.client.table("inboxes").insert({
                    "intercom_id": intercom_id,
                    "name": team.get("name", "Unknown"),
                }).execute())
                
                if insert_result.data:
                    self._inbox_cache[intercom_id] = insert_result.data[0]["id"]
        
        console.print(f"  [green]✓[/green] Synced {len(teams)} inboxes")
        return self._inbox_cache
    
    # --------------------------------------------------------
    # Conversation Ingestion
    # --------------------------------------------------------
    
    async def upsert_conversation(self, conv: IntercomConversation) -> Optional[str]:
        """
        Upsert a single conversation and its parts into Supabase.
        Returns the Supabase UUID of the conversation.
        """
        # Resolve foreign keys
        inbox_uuid = self._inbox_cache.get(conv.team_id) if conv.team_id else None
        agent_uuid = self._agent_cache.get(conv.assignee_id) if conv.assignee_id else None
        
        # Prepare conversation data
        conv_data = {
            "intercom_id": conv.id,
            "inbox_id": inbox_uuid,
            "agent_id": agent_uuid,
            "cx_score": conv.cx_score,
            "customer_name": conv.customer_name,
            "customer_email": conv.customer_email,
            "subject": conv.title,
            "intercom_created_at": conv.created_at.isoformat() if conv.created_at else None,
            "intercom_updated_at": conv.updated_at.isoformat() if conv.updated_at else None,
            "admin_reply_count": conv.admin_reply_count,
            "total_parts_count": conv.total_parts_count,
            "intercom_url": conv.intercom_url,
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
        }
        
        # Check if conversation already exists
        existing = (self.client.table("conversations")
                    .select("id, review_status")
                    .eq("intercom_id", conv.id)
                    .execute())
        
        if existing.data:
            conv_uuid = existing.data[0]["id"]
            current_status = existing.data[0]["review_status"]
            
            # Don't overwrite review_status if it's been manually set
            if current_status in ("in_review", "reviewed"):
                conv_data.pop("review_status", None)
            
            self.client.table("conversations").update(conv_data).eq("id", conv_uuid).execute()
        else:
            # New conversation — set initial status
            conv_data["review_status"] = "pending_scoring"
            
            insert_result = (self.client.table("conversations")
                             .insert(conv_data)
                             .execute())
            
            if not insert_result.data:
                console.print(f"  [red]✗[/red] Failed to insert conversation {conv.id}")
                return None
            
            conv_uuid = insert_result.data[0]["id"]
        
        # --- Upsert conversation parts ---
        # Delete existing parts and re-insert (simpler than individual upserts)
        self.client.table("conversation_parts").delete().eq("conversation_id", conv_uuid).execute()
        
        parts_to_insert = []
        for part in conv.parts:
            part_agent_uuid = None
            if part.author_type == "admin" and part.author_id:
                part_agent_uuid = self._agent_cache.get(part.author_id)
            
            parts_to_insert.append({
                "conversation_id": conv_uuid,
                "intercom_part_id": part.id,
                "author_type": part.author_type if part.author_type in ("admin", "bot", "user") else "user",
                "author_id": part.author_id,
                "agent_id": part_agent_uuid,
                "body_text": part.body_text,
                "body_html": part.body_html,
                "part_type": part.part_type,
                "sequence_order": part.sequence_order,
                "intercom_created_at": part.created_at.isoformat() if part.created_at else None,
            })
        
        if parts_to_insert:
            # Batch insert in chunks of 50
            for i in range(0, len(parts_to_insert), 50):
                chunk = parts_to_insert[i:i + 50]
                self.client.table("conversation_parts").insert(chunk).execute()
        
        return conv_uuid
    
    # --------------------------------------------------------
    # Sync State
    # --------------------------------------------------------
    
    def get_last_sync_time(self, inbox_id: str) -> Optional[datetime]:
        """Get the last sync timestamp for an inbox."""
        inbox_uuid = self._inbox_cache.get(inbox_id)
        if not inbox_uuid:
            return None
        
        result = (self.client.table("sync_state")
                  .select("last_conversation_updated_at")
                  .eq("inbox_id", inbox_uuid)
                  .execute())
        
        if result.data and result.data[0]["last_conversation_updated_at"]:
            from dateutil.parser import parse
            return parse(result.data[0]["last_conversation_updated_at"])
        
        return None
    
    def update_sync_state(self, inbox_id: str, last_updated_at: datetime, count: int):
        """Update sync state after a successful inbox sync."""
        inbox_uuid = self._inbox_cache.get(inbox_id)
        if not inbox_uuid:
            return
        
        # Upsert sync state
        existing = (self.client.table("sync_state")
                    .select("id")
                    .eq("inbox_id", inbox_uuid)
                    .execute())
        
        state_data = {
            "inbox_id": inbox_uuid,
            "last_synced_at": datetime.now(timezone.utc).isoformat(),
            "last_conversation_updated_at": last_updated_at.isoformat(),
            "conversations_synced": count,
        }
        
        if existing.data:
            (self.client.table("sync_state")
             .update(state_data)
             .eq("id", existing.data[0]["id"])
             .execute())
        else:
            self.client.table("sync_state").insert(state_data).execute()


# ============================================================
# Main Ingestion Logic
# ============================================================

async def sync_inbox(
    intercom: IntercomClient,
    writer: SupabaseWriter,
    inbox_intercom_id: str,
    inbox_name: str,
    since: Optional[datetime] = None,
    dry_run: bool = False,
    bot_admin_ids: Optional[set] = None,
) -> int:
    """
    Sync all conversations from a single inbox.
    Returns the number of conversations synced.
    """
    console.print(f"\n[bold blue]📥 Syncing inbox: {inbox_name}[/bold blue] (ID: {inbox_intercom_id})")
    
    # Determine sync start time
    if since is None:
        since = writer.get_last_sync_time(inbox_intercom_id)
    
    if since:
        console.print(f"  Fetching conversations updated after {since.isoformat()}")
    else:
        console.print("  [yellow]Full sync — fetching all conversations[/yellow]")
    
    # Search conversations in this inbox
    raw_conversations = await intercom.search_conversations(
        inbox_id=inbox_intercom_id,
        updated_after=since,
        page_size=PAGE_SIZE,
        max_pages=MAX_PAGES,
    )
    
    console.print(f"  Found {len(raw_conversations)} conversations to sync")
    
    if dry_run:
        console.print("  [yellow]DRY RUN — skipping database writes[/yellow]")
        return len(raw_conversations)
    
    # Process each conversation
    synced = 0
    failed = 0
    skipped = 0   # no human-agent reply → nothing to QC
    latest_updated = since
    
    for i, raw_conv in enumerate(raw_conversations):
        conv_id = str(raw_conv.get("id", ""))
        
        try:
            # Fetch full conversation with parts
            full_conv_data = await intercom.get_conversation(conv_id)
            
            # Parse into our model
            parsed = IntercomClient.parse_conversation(full_conv_data, bot_admin_ids=bot_admin_ids)

            # Track latest update time
            if parsed.updated_at and (latest_updated is None or parsed.updated_at > latest_updated):
                latest_updated = parsed.updated_at

            # FILTER: only QC conversations that contain a human-agent reply.
            # Bot-only / ticket-workflow threads have nothing to score — skip them.
            if parsed.admin_reply_count == 0:
                skipped += 1
                continue

            # Write to Supabase
            result_uuid = await writer.upsert_conversation(parsed)
            
            if result_uuid:
                synced += 1
            else:
                failed += 1
            
            # Progress indicator
            if (i + 1) % 10 == 0:
                console.print(f"  Progress: {i + 1}/{len(raw_conversations)} "
                              f"(synced: {synced}, failed: {failed})")
            
        except Exception as e:
            failed += 1
            console.print(f"  [red]✗[/red] Error processing conversation {conv_id}: {e}")
    
    # Update sync state
    if latest_updated:
        writer.update_sync_state(inbox_intercom_id, latest_updated, synced)
    
    console.print(
        f"  [green]✓[/green] Inbox complete: {synced} synced, "
        f"{skipped} skipped (no human reply), {failed} failed"
    )
    return synced


async def run_ingestion(
    full_sync: bool = False,
    target_inbox_id: Optional[str] = None,
    dry_run: bool = False,
):
    """
    Main ingestion workflow:
    1. Fetch admins and teams from Intercom
    2. Sync conversations from each inbox (or target inbox)
    3. Update sync state
    """
    console.print("[bold green]🚀 CR QC Platform — Ingestion Worker[/bold green]")
    console.print(f"   Mode: {'FULL SYNC' if full_sync else 'INCREMENTAL'}")
    console.print(f"   Dry Run: {dry_run}")
    console.print(f"   Target Inbox: {target_inbox_id or 'ALL'}")
    console.print()
    
    # Validate config
    if not INTERCOM_API_TOKEN:
        console.print("[red]ERROR: INTERCOM_API_TOKEN not set[/red]")
        sys.exit(1)
    if not SUPABASE_URL or not SUPABASE_SERVICE_KEY:
        console.print("[red]ERROR: SUPABASE_URL and SUPABASE_SERVICE_KEY required[/red]")
        sys.exit(1)
    
    # Initialize clients
    async with IntercomClient(INTERCOM_API_TOKEN, INTERCOM_API_VERSION) as intercom:
        writer = SupabaseWriter(SUPABASE_URL, SUPABASE_SERVICE_KEY)
        
        # Step 1: Sync admins
        console.print("[bold]Step 1: Syncing agents...[/bold]")
        admins_raw = await intercom.list_admins()
        # Bot/AI accounts (Fin AI, Facebook Bot) use operator+<app>@intercom.io
        # emails. Exclude them so only human-agent replies are counted/QC'd.
        bot_admin_ids = {a.id for a in admins_raw if a.email and "@intercom.io" in a.email}
        console.print(f"  Excluding {len(bot_admin_ids)} bot/AI account(s) from agent replies")
        if dry_run:
            console.print(f"  [yellow]DRY RUN — skipping write of {len(admins_raw)} agents[/yellow]")
        else:
            await writer.upsert_agents([
                {"id": a.id, "name": a.name, "email": a.email, "avatar_url": a.avatar_url}
                for a in admins_raw
            ])

        # Step 2: Sync inboxes/teams
        console.print("[bold]Step 2: Syncing inboxes...[/bold]")
        teams_raw = await intercom.list_teams()
        if dry_run:
            console.print(f"  [yellow]DRY RUN — skipping write of {len(teams_raw)} inboxes[/yellow]")
        else:
            await writer.upsert_inboxes(teams_raw)
        
        # Step 3: Sync conversations per inbox
        console.print("[bold]Step 3: Syncing conversations...[/bold]")
        
        # Determine which inboxes to sync
        inboxes_to_sync = []
        if target_inbox_id:
            # Sync single inbox
            matching = [t for t in teams_raw if str(t["id"]) == target_inbox_id]
            if matching:
                inboxes_to_sync = matching
            else:
                console.print(f"[red]ERROR: Inbox {target_inbox_id} not found[/red]")
                sys.exit(1)
        elif CR_INBOX_IDS:
            # Scope to the configured CR inboxes only.
            cr_set = set(CR_INBOX_IDS)
            inboxes_to_sync = [t for t in teams_raw if str(t["id"]) in cr_set]
            missing = cr_set - {str(t["id"]) for t in teams_raw}
            console.print(f"  Scoped to {len(inboxes_to_sync)} CR inbox(es) via CR_INBOX_IDS")
            if missing:
                console.print(f"  [yellow]⚠ CR_INBOX_IDS not found in Intercom: {', '.join(sorted(missing))}[/yellow]")
        else:
            inboxes_to_sync = teams_raw
            console.print(
                f"  [yellow]⚠ CR_INBOX_IDS not set — syncing ALL {len(teams_raw)} inboxes. "
                f"Set CR_INBOX_IDS in .env to scope to the 13 CR inboxes.[/yellow]"
            )

        # Determine sync start time
        since = None
        if not full_sync:
            since = datetime.now(timezone.utc) - timedelta(hours=LOOKBACK_HOURS)
        
        total_synced = 0
        for team in inboxes_to_sync:
            inbox_id = str(team["id"])
            inbox_name = team.get("name", f"Inbox {inbox_id}")
            
            count = await sync_inbox(
                intercom=intercom,
                writer=writer,
                inbox_intercom_id=inbox_id,
                inbox_name=inbox_name,
                since=since if full_sync else None,  # For incremental, use per-inbox sync state
                dry_run=dry_run,
                bot_admin_ids=bot_admin_ids,
            )
            total_synced += count
        
        # Summary
        console.print()
        console.print("[bold green]✅ Ingestion complete![/bold green]")
        console.print(f"   Total conversations synced: {total_synced}")
        console.print(f"   Inboxes processed: {len(inboxes_to_sync)}")
    
    return total_synced


# ============================================================
# CLI Entry Point
# ============================================================

def main():
    parser = argparse.ArgumentParser(description="CR QC Platform — Intercom Ingestion Worker")
    parser.add_argument("--full", action="store_true", help="Full sync (fetch all conversations)")
    parser.add_argument("--inbox-id", type=str, help="Sync only this inbox (Intercom team ID)")
    parser.add_argument("--dry-run", action="store_true", help="Fetch but don't write to database")
    args = parser.parse_args()
    
    asyncio.run(run_ingestion(
        full_sync=args.full,
        target_inbox_id=args.inbox_id,
        dry_run=args.dry_run,
    ))


if __name__ == "__main__":
    main()
