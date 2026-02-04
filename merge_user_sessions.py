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
                user_sessions[user_id].append(filepath)
    
    return user_sessions

def get_table_names(db_path):
    """Get list of all tables in a database"""
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = [row[0] for row in cursor.fetchall()]
    conn.close()
    return tables

def merge_session_into_user_history(session_db_path, user_db_path):
    """
    Merge data from a session database into the user's history database
    """
    # Connect to both databases
    session_conn = sqlite3.connect(session_db_path)
    user_conn = sqlite3.connect(user_db_path)
    
    try:
        # Get all tables from session database
        tables = get_table_names(session_db_path)
        
        for table in tables:
            # Get all data from session table
            session_cursor = session_conn.cursor()
            session_cursor.execute(f"SELECT * FROM {table}")
            rows = session_cursor.fetchall()
            
            if not rows:
                continue
            
            # Get column names
            session_cursor.execute(f"PRAGMA table_info({table})")
            columns = [col[1] for col in session_cursor.fetchall()]
            placeholders = ','.join(['?' for _ in columns])
            
            # Insert into user history database
            user_cursor = user_conn.cursor()
            
            # Check if table exists in user database
            user_cursor.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table}'")
            if not user_cursor.fetchone():
                # Create table if it doesn't exist (copy structure from session db)
                session_cursor.execute(f"SELECT sql FROM sqlite_master WHERE type='table' AND name='{table}'")
                create_sql = session_cursor.fetchone()[0]
                user_cursor.execute(create_sql)
            
            # Insert rows (using INSERT OR IGNORE to avoid duplicates if there's a primary key)
            user_cursor.executemany(f"INSERT OR IGNORE INTO {table} VALUES ({placeholders})", rows)
            
        user_conn.commit()
        print(f"  ✓ Merged {session_db_path} successfully")
        
    except sqlite3.Error as e:
        print(f"  ✗ Error merging {session_db_path}: {e}")
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
        print("No session files found to merge.")
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