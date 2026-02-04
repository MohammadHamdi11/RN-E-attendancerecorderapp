import sqlite3
import os
import re
from collections import defaultdict

def extract_user_id(filename):
    """
    Extract user ID from filename format: sessionid_userid.db
    Returns user_id or None if pattern doesn't match
    """
    # Match pattern: anything_userid.db
    match = re.search(r'_(\d+)\.db$', filename)
    if match:
        return match.group(1)
    return None

def is_valid_sqlite_db(db_path):
    """
    Check if a file is a valid SQLite database
    """
    if not os.path.exists(db_path):
        return False
    
    if os.path.getsize(db_path) < 100:  # SQLite header is 100 bytes
        return False
    
    try:
        conn = sqlite3.connect(db_path)
        cursor = conn.cursor()
        cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        cursor.fetchall()
        conn.close()
        return True
    except sqlite3.Error:
        return False

def get_session_files():
    """
    Scan log_history directory and group session files by user_id
    Returns dict: {user_id: [list of session db files]}
    """
    log_history_dir = 'log_history'
    user_sessions = defaultdict(list)
    
    if not os.path.exists(log_history_dir):
        print(f"Directory '{log_history_dir}' not found.")
        return user_sessions
    
    for filename in os.listdir(log_history_dir):
        if filename.endswith('.db') and filename != 'log_history.db':
            user_id = extract_user_id(filename)
            if user_id:
                filepath = os.path.join(log_history_dir, filename)
                # Only include valid SQLite databases
                if is_valid_sqlite_db(filepath):
                    user_sessions[user_id].append(filepath)
                else:
                    print(f"  ⚠ Skipping invalid database: {filename}")
    
    return user_sessions

