import os
import csv
import sys
import json
import pyotp
import pprint
import robin_stocks
import robinhood_secrets
from datetime import datetime, timezone, MINYEAR
from dateutil.relativedelta import relativedelta

PERSISTED_DATE_FILE = "last_run_timestamp.txt"
DEFAULT_PAST_DATE = datetime(MINYEAR, 1, 1, tzinfo=timezone.utc)

def load_persisted_date(filepath):
    """Loads the last processed date from a file."""
    try:
        with open(filepath, 'r') as f:
            date_str = f.read().strip()
            dt = datetime.fromisoformat(date_str)
            print(f"Successfully loaded persisted date: {dt} from {filepath}")
            return dt
    except FileNotFoundError:
        print(f"Persisted date file not found: {filepath}. Using default old date.")
        return DEFAULT_PAST_DATE
    except ValueError as e:
        print(f"Error parsing date from {filepath}: {e}. Using default old date.")
        return DEFAULT_PAST_DATE

def save_persisted_date(filepath, date_to_save):
    """Saves the given date to a file in ISO format."""
    try:
        with open(filepath, 'w') as f:
            f.write(date_to_save.isoformat())
        print(f"Successfully saved date {date_to_save.isoformat()} to {filepath}")
    except IOError as e:
        print(f"Error saving date to {filepath}: {e}")

def get_latest_execution_date(option_orders_list):
    """Iterates through all orders to find the most recent execution timestamp."""
    latest_date_found = DEFAULT_PAST_DATE
    found_any_valid_date = False

    for order in option_orders_list:
        updated_at = order.get("updated_at")
        if not updated_at:
            continue
        try:
            updated_at_datetime = datetime.fromisoformat(updated_at.replace('Z', '+00:00'))
            if updated_at_datetime > latest_date_found:
                latest_date_found = updated_at_datetime
                found_any_valid_date = True
        except ValueError:
            print(f"Warning: Could not parse updated_at timestamp: {updated_at} in order {order.get('id', 'N/A')}")
            continue
    
    if not found_any_valid_date:
        print("Warning: No valid execution timestamps found in any orders. Max date remains default past.")
        
    return latest_date_found

# Load the date from the last run (or default if first run/error)
persisted_last_processed_date = load_persisted_date(PERSISTED_DATE_FILE)
print(f"Orders will be processed if newer than: {persisted_last_processed_date}")

def get_option_orders_for_ticker(option_orders_list, ticker, process_orders_after_date):
    order_list = []
    for order in option_orders_list:
        if order.get("chain_symbol") == ticker and order.get("state") == "filled":
            # Assuming 'updated_at' is the field to check for newness of the order
            order_timestamp_str = order.get("updated_at") 
            if not order_timestamp_str:
                # If no updated_at, you might decide to always process, or always skip, or use another date field.
                # For now, let's skip if this crucial date is missing for filtering.
                print(f"Warning: Order {order.get('id', 'N/A')} missing 'updated_at', cannot determine if new. Skipping for incremental processing.")
                continue
            try:
                order_date = datetime.fromisoformat(order_timestamp_str.replace('Z', '+00:00'))
                if order_date > process_orders_after_date:
                    order_list.append(order)
                # else: 
                #    print(f"DEBUG: Order {order.get('id', 'N/A')} ({order_date}) is not newer than {process_orders_after_date}. Skipping.")
            except ValueError:
                print(f"Warning: Could not parse order timestamp: {order_timestamp_str} for order {order.get('id', 'N/A')}. Skipping.")
                continue
    return order_list

def calculate_total_premium_earned(all_option_orders, ticker, process_orders_after_date):
    filled_order_list = get_option_orders_for_ticker(all_option_orders, ticker, process_orders_after_date)
    total_premium = 0
    print(f"Calculating premium for {len(filled_order_list)} new/updated orders for ticker {ticker}.")
    for order in filled_order_list:
        direction = order.get("net_amount_direction")
        amount_str = order.get("net_amount")

        if amount_str is None:
            print(f"Warning: Order {order.get('id', 'N/A')} is missing 'net_amount'. Skipping.")
            continue

        try:
            amount = float(amount_str)
            if direction == "credit":
                total_premium += amount
            elif direction == "debit":
                total_premium -= amount
            else:
                print(f"Warning: Order {order.get('id', 'N/A')} (state: 'filled') has unhandled net_amount_direction: '{direction}'. Amount: {amount_str}. Order not counted against premium.")
        except ValueError:
            print(f"Warning: Could not parse net_amount '{amount_str}' for order {order.get('id', 'N/A')}. Skipping.")
            continue
        
    return total_premium

if __name__ == "__main__":
    if len(sys.argv) > 1:
        ticker_symbol = sys.argv[1]
        filename = sys.argv[2]
        all_option_orders = json.load(open(filename))

        # Determine the absolute latest execution date from the current dataset
        current_max_execution_date_from_data = get_latest_execution_date(all_option_orders)
        print(f"Latest execution date found in current data: {current_max_execution_date_from_data}")



        # login_info = robin_stocks.robinhood.login('rawat.nav@gmail.com', robinhood_secrets.PASSWORD, mfa_code=pyotp.TOTP(robinhood_secrets.MY_2FA_APP_HERE).now())
        # option_orders = robin_stocks.robinhood.orders.get_all_option_orders()
        # with open('option_orders.json', 'w') as fout:
        #     json.dump(option_orders, fout, indent=4)

        # Pass the persisted_last_processed_date for filtering
        net_premium = calculate_total_premium_earned(all_option_orders, ticker_symbol, persisted_last_processed_date)
        print(f"Net premium from new/updated orders for {ticker_symbol} (since {persisted_last_processed_date}): {net_premium}")
        
        # After all processing for this run, save the latest execution date found in this dataset for the next run.
        # Only save if current_max_execution_date_from_data is newer than what was persisted or if it's not the default past date.
        if current_max_execution_date_from_data > persisted_last_processed_date and current_max_execution_date_from_data != DEFAULT_PAST_DATE:
            save_persisted_date(PERSISTED_DATE_FILE, current_max_execution_date_from_data)
        elif persisted_last_processed_date == DEFAULT_PAST_DATE and current_max_execution_date_from_data != DEFAULT_PAST_DATE:
             # Handles the very first run where persisted date was default, and we found actual dates.
            save_persisted_date(PERSISTED_DATE_FILE, current_max_execution_date_from_data)
        else:
            print("No new max execution date to persist, or current data has no valid execution dates.")
    else:
        print("Usage: python sandbox.py <TICKER_SYMBOL>")
