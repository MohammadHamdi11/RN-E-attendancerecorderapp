"""
Log Database Management Script

This script merges attendance logs from multiple sources, deduplicates,
archives old records, and maintains two databases:
- log_history.db (records ≤ 6 months old)
- log_deleted.db (records > 6 months and ≤ 3 years old)

Records older than 3 years are permanently deleted.
"""

import sqlite3
import os
import shutil
from datetime import datetime, timedelta
from pathlib import Path
import subprocess

# Configuration
LOG_HISTORY_DIR = 'log_history'
LOG_DELETED_DIR = 'log_deleted'
USER_SESSION_DIR = 'user_session_history'
PROCESSED_ARCHIVE_DIR = 'archive/processed_logs'

# Time thresholds
SIX_MONTHS_AGO = datetime.now() - timedelta(days=180)
THREE_YEARS_AGO = datetime.now() - timedelta(days=1095)
FIVE_MINUTES_AGO = datetime.now() - timedelta(minutes=5)  # Safety buffer

def log(message):
    """Print timestamped log message"""
    print(f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] {message}")

def get_db_files(directory, apply_timestamp_filter=False):
    """Get all .db files from a directory, optionally filtering by age"""
    if not os.path.exists(directory):
        log(f"Directory {directory} does not exist, skipping")
        return []
    
    db_files = []
    
    for filename in os.listdir(directory):
        if not filename.endswith('.db'):
            continue
        
        filepath = os.path.join(directory, filename)
        
        # Apply timestamp filter if requested (for log_history only)
        if apply_timestamp_filter:
            # Get file modification time
            file_mtime = datetime.fromtimestamp(os.path.getmtime(filepath))
            
            # Skip files modified in the last 5 minutes (safety buffer)
            if file_mtime > FIVE_MINUTES_AGO:
                log(f"  Skipping {filename} (too recent, modified at {file_mtime.strftime('%Y-%m-%d %H:%M:%S')})")
                continue
        
        db_files.append(filepath)
    
    log(f"Found {len(db_files)} .db files in {directory}")
    return db_files

