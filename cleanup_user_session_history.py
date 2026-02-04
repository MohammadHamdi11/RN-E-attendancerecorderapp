import argparse
import os
import sqlite3
from datetime import date
from typing import Optional


SQLITE_HEADER = b"SQLite format 3\x00"


def has_sqlite_header(filepath: str) -> bool:
    if not os.path.exists(filepath) or os.path.getsize(filepath) < 16:
        return False
    try:
        with open(filepath, "rb") as f:
            return f.read(16) == SQLITE_HEADER
    except OSError:
        return False


def subtract_years(d: date, years: int) -> date:
    """Subtract whole years from a date (handles Feb 29 safely)."""
    try:
        return d.replace(year=d.year - years)
    except ValueError:
        # Feb 29 -> Feb 28 on non-leap target year
        return d.replace(year=d.year - years, month=2, day=28)


def resolve_user_session_history_dir(cli_dir: Optional[str]) -> Optional[str]:
    """Find user_session_history directory from CLI or common locations."""
    if cli_dir:
        return cli_dir

    here = os.path.dirname(os.path.abspath(__file__))
    candidates = [
        os.path.join(os.getcwd(), "user_session_history"),
        os.path.join(here, "user_session_history"),
        os.path.normpath(os.path.join(here, "..", "user_session_history")),
    ]
    for d in candidates:
        if os.path.isdir(d):
            return d
    return None


def list_db_files(directory: str) -> list[str]:
    try:
        filenames = os.listdir(directory)
    except OSError:
        return []
    return [
        os.path.join(directory, name)
        for name in filenames
        if name.lower().endswith(".db") and os.path.isfile(os.path.join(directory, name))
    ]


def get_table_names(conn: sqlite3.Connection) -> list[str]:
    cur = conn.cursor()
    cur.execute("SELECT name FROM sqlite_master WHERE type='table'")
    return [r[0] for r in cur.fetchall()]


def table_row_count(conn: sqlite3.Connection, table: str) -> int:
    cur = conn.cursor()
    cur.execute(f"SELECT COUNT(*) FROM {table}")
    return int(cur.fetchone()[0])


def delete_old_attendance_rows(conn: sqlite3.Connection, cutoff_str: str) -> int:
    """
    Delete attendance rows older than cutoff_str (YYYY-MM-DD).
    Prefers scanTime (ISO), then dateTime (ISO), then log_date (YYYY-MM-DD).
    """
    cur = conn.cursor()

    cur.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='attendance'")
    if not cur.fetchone():
        return 0

    cur.execute("PRAGMA table_info(attendance)")
    cols = [r[1] for r in cur.fetchall()]

    if "scanTime" in cols:
        where_expr = "substr(scanTime, 1, 10) < ?"
    elif "dateTime" in cols:
        where_expr = "substr(dateTime, 1, 10) < ?"
    elif "log_date" in cols:
        where_expr = "log_date < ?"
    else:
        return 0

    cur.execute(f"SELECT COUNT(*) FROM attendance WHERE {where_expr}", (cutoff_str,))
    to_delete = int(cur.fetchone()[0])
    if to_delete <= 0:
        return 0

    cur.execute(f"DELETE FROM attendance WHERE {where_expr}", (cutoff_str,))
    return to_delete


def is_db_empty(conn: sqlite3.Connection) -> bool:
    """
    Consider DB empty if it has no rows across all non-internal tables.
    """
    tables = [t for t in get_table_names(conn) if t not in ("sqlite_sequence",)]
    if not tables:
        return True
    total = 0
    for t in tables:
        try:
            total += table_row_count(conn, t)
        except sqlite3.Error:
            # If a table can't be counted, assume DB isn't safely "empty"
            return False
    return total == 0


def process_db(db_path: str, cutoff_str: str, delete_empty_dbs: bool) -> tuple[int, bool]:
    """
    Returns (rows_deleted, db_removed)
    """
    if not has_sqlite_header(db_path):
        print(f"  [SKIP] Non-SQLite file: {os.path.basename(db_path)}")
        return 0, False

    conn = sqlite3.connect(db_path)
    try:
        deleted = delete_old_attendance_rows(conn, cutoff_str)
        if deleted > 0:
            conn.commit()

        removed = False
        if delete_empty_dbs and is_db_empty(conn):
            conn.close()
            os.remove(db_path)
            removed = True
        return deleted, removed
    finally:
        try:
            conn.close()
        except Exception:
            pass


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Cleanup user_session_history DBs: delete rows older than N years and remove empty DBs."
    )
    parser.add_argument("--dir", default=None, help="Path to user_session_history directory (optional).")
    parser.add_argument("--years", type=int, default=4, help="Delete entries older than this many years (default: 4).")
    parser.add_argument(
        "--keep-empty",
        action="store_true",
        help="Do not delete empty DB files after cleanup (default deletes empties).",
    )
    args = parser.parse_args()

    user_dir = resolve_user_session_history_dir(args.dir)
    if not user_dir:
        print("user_session_history directory not found. Nothing to do.")
        return 0

    cutoff = subtract_years(date.today(), int(args.years))
    cutoff_str = cutoff.strftime("%Y-%m-%d")

    db_files = sorted(list_db_files(user_dir))
    print(f"Scanning {len(db_files)} DBs in: {user_dir}")
    print(f"Deleting attendance entries older than: {cutoff_str} ({args.years} years)")

    total_deleted = 0
    total_removed = 0
    for db_path in db_files:
        name = os.path.basename(db_path)
        deleted, removed = process_db(db_path, cutoff_str, delete_empty_dbs=(not args.keep_empty))
        if removed:
            total_removed += 1
            print(f"  [OK] {name}: removed (empty after cleanup)")
        else:
            total_deleted += deleted
            print(f"  [OK] {name}: deleted {deleted} old row(s)")

    print(f"Done. Deleted {total_deleted} row(s). Removed {total_removed} empty DB(s).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

