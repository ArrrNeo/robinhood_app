import os
import csv
import json
import pyotp
import pprint
import robin_stocks
import robinhood_secrets
from datetime import datetime, timezone, MINYEAR, timedelta
from dateutil.relativedelta import relativedelta

# --- Constants ---
GET_LATEST_DATA = True  # Set to False to use cached data
JSON_DIR = 'json/'
MY_STOCKS_FILE = JSON_DIR + 'my_stocks'
MY_OPTIONS_FILE = JSON_DIR + 'my_options'
FUNDAMENTALS_FILE_PREFIX = JSON_DIR + 'fundamentals_'
OPTION_MARKET_DATA_FILE_PREFIX = JSON_DIR + 'option_market_data_'
OUTPUT_CSV_FILE = 'my_positions.csv'
HISTORICAL_OPTION_ORDERS_FILE = JSON_DIR + 'all_historical_option_orders'
PERSISTED_RUN_STATE_FILE = JSON_DIR + "run_state.json"
DEFAULT_PAST_DATE = datetime(MINYEAR, 1, 1, tzinfo=timezone.utc)

# --- Helper Functions for State Persistence and Premium Calculation ---
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

def get_latest_order_update_date(option_orders_list):
    """Iterates through all orders to find the most recent updated_at timestamp."""
    latest_date_found = DEFAULT_PAST_DATE
    found_any_valid_date = False
    # Handle empty list
    if not option_orders_list:
        return latest_date_found

    for order in option_orders_list:
        updated_at_str = order.get("updated_at")
        if not updated_at_str:
            continue
        try:
            updated_at_datetime = datetime.fromisoformat(updated_at_str.replace('Z', '+00:00'))
            if updated_at_datetime > latest_date_found:
                latest_date_found = updated_at_datetime
                found_any_valid_date = True
        except ValueError:
            print(f"Warning: Could not parse updated_at timestamp: {updated_at_str} in order {order.get('id', 'N/A')}")
            continue 
    
    if not found_any_valid_date:
        print("Warning: No valid updated_at timestamps found in any orders. Max date remains default past.")
        
    return latest_date_found

def get_filtered_option_orders_for_ticker(all_historical_option_orders, ticker, process_orders_after_date):
    """ Helper for premium calculation, gets relevant orders for a ticker newer than a date """
    order_list = []
    if not all_historical_option_orders: # Handle empty or None list
        return order_list
        
    for order in all_historical_option_orders:
        if order.get("chain_symbol") == ticker and order.get("state") == "filled":
            order_timestamp_str = order.get("updated_at") 
            if not order_timestamp_str:
                # print(f"DEBUG: Order {order.get('id', 'N/A')} missing 'updated_at', cannot determine if new for premium calc. Skipping.")
                continue
            try:
                order_date = datetime.fromisoformat(order_timestamp_str.replace('Z', '+00:00'))
                if order_date > process_orders_after_date:
                    order_list.append(order)
            except ValueError:
                # print(f"DEBUG: Could not parse order updated_at: {order_timestamp_str} for order {order.get('id', 'N/A')} for premium calc. Skipping.")
                continue
    return order_list

# todo:
# add premium for sell to open and reduce premium for buy to close.
# other orders are just regular trades.
def calculate_premium_from_new_orders(all_historical_option_orders, ticker, process_orders_after_date):
    """Calculates the net premium from new filled orders for a specific ticker."""
    # This function now only calculates the increment from orders newer than process_orders_after_date
    new_orders_for_ticker = get_filtered_option_orders_for_ticker(all_historical_option_orders, ticker, process_orders_after_date)
    premium_increment = 0
    
    for order in new_orders_for_ticker:
        direction = order.get("net_amount_direction")
        amount_str = order.get("net_amount")
        if amount_str is None: continue
        try:
            amount = float(amount_str)
            if direction == "credit":
                premium_increment += amount
            elif direction == "debit":
                premium_increment -= amount
        except ValueError: continue
    return premium_increment

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