def create_temporary_merged_db():
    """Create temporary database for merging all records"""
    temp_db_path = 'temp_merged.db'
    
    # Remove if exists
    if os.path.exists(temp_db_path):
        os.remove(temp_db_path)
    
    conn = sqlite3.connect(temp_db_path)
    cursor = conn.cursor()
    
    # Create attendance table with all columns
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS attendance (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            student_id INTEGER NOT NULL,
            subject TEXT NOT NULL,
            log_date TEXT NOT NULL,
            log_time TEXT NOT NULL,
            sessionId TEXT NOT NULL,
            dateTime TEXT NOT NULL,
            inProgress INTEGER NOT NULL,
            isChecklist INTEGER NOT NULL,
            isScanner INTEGER NOT NULL,
            isExcused INTEGER NOT NULL,
            isEdited INTEGER NOT NULL,
            backedUp INTEGER NOT NULL,
            personalBackedUp INTEGER NOT NULL,
            synced INTEGER NOT NULL,
            syncedAt TEXT NOT NULL,
            year INTEGER NOT NULL,
            batch TEXT NOT NULL,
            scanTime TEXT NOT NULL,
            isManual INTEGER NOT NULL,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL,
            notes TEXT,
            user_name TEXT NOT NULL,
            user_id TEXT NOT NULL,
            division TEXT NOT NULL,
            department TEXT NOT NULL
        )
    ''')
    
    # Create index for deduplication
    cursor.execute('''
        CREATE INDEX IF NOT EXISTS idx_dedup 
        ON attendance(student_id, subject, log_date, log_time)
    ''')
    
    conn.commit()
    conn.close()
    
    log(f"Created temporary database: {temp_db_path}")
    return temp_db_path

def merge_database_into_temp(source_db_path, temp_db_path):
    """Merge records from source database into temporary database"""
    try:
        source_conn = sqlite3.connect(source_db_path)
        temp_conn = sqlite3.connect(temp_db_path)
        
        source_cursor = source_conn.cursor()
        temp_cursor = temp_conn.cursor()
        
        # Get all records from source
        source_cursor.execute('SELECT * FROM attendance')
        records = source_cursor.fetchall()
        
        if not records:
            log(f"  No records found in {os.path.basename(source_db_path)}")
            source_conn.close()
            temp_conn.close()
            return 0
        
        # Get column names (excluding id for auto-increment)
        source_cursor.execute('PRAGMA table_info(attendance)')
        columns = [col[1] for col in source_cursor.fetchall() if col[1] != 'id']
        
        # Insert records (excluding original id, will auto-increment)
        placeholders = ','.join(['?' for _ in columns])
        insert_query = f'INSERT INTO attendance ({",".join(columns)}) VALUES ({placeholders})'
        
        inserted_count = 0
        for record in records:
            # Skip the id column (first column)
            record_without_id = record[1:]
            
            try:
                temp_cursor.execute(insert_query, record_without_id)
                inserted_count += 1
            except sqlite3.IntegrityError as e:
                log(f"  Skipped duplicate/error: {e}")
                continue
        
        temp_conn.commit()
        
        source_conn.close()
        temp_conn.close()
        
        log(f"  Merged {inserted_count} records from {os.path.basename(source_db_path)}")
        return inserted_count
        
    except Exception as e:
        log(f"  ERROR merging {source_db_path}: {e}")
        return 0

def remove_duplicates(db_path):
    """Remove duplicate records based on student_id, subject, log_date, log_time"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    log("Removing duplicates...")
    
    # Get count before
    cursor.execute('SELECT COUNT(*) FROM attendance')
    count_before = cursor.fetchone()[0]
    
    # Keep only the first occurrence of each duplicate group
    # (based on student_id, subject, log_date, log_time)
    cursor.execute('''
        DELETE FROM attendance
        WHERE id NOT IN (
            SELECT MIN(id)
            FROM attendance
            GROUP BY student_id, subject, log_date, log_time
        )
    ''')
    
    conn.commit()
    
    # Get count after
    cursor.execute('SELECT COUNT(*) FROM attendance')
    count_after = cursor.fetchone()[0]
    
    duplicates_removed = count_before - count_after
    log(f"Removed {duplicates_removed} duplicates ({count_before} -> {count_after})")
    
    conn.close()
    return duplicates_removed

def delete_old_records(db_path, cutoff_date):
    """Delete records older than cutoff_date"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    cutoff_str = cutoff_date.strftime('%Y-%m-%d')
    
    # Count records to be deleted
    cursor.execute('SELECT COUNT(*) FROM attendance WHERE log_date < ?', (cutoff_str,))
    count_to_delete = cursor.fetchone()[0]
    
    if count_to_delete > 0:
        # Delete old records
        cursor.execute('DELETE FROM attendance WHERE log_date < ?', (cutoff_str,))
        conn.commit()
        log(f"Deleted {count_to_delete} records older than {cutoff_str}")
    else:
        log(f"No records older than {cutoff_str} to delete")
    
    conn.close()
    return count_to_delete

def split_into_history_and_deleted(source_db_path, history_db_path, deleted_db_path):
    """Split records into log_history.db (≤6 months) and log_deleted.db (>6 months, ≤3 years)"""
    
    six_months_str = SIX_MONTHS_AGO.strftime('%Y-%m-%d')
    
    # Create/recreate history database
    if os.path.exists(history_db_path):
        os.remove(history_db_path)
    
    # Create/recreate deleted database  
    if os.path.exists(deleted_db_path):
        os.remove(deleted_db_path)
    
    source_conn = sqlite3.connect(source_db_path)
    history_conn = sqlite3.connect(history_db_path)
    deleted_conn = sqlite3.connect(deleted_db_path)
    
    # Create tables in both databases
    for conn in [history_conn, deleted_conn]:
        cursor = conn.cursor()
        cursor.execute('''
            CREATE TABLE IF NOT EXISTS attendance (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                student_id INTEGER NOT NULL,
                subject TEXT NOT NULL,
                log_date TEXT NOT NULL,
                log_time TEXT NOT NULL,
                sessionId TEXT NOT NULL,
                dateTime TEXT NOT NULL,
                inProgress INTEGER NOT NULL,
                isChecklist INTEGER NOT NULL,
                isScanner INTEGER NOT NULL,
                isExcused INTEGER NOT NULL,
                isEdited INTEGER NOT NULL,
                backedUp INTEGER NOT NULL,
                personalBackedUp INTEGER NOT NULL,
                synced INTEGER NOT NULL,
                syncedAt TEXT NOT NULL,
                year INTEGER NOT NULL,
                batch TEXT NOT NULL,
                scanTime TEXT NOT NULL,
                isManual INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                notes TEXT,
                user_name TEXT NOT NULL,
                user_id TEXT NOT NULL,
                division TEXT NOT NULL,
                department TEXT NOT NULL
            )
        ''')
        conn.commit()
    
    # Get column names (excluding id)
    source_cursor = source_conn.cursor()
    source_cursor.execute('PRAGMA table_info(attendance)')
    columns = [col[1] for col in source_cursor.fetchall() if col[1] != 'id']
    
    placeholders = ','.join(['?' for _ in columns])
    insert_query = f'INSERT INTO attendance ({",".join(columns)}) VALUES ({placeholders})'
    
    # Split records
    source_cursor.execute('SELECT * FROM attendance')
    records = source_cursor.fetchall()
    
    history_count = 0
    deleted_count = 0
    
    for record in records:
        log_date = record[3]  # log_date column (adjust index if needed)
        record_without_id = record[1:]  # Exclude id
        
        if log_date >= six_months_str:
            # Recent record (≤ 6 months) -> log_history.db
            history_conn.cursor().execute(insert_query, record_without_id)
            history_count += 1
        else:
            # Old record (> 6 months) -> log_deleted.db
            deleted_conn.cursor().execute(insert_query, record_without_id)
            deleted_count += 1
    
    history_conn.commit()
    deleted_conn.commit()
    
    source_conn.close()
    history_conn.close()
    deleted_conn.close()
    
    log(f"Split into log_history.db: {history_count} records (≤ 6 months)")
    log(f"Split into log_deleted.db: {deleted_count} records (> 6 months, ≤ 3 years)")
    
    return history_count, deleted_count

def archive_processed_files(files_to_archive):
    """Move processed files to archive directory"""
    if not files_to_archive:
        log("No files to archive")
        return
    
    # Create archive directory with timestamp
    archive_subdir = os.path.join(
        PROCESSED_ARCHIVE_DIR,
        datetime.now().strftime('%Y-%m-%d_%H-%M-%S')
    )
    os.makedirs(archive_subdir, exist_ok=True)
    
    archived_count = 0
    for file_path in files_to_archive:
        try:
            filename = os.path.basename(file_path)
            archive_path = os.path.join(archive_subdir, filename)
            shutil.move(file_path, archive_path)
            log(f"  Archived: {filename}")
            archived_count += 1
        except Exception as e:
            log(f"  ERROR archiving {file_path}: {e}")
    
    log(f"Archived {archived_count} files to {archive_subdir}")

def git_commit_and_push(message):
    """Commit and push changes to GitHub with safety checks"""
    try:
        # Stage all changes
        subprocess.run(['git', 'add', '-A'], check=True)
        
        # Commit
        result = subprocess.run(
            ['git', 'commit', '-m', message],
            capture_output=True,
            text=True
        )
        
        if result.returncode != 0:
            if 'nothing to commit' in result.stdout:
                log("No changes to commit")
                return True
            else:
                log(f"Commit failed: {result.stderr}")
                return False
        
        # Pull with rebase to merge any remote changes
        log("Pulling latest changes from remote...")
        subprocess.run(['git', 'pull', '--rebase'], check=True)
        
        # Push
        log("Pushing changes to remote...")
        subprocess.run(['git', 'push'], check=True)
        
        log("Successfully committed and pushed changes")
        return True
        
    except subprocess.CalledProcessError as e:
        log(f"Git operation failed: {e}")
        return False

def main():
    """Main execution function"""
    log("=" * 60)
    log("Starting Log Database Management Script")
    log("=" * 60)
    
    # Step 1: Collect all .db files from three directories
    log("\n[Step 1] Collecting database files...")
    
    # Apply timestamp filter ONLY to log_history (safety buffer)
    log_history_files = get_db_files(LOG_HISTORY_DIR, apply_timestamp_filter=True)
    
    # No filter for these (they're reference databases, not user uploads)
    log_deleted_files = get_db_files(LOG_DELETED_DIR, apply_timestamp_filter=False)
    user_session_files = get_db_files(USER_SESSION_DIR, apply_timestamp_filter=False)
    
    all_files = log_history_files + log_deleted_files + user_session_files
    
    if not all_files:
        log("No database files found. Exiting.")
        return
    
    log(f"Total files to process: {len(all_files)}")
    
    # Step 2: Create temporary database and merge all files
    log("\n[Step 2] Merging all databases...")
    
    temp_db = create_temporary_merged_db()
    
    total_records_merged = 0
    for db_file in all_files:
        count = merge_database_into_temp(db_file, temp_db)
        total_records_merged += count
    
    log(f"Total records merged: {total_records_merged}")
    
    # Step 3: Remove duplicates
    log("\n[Step 3] Removing duplicates...")
    remove_duplicates(temp_db)
    
    # Step 4: Delete records older than 3 years
    log("\n[Step 4] Deleting records older than 3 years...")
    delete_old_records(temp_db, THREE_YEARS_AGO)
    
    # Step 5: Split into log_history.db and log_deleted.db
    log("\n[Step 5] Splitting into log_history.db and log_deleted.db...")
    
    history_db_path = os.path.join(LOG_HISTORY_DIR, 'log_history.db')
    deleted_db_path = os.path.join(LOG_DELETED_DIR, 'log_deleted.db')
    
    # Ensure directories exist
    os.makedirs(LOG_HISTORY_DIR, exist_ok=True)
    os.makedirs(LOG_DELETED_DIR, exist_ok=True)
    
    split_into_history_and_deleted(temp_db, history_db_path, deleted_db_path)
    
    # Step 6: Archive processed files from log_history directory ONLY
    log("\n[Step 6] Archiving processed files from log_history directory...")
    log("IMPORTANT: Files from user_session_history will NOT be deleted")
    
    # Only archive files from log_history directory
    files_to_archive = log_history_files.copy()
    
    if files_to_archive:
        archive_processed_files(files_to_archive)
    else:
        log("No files from log_history to archive")
    
    # Clean up temporary database
    if os.path.exists(temp_db):
        os.remove(temp_db)
        log("Cleaned up temporary database")
    
    # Step 7: Commit and push to GitHub
    log("\n[Step 7] Committing changes to GitHub...")
    
    commit_message = f"Log management: processed {len(files_to_archive)} files, " \
                    f"archived old logs [{datetime.now().strftime('%Y-%m-%d %H:%M')}]"
    
    success = git_commit_and_push(commit_message)
    
    if success:
        log("\n" + "=" * 60)
        log("Log Database Management Completed Successfully")
        log("=" * 60)
    else:
        log("\n" + "=" * 60)
        log("Log Database Management Completed with Errors")
        log("=" * 60)

if __name__ == '__main__':
    main()