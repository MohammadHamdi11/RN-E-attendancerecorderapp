# -*- coding: utf-8 -*-
"""
excel_to_db.py
==============
Converts raw scanner Excel files directly into SQLite .db files,
ready to be used by the attendance app.

HOW IT WORKS (all 5 pipeline steps in one go):
  Step 1 - Read each Excel file, extract metadata from the filename
           (year, batch, sessionId, hashed email of the teacher/user)
  Step 2 - Match the hashed email to user details (user_id, user_name,
           division, department) using the userID-email lookup file
  Step 3 - Enrich every row:
             - scanTime  = log_date + log_time combined into ISO format
             - dateTime  = earliest scanTime in the session
             - isManual  = 1 if Type == "manual", else 0
             - isScanner / isChecklist / isExcused / isEdited flags
  Step 4 - Remove rows with invalid log_time (not hh:mm:ss)
  Step 5 - Remove duplicate rows (same student_id + subject + date + time)
  Step 6 - Write one .db file per (sessionId, user_id) combination,
           named  sessionId_userId.db

OUTPUT FILENAME PATTERN:
  scanner1234567890123_987654321012.db
   +-- sessionId ------+ +-- userId +

USAGE:
  python excel_to_db.py

The script will ask you for:
  1. Folder containing the raw Excel files  (or press Enter for current folder)
  2. The userID-email.xlsx lookup file path (or press Enter for default name)
  3. Output folder for .db files            (or press Enter for ./output_db)
"""

import os
import re
import sqlite3
import hashlib
import logging
from pathlib import Path
from datetime import datetime
from typing import Optional

import pandas as pd

# ==============================================================================
#  SESSION ID GENERATOR
# ==============================================================================

def generate_session_id(prefix: str) -> str:
    """
    Generate a random sessionId in the format: {prefix}{12 digits}
    Examples: scanner425637256261 / checklist653452676356
              excuses152634576328 / edited425362736352
    """
    import random
    digits = ''.join([str(random.randint(0, 9)) for _ in range(12)])
    return f"{prefix}{digits}"


def detect_session_prefix(types_series) -> str:
    """
    Detect the session type prefix from a sheet's Type column.
    Returns: 'scanner' | 'checklist' | 'excuses' | 'edited'
    Falls back to 'scanner' if all rows are Manual or unknown.
    """
    non_manual = (
        types_series.dropna()
        .astype(str)
        .str.lower().str.strip()
        .pipe(lambda s: s[s != 'manual'])
        .unique()
    )
    if len(non_manual) == 0:
        return 'scanner'  # last resort fallback
    if 'scan' in non_manual:
        return 'scanner'
    if any(t in non_manual for t in ('selection', 'checklist')):
        return 'checklist'
    if any(t in non_manual for t in ('excuse', 'excused')):
        return 'excuses'
    if any(t in non_manual for t in ('edit', 'edited')):
        return 'edited'
    return 'scanner'  # final fallback


# ==============================================================================
#  PART 1 -- FILENAME PARSING
# ==============================================================================

def parse_filename(filename: str) -> dict:
    """
    Extract metadata embedded in the Excel filename.

    Expected pattern:
        Y{year}_B{batch}_{Subject}_{sessionId}_{hashedEmail}.xlsx

    Example:
        Y1_B2526_Microbiology_scanner1772364274535_9fb0d249...xlsx

    Returns a dict with keys:
        year        int  (e.g. 1)
        batch       str  (e.g. "2025/2026")
        subject     str  (e.g. "Microbiology")
        session_id  str  (e.g. "scanner1772364274535")
        hashed_email str (64-char hex, or None)
    """
    stem = Path(filename).stem  # strip .xlsx

    # -- year ------------------------------------------------------------------
    year_match = re.search(r'Y(\d+)', stem)
    year = int(year_match.group(1)) if year_match else None

    # -- batch  B2526 -> "2025/2026" --------------------------------------------
    batch_match = re.search(r'B(\d{4})', stem)
    batch = None
    if batch_match:
        code = batch_match.group(1)          # e.g. "2526"
        batch = f"20{code[:2]}/20{code[2:]}" # "2025/2026"

    # -- sessionId  (scanner + 13+ digits) ------------------------------------
    session_match = re.search(r'((?:scanner|checklist|excuses|edited)\d{10,})', stem, re.IGNORECASE)
    session_id = session_match.group(1) if session_match else None

    # -- hashed email (64-char hex at the very end) ----------------------------
    hash_match = re.search(r'_([a-f0-9]{64})$', stem, re.IGNORECASE)
    hashed_email = hash_match.group(1) if hash_match else None

    # -- subject  (everything between batch and sessionId) --------------------
    # Remove known tokens and what remains is the subject
    subject = stem
    for token in [
        year_match.group(0) if year_match else "",
        batch_match.group(0) if batch_match else "",
        session_match.group(0) if session_match else "",
        f"_{hashed_email}" if hashed_email else "",
    ]:
        subject = subject.replace(token, "")
    subject = subject.strip("_").strip()

    return {
        "year": year,
        "batch": batch,
        "subject": subject,
        "session_id": session_id,
        "filename_lower": stem.lower(),
        "hashed_email": hashed_email,
    }


