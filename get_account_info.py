import os
import csv
import pprint
import helpers
import robin_stocks
from datetime import datetime, timezone, timedelta

# --- Constants ---
FUNDAMENTALS_FILE_PREFIX = helpers.CACHE_DIR + '/fundamentals_'
OPTION_MARKET_DATA_FILE_PREFIX = helpers.CACHE_DIR + '/option_market_data_'

def get_latest_order_update_date(option_orders_list):
    """Iterates through all orders to find the most recent updated_at timestamp."""
    latest_date_found = helpers.DEFAULT_PAST_DATE
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

# logic:
#       Identify if option order is eligible for earned premium calculation
#       only orders that were one of following, eligible
#       1. sell to open (STO)
#       2, buy to close (BTC)
#       3. ROLL
#
#       An option order will have single or multiple entry in "legs" array.
#       entry in "legs" array have
#           "position_effect" = "open" or "close"
#           "side" = "sell" or "buy"
#       order is STO if it has a leg that is "side" = "sell" and "position_effect" = "open"
#       order is BTC if it has a leg that is "side" = "buy" and "position_effect" = "close"
#       order is ROLL if has both BTC and STO legs
#       only add or subtract premium of above kind of orders
def is_order_eligible_for_premium(order):
    if len(order.get("legs", [])) <= 0:
        return False

    legs = order.get("legs")
    sell_to_open = any(leg["side"] == "sell" and leg["position_effect"] == "open" for leg in legs)
    buy_to_close = any(leg["side"] == "buy" and leg["position_effect"] == "close" for leg in legs)

    return sell_to_open or buy_to_close

def calculate_premium_from_new_orders(all_historical_option_orders, ticker, process_orders_after_date):
    """Calculates the net premium from new filled orders for a specific ticker."""
    # This function now only calculates the increment from orders newer than process_orders_after_date
    new_orders_for_ticker = get_filtered_option_orders_for_ticker(all_historical_option_orders, ticker, process_orders_after_date)
    premium_increment = 0

    for order in new_orders_for_ticker:
        if not is_order_eligible_for_premium(order):
            continue
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

def process_stocks(my_stocks_raw, all_historical_option_orders, process_orders_after_date, current_run_state):
    """Processes raw stock data into a structured format."""
    processed_stocks = {}
    
    total_equity = helpers.get_total_equity()
    cash = helpers.get_cash()
    
    for item in my_stocks_raw:
        # It is possible for positions_data to be [None]
        if not item:
            continue

        my_custom_data = {}
        instrument_data = robin_stocks.robinhood.account.get_instrument_by_url(item['instrument'])
        symbol = instrument_data['symbol']
        fundamental_data = robin_stocks.robinhood.account.get_fundamentals(symbol)[0]
        price = float(robin_stocks.robinhood.account.get_latest_price(instrument_data['symbol'])[0])
        quantity = float(item['quantity'])
        equity = quantity * price
        average_buy_price = float(item['average_buy_price'])
        equity_change = (quantity * price) - (quantity * average_buy_price)
        percentage = quantity * price * 100 / total_equity
        intraday_average_buy_price = float(item['intraday_average_buy_price'])
        if (average_buy_price == 0.0):
            percent_change = 0.0
        else:
            percent_change = (price - average_buy_price) * 100 / average_buy_price
        if (intraday_average_buy_price == 0.0):
            intraday_percent_change = 0.0
        else:
            intraday_percent_change = (float(price) - intraday_average_buy_price) * 100 / intraday_average_buy_price
        my_custom_data['ticker'] = symbol
        my_custom_data['name'] = robin_stocks.robinhood.account.get_name_by_symbol(symbol)
        my_custom_data['mark_price'] = price
        my_custom_data['quantity'] = quantity
        my_custom_data['avg_price'] = average_buy_price
        my_custom_data['equity'] = equity
        my_custom_data['pnl_percent'] = percent_change
        my_custom_data['intraday_percent_change'] = intraday_percent_change
        my_custom_data['pnl'] = equity_change
        my_custom_data['type'] = 'stock'
        my_custom_data['id'] = instrument_data['id']
        my_custom_data['pe_ratio'] = float(fundamental_data['pe_ratio']) if fundamental_data['pe_ratio'] else 0.0
        my_custom_data['portfolio_percent'] = percentage
        if my_custom_data['equity'] > 0:
            my_custom_data['side'] = 'long'
        else:
            my_custom_data['side'] = 'short'
            my_custom_data['pnl'] = -1 * my_custom_data['pnl']
        my_custom_data['strike'] = 0
        my_custom_data['option_type'] = 'N/A'
        my_custom_data['expiry'] = 'N/A'
        total_cumulative_premium = current_run_state["premiums"].get(symbol, 0.0)
        if len(all_historical_option_orders) > 0:
            premium_increment_from_new_trades = calculate_premium_from_new_orders(all_historical_option_orders, symbol, process_orders_after_date)
            total_cumulative_premium = total_cumulative_premium + premium_increment_from_new_trades
            current_run_state["premiums"][symbol] = total_cumulative_premium # Update the state
        my_custom_data['premium_earned'] = total_cumulative_premium
        processed_stocks[my_custom_data['id']] = my_custom_data

    my_custom_data = {}
    my_custom_data['ticker'] = 'cash'
    my_custom_data['equity'] = cash
    my_custom_data['portfolio_percent'] = cash * 100 / total_equity
    processed_stocks['cash'] = my_custom_data

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
        market_data_list = helpers.fetch_n_save_data(robin_stocks.robinhood.options.get_option_market_data_by_id,
                                                     option_market_data_filename_base,
                                                     option_id)

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
            fundamentals_data_list = helpers.fetch_n_save_data(robin_stocks.robinhood.stocks.get_fundamentals,
                                                               fundamentals_filename_base,
                                                               my_custom_data['ticker'])
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

