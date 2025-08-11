# --- Helper Functions for State Persistence and Premium Calculation ---
import os
import csv
import json
import pyotp
import yfinance
import robin_stocks
import pandas as pd
from datetime import datetime, timezone, timedelta, MINYEAR

os.makedirs("cache/INDIVIDUAL", exist_ok=True)
os.makedirs("cache/ROTH_IRA", exist_ok=True)
os.makedirs("cache/TRADITIONAL_IRA", exist_ok=True)

CACHE_DIR = 'cache'
DEFAULT_PAST_DATE = datetime(MINYEAR, 1, 1, tzinfo=timezone.utc)

SECRETS_FILE = "robinhood_secrets.json"
SECRETS = json.load(open(SECRETS_FILE, 'r'))

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
            print(f"Successfully loaded run state from {filepath}")
            print(f"\tPosition fetch date : {pos_dt}")
            print(f"\tOrder processed date: {order_dt}")
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
        mfa_code = pyotp.TOTP(SECRETS['MY_2FA_APP_HERE']).now()
        login_info = robin_stocks.robinhood.login(
            SECRETS['USER'],
            SECRETS['PASSWORD'],
            mfa_code=mfa_code
        )
        print("Login successful.")
        return login_info
    except Exception as e:
        print(f"Error during login: {e}")
        return None

def save_to_csv(positions, filename, index=False, encoding="utf-8"):
    """
    Converts an array of dictionaries to a CSV file.

    Args:
        positions (list): A list where each element is a dictionary,
                           representing a row of data.
        filename (str): The name of the CSV file to create.
        index (bool): Whether to write the DataFrame index as the first column.
                      Defaults to False (recommended for most CSV exports).
        encoding (str): The encoding to use for the CSV file. Defaults to "utf-8".
    """
    if not isinstance(positions, list) or not all(isinstance(d, dict) for d in positions):
        print("Error: Input must be a list of dictionaries.")
        return

    if not positions:
        print("Warning: The input array of dictionaries is empty. An empty CSV file will be created.")
        # Create an empty DataFrame with no columns if the input is empty
        df = pd.DataFrame()
    else:
        # Convert the list of dictionaries to a pandas DataFrame
        # Pandas automatically infers column names from dictionary keys
        df = pd.DataFrame(positions)

    try:
        # Write the DataFrame to a CSV file
        # index=False prevents pandas from writing the DataFrame index as a column
        df.to_csv(filename, index=index, encoding=encoding)
        print(f"Successfully converted data to '{filename}'")
        # Optional: Print the first few rows of the DataFrame for verification
        print("\nFirst 5 rows of the DataFrame (before saving to CSV):")
        print(df.head())
        print(f"\nCSV file saved to: {os.path.abspath(filename)}")

    except Exception as e:
        print(f"An error occurred while writing the CSV file: {e}")

def round_dict(value, num_decimals=2):
    if isinstance(value, dict):
        return {k: round_dict(v, num_decimals) for k, v in value.items()}
    elif isinstance(value, list):
        return [round_dict(item, num_decimals) for item in value]
    elif isinstance(value, float):
        return round(value, num_decimals)
    else:
        return value

def fetch_n_save_data(fetch_function, filename_base, *args, **kwargs):
    """Fetches data using the provided function or reads from cache."""
    # Construct the full filename with .json extension for reading/writing
    json_filename = filename_base + '.json'
    print(f"Fetching latest data for {filename_base}...")
    data = fetch_function(*args, **kwargs)
    write_to_file(data, filename_base) # write_to_file appends .json
    return data

def read_from_csv(csv_file):
    # Try to load from CSV
    try:
        with open(csv_file, 'r') as csvfile:
            reader = csv.DictReader(csvfile)
            positions_list = [{k: (float(v) if v.replace('.', '', 1).isdigit() else v) for k, v in row.items()} for row in reader]
        if positions_list:
            print(f"Loaded positions from CSV ({csv_file}) as last fetch was less than 5 minutes ago.")
            return positions_list
        else:
            print(f"CSV file {csv_file} is empty, will fetch from API.")
    except FileNotFoundError:
        print(f"CSV file {csv_file} not found, will fetch from API.")
    except Exception as e:
        print(f"Error loading positions from CSV: {e}. Will fetch from API.")
    return []

def update_state(filepath, current_run_state_to_persist):
    run_state = load_run_state(filepath)
    current_time = datetime.now(timezone.utc)
    five_minutes_ago = current_time - timedelta(minutes=5)
    # Save the updated run state (new high-water mark date and all ticker premiums)
    if current_run_state_to_persist["order_date"] > run_state["order_date"] or run_state["order_date"] == DEFAULT_PAST_DATE:
        if current_run_state_to_persist["order_date"] != DEFAULT_PAST_DATE:
            save_run_state(filepath, current_run_state_to_persist)
        else:
            print("No valid new execution date found in current data, run state not saved to prevent overwriting with default date.")
    elif run_state["premiums"] != current_run_state_to_persist["premiums"]:
        print("Ticker premiums have changed, saving updated run state.")
        save_run_state(filepath, current_run_state_to_persist)
    elif run_state["position_date"] < five_minutes_ago:
        print("Positions have changed, saving updated run state.")
        save_run_state(filepath, current_run_state_to_persist)

def get_total_equity():
    total_equity = 0
    portfolios_data = robin_stocks.robinhood.account.load_portfolio_profile()
    if portfolios_data['extended_hours_equity'] is not None:
        total_equity = max(float(portfolios_data['equity']), float(portfolios_data['extended_hours_equity']))
    else:
        total_equity = float(portfolios_data['equity'])
    return total_equity

def get_cash():
    accounts_data = robin_stocks.robinhood.account.load_account_profile()
    cash = float(accounts_data['cash']) + float(accounts_data['uncleared_deposits'])
    return cash

def get_price_change_percentage(symbol, period_in_days):
    # yfinance ticker
    yf_symbol = symbol.replace('.', '-')
    ticker = yfinance.Ticker(yf_symbol)
    """Fetches historical data and calculates the percentage change for a given period."""
    end_date = datetime.now()
    start_date = end_date - timedelta(days=period_in_days)
    try:
        hist = ticker.history(start=start_date, end=end_date)
        if hist.empty:
            return 0.0
        old_price = hist['Close'].iloc[0]
        new_price = hist['Close'].iloc[-1]
        return ((new_price - old_price) / old_price) * 100
    except Exception as e:
        print(f"Could not fetch history for period {period_in_days} days: {e}")
        return 0.0