def process_stocks(my_stocks_raw, all_historical_option_orders, process_orders_after_date, current_run_state):
    """Processes raw stock data into a structured format."""
    processed_stocks = {}
    if not isinstance(my_stocks_raw, dict):
        print("Warning: my_stocks_raw is not a dictionary. Skipping stock processing.")
        return processed_stocks

    for key, value in my_stocks_raw.items():
        my_custom_data = {}
        my_custom_data['ticker'] = key
        my_custom_data['avg_price'] = float(value.get('average_buy_price', 0))
        my_custom_data['mark_price'] = float(value.get('price', 0))
        my_custom_data['quantity'] = float(value.get('quantity', 0))
        my_custom_data['equity'] = float(value.get('equity', 0))
        my_custom_data['pe_ratio'] = float(value.get('pe_ratio', 0)) if value.get('pe_ratio') else 0
        my_custom_data['pnl_percent'] = float(value.get('percent_change', 0))
        my_custom_data['portfolio_percent'] = float(value.get('percentage', 0))
        my_custom_data['type'] = 'stock'
        my_custom_data['pnl'] = (my_custom_data['mark_price'] - my_custom_data['avg_price']) * my_custom_data['quantity']
        if my_custom_data['equity'] > 0:
            my_custom_data['side'] = 'long'
        else:
            my_custom_data['side'] = 'short'
            my_custom_data['pnl'] = -1 * my_custom_data['pnl']
        my_custom_data['strike'] = 0
        my_custom_data['option_type'] = 'N/A'
        my_custom_data['expiry'] = 'N/A'
        my_custom_data['id'] = value.get('id')

        stock_ticker = my_custom_data['ticker']
        initial_persisted_premium = current_run_state["premiums"].get(stock_ticker, 0.0)
        premium_increment_from_new_trades = calculate_premium_from_new_orders(
            all_historical_option_orders, 
            stock_ticker, 
            process_orders_after_date # This is the persisted_last_run_date
        )
        total_cumulative_premium = initial_persisted_premium + premium_increment_from_new_trades
        my_custom_data['premium_earned'] = total_cumulative_premium
        current_run_state["premiums"][stock_ticker] = total_cumulative_premium # Update the state

        # Fetch or read fundamentals data for each stock
        if my_custom_data['ticker']: # Ensure ticker is available
            fundamentals_filename_base = FUNDAMENTALS_FILE_PREFIX + my_custom_data['ticker']
            fetch_or_read_data(
                lambda ticker: robin_stocks.robinhood.stocks.get_fundamentals(ticker),
                fundamentals_filename_base,
                my_custom_data['ticker'], # Argument for get_fundamentals
                force_fetch=GET_LATEST_DATA
            )
            # Note: The fetched fundamentals are written to file but not directly used in my_custom_data here.
            # This matches original logic. If it needs to be used, it should be read back and processed.

        if my_custom_data['id']: # Ensure ID is available before adding to dict
            processed_stocks[my_custom_data['id']] = my_custom_data
    return processed_stocks

def parse_occ_symbol(occ_symbol_full):
    """Parses the OCC option symbol to extract expiry, type, and strike."""
    if not occ_symbol_full or not isinstance(occ_symbol_full, str):
        return 'N/A', 'N/A', 0

    occ_symbol_parts = occ_symbol_full.split()
    if len(occ_symbol_parts) <= 1: # Check if split produced enough parts
        return 'N/A', 'N/A', 0

    occ_symbol_core = occ_symbol_parts[1]
    if len(occ_symbol_core) < 7: # Basic validation for symbol length
        return 'N/A', 'N/A', 0

    try:
        expiry_year_short = occ_symbol_core[0:2]
        expiry_month = occ_symbol_core[2:4]
        expiry_day = occ_symbol_core[4:6]
        expiry = f"{expiry_month}/{expiry_day}/20{expiry_year_short}"

        option_char = occ_symbol_core[6]
        option_type = 'N/A'
        if option_char == 'C':
            option_type = 'call'
        elif option_char == 'P':
            option_type = 'put'

        strike_price_str = occ_symbol_core[7:]
        strike = float(strike_price_str) / 1000 if strike_price_str else 0
        return expiry, option_type, strike
    except ValueError: # Catch errors during conversion (e.g. float)
        return 'N/A', 'N/A', 0