def get_processed_positions(account='INDIVIDUAL'):
    """Main function to orchestrate the script, process data, and return it."""
    login_info = helpers.login_to_robinhood()
    if not login_info:
        print("Login failed. Exiting.")
        return {} # Return empty dict on failure

    output_csv_file = helpers.CACHE_DIR + '/' + account + '/positions.csv'
    my_stocks_file = helpers.CACHE_DIR + '/' + account + '/my_stocks'
    my_options_file = helpers.CACHE_DIR + '/' + account + '/my_options'
    run_state_file = helpers.CACHE_DIR + '/' + account + '/run_state.json'
    historical_option_orders_file = helpers.CACHE_DIR + '/' + account + '/all_historical_option_orders'

    # Load run state (persisted dates and ticker premiums)
    run_state = helpers.load_run_state(run_state_file)
    persisted_last_position_date = run_state["position_date"]
    persisted_last_order_date = run_state["order_date"]
    current_time = datetime.now(timezone.utc)
    five_minutes_ago = current_time - timedelta(minutes=5)

    # Decide whether to fetch from API or use CSV
    should_fetch = (persisted_last_position_date < five_minutes_ago)

    print ("current_time    : ", current_time)
    print ("five_minutes_ago: ", five_minutes_ago)
    print ("should_fetch    : ", should_fetch)

    if not should_fetch:
        return helpers.read_from_csv(output_csv_file)

    # If we reach here, we need to fetch from API
    print("Fetching positions from Robinhood APIs...")
    current_run_state_to_persist = {
        "position_date": current_time,  # Set to now at start of run
        "order_date": persisted_last_order_date,
        "premiums": run_state["premiums"].copy()
    }
    print(f"Premium calculation will consider historical orders newer than: {persisted_last_order_date}")

    # fetch positions from Robinhood API filtering:
    # after persisted_last_order_date or DEFAULT_PAST_DATE (which ever is later)
    # execution state = filled
    last_order_date_plus_1 = (persisted_last_order_date + timedelta(microseconds=1)).isoformat().replace('+00:00', 'Z')
    # and append the new orders to historical_option_orders_file
    all_historical_option_orders = helpers.fetch_n_save_data(robin_stocks.robinhood.orders.get_all_option_orders,
                                                             historical_option_orders_file,
                                                             account_number=helpers.SECRETS['ACCOUNTS'][account],
                                                             start_date=last_order_date_plus_1)
    if all_historical_option_orders is None: all_historical_option_orders = []

    my_stocks_raw = helpers.fetch_n_save_data(robin_stocks.robinhood.account.get_open_stock_positions, my_stocks_file, account_number=helpers.SECRETS['ACCOUNTS'][account])
    my_options_raw = helpers.fetch_n_save_data(robin_stocks.robinhood.options.get_open_option_positions, my_options_file, account_number=helpers.SECRETS['ACCOUNTS'][account])

    processed_stocks = process_stocks(my_stocks_raw or {}, all_historical_option_orders, persisted_last_order_date, current_run_state_to_persist)
    processed_options = process_options(my_options_raw or [])

    my_total_positions = {**processed_stocks, **processed_options}
    rounded_positions = helpers.round_dict(my_total_positions, 2)

    # Save to CSV
    helpers.save_to_csv(rounded_positions, output_csv_file)
    print(f"Saved latest positions to CSV: {output_csv_file}")

    if len(all_historical_option_orders) > 0:
        current_max_order_update_date = get_latest_order_update_date(all_historical_option_orders)
        print(f"Latest 'updated_at' date in current historical option data: {current_max_order_update_date}")
    else:
        current_max_order_update_date = persisted_last_order_date

    # Update the order date in the state to be persisted with the latest one found in this run's data
    current_run_state_to_persist["order_date"] = current_max_order_update_date

    helpers.update_state(run_state_file, current_run_state_to_persist)

    return rounded_positions

if __name__ == "__main__":
    get_processed_positions('INDIVIDUAL')