def merge_session_into_user_history(session_db_path, user_db_path):
    """
    Merge data from a session database into the user's history database
    """
    print(f"  → Attempting to merge: {session_db_path}")
    
    # Verify session database is valid before opening
    if not os.path.exists(session_db_path):
        print(f"  ✗ Session file not found: {session_db_path}")
        return False
    
    # Check file size
    file_size = os.path.getsize(session_db_path)
    print(f"  → File size: {file_size} bytes")
    if file_size == 0:
        print(f"  ✗ Session file is empty: {session_db_path}")
        return False
    
    # Check file header (first 16 bytes should be SQLite magic string)
    try:
        with open(session_db_path, 'rb') as f:
            header = f.read(16)
            print(f"  → File header (hex): {header.hex()}")
            if header[:15] != b'SQLite format 3':
                print(f"  ✗ Not a valid SQLite file - invalid header")
                return False
    except Exception as e:
        print(f"  ✗ Cannot read file header: {e}")
        return False
    
    print(f"  → Attempting to connect to session DB...")
    # Connect to both databases
    try:
        session_conn = sqlite3.connect(session_db_path)
        print(f"  → Successfully connected to session DB")
    except sqlite3.Error as e:
        print(f"  ✗ Cannot open session database {session_db_path}: {e}")
        print(f"  → sqlite3.Error type: {type(e).__name__}")
        print(f"  → Error args: {e.args}")
        return False
    
    print(f"  → Attempting to connect to user DB: {user_db_path}")
    try:
        user_conn = sqlite3.connect(user_db_path)
        print(f"  → Successfully connected to user DB")
    except sqlite3.Error as e:
        print(f"  ✗ Cannot open user database {user_db_path}: {e}")
        session_conn.close()
        return False
    
    try:
        print(f"  → Querying tables from session DB...")
        # Get all tables from session database (using already open connection)
        session_cursor = session_conn.cursor()
        session_cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
        tables = [row[0] for row in session_cursor.fetchall()]
        print(f"  → Found tables: {tables}")
        
        if not tables:
            print(f"  ⚠ No tables found in {session_db_path}")
            session_conn.close()
            user_conn.close()
            return True
        
        merged_count = 0
        for table in tables:
            if table == 'sqlite_sequence':  # Skip internal SQLite table
                continue
                
            # Get all data from session table
            session_cursor = session_conn.cursor()
            try:
                session_cursor.execute(f"SELECT * FROM {table}")
                rows = session_cursor.fetchall()
            except sqlite3.Error as e:
                print(f"  ✗ Error reading table {table}: {e}")
                continue
            
            if not rows:
                continue
            
            # Get column information including whether it's a primary key with autoincrement
            session_cursor.execute(f"PRAGMA table_info({table})")
            col_info = session_cursor.fetchall()
            columns = [col[1] for col in col_info]
            
            # Check if first column is an AUTOINCREMENT primary key
            session_cursor.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table}'")
            create_sql = session_cursor.fetchone()[0]
            has_autoincrement = 'AUTOINCREMENT' in create_sql.upper()
            
            # Insert into user history database
            user_cursor = user_conn.cursor()
            
            # Check if table exists in user database
            user_cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            if not user_cursor.fetchone():
                # Create table if it doesn't exist
                user_cursor.execute(create_sql)
            
            # If there's an AUTOINCREMENT column, exclude it from INSERT
            if has_autoincrement and col_info[0][5] == 1:  # col_info[0][5] is the pk flag
                # Skip the first column (id) and insert the rest
                insert_columns = columns[1:]
                insert_column_names = ', '.join(insert_columns)
                placeholders = ','.join(['?' for _ in insert_columns])
                # Remove first value from each row (the id)
                rows_without_id = [row[1:] for row in rows]
                
                try:
                    user_cursor.executemany(
                        f"INSERT OR IGNORE INTO {table} ({insert_column_names}) VALUES ({placeholders})", 
                        rows_without_id
                    )
                    merged_count += user_cursor.rowcount
                except sqlite3.Error as e:
                    print(f"  ✗ Error inserting into table {table}: {e}")
                    continue
            else:
                # No AUTOINCREMENT, insert all columns normally
                placeholders = ','.join(['?' for _ in columns])
                try:
                    user_cursor.executemany(f"INSERT OR IGNORE INTO {table} VALUES ({placeholders})", rows)
                    merged_count += user_cursor.rowcount
                except sqlite3.Error as e:
                    print(f"  ✗ Error inserting into table {table}: {e}")
                    continue
            
        user_conn.commit()
        print(f"  ✓ Merged {os.path.basename(session_db_path)} - {merged_count} records")
        return True
        
    except sqlite3.Error as e:
        print(f"  ✗ Error merging {session_db_path}: {e}")
        return False
    finally:
        session_conn.close()
        user_conn.close()

def merge_all_sessions():
    """
    Main function to merge all session databases into user history databases
    """
    print("Starting session merge process...")
    
    # Get all session files grouped by user_id
    user_sessions = get_session_files()
    
    if not user_sessions:
        print("No valid session database files found to merge.")
        print("Note: Files with prefixes like 'excuses', 'scanner', 'checklist', 'edited' may not be valid SQLite databases.")
        return
    
    user_session_dir = 'user_session_history'
    
    # Create user_session_history directory if it doesn't exist
    if not os.path.exists(user_session_dir):
        os.makedirs(user_session_dir)
        print(f"Created directory: {user_session_dir}")
    
    total_sessions = sum(len(sessions) for sessions in user_sessions.values())
    print(f"Found {total_sessions} session files for {len(user_sessions)} users")
    
    # Process each user
    for user_id, session_files in user_sessions.items():
        user_db_path = os.path.join(user_session_dir, f"{user_id}.db")
        
        print(f"\nProcessing user {user_id} ({len(session_files)} sessions)...")
        
        # Create user database if it doesn't exist
        if not os.path.exists(user_db_path):
            print(f"  Creating new user history database: {user_db_path}")
            # Create empty database (will be populated from first session)
            conn = sqlite3.connect(user_db_path)
            conn.close()
        
        # Merge each session into user history
        for session_file in session_files:
            merge_session_into_user_history(session_file, user_db_path)
    
    print(f"\n✓ Merge completed! Processed {len(user_sessions)} users.")

if __name__ == '__main__':
    merge_all_sessions()
