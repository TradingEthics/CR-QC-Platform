"""
Intercom REST API Client for CR QC Platform.

Handles authentication, pagination, rate limiting, and data extraction
from 12 CR inboxes.

Usage:
    client = IntercomClient(api_token="your_token")
    conversations = await client.fetch_conversations(inbox_id="12345", since=datetime(...))
    parts = await client.fetch_conversation_parts(conversation_id="67890")
"""

import asyncio
import os
import time
from datetime import datetime, timezone
from typing import Optional

import httpx
from pydantic import BaseModel
from tenacity import retry, stop_after_attempt, wait_exponential, retry_if_exception_type

# Intercom workspace/app ID — used to build clickable conversation links.
# Derived from the operator bot email (operator+<app_id>@intercom.io).
INTERCOM_APP_ID = os.getenv("INTERCOM_APP_ID", "")

# ============================================================
# Data Models
# ============================================================

class IntercomAdmin(BaseModel):
    """An Intercom admin (agent)."""
    id: str
    name: str
    email: Optional[str] = None
    avatar_url: Optional[str] = None


class IntercomConversationPart(BaseModel):
    """A single message/part within a conversation."""
    id: Optional[str] = None
    part_type: Optional[str] = None       # 'comment', 'note', 'assignment', etc.
    author_type: str                       # 'admin', 'bot', 'user'
    author_id: Optional[str] = None
    body_html: Optional[str] = None
    body_text: Optional[str] = None
    created_at: Optional[datetime] = None
    sequence_order: int = 0


class IntercomConversation(BaseModel):
    """A full conversation with metadata and parts."""
    id: str
    title: Optional[str] = None
    
    # Assignee
    assignee_id: Optional[str] = None
    assignee_type: Optional[str] = None    # 'admin', 'team', etc.
    
    # Team/Inbox
    team_id: Optional[str] = None
    
    # Customer
    customer_name: Optional[str] = None
    customer_email: Optional[str] = None
    
    # CX Score (CSAT)
    cx_score: Optional[int] = None
    
    # Timestamps
    created_at: Optional[datetime] = None
    updated_at: Optional[datetime] = None
    
    # Parts
    parts: list[IntercomConversationPart] = []
    admin_reply_count: int = 0      # human-agent replies only (excludes Fin AI / bots)
    total_parts_count: int = 0

    # Clickable link to the conversation in the Intercom inbox (for manual review)
    intercom_url: Optional[str] = None


# ============================================================
# Intercom Client
# ============================================================

class RateLimitExceeded(Exception):
    """Raised when Intercom rate limit is hit."""
    pass


