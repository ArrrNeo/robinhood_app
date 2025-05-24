import os
import csv
import json
import pyotp
import pprint
import robin_stocks
import robinhood_secrets

# --- Constants ---
GET_LATEST_DATA = True  # Set to False to use cached data
JSON_DIR = 'json/'
MY_STOCKS_FILE = JSON_DIR + 'my_stocks'
MY_OPTIONS_FILE = JSON_DIR + 'my_options'
FUNDAMENTALS_FILE_PREFIX = JSON_DIR + 'fundamentals_'
OPTION_MARKET_DATA_FILE_PREFIX = JSON_DIR + 'option_market_data_'
OUTPUT_CSV_FILE = 'my_positions.csv'

# --- Helper Functions ---
def write_to_file(obj, filename):
    # Ensure the directory exists
    os.makedirs(os.path.dirname(filename), exist_ok=True)
    with open(filename + '.json', 'w') as fout:
        json.dump(obj, fout)

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

def process_stocks(my_stocks_raw):
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
        'strike', 'option_type', 'expiry'
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

def main():
    """Main function to orchestrate the script."""
    login_info = login_to_robinhood()
    if not login_info:
        print("Login failed. Exiting.")
        return

    # Fetch or load stock data
    my_stocks_raw = fetch_or_read_data(
        robin_stocks.robinhood.account.build_holdings,
        MY_STOCKS_FILE
    )

    # Fetch or load options data
    my_options_raw = fetch_or_read_data(
        robin_stocks.robinhood.options.get_open_option_positions,
        MY_OPTIONS_FILE
    )

    # Process data
    processed_stocks = process_stocks(my_stocks_raw or {}) # Pass empty dict if None
    processed_options = process_options(my_options_raw or []) # Pass empty list if None

    # Combine processed data
    my_total_positions = {**processed_stocks, **processed_options}

    # Round numerical values
    rounded_positions = round_dict(my_total_positions, 2)

    # Save to CSV
    save_to_csv(rounded_positions, OUTPUT_CSV_FILE)

    # Optional: Pretty print the final combined data
    # print("\nFinal Processed and Rounded Positions:")
    # pprint.PrettyPrinter(indent=4).pprint(rounded_positions)

if __name__ == "__main__":
    main()
