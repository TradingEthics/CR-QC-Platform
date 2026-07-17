"""
CR QC Platform — Connection Verification Script

Run this first to verify your Intercom API token and Supabase connection
are working correctly before running the full ingestion.

Usage:
    python verify_setup.py
"""

import asyncio
import os
import sys
import json

from dotenv import load_dotenv
from rich.console import Console
from rich.table import Table
from rich.panel import Panel

load_dotenv()
console = Console()


async def verify_intercom():
    """Test Intercom API connection and list available inboxes/teams."""
    from intercom_client import IntercomClient
    
    token = os.getenv("INTERCOM_API_TOKEN", "")
    if not token:
        console.print("[red]✗ INTERCOM_API_TOKEN not set in .env[/red]")
        return False
    
    console.print("[bold]Testing Intercom API connection...[/bold]")
    
    try:
        async with IntercomClient(token) as client:
            # Test 1: List admins
            admins = await client.list_admins()
            console.print(f"  [green]✓[/green] Connected! Found {len(admins)} admins:")
            
            admin_table = Table(show_header=True, header_style="bold")
            admin_table.add_column("ID")
            admin_table.add_column("Name")
            admin_table.add_column("Email")
            for admin in admins[:15]:  # Show first 15
                admin_table.add_row(admin.id, admin.name, admin.email or "—")
            console.print(admin_table)
            
            # Test 2: List teams/inboxes
            teams = await client.list_teams()
            console.print(f"\n  [green]✓[/green] Found {len(teams)} teams/inboxes:")
            
            team_table = Table(show_header=True, header_style="bold")
            team_table.add_column("ID")
            team_table.add_column("Name")
            for team in teams:
                team_table.add_row(str(team.get("id")), team.get("name", "Unknown"))
            console.print(team_table)
            
            # Test 3: Fetch one conversation to check structure
            console.print("\n  [bold]Fetching a sample conversation to verify structure...[/bold]")
            sample_convs = await client.search_conversations(
                page_size=1,
                max_pages=1,
            )
            
            if sample_convs:
                conv_id = str(sample_convs[0].get("id", ""))
                full_conv = await client.get_conversation(conv_id)
                
                # Check for CX score / CSAT
                rating = full_conv.get("conversation_rating", {})
                custom_attrs = full_conv.get("custom_attributes", {})
                
                console.print(f"  [green]✓[/green] Sample conversation ID: {conv_id}")
                console.print(f"    conversation_rating: {json.dumps(rating, indent=2) if rating else 'None'}")
                console.print(f"    custom_attributes keys: {list(custom_attrs.keys()) if custom_attrs else 'None'}")
                
                # Count parts by author type
                parts = full_conv.get("conversation_parts", {}).get("conversation_parts", [])
                author_counts = {}
                for p in parts:
                    atype = p.get("author", {}).get("type", "unknown")
                    author_counts[atype] = author_counts.get(atype, 0) + 1
                
                console.print(f"    Total parts: {len(parts)}")
                console.print(f"    Parts by author type: {author_counts}")
                
                # Parse it through our parser
                parsed = IntercomClient.parse_conversation(full_conv)
                console.print(f"\n    [bold]Parsed result:[/bold]")
                console.print(f"    CX Score: {parsed.cx_score}")
                console.print(f"    Admin replies: {parsed.admin_reply_count}")
                console.print(f"    Customer: {parsed.customer_name} ({parsed.customer_email})")
                console.print(f"    Team ID: {parsed.team_id}")
                console.print(f"    Assignee ID: {parsed.assignee_id}")
            else:
                console.print("  [yellow]⚠ No conversations found (inbox might be empty)[/yellow]")
            
            return True
            
    except Exception as e:
        console.print(f"  [red]✗ Intercom error: {e}[/red]")
        return False


def verify_supabase():
    """Test Supabase connection and check if schema is set up."""
    url = os.getenv("SUPABASE_URL", "")
    key = os.getenv("SUPABASE_SERVICE_KEY", "")
    
    if not url or not key:
        console.print("[red]✗ SUPABASE_URL or SUPABASE_SERVICE_KEY not set in .env[/red]")
        return False
    
    console.print("\n[bold]Testing Supabase connection...[/bold]")
    
    try:
        from supabase import create_client
        client = create_client(url, key)
        
        # Check if tables exist
        tables_to_check = [
            "inboxes", "agents", "conversations", "conversation_parts",
            "scoring_categories", "qc_assessments", "qc_errors",
            "manual_reviews", "scoring_runs", "sync_state",
        ]
        
        all_ok = True
        for table_name in tables_to_check:
            try:
                result = client.table(table_name).select("*", count="exact").limit(0).execute()
                count = result.count if result.count is not None else 0
                console.print(f"  [green]✓[/green] {table_name}: {count} rows")
            except Exception as e:
                console.print(f"  [red]✗[/red] {table_name}: {e}")
                all_ok = False
        
        # Check scoring categories are seeded
        cats = client.table("scoring_categories").select("*", count="exact").execute()
        cat_count = cats.count if cats.count is not None else len(cats.data)
        if cat_count > 0:
            console.print(f"\n  [green]✓[/green] Scoring categories seeded: {cat_count} categories")
        else:
            console.print("\n  [yellow]⚠ Scoring categories not seeded — run schema.sql first[/yellow]")
            all_ok = False
        
        return all_ok
        
    except Exception as e:
        console.print(f"  [red]✗ Supabase error: {e}[/red]")
        return False


def verify_ai_keys():
    """Check if AI scoring API keys are configured."""
    console.print("\n[bold]Checking AI scoring API keys...[/bold]")
    
    groq_key = os.getenv("GROQ_API_KEY", "")
    openrouter_key = os.getenv("OPENROUTER_API_KEY", "")
    
    if groq_key:
        console.print(f"  [green]✓[/green] GROQ_API_KEY set ({groq_key[:8]}...)")
    else:
        console.print("  [yellow]⚠[/yellow] GROQ_API_KEY not set (needed for Week 2)")
    
    if openrouter_key:
        console.print(f"  [green]✓[/green] OPENROUTER_API_KEY set ({openrouter_key[:8]}...)")
    else:
        console.print("  [yellow]⚠[/yellow] OPENROUTER_API_KEY not set (needed for Week 2)")
    
    return True  # Not blocking for Week 1


async def main():
    console.print(Panel.fit(
        "[bold green]CR QC Platform — Setup Verification[/bold green]\n"
        "Checking Intercom API, Supabase, and AI scoring keys",
        border_style="green",
    ))
    
    results = {}
    
    # 1. Intercom
    results["intercom"] = await verify_intercom()
    
    # 2. Supabase
    results["supabase"] = verify_supabase()
    
    # 3. AI Keys
    results["ai_keys"] = verify_ai_keys()
    
    # Summary
    console.print("\n" + "=" * 50)
    console.print("[bold]Summary:[/bold]")
    for name, ok in results.items():
        status = "[green]PASS[/green]" if ok else "[red]FAIL[/red]"
        console.print(f"  {name}: {status}")
    
    if all(results.values()):
        console.print("\n[bold green]✅ All checks passed! Ready to run ingestion.[/bold green]")
        console.print("  Run: python ingest.py --full --dry-run")
    else:
        console.print("\n[bold red]❌ Some checks failed. Fix the issues above first.[/bold red]")
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
