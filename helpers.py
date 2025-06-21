# --- Helper Functions for State Persistence and Premium Calculation ---
import os
import csv
import json
import pyotp
import robin_stocks
import robinhood_secrets
from datetime import datetime, timezone, MINYEAR

GET_LATEST_DATA = True  # Set to False to use cached data
DEFAULT_PAST_DATE = datetime(MINYEAR, 1, 1, tzinfo=timezone.utc)

def load_run_state(filepath):
    """Loads the last run state (two dates and ticker premiums) from a JSON file."""
    try:
        with open(filepath, 'r') as f:
            data = json.load(f)
            pos_date_str = data.get("last_position_fetch_date")
            order_date_str = data.get("last_order_processed_date")
            premiums = data.get("ticker_premiums", {})
            pos_dt = datetime.fromisoformat(pos_date_str) if pos_date_str else DEFAULT_PAST_DATE
            order_dt = datetime.fromisoformat(order_date_str) if order_date_str else DEFAULT_PAST_DATE
            print(f"Successfully loaded run state from {filepath}. Position fetch: {pos_dt}, Order processed: {order_dt}, Premiums for {len(premiums)} tickers.")
            return {"position_date": pos_dt, "order_date": order_dt, "premiums": premiums}
    except FileNotFoundError:
        print(f"Run state file not found: {filepath}. Using default empty state.")
        return {"position_date": DEFAULT_PAST_DATE, "order_date": DEFAULT_PAST_DATE, "premiums": {}}
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Error parsing data from {filepath}: {e}. Using default empty state.")
        return {"position_date": DEFAULT_PAST_DATE, "order_date": DEFAULT_PAST_DATE, "premiums": {}}

def save_run_state(filepath, state_data):
    """Saves the given run state (two dates and ticker premiums) to a JSON file."""
    os.makedirs(os.path.dirname(filepath), exist_ok=True) 
    data_to_save = {
        "last_position_fetch_date": state_data["position_date"].isoformat() if state_data.get("position_date") else None,
        "last_order_processed_date": state_data["order_date"].isoformat() if state_data.get("order_date") else None,
        "ticker_premiums": state_data.get("premiums", {})
    }
    try:
        with open(filepath, 'w') as f:
            json.dump(data_to_save, f, indent=4)
        print(f"Successfully saved run state to {filepath}. Position fetch: {data_to_save['last_position_fetch_date']}, Order processed: {data_to_save['last_order_processed_date']}, Premiums for {len(data_to_save['ticker_premiums'])} tickers.")
    except IOError as e:
        print(f"Error saving run state to {filepath}: {e}")

# --- Original Helper Functions ---
def write_to_file(obj, filename):
    # Ensure the directory exists
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename + '.json', 'w') as fout:
        json.dump(obj, fout, indent=4)

def read_from_file(filename):
    with open(filename + '.json', 'r') as fin:
        return json.load(fin)

def login_to_robinhood():
    """Logs into Robinhood using credentials and MFA code."""
    try:
        mfa_code = pyotp.TOTP(robinhood_secrets.MY_2FA_APP_HERE).now()
        login_info = robin_stocks.robinhood.login(
            'rawat.nav@gmail.com',
            robinhood_secrets.PASSWORD,
            mfa_code=mfa_code
        )
        print("Login successful.")
        return login_info
    except Exception as e:
        print(f"Error during login: {e}")
        return None
    
def save_to_csv(data_dict, filename):
    if not data_dict:
        print("No data to save to CSV.")
        return

    # Ensure there's at least one item before trying to get keys.
    if not list(data_dict.values()):
        print("Data dictionary is empty, cannot determine CSV headers.")
        return
    # Define a standard set of headers to ensure consistency,
    # especially if some items might miss optional keys.
    # This list should include all possible keys from both stocks and options.
    # Order them as desired for the CSV output.
    headers = [
        'id', 'ticker', 'type', 'side', 'quantity', 'avg_price', 'mark_price',
        'equity', 'pnl', 'pnl_percent', 'portfolio_percent', 'pe_ratio',
        'strike', 'option_type', 'expiry', 'premium_earned'
    ]

    # Filter out rows that might be completely empty or don't have an ID.
    rows_to_write = [row for row in data_dict.values() if row.get('id')]

    if not rows_to_write:
        print("No valid data rows to write to CSV.")
        return

    with open(filename, 'w', newline='') as output_file:
        dict_writer = csv.DictWriter(output_file, fieldnames=headers, extrasaction='ignore')
        dict_writer.writeheader()
        dict_writer.writerows(rows_to_write)
    print(f"Data saved to {filename}")

def round_dict(value, num_decimals=2):
    if isinstance(value, dict):
        return {k: round_dict(v, num_decimals) for k, v in value.items()}
    elif isinstance(value, list):
        return [round_dict(item, num_decimals) for item in value]
    elif isinstance(value, float):
        return round(value, num_decimals)
    else:
        return value
    
def fetch_or_read_data(fetch_function, filename_base, *args, force_fetch=GET_LATEST_DATA):
    """Fetches data using the provided function or reads from cache."""
    # Construct the full filename with .json extension for reading/writing
    json_filename = filename_base + '.json'
    if force_fetch:
        print(f"Fetching latest data for {filename_base}...")
        data = fetch_function(*args)
        write_to_file(data, filename_base) # write_to_file appends .json
        return data
    else:
        print(f"Reading data from cache for {filename_base}...")
        try:
            # read_from_file expects filename without .json, it appends it.
            return read_from_file(filename_base)
        except FileNotFoundError:
            print(f"Cache file {json_filename} not found. Fetching fresh data.")
            data = fetch_function(*args)
            write_to_file(data, filename_base)
            return data
        except json.JSONDecodeError:
            print(f"Error decoding JSON from {json_filename}. Fetching fresh data.")
            data = fetch_function(*args)
            write_to_file(data, filename_base)
            return data