#!/usr/bin/env python3
"""India ransomware.live /country/IN → MongoDB (fallback: server/data JSON)."""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
import time
import html as html_lib
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urljoin, urlparse

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv
from pymongo import MongoClient, UpdateOne

_REPO_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_REPO_ROOT / "server" / ".env")
load_dotenv(_REPO_ROOT / ".env")

BASE = os.environ.get("RANSOMWARE_BASE", "https://www.ransomware.live").rstrip("/")
LIST_URL = f"{BASE}/country/IN"
USER_AGENT = os.environ.get(
    "SCRAPE_USER_AGENT",
    "IndiaRansomwareDashboard/1.0 (+research; respectful crawl)",
)

URL_RE = re.compile(
    r"https?://[^\s\"'<>)\]]+",
    re.IGNORECASE,
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def session() -> requests.Session:
    s = requests.Session()
    s.headers.update({"User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.9"})
    return s


def extract_urls(text: str) -> list[str]:
    if not text:
        return []
    found = URL_RE.findall(text)
    out: list[str] = []
    for u in found:
        u = u.rstrip(").,;]")
        if u not in out:
            out.append(u)
    return out


def parse_victim_card(item: Any, base: str) -> dict[str, Any]:
    title_a = item.select_one("a.victim-title")
    if not title_a or not title_a.get("href"):
        return {}
    href = title_a["href"].strip()
    if not href.startswith("/id/"):
        return {}
    victim_id = href[len("/id/") :]
    target = title_a.get_text(strip=True)

    group_el = item.select_one("a.rl-group-badge")
    group = group_el.get_text(strip=True) if group_el else ""

    discovered_date = ""
    attack_estimated = ""
    meta = item.select_one(".victim-meta")
    if meta:
        raw = " ".join(meta.stripped_strings)
        m_disc = re.search(r"Discovered:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", raw)
        if m_disc:
            discovered_date = m_disc.group(1)
        m_att = re.search(r"Attack est\.:\s*([0-9]{4}-[0-9]{2}-[0-9]{2})", raw)
        if m_att:
            attack_estimated = m_att.group(1)

    desc_el = item.select_one(".victim-desc")
    list_summary = ""
    if desc_el:
        list_summary = html_lib.unescape(desc_el.get_text(" ", strip=True))

    website = ""
    proof_links: list[str] = []
    for a in item.select(".victim-icons a[href]"):
        h = a.get("href", "").strip()
        if not h:
            continue
        if h.startswith("http"):
            proof_links.append(h)
            if not website and urlparse(h).netloc and "ransomware.live" not in h:
                website = h
        elif "#screenshot" in h:
            proof_links.append(urljoin(base, h))

    logo_el = item.select_one(".victim-logo-wrap img[src]")
    logo_path = logo_el.get("src") if logo_el else ""
    logo_url = urljoin(base, logo_path) if logo_path else ""

    source_url = urljoin(base, href)
    return {
        "victim_id": victim_id,
        "target": target,
        "group": group,
        "country": "IN",
        "discovered_date": discovered_date,
        "attack_estimated": attack_estimated,
        "list_summary": list_summary,
        "website": website,
        "proof_links": proof_links,
        "logo_url": logo_url,
        "source_url": source_url,
    }


def parse_detail(html: str, base: str, victim_id: str) -> dict[str, Any]:
    soup = BeautifulSoup(html, "lxml")
    out: dict[str, Any] = {}

    og_img = soup.select_one('meta[property="og:image"]')
    if og_img and og_img.get("content"):
        out["og_image"] = og_img["content"].strip()

    grid = soup.select_one(".rl-info-grid")
    if grid:
        for row in grid.select(".rl-info-row"):
            lab = row.select_one(".rl-info-label")
            val = row.select_one(".rl-info-value")
            if not lab or not val:
                continue
            label = lab.get_text(" ", strip=True).lower()
            text = html_lib.unescape(val.get_text(" ", strip=True))
            if "discovered" in label:
                out["discovered_utc"] = text.replace("UTC", "").strip()
            elif "attack date" in label or "est. attack" in label:
                out["attack_estimated_detail"] = text
            elif "country" in label:
                out["country_label"] = text

    # Primary narrative (operator / contributor text)
    desc_box = None
    for p in soup.select("p.mb-2"):
        if p.find(string=re.compile(r"Description", re.I)):
            nxt = p.find_next_sibling("div", class_=re.compile("rl-contributor-box"))
            if nxt:
                desc_box = nxt
                break
    if desc_box:
        reason = html_lib.unescape(desc_box.get_text("\n", strip=True))
        out["reason"] = reason
        extra = extract_urls(reason)
        if extra:
            out["extracted_urls"] = extra

    # Victim website (header area)
    for a in soup.select('a[href^="http"]'):
        h = a["href"]
        if "ransomware.live" in h or "hudsonrock" in h or "buymeacoffee" in h:
            continue
        if "freshdesk" in h or "twitter.com" in h or "bsky" in h:
            continue
        netloc = urlparse(h).netloc.lower()
        if netloc and not netloc.endswith("ransomware.live"):
            out["website"] = h
            break

    shot = soup.select_one("p#screenshot")
    if shot:
        img = shot.find_next("img")
        if img and img.get("src"):
            out["leak_screenshot_url"] = img["src"].strip()

    return out


def fetch_detail(sess: requests.Session, victim_id: str, base: str) -> dict[str, Any]:
    url = f"{base}/id/{victim_id}"
    r = sess.get(url, timeout=45)
    r.raise_for_status()
    return parse_detail(r.text, base, victim_id)


def scrape_list(sess: requests.Session) -> list[dict[str, Any]]:
    r = sess.get(LIST_URL, timeout=60)
    r.raise_for_status()
    soup = BeautifulSoup(r.text, "lxml")
    items = soup.select("#victim-list .victim-item")
    rows: list[dict[str, Any]] = []
    for it in items:
        row = parse_victim_card(it, BASE)
        if row:
            rows.append(row)
    return rows


def dedupe_rows_by_victim_id(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
   
    by_id: dict[str, dict[str, Any]] = {}
    order: list[str] = []
    for row in rows:
        vid = row.get("victim_id")
        if not vid:
            continue
        vid = str(vid).strip()
        if not vid:
            continue
        if vid not in by_id:
            order.append(vid)
            by_id[vid] = {**row}
            continue
        prev = by_id[vid]
        pl = list(prev.get("proof_links") or [])
        for u in row.get("proof_links") or []:
            if u and u not in pl:
                pl.append(u)
        prev["proof_links"] = pl
        for k, v in row.items():
            if k in ("proof_links", "victim_id"):
                continue
            if isinstance(v, str) and v.strip():
                prev[k] = v
            elif v not in (None, "", [], {}):
                prev[k] = v
    return [by_id[vid] for vid in order]


def merge_proof_links(row: dict[str, Any], detail: dict[str, Any]) -> None:
    links = list(row.get("proof_links") or [])
    for key in ("extracted_urls",):
        for u in detail.get(key) or []:
            if u not in links:
                links.append(u)
    if detail.get("leak_screenshot_url"):
        u = detail["leak_screenshot_url"]
        if u not in links:
            links.append(u)
    if detail.get("og_image") and detail["og_image"] not in links:
        links.append(detail["og_image"])
    row["proof_links"] = links


def notify_node() -> None:
    hook = os.environ.get("NODE_SCRAPE_HOOK", "").strip()
    if not hook:
        return
    secret = os.environ.get("SCRAPE_HOOK_SECRET", "").strip()
    headers = {}
    if secret:
        headers["X-Scrape-Secret"] = secret
    try:
        requests.post(hook, json={"source": "python-scraper"}, headers=headers, timeout=5)
    except requests.RequestException:
        pass


def default_file_store_path() -> Path:
    return Path(__file__).resolve().parent.parent / "server" / "data" / "attacks.json"


def json_serialize_doc(doc: dict[str, Any]) -> dict[str, Any]:
    out: dict[str, Any] = {}
    for k, v in doc.items():
        if isinstance(v, datetime):
            out[k] = v.isoformat()
        else:
            out[k] = v
    return out


def write_file_store(documents: list[dict[str, Any]], path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "items": [json_serialize_doc(d) for d in documents],
        "saved_at": utc_now().isoformat(),
    }
    tmp = path.with_suffix(".tmp")
    with tmp.open("w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    tmp.replace(path)


def ensure_indexes(coll: Any) -> None:
    """Idempotent indexes for Compass-friendly browsing and API sort/filter."""
    try:
        coll.create_index("victim_id", unique=True, name="uq_victim_id")
    except Exception as e:
        print(f"warn: index uq_victim_id: {e}", file=sys.stderr)
    try:
        coll.create_index([("updated_at", -1)], name="idx_updated_at_desc")
    except Exception as e:
        print(f"warn: index updated_at: {e}", file=sys.stderr)
    try:
        coll.create_index("group", name="idx_group", sparse=True)
    except Exception as e:
        print(f"warn: index group: {e}", file=sys.stderr)


def write_sync_meta(
    client: MongoClient,
    db_name: str,
    coll_name: str,
    row_count: int,
    now: datetime,
) -> None:
    """Single doc per collection — open `_sync_meta` in Compass to see last scrape time."""
    coll = client[db_name]["_sync_meta"]
    coll.update_one(
        {"_id": coll_name},
        {
            "$set": {
                "last_scrape_at": now,
                "last_row_count": row_count,
                "source_collection": coll_name,
                "updated_at": now,
            }
        },
        upsert=True,
    )


def upsert_all(
    client: MongoClient,
    db_name: str,
    coll_name: str,
    documents: list[dict[str, Any]],
) -> tuple[int, int]:
    """Upsert by victim_id: re-running the scraper updates the same document (no duplicate rows per id)."""
    by_vid: dict[str, dict[str, Any]] = {}
    for doc in documents:
        vid = str(doc.get("victim_id", "")).strip()
        if not vid:
            continue
        by_vid[vid] = doc
    documents = list(by_vid.values())
    if not documents:
        return (0, 0)

    coll = client[db_name][coll_name]
    ensure_indexes(coll)
    now = utc_now()
    ops: list[UpdateOne] = []
    for doc in documents:
        vid = doc["victim_id"]
        doc["updated_at"] = now
        to_set = {k: v for k, v in doc.items() if k != "first_seen_at"}
        ops.append(
            UpdateOne(
                {"victim_id": vid},
                {"$set": to_set, "$setOnInsert": {"first_seen_at": now}},
                upsert=True,
            )
        )
    if not ops:
        return (0, 0)
    res = coll.bulk_write(ops, ordered=False)
    return (res.upserted_count + res.modified_count, res.upserted_count)


def run(
    enrich_details: bool,
    detail_workers: int,
    detail_delay: float,
    emit_stdout_json: bool = False,
) -> int:
    sess = session()
    rows = scrape_list(sess)
    if not rows:
        print("No victim rows parsed.", file=sys.stderr)
        return 1

    if enrich_details:
        workers = max(1, detail_workers)

        def work(row: dict[str, Any]) -> dict[str, Any]:
            if detail_delay > 0:
                time.sleep(detail_delay)
            ts = session()
            try:
                d = fetch_detail(ts, row["victim_id"], BASE)
            except requests.RequestException as e:
                r = {**row, "detail_error": str(e)}
                r["attack_details"] = r.get("list_summary", "")
                r["reason"] = r.get("list_summary", "")
                return r
            merged = {**row}
            if d.get("discovered_utc"):
                merged["discovered_utc"] = d["discovered_utc"]
            if d.get("attack_estimated_detail"):
                det = d["attack_estimated_detail"].strip()
                if det:
                    merged["attack_estimated"] = det
            if d.get("reason"):
                merged["reason"] = d["reason"]
                merged["attack_details"] = d["reason"]
            elif merged.get("list_summary"):
                merged["reason"] = merged["list_summary"]
                merged["attack_details"] = merged["list_summary"]
            if d.get("website"):
                merged["website"] = d["website"]
            if d.get("leak_screenshot_url"):
                merged["leak_screenshot_url"] = d["leak_screenshot_url"]
            merge_proof_links(merged, d)
            return merged

        enriched: list[dict[str, Any]] = []
        with ThreadPoolExecutor(max_workers=workers) as ex:
            futs = {ex.submit(work, r): r for r in rows}
            for fut in as_completed(futs):
                enriched.append(fut.result())
        rows = enriched
    else:
        for r in rows:
            r["attack_details"] = r.get("list_summary", "")
            r["reason"] = r.get("list_summary", "")

    before_dedupe = len(rows)
    rows = dedupe_rows_by_victim_id(rows)
    if len(rows) != before_dedupe:
        print(f"Deduped scrape batch by victim_id: {before_dedupe} -> {len(rows)} rows.", file=sys.stderr)

    uri = os.environ.get("MONGODB_URI", "mongodb://127.0.0.1:27017")
    db_name = os.environ.get("MONGODB_DB", "ransomware_india")
    coll_name = (
        os.environ.get("MONGODB_ATTACKS_COLLECTION")
        or os.environ.get("MONGODB_COLLECTION")
        or "attacks"
    )
    file_path = (
        Path(os.environ["DATA_FILE"]).expanduser()
        if os.environ.get("DATA_FILE")
        else default_file_store_path()
    )

    client: MongoClient | None = None
    try:
        timeout_ms = (
            20000
            if uri.startswith("mongodb+srv") or ".mongodb.net" in uri
            else 8000
        )
        client = MongoClient(uri, serverSelectionTimeoutMS=timeout_ms)
        modified, upserts = upsert_all(client, db_name, coll_name, rows)
        write_sync_meta(client, db_name, coll_name, len(rows), utc_now())
        print(
            f"Upserted {len(rows)} India victims into {db_name}.{coll_name} "
            f"(writes acknowledged: {modified}, new upserts in batch: {upserts}).",
            file=sys.stderr,
        )
        print(
            f"Sync meta: {db_name}._sync_meta _id={coll_name!r} (open in Compass for last_scrape_at).",
            file=sys.stderr,
        )
        if not os.environ.get("NODE_SCRAPE_HOOK", "").strip():
            print(
                "Tip: set NODE_SCRAPE_HOOK=http://127.0.0.1:4000/hooks/scrape-complete (in server/.env, loaded by scraper) so the dashboard refreshes after each scrape.",
                file=sys.stderr,
            )
    except Exception as e:
        print(f"MongoDB unavailable ({e}); writing local JSON file store.", file=sys.stderr)
        write_file_store(rows, file_path)
        print(f"Wrote {len(rows)} records to {file_path}", file=sys.stderr)
    finally:
        if client is not None:
            client.close()

    notify_node()
    if emit_stdout_json:
        print(json.dumps({"items": rows, "count": len(rows)}, default=str), flush=True)
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument(
        "--no-details",
        action="store_true",
        help="Skip per-victim detail pages (faster; less proof metadata).",
    )
    p.add_argument("--detail-workers", type=int, default=int(os.environ.get("DETAIL_WORKERS", "6")))
    p.add_argument(
        "--detail-delay",
        type=float,
        default=float(os.environ.get("DETAIL_DELAY_SEC", "0.12")),
        help="Sleep per detail request (per worker) to reduce load on source site.",
    )
    p.add_argument(
        "--loop",
        type=int,
        default=0,
        metavar="SEC",
        help="Re-run forever every SEC seconds (live updates).",
    )
    p.add_argument(
        "--stdout-json-result",
        action="store_true",
        help="After a successful run, print one JSON line to stdout {items, count} (logs go to stderr). For Node intel runner.",
    )
    args = p.parse_args()
    enrich = not args.no_details

    if args.loop > 0:
        while True:
            try:
                run(enrich, args.detail_workers, args.detail_delay, False)
            except Exception as e:
                print(f"Scrape error: {e}", file=sys.stderr)
            time.sleep(args.loop)
        return 0

    try:
        return run(enrich, args.detail_workers, args.detail_delay, args.stdout_json_result)
    except requests.RequestException as e:
        print(f"HTTP error: {e}", file=sys.stderr)
        return 2
    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        return 3


if __name__ == "__main__":
    raise SystemExit(main())
