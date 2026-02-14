import sqlite3
import pandas as pd
from datetime import datetime
import os
import json

def convert_attendance_to_excel():
    """
    Extract attendance data from log_history.db and create an Excel file
    with Student ID, User ID, Subject, Log Date, Log Time, and User Name columns.
    Also exports to JSON and CSV formats.
    """
    db_path = 'log_history/log_history.db'
    
    # Check if database exists
    if not os.path.exists(db_path):
        print(f"Database file '{db_path}' not found.")
        return
    
    # Connect to the database
    conn = sqlite3.connect(db_path)
    
    try:
        # Query to fetch required columns including user_name, user_id, division, department, year, and batch
        query = """
        SELECT student_id, subject, log_date, log_time, year, batch, user_name, user_id, division, department
        FROM attendance
        ORDER BY log_date DESC, log_time DESC
        """
        
        # Read data into pandas DataFrame
        df = pd.read_sql(query, conn)
        
        # Check if data exists
        if df.empty:
            print("No attendance records found in the database.")
            conn.close()
            return
        
        # Rename columns to proper case for Excel headers
        df.columns = ['Student ID', 'Subject', 'Log Date', 'Log Time', 'Year', 'Batch', 'User Name', 'User ID', 'Division', 'Department']
        
        # Create output filenames in log_history directory
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        excel_file = f'log_history/attendance_export.xlsx'
        json_file = f'log_history/attendance_export.json'
        csv_file = f'log_history/attendance_export.csv'
        
        # Export to Excel
        df.to_excel(excel_file, index=False, sheet_name='Attendance')
        print(f"Successfully exported {len(df)} records to {excel_file}")
        
        # Export to JSON
        # Convert DataFrame to list of dictionaries for cleaner JSON
       # json_data = df.to_dict(orient='records')
        
       # with open(json_file, 'w', encoding='utf-8') as f:
       #     json.dump(json_data, f, indent=2, ensure_ascii=False)
        
       # print(f"Successfully exported {len(df)} records to {json_file}")
        
        # Export to CSV
        df.to_csv(csv_file, index=False, encoding='utf-8')
        print(f"Successfully exported {len(df)} records to {csv_file}")
        
    except sqlite3.Error as e:
        print(f"Database error: {e}")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        conn.close()

if __name__ == '__main__':
    convert_attendance_to_excel()