# ==============================================================================
#  PART 2 -- USER LOOKUP
# ==============================================================================

def load_user_lookup(lookup_path: str) -> dict:
    """
    Read userID-email.xlsx and return a dict:
        { hashed_email_string : { user_id, user_name, division, department } }

    The email column in the file is expected to already be the SHA-256 hash.
    """
    logging.info(f"Loading user lookup: {lookup_path}")

    ext = Path(lookup_path).suffix.lower()
    df = pd.read_csv(lookup_path) if ext == ".csv" else pd.read_excel(lookup_path)

    required = {"email", "user_id", "user_name", "division", "department"}
    missing = required - set(df.columns)
    if missing:
        raise ValueError(f"Lookup file is missing columns: {missing}")

    lookup = {}
    for _, row in df.iterrows():
        key = str(row["email"]).strip().lower()
        if key:
            lookup[key] = {
                "user_id":    str(row["user_id"]).strip(),
                "user_name":  str(row["user_name"]).strip(),
                "division":   str(row["division"]).strip() if pd.notna(row["division"]) else "N/A",
                "department": str(row["department"]).strip() if pd.notna(row["department"]) else "N/A",
            }

    logging.info(f"  Loaded {len(lookup):,} users from lookup file")
    return lookup


DEVELOPER_USER = {
    "user_id":    "000000000000",
    "user_name":  "Developer",
    "division":   "N/A",
    "department": "N/A",
}


def resolve_user(hashed_email: Optional[str], lookup: dict) -> dict:
    """
    Return user details by looking up a hashed email in the lookup table.
    Falls back to a Developer placeholder if nothing is found.
    """
    if hashed_email:
        key = hashed_email.strip().lower()
        if key in lookup:
            return lookup[key]
    return DEVELOPER_USER


def resolve_user_from_plain_email(plain_email: str, lookup: dict) -> dict:
    """
    Hash a plain email address with SHA-256 then look it up.
    Used when the filename has no embedded hash but the User column
    contains the original email (e.g. multi-sheet all_sessions files).
    Falls back to Developer if the email is not in the lookup table.
    """
    try:
        email_str = str(plain_email).strip().lower()
        if not email_str or email_str == "nan":
            return DEVELOPER_USER
        hashed = hashlib.sha256(email_str.encode("utf-8")).hexdigest()
        return lookup.get(hashed, DEVELOPER_USER)
    except Exception:
        return DEVELOPER_USER


# ==============================================================================
#  PART 3 -- ROW-LEVEL TRANSFORMATIONS  (Scripts 1, 2, 3, 5 logic)
# ==============================================================================

def to_iso(date_val, time_val) -> Optional[str]:
    """Combine log_date + log_time into ISO-8601 string (UTC 'Z' suffix)."""
    try:
        if pd.isna(date_val) or pd.isna(time_val):
            return None

        date_str = str(date_val).strip()
        time_str = str(time_val).strip()

        # Accept dd/mm/yyyy  OR  yyyy-mm-dd (from Excel datetime serialisation)
        if re.match(r"\d{2}/\d{2}/\d{4}", date_str):
            day, month, year = date_str.split("/")
        elif re.match(r"\d{4}-\d{2}-\d{2}", date_str):
            year, month, day = date_str.split("-")[:3]  # drop time part if present
        else:
            return None

        # Accept hh:mm:ss  (ignore fractional seconds if present)
        time_parts = time_str.split(":")
        if len(time_parts) < 3:
            return None
        h, m, s = time_parts[0], time_parts[1], time_parts[2].split(".")[0]

        dt = datetime(int(year), int(month), int(day),
                      int(h), int(m), int(s), 13000)
        return dt.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"

    except Exception:
        return None