class IntercomClient:
    """Async Intercom REST API client with rate limiting and pagination."""
    
    BASE_URL = "https://api.intercom.io"
    
    def __init__(self, api_token: str, api_version: str = "2.11"):
        self.api_token = api_token
        self.api_version = api_version
        self._client = httpx.AsyncClient(
            base_url=self.BASE_URL,
            headers={
                "Authorization": f"Bearer {api_token}",
                "Accept": "application/json",
                "Intercom-Version": api_version,
            },
            timeout=30.0,
        )
        self._rate_limit_remaining = 83  # Intercom's default
        self._rate_limit_reset = 0.0
    
    async def close(self):
        await self._client.aclose()
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, *args):
        await self.close()
    
    # --------------------------------------------------------
    # Rate Limiting
    # --------------------------------------------------------
    
    def _update_rate_limits(self, response: httpx.Response):
        """Extract rate limit info from response headers."""
        remaining = response.headers.get("X-RateLimit-Remaining")
        reset = response.headers.get("X-RateLimit-Reset")
        if remaining is not None:
            self._rate_limit_remaining = int(remaining)
        if reset is not None:
            self._rate_limit_reset = float(reset)
    
    async def _throttle_if_needed(self):
        """Pause if we're close to the rate limit."""
        if self._rate_limit_remaining <= 5:
            wait_time = max(0, self._rate_limit_reset - time.time()) + 1
            print(f"[Rate Limit] Only {self._rate_limit_remaining} requests remaining. "
                  f"Waiting {wait_time:.1f}s...")
            await asyncio.sleep(wait_time)
    
    # --------------------------------------------------------
    # Core API Methods
    # --------------------------------------------------------
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type((httpx.HTTPStatusError, RateLimitExceeded)),
    )
    async def _get(self, path: str, params: Optional[dict] = None) -> dict:
        """Make a GET request with retry and rate limit handling."""
        await self._throttle_if_needed()
        
        response = await self._client.get(path, params=params)
        self._update_rate_limits(response)
        
        if response.status_code == 429:
            raise RateLimitExceeded("Intercom rate limit exceeded")
        
        response.raise_for_status()
        return response.json()
    
    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=2, min=2, max=30),
        retry=retry_if_exception_type((httpx.HTTPStatusError, RateLimitExceeded)),
    )
    async def _post(self, path: str, json_data: dict) -> dict:
        """Make a POST request with retry and rate limit handling."""
        await self._throttle_if_needed()
        
        response = await self._client.post(path, json=json_data)
        self._update_rate_limits(response)
        
        if response.status_code == 429:
            raise RateLimitExceeded("Intercom rate limit exceeded")
        
        response.raise_for_status()
        return response.json()
    
    # --------------------------------------------------------
    # Admins (Agents)
    # --------------------------------------------------------
    
    async def list_admins(self) -> list[IntercomAdmin]:
        """Fetch all admins (agents) from Intercom."""
        data = await self._get("/admins")
        admins = []
        for admin_data in data.get("admins", []):
            admins.append(IntercomAdmin(
                id=str(admin_data["id"]),
                name=admin_data.get("name", "Unknown"),
                email=admin_data.get("email"),
                avatar_url=admin_data.get("avatar", {}).get("image_url") if admin_data.get("avatar") else None,
            ))
        return admins
    
    # --------------------------------------------------------
    # Teams (Inboxes)
    # --------------------------------------------------------
    
    async def list_teams(self) -> list[dict]:
        """Fetch all teams/inboxes from Intercom."""
        data = await self._get("/teams")
        return data.get("teams", [])
    
    # --------------------------------------------------------
    # Conversations
    # --------------------------------------------------------
    
    async def search_conversations(
        self,
        inbox_id: Optional[str] = None,
        updated_after: Optional[datetime] = None,
        page_size: int = 50,
        max_pages: int = 100,
    ) -> list[dict]:
        """
        Search conversations using Intercom Search API.
        
        Supports filtering by inbox/team and updated_after timestamp
        for incremental syncing.
        """
        # Build search query
        filters = []
        
        if inbox_id:
            filters.append({
                "field": "team_assignee_id",
                "operator": "=",
                "value": inbox_id,
            })
        
        if updated_after:
            filters.append({
                "field": "updated_at",
                "operator": ">",
                "value": int(updated_after.timestamp()),
            })
        
        query = {}
        if len(filters) == 1:
            query = filters[0]
        elif len(filters) > 1:
            query = {"operator": "AND", "value": filters}
        
        # Paginate through results
        all_conversations = []
        starting_after = None
        page = 0
        
        while page < max_pages:
            payload = {
                "query": query,
                "pagination": {"per_page": page_size},
            }
            if starting_after:
                payload["pagination"]["starting_after"] = starting_after
            
            data = await self._post("/conversations/search", payload)
            
            conversations = data.get("conversations", [])
            all_conversations.extend(conversations)
            
            # Check for next page
            pages_info = data.get("pages", {})
            next_cursor = pages_info.get("next", {})
            starting_after = next_cursor.get("starting_after") if next_cursor else None
            
            page += 1
            print(f"  [Page {page}] Fetched {len(conversations)} conversations "
                  f"(total: {len(all_conversations)})")
            
            if not starting_after or not conversations:
                break
        
        return all_conversations
    
    async def get_conversation(self, conversation_id: str) -> dict:
        """Fetch a single conversation with all its parts."""
        data = await self._get(
            f"/conversations/{conversation_id}",
            params={"display_as": "plaintext"}
        )
        return data
    
    # --------------------------------------------------------
    # Parsing Helpers
    # --------------------------------------------------------
    
    @staticmethod
    def parse_conversation(raw: dict, bot_admin_ids: Optional[set] = None) -> IntercomConversation:
        """
        Parse a raw Intercom conversation dict into our model.

        bot_admin_ids: author IDs to treat as non-human (Fin AI, Facebook Bot,
        etc.). Their messages are excluded from admin_reply_count so we only
        count real human-agent replies for QC.
        
        Handles:
        - Extracting CX score from conversation_rating
        - Parsing admin/bot/user parts
        - Computing admin reply count
        """
        import html2text
        h2t = html2text.HTML2Text()
        h2t.ignore_links = False
        h2t.ignore_images = True
        h2t.body_width = 0  # Don't wrap lines
        
        # --- Basic fields ---
        conv_id = str(raw.get("id", ""))
        title = raw.get("title") or raw.get("source", {}).get("subject")

        # Read app id at call time — the module-level constant can be empty if
        # this module was imported before load_dotenv() ran (as in ingest.py).
        app_id = os.getenv("INTERCOM_APP_ID", "") or INTERCOM_APP_ID
        
        # --- Assignee ---
        assignee = raw.get("assignee", {}) or {}
        assignee_id = str(assignee.get("id", "")) if assignee.get("id") else None
        assignee_type = assignee.get("type")
        
        # --- Team ---
        team = raw.get("team_assignee_id")
        team_id = str(team) if team else None
        
        # --- Customer ---
        contacts = raw.get("contacts", {}).get("contacts", [])
        customer_name = None
        customer_email = None
        if contacts:
            first_contact = contacts[0]
            customer_name = first_contact.get("name")
            customer_email = first_contact.get("email")
        
        # Also check source for initial message author
        source = raw.get("source", {})
        if not customer_name and source:
            author = source.get("author", {})
            customer_name = author.get("name")
            customer_email = customer_email or author.get("email")
        
        # --- CX Score (CSAT Rating) ---
        # Intercom stores this in conversation_rating.rating (1-5)
        # TODO: Confirm with Sakib if this is the right field
        cx_score = None
        rating_data = raw.get("conversation_rating", {})
        if rating_data and rating_data.get("rating"):
            cx_score = int(rating_data["rating"])
        
        # Also check custom_attributes for CX score
        custom_attrs = raw.get("custom_attributes", {}) or {}
        if not cx_score and custom_attrs.get("cx_score"):
            cx_score = int(custom_attrs["cx_score"])
        
        # --- Timestamps ---
        created_at = None
        updated_at = None
        if raw.get("created_at"):
            created_at = datetime.fromtimestamp(raw["created_at"], tz=timezone.utc)
        if raw.get("updated_at"):
            updated_at = datetime.fromtimestamp(raw["updated_at"], tz=timezone.utc)
        
        # --- Parse conversation parts ---
        parts = []
        sequence = 0
        
        # The initial message (source) is part 0
        if source:
            source_author = source.get("author", {})
            body_html = source.get("body") or ""
            body_text = h2t.handle(body_html).strip() if body_html else ""
            
            parts.append(IntercomConversationPart(
                id=None,
                part_type="source",
                author_type=source_author.get("type", "user"),
                author_id=str(source_author.get("id", "")) if source_author.get("id") else None,
                body_html=body_html,
                body_text=body_text,
                created_at=created_at,
                sequence_order=sequence,
            ))
            sequence += 1
        
        # Subsequent parts
        conv_parts_data = raw.get("conversation_parts", {}).get("conversation_parts", [])
        for part_data in conv_parts_data:
            author = part_data.get("author", {})
            author_type = author.get("type", "unknown")
            
            # Skip non-message parts (assignments, state changes)
            part_type = part_data.get("part_type", "")
            
            body_html = part_data.get("body") or ""
            body_text = h2t.handle(body_html).strip() if body_html else ""
            
            part_created = None
            if part_data.get("created_at"):
                part_created = datetime.fromtimestamp(
                    part_data["created_at"], tz=timezone.utc
                )
            
            parts.append(IntercomConversationPart(
                id=str(part_data.get("id", "")) if part_data.get("id") else None,
                part_type=part_type,
                author_type=author_type,
                author_id=str(author.get("id", "")) if author.get("id") else None,
                body_html=body_html,
                body_text=body_text,
                created_at=part_created,
                sequence_order=sequence,
            ))
            sequence += 1
        
        # Count HUMAN agent replies (only parts with actual content).
        # Excludes Fin AI / bots (bot_admin_ids) — Intercom labels the AI agent
        # as "admin" too, so type alone is not enough.
        bot_ids = bot_admin_ids or set()
        admin_replies = [
            p for p in parts
            if p.author_type == "admin"
            and p.author_id not in bot_ids
            and p.body_text
            and p.body_text.strip()
            and p.part_type in ("comment", "source", None, "")
        ]
        
        return IntercomConversation(
            id=conv_id,
            title=title,
            assignee_id=assignee_id,
            assignee_type=assignee_type,
            team_id=team_id,
            customer_name=customer_name,
            customer_email=customer_email,
            cx_score=cx_score,
            created_at=created_at,
            updated_at=updated_at,
            parts=parts,
            admin_reply_count=len(admin_replies),
            total_parts_count=len(parts),
            intercom_url=(
                f"https://app.intercom.com/a/inbox/{app_id}/inbox/conversation/{conv_id}"
                if app_id else None
            ),
        )