def process_options(my_options_raw):
    """Processes raw option data into a structured format."""
    processed_options = {}
    if not isinstance(my_options_raw, list): # Original code iterates a list
        print("Warning: my_options_raw is not a list. Skipping option processing.")
        return processed_options

    for position in my_options_raw:
        my_custom_data = {}
        option_id = position.get('option_id')
        if not option_id:
            print(f"Skipping option position due to missing 'option_id': {position}")
            continue

        # Fetch or read option market data
        option_market_data_filename_base = OPTION_MARKET_DATA_FILE_PREFIX + option_id
        market_data_list = fetch_or_read_data(
            robin_stocks.robinhood.options.get_option_market_data_by_id,
            option_market_data_filename_base,
            option_id, # Argument for get_option_market_data_by_id
            force_fetch=GET_LATEST_DATA
        )

        # Ensure market_data_list is not empty and contains data
        if not market_data_list or not isinstance(market_data_list, list) or not market_data_list[0]:
            print(f"Warning: No market data found for option ID {option_id}. Skipping.")
            continue
        market_data = market_data_list[0] # Assuming first element is the relevant data

        my_custom_data['ticker'] = position.get('chain_symbol')
        avg_price_raw = float(position.get('average_price', 0))
        my_custom_data['avg_price'] = avg_price_raw / 100 # Options prices are per share
        my_custom_data['mark_price'] = float(market_data.get('mark_price', 0))
        my_custom_data['quantity'] = float(position.get('quantity', 0))
        # Equity for options: quantity * mark_price * 100 (multiplier for options)
        my_custom_data['equity'] = my_custom_data['quantity'] * my_custom_data['mark_price'] * 100

        # Fetch or read fundamentals data for the underlying ticker
        if my_custom_data['ticker']:
            fundamentals_filename_base = FUNDAMENTALS_FILE_PREFIX + my_custom_data['ticker']
            fundamentals_data_list = fetch_or_read_data(
                lambda ticker: robin_stocks.robinhood.stocks.get_fundamentals(ticker),
                fundamentals_filename_base,
                my_custom_data['ticker'],
                force_fetch=GET_LATEST_DATA
            )
            if fundamentals_data_list and fundamentals_data_list[0] and fundamentals_data_list[0].get('pe_ratio'):
                my_custom_data['pe_ratio'] = float(fundamentals_data_list[0]['pe_ratio'])
            else:
                my_custom_data['pe_ratio'] = 0
        else:
            my_custom_data['pe_ratio'] = 0

        my_custom_data['premium_earned'] = 0 # not applicable for options
        my_custom_data['portfolio_percent'] = 0  # TODO: Implement portfolio percentage calculation
        my_custom_data['type'] = 'option'
        # P&L for options: (mark_price - avg_price) * quantity * 100
        my_custom_data['pnl'] = (my_custom_data['mark_price'] - my_custom_data['avg_price']) * my_custom_data['quantity'] * 100

        if my_custom_data['avg_price'] != 0:
            my_custom_data['pnl_percent'] = \
                (my_custom_data['mark_price'] - my_custom_data['avg_price']) * 100 / my_custom_data['avg_price']
        else:
            my_custom_data['pnl_percent'] = 0

        my_custom_data['side'] = position.get('type') # 'long' or 'short' for options type from API
        if my_custom_data['side'] == 'short':
            my_custom_data['equity'] *= -1
            my_custom_data['pnl'] *= -1
            if my_custom_data['avg_price'] != 0: # Check to prevent division by zero error
                 my_custom_data['pnl_percent'] *= -1
            # if avg_price is 0 and side is short, pnl_percent remains 0, which is fine.

        occ_symbol_full = market_data.get('occ_symbol')
        expiry, option_type_parsed, strike = parse_occ_symbol(occ_symbol_full)
        my_custom_data['expiry'] = expiry
        my_custom_data['option_type'] = option_type_parsed # 'call' or 'put'
        my_custom_data['strike'] = strike

        my_custom_data['id'] = option_id
        processed_options[my_custom_data['id']] = my_custom_data
    return processed_options

def round_dict(value, num_decimals=2):
    if isinstance(value, dict):
        return {k: round_dict(v, num_decimals) for k, v in value.items()}
    elif isinstance(value, list):
        return [round_dict(item, num_decimals) for item in value]
    elif isinstance(value, float):
        return round(value, num_decimals)
    else:
        return value

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