def format_log_date(date_val) -> str:
    """Return log_date as dd/mm/yyyy string."""
    try:
        if pd.isna(date_val):
            return ""
        date_str = str(date_val).strip()
        # Already dd/mm/yyyy
        if re.match(r"\d{2}/\d{2}/\d{4}$", date_str):
            return date_str
        # Excel may give yyyy-mm-dd hh:mm:ss
        dt = pd.to_datetime(date_str, errors="coerce")
        if pd.notna(dt):
            return dt.strftime("%d/%m/%Y")
        return date_str
    except Exception:
        return str(date_val)


def is_valid_time(time_val) -> bool:
    """Check that time_val is a valid hh:mm:ss string."""
    try:
        if pd.isna(time_val):
            return False
        s = str(time_val).strip()
        if not re.match(r"^\d{1,2}:\d{2}:\d{2}$", s):
            return False
        h, m, sec = map(int, s.split(":"))
        return 0 <= h <= 23 and 0 <= m <= 59 and 0 <= sec <= 59
    except Exception:
        return False


def categorise_session(types_series) -> pd.Series:
    """
    Given the 'Type' column for one session, return
    a pd.Series with isChecklist, isScanner, isExcused, isEdited flags.
    Priority: scan > selection/checklist > excuse > edited
    """
    flags = {"isChecklist": 0, "isScanner": 0, "isExcused": 0, "isEdited": 0}
    non_manual = (
        types_series.dropna()
        .str.lower().str.strip()
        .pipe(lambda s: s[s != "manual"])
        .unique()
    )
    if len(non_manual) == 0:
        flags["isScanner"] = 1  # last resort: all-manual session -> scanner
        return pd.Series(flags)
    if "scan" in non_manual:
        flags["isScanner"] = 1
    elif any(t in non_manual for t in ("selection", "checklist")):
        flags["isChecklist"] = 1
    elif any(t in non_manual for t in ("excuse", "excused")):
        flags["isExcused"] = 1
    elif any(t in non_manual for t in ("edited", "edit")):
        flags["isEdited"] = 1
    return pd.Series(flags)


# ==============================================================================
#  PART 4 -- DATABASE WRITING
# ==============================================================================

DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS attendance (
    id               INTEGER PRIMARY KEY AUTOINCREMENT,
    sessionId        TEXT    NOT NULL,
    subject          TEXT,
    dateTime         TEXT,
    inProgress       INTEGER DEFAULT 0,
    year             INTEGER,
    batch            TEXT,
    isChecklist      INTEGER DEFAULT 0,
    isScanner        INTEGER DEFAULT 0,
    isExcused        INTEGER DEFAULT 0,
    isEdited         INTEGER DEFAULT 0,
    backedUp         INTEGER DEFAULT 0,
    personalBackedUp INTEGER DEFAULT 0,
    synced           INTEGER DEFAULT 0,
    syncedAt         TEXT,
    student_id       TEXT    DEFAULT '',
    scanTime         TEXT,
    log_date         TEXT,
    log_time         TEXT,
    isManual         INTEGER DEFAULT 0,
    created_at       TEXT    DEFAULT (datetime('now')),
    updated_at       TEXT,
    notes            TEXT,
    user_name        TEXT,
    user_id          TEXT,
    division         TEXT,
    department       TEXT
);

CREATE TABLE IF NOT EXISTS _db_meta (
    key   TEXT PRIMARY KEY,
    value TEXT
);
"""

INSERT_SQL = """
INSERT INTO attendance (
    sessionId, subject, dateTime, inProgress, year, batch,
    isChecklist, isScanner, isExcused, isEdited,
    backedUp, personalBackedUp, synced, syncedAt,
    student_id, scanTime, log_date, log_time,
    isManual, created_at, updated_at, notes,
    user_name, user_id, division, department
) VALUES (
    ?, ?, ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?,
    ?, ?, ?, ?
)
"""


def write_db(db_path: Path, rows: list[tuple]):
    """Create (or overwrite) a .db file and insert all rows."""
    if db_path.exists():
        db_path.unlink()

    conn = sqlite3.connect(db_path)
    conn.executescript(DB_SCHEMA)
    conn.executemany(INSERT_SQL, rows)
    conn.commit()
    conn.close()


# ==============================================================================
#  PART 5 -- MAIN PIPELINE
# ==============================================================================

def process_excel_file(excel_path: Path, lookup: dict, meta: dict) -> Optional[pd.DataFrame]:
    """
    Read one raw Excel file and return a fully-enriched DataFrame,
    or None if there is nothing usable inside.

    meta  =  output of parse_filename()
    """
    try:
        xl = pd.ExcelFile(excel_path, engine="openpyxl")
    except Exception as e:
        logging.error(f"    Cannot open {excel_path.name}: {e}")
        return None

    frames = []
    for sheet in xl.sheet_names:
        try:
            df = xl.parse(sheet)
        except Exception as e:
            logging.warning(f"    Skipping sheet '{sheet}': {e}")
            continue

        if df.empty:
            continue

        # -- normalise column names (strip spaces, lower for matching) ---------
        df.columns = [c.strip() for c in df.columns]
        col_map = {c.lower().replace(" ", "_"): c for c in df.columns}

        def gcol(canonical: str):
            """Get the actual column name regardless of capitalisation."""
            return col_map.get(canonical)

        # -- required columns --------------------------------------------------
        sid_col  = gcol("student_id")
        subj_col = gcol("subject")
        date_col = gcol("log_date")
        time_col = gcol("log_time")
        type_col = gcol("type")
        user_col = gcol("user")

        if not all([sid_col, date_col, time_col]):
            logging.warning(f"    Sheet '{sheet}' missing required columns, skipping")
            continue

        out = pd.DataFrame()

        # -- basic columns -----------------------------------------------------
        out["student_id"]       = df[sid_col].apply(
            lambda x: str(int(x)) if pd.notna(x) and str(x).replace(".0","").isdigit() else str(x) if pd.notna(x) else ""
        )
        out["subject"]          = df[subj_col].astype(str) if subj_col else meta["subject"]
        out["log_date_raw"]     = df[date_col]  # keep raw for scanTime calc
        out["log_time"]         = df[time_col].astype(str).str.strip() if time_col else ""
        out["type_raw"]         = df[type_col].astype(str) if type_col else "scan"
        out["user_raw"]         = df[user_col].astype(str).str.strip() if user_col else ""

        # -- session info from filename ----------------------------------------
        # Single-sheet workbook or filename already contains a sessionId:
        #   use it directly.
        # Multi-sheet workbook with no sessionId in filename:
        #   generate one per sheet so each session gets a unique ID.
        if meta["session_id"]:
            sheet_session_id = meta["session_id"]
        else:
            # Detect type from this sheet's Type column and generate ID
            prefix = detect_session_prefix(out["type_raw"])
            sheet_session_id = generate_session_id(prefix)
            logging.info(f"    Generated sessionId for sheet '{sheet}': {sheet_session_id}")

        out["sessionId"]        = sheet_session_id
        out["year"]             = meta["year"]
        out["batch"]            = meta["batch"] or ""

        frames.append(out)

    if not frames:
        return None

    df = pd.concat(frames, ignore_index=True)

    # == Step A: remove invalid times ==========================================
    valid_mask = df["log_time"].apply(is_valid_time)
    dropped = (~valid_mask).sum()
    if dropped:
        logging.info(f"    Dropped {dropped:,} rows with invalid log_time")
    df = df[valid_mask].copy()

    if df.empty:
        return None

    # == Step B: format log_date (dd/mm/yyyy) ==================================
    df["log_date"] = df["log_date_raw"].apply(format_log_date)

    # == Step C: scanTime  (ISO datetime) ======================================
    df["scanTime"] = df.apply(
        lambda r: to_iso(r["log_date_raw"], r["log_time"]), axis=1
    )

    # == Step D: isManual flag ==================================================
    df["isManual"] = df["type_raw"].str.lower().str.strip().eq("manual").astype(int)

    # == Step E: session-level flags from FILENAME, not from Type column ========
    # A session is isScanner if the filename contains 'scanner', isChecklist if
    # it contains 'checklist' or 'selection', etc.  Individual rows may be
    # Type=Manual even inside a scanner session (manual top-ups during scanning)
    # and those rows are still part of a scanner session.
    filename_lower = meta.get("filename_lower", "")
    if "scanner" in filename_lower:
        df["isScanner"]    = 1
        df["isChecklist"]  = 0
        df["isExcused"]    = 0
        df["isEdited"]     = 0
    elif "checklist" in filename_lower or "selection" in filename_lower:
        df["isScanner"]    = 0
        df["isChecklist"]  = 1
        df["isExcused"]    = 0
        df["isEdited"]     = 0
    elif "excus" in filename_lower:
        df["isScanner"]    = 0
        df["isChecklist"]  = 0
        df["isExcused"]    = 1
        df["isEdited"]     = 0
    elif "edit" in filename_lower:
        df["isScanner"]    = 0
        df["isChecklist"]  = 0
        df["isExcused"]    = 0
        df["isEdited"]     = 1
    else:
        # Fallback: inspect Type column per session (original logic)
        session_flags = (
            df.groupby("sessionId")["type_raw"]
            .apply(categorise_session)
            .unstack(level=1)
            .reset_index()
        )
        for col in ("isChecklist", "isScanner", "isExcused", "isEdited"):
            if col not in session_flags.columns:
                session_flags[col] = 0
        df = df.merge(session_flags, on="sessionId", how="left")

    # == Step F: dateTime = earliest scanTime per session ======================
    earliest = (
        df.groupby("sessionId")["scanTime"]
        .apply(lambda s: s.dropna().astype(str).min() if s.dropna().any() else None)
        .rename("dateTime")
        .reset_index()
    )
    df = df.merge(earliest, on="sessionId", how="left")

    # == Step G: resolve user ===================================================
    # Priority:
    #   1. Hashed email embedded in the filename  (single-session files)
    #   2. Plain email in the User column         (multi-sheet all_sessions files)
    #   3. Developer fallback                     (unknown / missing)
    if meta["hashed_email"]:
        user_info = resolve_user(meta["hashed_email"], lookup)
        df["user_id"]    = user_info["user_id"]
        df["user_name"]  = user_info["user_name"]
        df["division"]   = user_info["division"]
        df["department"] = user_info["department"]
    else:
        if "user_raw" in df.columns:
            resolved = df["user_raw"].apply(
                lambda email: resolve_user_from_plain_email(email, lookup)
            )
            df["user_id"]    = resolved.apply(lambda u: u["user_id"])
            df["user_name"]  = resolved.apply(lambda u: u["user_name"])
            df["division"]   = resolved.apply(lambda u: u["division"])
            df["department"] = resolved.apply(lambda u: u["department"])
        else:
            df["user_id"]    = DEVELOPER_USER["user_id"]
            df["user_name"]  = DEVELOPER_USER["user_name"]
            df["division"]   = DEVELOPER_USER["division"]
            df["department"] = DEVELOPER_USER["department"]

    # == Step H: fixed / default columns ======================================
    now_ts = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z"
    df["inProgress"]       = 0
    df["backedUp"]         = 1   # migrated data = treat as backed up
    df["personalBackedUp"] = 1
    df["synced"]           = 1
    # syncedAt = same as dateTime (session start timestamp)
    df["syncedAt"]         = df["dateTime"].fillna(now_ts)
    df["created_at"]       = now_ts
    df["updated_at"]       = now_ts
    df["notes"]            = None

    # == Step I: remove duplicates (student + subject + date + time) ===========
    before = len(df)
    df.drop_duplicates(
        subset=["student_id", "subject", "log_date", "log_time"],
        keep="first",
        inplace=True,
    )
    dupes = before - len(df)
    if dupes:
        logging.info(f"    Removed {dupes:,} duplicate rows")

    df.drop(columns=["log_date_raw", "type_raw", "user_raw"], inplace=True, errors="ignore")

    return df


def run(excel_dir: str, lookup_path: str, output_dir: str):
    """Main entry-point: process all Excel files and write .db files."""

    excel_dir  = Path(excel_dir)
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    # Load user lookup
    try:
        lookup = load_user_lookup(lookup_path)
    except Exception as e:
        logging.error(f"Failed to load lookup file: {e}")
        return

    # Find Excel files -- only those matching the scanner filename pattern:
    #   Y{year}_B{batch}_{Subject}_scanner{digits}_{hash}.xlsx
    ATTENDANCE_PATTERN = re.compile(r'^Y\d+', re.IGNORECASE)

    all_excel = sorted(
        list(excel_dir.glob("*.xlsx")) + list(excel_dir.glob("*.xls"))
    )
    excel_files = [
        f for f in all_excel
        if not f.name.startswith("~$") and ATTENDANCE_PATTERN.search(f.stem)
    ]
    skipped = [f.name for f in all_excel if f not in excel_files and not f.name.startswith("~$")]

    if skipped:
        logging.info(f"Skipping {len(skipped)} non-attendance file(s): {', '.join(skipped)}")

    if not excel_files:
        logging.warning(f"No attendance Excel files found in: {excel_dir}")
        logging.warning("Files must start with Y{{year}} e.g. Y1_B2526_Subject_scanner...xlsx")
        return

    logging.info(f"Found {len(excel_files)} Excel file(s) to process")
    logging.info("=" * 70)

    total_db          = 0
    total_rows        = 0
    failed_files      = []
    converted_files   = []   # Excel paths that produced at least one .db successfully

    for idx, xl_path in enumerate(excel_files, 1):
        logging.info(f"[{idx}/{len(excel_files)}] {xl_path.name}")

        meta = parse_filename(xl_path.name)
        logging.info(
            f"    -> year={meta['year']}, batch={meta['batch']}, "
            f"session={meta['session_id']}, "
            f"hashed_email={'yes' if meta['hashed_email'] else 'not found'}"
        )

        df = process_excel_file(xl_path, lookup, meta)

        if df is None or df.empty:
            logging.warning(f"    No usable data -- skipping")
            failed_files.append(xl_path.name)
            continue

        # -- one .db per (sessionId, user_id) combination ---------------------
        groups = df.groupby(["sessionId", "user_id"])
        file_had_success = False
        for (session_id, user_id), group in groups:
            db_name   = f"{session_id}_{user_id}.db"
            db_path   = output_dir / db_name

            # Build list of tuples matching INSERT_SQL column order
            records = []
            for _, r in group.iterrows():
                records.append((
                    str(r["sessionId"]),
                    str(r["subject"]),
                    r["dateTime"],
                    int(r["inProgress"]),
                    int(r["year"]) if pd.notna(r["year"]) else None,
                    str(r["batch"]),
                    int(r["isChecklist"]),
                    int(r["isScanner"]),
                    int(r["isExcused"]),
                    int(r["isEdited"]),
                    int(r["backedUp"]),
                    int(r["personalBackedUp"]),
                    int(r["synced"]),
                    str(r["syncedAt"]),
                    str(r["student_id"]),
                    r["scanTime"],
                    str(r["log_date"]),
                    str(r["log_time"]),
                    int(r["isManual"]),
                    str(r["created_at"]),
                    str(r["updated_at"]),
                    r["notes"],
                    str(r["user_name"]),
                    str(r["user_id"]),
                    str(r["division"]),
                    str(r["department"]),
                ))

            try:
                write_db(db_path, records)
                logging.info(f"    [OK] {db_name}  ({len(records)} rows)")
                total_db       += 1
                total_rows     += len(records)
                file_had_success = True
            except Exception as e:
                logging.error(f"    [FAIL] Failed to write {db_name}: {e}")
                failed_files.append(xl_path.name)

        if file_had_success:
            converted_files.append(xl_path)

    # -- Summary ----------------------------------------------------------------
    logging.info("=" * 70)
    logging.info("DONE")
    logging.info(f"  Excel files processed : {len(excel_files) - len(failed_files)} / {len(excel_files)}")
    logging.info(f"  .db files created     : {total_db:,}")
    logging.info(f"  Total rows inserted   : {total_rows:,}")
    if failed_files:
        logging.warning(f"  Files with issues ({len(failed_files)}):")
        for f in failed_files:
            logging.warning(f"    - {f}")
    logging.info(f"  Output folder         : {output_dir.resolve()}")
    logging.info(f"  Log file              : {log_filename}")

    return converted_files


# ==============================================================================
#  CLI
# ==============================================================================

def run_headless(excel_dir: str, lookup_path: str, output_dir: str):
    """
    Non-interactive entry-point for use in automated pipelines (e.g. GitHub Actions).

    Converts all scanner Excel files found in `excel_dir` to .db files and
    writes them to `output_dir`.  Exits with code 1 on fatal errors so the
    calling workflow step fails visibly.

    Example (CI step):
        python excel_to_db.py --headless \
            --excel-dir  log_history \
            --lookup     userID-email.xlsx \
            --output-dir log_history
    """
    logging.info("Running in headless (non-interactive) mode")
    logging.info(f"  Excel dir  : {excel_dir}")
    logging.info(f"  Lookup     : {lookup_path}")
    logging.info(f"  Output dir : {output_dir}")

    if not Path(excel_dir).is_dir():
        logging.error(f"Excel dir not found: '{excel_dir}'")
        raise SystemExit(1)

    if not Path(lookup_path).exists():
        logging.error(f"Lookup file not found: '{lookup_path}'")
        raise SystemExit(1)

    converted = run(excel_dir, lookup_path, output_dir) or []

    # Write a manifest of successfully converted Excel paths so the calling
    # shell script can delete exactly those files and nothing else.
    manifest_path = Path(output_dir) / ".converted_manifest.txt"
    with open(manifest_path, "w", encoding="utf-8") as fh:
        for p in converted:
            fh.write(str(p.resolve()) + "\n")
    logging.info(f"Manifest written: {manifest_path}  ({len(converted)} file(s))")


def main():
    import argparse

    # ------------------------------------------------------------------
    # If --headless flag is present, skip all interactive prompts
    # ------------------------------------------------------------------
    parser = argparse.ArgumentParser(
        description="Excel -> SQLite DB Converter",
        add_help=True,
    )
    parser.add_argument(
        "--headless",
        action="store_true",
        help="Run without interactive prompts (for CI / GitHub Actions)",
    )
    parser.add_argument(
        "--excel-dir",
        default=".",
        help="Folder containing raw Excel files (default: current folder)",
    )
    parser.add_argument(
        "--lookup",
        default="userID-email.xlsx",
        help="Path to userID-email lookup file (default: userID-email.xlsx)",
    )
    parser.add_argument(
        "--output-dir",
        default="./output_db",
        help="Folder where .db files will be saved (default: ./output_db)",
    )

    args = parser.parse_args()

    if args.headless:
        run_headless(args.excel_dir, args.lookup, args.output_dir)
        print("\nHeadless run complete. Check the log file for full details.")
        return

    # ------------------------------------------------------------------
    # Interactive mode (original behaviour)
    # ------------------------------------------------------------------
    print("=" * 70)
    print("  Excel -> SQLite DB Converter")
    print("  (All pipeline steps combined into one script)")
    print("=" * 70)

    excel_dir = input(
        "\nFolder containing raw Excel files\n"
        "(press Enter for current folder): "
    ).strip() or "."

    if not Path(excel_dir).is_dir():
        print(f"Error: '{excel_dir}' is not a folder.")
        return

    lookup_path = input(
        "\nPath to userID-email lookup file\n"
        "(press Enter for 'userID-email.xlsx'): "
    ).strip() or "userID-email.xlsx"

    if not Path(lookup_path).exists():
        print(f"Error: lookup file '{lookup_path}' not found.")
        return

    output_dir = input(
        "\nFolder where .db files will be saved\n"
        "(press Enter for './output_db'): "
    ).strip() or "./output_db"

    # -- Confirm ----------------------------------------------------------------
    print("\n" + "=" * 70)
    print("  Settings:")
    print(f"    Excel folder  : {excel_dir}")
    print(f"    Lookup file   : {lookup_path}")
    print(f"    Output folder : {output_dir}")
    print("=" * 70)

    go = input("\nStart? (yes / no): ").strip().lower()
    if go not in ("yes", "y"):
        print("Cancelled.")
        return

    print()
    run(excel_dir, lookup_path, output_dir)
    print("\nAll done! Check the log file for full details.")


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
    except Exception as e:
        logging.error(f"Fatal error: {e}", exc_info=True)
        print(f"\nFatal error: {e}")