def get_processed_positions(force_refresh=GET_LATEST_DATA):
    """Main function to orchestrate the script, process data, and return it."""
    login_info = login_to_robinhood()
    if not login_info:
        print("Login failed. Exiting.")
        return {} # Return empty dict on failure

    # Load run state (persisted dates and ticker premiums)
    run_state = load_run_state(PERSISTED_RUN_STATE_FILE)
    persisted_last_position_date = run_state["position_date"]
    persisted_last_order_date = run_state["order_date"]
    current_time = datetime.now(timezone.utc)
    five_minutes_ago = current_time - timedelta(minutes=5)

    # Decide whether to fetch from API or use CSV
    should_fetch = (persisted_last_position_date < five_minutes_ago)

    print ("current_time: ", current_time)
    print ("five_minutes_ago: ", five_minutes_ago)
    print ("persisted_last_position_date: ", persisted_last_position_date)
    print ("should_fetch: ", should_fetch)

    if not should_fetch:
        # Try to load from CSV
        try:
            with open(OUTPUT_CSV_FILE, 'r') as csvfile:
                reader = csv.DictReader(csvfile)
                positions_dict = {row['id']: {k: (float(v) if v.replace('.', '', 1).isdigit() else v) for k, v in row.items()} for row in reader if row.get('id')}
            if positions_dict:
                print(f"Loaded positions from CSV ({OUTPUT_CSV_FILE}) as last fetch was less than 5 minutes ago.")
                return positions_dict
            else:
                print(f"CSV file {OUTPUT_CSV_FILE} is empty, will fetch from API.")
        except FileNotFoundError:
            print(f"CSV file {OUTPUT_CSV_FILE} not found, will fetch from API.")
        except Exception as e:
            print(f"Error loading positions from CSV: {e}. Will fetch from API.")

    # If we reach here, we need to fetch from API
    print("Fetching positions from Robinhood APIs...")
    current_run_state_to_persist = {
        "position_date": current_time,  # Set to now at start of run
        "order_date": persisted_last_order_date,
        "premiums": run_state["premiums"].copy()
    }
    print(f"Premium calculation will consider historical orders newer than: {persisted_last_order_date}")

    # todo:
    # fetch positions from Robinhood API filtering:
    # after persisted_last_order_date or DEFAULT_PAST_DATE (which ever is later)
    # execution state = filled
    # and append the new orders to HISTORICAL_OPTION_ORDERS_FILE
    all_historical_option_orders = fetch_or_read_data(
        robin_stocks.robinhood.orders.get_all_option_orders, 
        HISTORICAL_OPTION_ORDERS_FILE, 
        force_fetch=force_refresh 
    )
    if all_historical_option_orders is None: all_historical_option_orders = []

    current_max_order_update_date = get_latest_order_update_date(all_historical_option_orders)
    print(f"Latest 'updated_at' date in current historical option data: {current_max_order_update_date}")

    my_stocks_raw = fetch_or_read_data(
        robin_stocks.robinhood.account.build_holdings,
        MY_STOCKS_FILE, force_fetch=force_refresh
    )
    my_options_raw = fetch_or_read_data(
        robin_stocks.robinhood.options.get_open_option_positions,
        MY_OPTIONS_FILE, force_fetch=force_refresh
    )

    processed_stocks = process_stocks(my_stocks_raw or {}, all_historical_option_orders, persisted_last_order_date, current_run_state_to_persist)
    processed_options = process_options(my_options_raw or []) 

    my_total_positions = {**processed_stocks, **processed_options}
    rounded_positions = round_dict(my_total_positions, 2)

    # Save to CSV
    save_to_csv(rounded_positions, OUTPUT_CSV_FILE)
    print(f"Saved latest positions to CSV: {OUTPUT_CSV_FILE}")

    # Update the order date in the state to be persisted with the latest one found in this run's data
    current_run_state_to_persist["order_date"] = current_max_order_update_date

    # Save the updated run state (new high-water mark date and all ticker premiums)
    if current_max_order_update_date > persisted_last_order_date or persisted_last_order_date == DEFAULT_PAST_DATE:
        if current_max_order_update_date != DEFAULT_PAST_DATE:
            save_run_state(PERSISTED_RUN_STATE_FILE, current_run_state_to_persist)
        else:
            print("No valid new execution date found in current data, run state not saved to prevent overwriting with default date.")
    elif run_state["premiums"] != current_run_state_to_persist["premiums"]:
        print("Ticker premiums have changed, saving updated run state.")
        save_run_state(PERSISTED_RUN_STATE_FILE, current_run_state_to_persist)
    elif persisted_last_position_date < five_minutes_ago:
        print("Positions have changed, saving updated run state.")
        save_run_state(PERSISTED_RUN_STATE_FILE, current_run_state_to_persist)

    return rounded_positions

if __name__ == "__main__":
    latest_data_to_fetch = GET_LATEST_DATA # Or set to True/False as needed for standalone run
    get_processed_positions(force_refresh=latest_data_to_fetch)
