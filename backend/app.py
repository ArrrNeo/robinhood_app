import os
import sys
import json
import pprint
import traceback
import pandas as pd
import yfinance as yf
from collections import defaultdict
from flask_cors import CORS
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
import robin_stocks.robinhood as r
from cache_utils import cache_robinhood_response

# order_considered_for_earned_premium_new_logic = []

# --- Flask App Initialization ---
app = Flask(__name__)
# Allow requests from both localhost (for local dev) and your specific network IP
origins = ["http://localhost:3000", "http://192.168.4.42:3000"]
CORS(app, resources={r"/api/*": {"origins": origins}})

pp = pprint.PrettyPrinter(indent=4)

# --- Robinhood Logic (similar to your original script) ---
# We will login once when the server starts.
# NOTE: In a real production app, you'd manage this session more robustly.
try:
    with open("robinhood_secrets.json") as f:
        secrets = json.load(f)

    r.login(
        username=secrets["USER"],
        password=secrets["PASSWORD"],
        store_session=True,
        mfa_code=secrets["MY_2FA_APP_HERE"]
    )
    print("Robinhood login successful.")
except Exception as e:
    print(f"CRITICAL: Robinhood login failed on startup. {e}")
    # The app will still run, but API calls will fail.

@cache_robinhood_response
def get_all_option_orders(account_number, start_date=None):
    return r.orders.get_all_option_orders(account_number=account_number, start_date=start_date)

@cache_robinhood_response
def load_portfolio_profile(account_number):
    return r.account.load_portfolio_profile(account_number=account_number)

@cache_robinhood_response
def load_account_profile(account_number):
    return r.account.load_account_profile(account_number=account_number)

@cache_robinhood_response
def get_open_stock_positions(account_number):
    return r.account.get_open_stock_positions(account_number=account_number)

def get_instrument_by_url(url):
    return r.get_instrument_by_url(url)

# --- Caching for get_instrument_by_url ---
INSTRUMENT_URL_CACHE_FILE = os.path.join('..', 'cache', 'api_responses', 'instrument_url_to_ticker_map.json')

def get_instrument_by_url_cached(url):
    os.makedirs(os.path.dirname(INSTRUMENT_URL_CACHE_FILE), exist_ok=True)
    url_to_ticker_map = {}
    if os.path.exists(INSTRUMENT_URL_CACHE_FILE):
        try:
            with open(INSTRUMENT_URL_CACHE_FILE, 'r') as f:
                url_to_ticker_map = json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: Could not decode JSON from {INSTRUMENT_URL_CACHE_FILE}. Starting fresh.")

    if url in url_to_ticker_map:
        return {'symbol': url_to_ticker_map[url]}
    else:
        instrument_data = r.get_instrument_by_url(url)
        if instrument_data and 'symbol' in instrument_data:
            ticker = instrument_data['symbol']
            url_to_ticker_map[url] = ticker
            with open(INSTRUMENT_URL_CACHE_FILE, 'w') as f:
                json.dump(url_to_ticker_map, f, indent=2)
            return {'symbol': ticker}
        return None # Or handle error appropriately

@cache_robinhood_response
def get_fundamentals(ticker):
    return r.stocks.get_fundamentals(ticker)

@cache_robinhood_response
def get_latest_price(ticker):
    return r.get_latest_price(ticker)

@cache_robinhood_response
def get_name_by_symbol(ticker):
    return r.stocks.get_name_by_symbol(ticker)

@cache_robinhood_response
def get_open_option_positions(account_number):
    return r.options.get_open_option_positions(account_number=account_number)

@cache_robinhood_response
def get_option_market_data_by_id(option_id):
    return r.options.get_option_market_data_by_id(option_id)

@cache_robinhood_response
def get_all_stock_orders(account_number, start_date=None):
    return r.orders.get_all_stock_orders(account_number=account_number, start_date=start_date)

def get_price_change_percentage(ticker, days_ago):
    """Uses yfinance to get the percentage change over a period."""
    try:
        ticker=ticker.replace('.', '-')
        stock = yf.Ticker(ticker)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days_ago)
        hist = stock.history(start=start_date, end=end_date)
        if hist.empty or len(hist) < 2:
            return 0.0
        old_price = hist['Close'].iloc[0]
        new_price = hist['Close'].iloc[-1]
        if old_price == 0: return 0.0
        return ((new_price - old_price) / old_price) * 100
    except Exception as e:
        print(f"yfinance failed for {ticker} over {days_ago} days: {e}")
        return 0.0

def is_order_eligible_for_premium(order: dict):
    """
    Analyzes a single order and returns a detailed classification.
    """
    state = order.get("state")
    direction = order.get("direction")
    legs = order.get("legs", [])
    # default
    is_theta_play_initiator = False

    if not order.get('legs'):
        return None

    if state != "filled":
        return {"is_theta_play_initiator": False, "order_type": "Cancelled"}

    net_premium = float(order.get('net_amount', 0.0))
    if order.get('net_amount_direction') == 'debit':
        net_premium *= -1

    # BTO: buy to open
    # BTC: buy to close
    # STO: sell to open
    # STC: sell to close

    has_STO = any(l["side"] == "sell" and l["position_effect"] == "open" for l in legs)
    has_BTC = any(l["side"] == "buy" and l["position_effect"] == "close" for l in legs)
    has_BTO = any(l["side"] == "buy" and l["position_effect"] == "open" for l in legs)

    if has_STO and has_BTC:
        is_theta_play_initiator = True
    elif has_STO:
        # exclude pure debit spreads to open
        if direction == "debit" and has_BTO:
            is_theta_play_initiator = False
        else:
            is_theta_play_initiator = True
    elif has_BTC:
        if direction == "debit" and all(l["side"] == "buy" and l["position_effect"] == "close" for l in legs):
            is_theta_play_initiator = True

    return  is_theta_play_initiator

def calculate_theta_premium_for_account(account_number, account_name):
    """
    Calculates the net premium from all historical filled option orders
    and groups it by ticker, using a cache to avoid reprocessing orders.
    """
    cache_dir = os.path.join('..', 'cache', account_name)
    os.makedirs(cache_dir, exist_ok=True)
    cache_file = os.path.join(cache_dir, 'earned_premium.json')

    # Load cached data if it exists
    cached_data = {"processed_order_ids": [], "premiums_by_ticker": {}}
    if os.path.exists(cache_file):
        with open(cache_file, 'r') as f:
            try:
                cached_data = json.load(f)
                # Ensure keys exist
                if "processed_order_ids" not in cached_data:
                    cached_data["processed_order_ids"] = []
                if "premiums_by_ticker" not in cached_data:
                    cached_data["premiums_by_ticker"] = {}
            except json.JSONDecodeError:
                print(f"Warning: Could not decode JSON from {cache_file}. Starting fresh.")

    processed_order_ids = set(cached_data["processed_order_ids"])
    premiums = defaultdict(float, cached_data["premiums_by_ticker"])
    new_orders_processed = False

    try:
        all_orders = get_all_option_orders(account_number=account_number)
        if not all_orders:
            return premiums

        for order in all_orders:
            order_id = order.get("id")
            if not order_id or order_id in processed_order_ids:
                continue

            if not is_order_eligible_for_premium(order):
                continue

            new_orders_processed = True
            processed_order_ids.add(order_id)

            ticker = order.get("chain_symbol")
            direction = order.get("direction") # Use 'direction' for overall order credit/debit
            amount = float(order.get("net_amount", 0)) # Use 'net_amount' which is the net amount for the order
            quantity = float(order.get("quantity", 0))
            if not all([ticker, direction, amount, quantity]):
                continue
            net_amount = amount * quantity
            premiums[ticker] += net_amount if direction == "credit" else -net_amount

        # Save back to cache if new orders were processed
        if new_orders_processed:
            with open(cache_file, 'w') as f:
                json.dump({
                    "processed_order_ids": list(processed_order_ids),
                    "premiums_by_ticker": premiums
                }, f, indent=2)

        return premiums
    except Exception as e:
        print(f"ERROR in calculate_theta_premium_for_account: {e}")
        traceback.print_exc()
        return premiums

def parse_occ_symbol(occ_symbol_full):
    """Parses the OCC option symbol to extract expiry, type, and strike."""
    if not isinstance(occ_symbol_full, str) or len(occ_symbol_full.split()) <= 1:
        return 'N/A', 'N/A', 0
    try:
        occ_symbol_core = occ_symbol_full.split()[1]
        expiry_str = occ_symbol_core[:6]
        expiry = datetime.strptime(expiry_str, "%y%m%d").strftime("%m/%d/%Y")
        option_type = 'call' if occ_symbol_core[6] == 'C' else 'put'
        strike = float(occ_symbol_core[7:]) / 1000
        return expiry, option_type, strike
    except (ValueError, IndexError) as e:
        print(f"Error parsing OCC symbol '{occ_symbol_full}': {e}")
        return 'N/A', 'N/A', 0

import pytz
from datetime import datetime, timedelta, time

def is_market_hours(now=None):
    """Checks if the current time is within US stock market hours."""
    if now is None:
        now = datetime.now(pytz.utc)

    eastern = pytz.timezone('US/Eastern')
    now_eastern = now.astimezone(eastern)

    # Market hours: 9:30 AM to 4:00 PM
    market_open = time(9, 30)
    market_close = time(16, 0)

    # Check if it's a weekday and within market hours
    is_weekday = now_eastern.weekday() < 5  # Monday=0, Sunday=6
    is_market_time = market_open <= now_eastern.time() <= market_close

    return is_weekday and is_market_time

def get_data_for_account(account_name, force_refresh=False):
    """
    Fetches and processes portfolio data for a given account name.
    This function is designed to be called by our API endpoint.
    It uses a cache to avoid fetching data too frequently, with different
    durations for market vs. off-market hours.
    """
    cache_dir = os.path.join('..', 'cache', account_name)
    os.makedirs(cache_dir, exist_ok=True)
    portfolio_cache_file = os.path.join(cache_dir, 'portfolio_data.json')

    # Determine cache duration based on market hours
    if is_market_hours():
        CACHE_DURATION_SECONDS = 300  # 5 minutes
        print("Market is open. Using 5-minute cache.")
    else:
        CACHE_DURATION_SECONDS = 3600  # 60 minutes
        print("Market is closed. Using 60-minute cache.")

    # --- Check for cached data first ---
    if not force_refresh and os.path.exists(portfolio_cache_file):
        with open(portfolio_cache_file, 'r') as f:
            try:
                cached_data = json.load(f)
                last_fetched_time = datetime.fromisoformat(cached_data.get("timestamp"))
                if (datetime.now() - last_fetched_time).total_seconds() < CACHE_DURATION_SECONDS:
                    print(f"Serving cached portfolio data for {account_name}.")
                    response_data = cached_data.get("data", {})
                    response_data['timestamp'] = cached_data.get("timestamp")
                    return response_data, 200
            except (json.JSONDecodeError, KeyError, TypeError) as e:
                print(f"Warning: Could not read cache file {portfolio_cache_file}. Refetching. Error: {e}")

    print(f"Fetching fresh portfolio data for {account_name}.")
    try:
        with open("robinhood_secrets.json") as f:
            accounts_map = json.load(f)["ACCOUNTS"]

        account_number = accounts_map.get(account_name)
        if not account_number:
            return {"error": "Account not found"}, 404

        # --- Calculate Earned Premium ---
        premiums_by_ticker = calculate_theta_premium_for_account(account_number, account_name)
        total_earned_premium = sum(premiums_by_ticker.values())

        # for total equity
        portfolio = load_portfolio_profile(account_number=account_number + '/')
        # for cash and uncleared deposits
        account_details = load_account_profile(account_number=account_number + '/')

        total_equity = float(portfolio.get('extended_hours_equity') or portfolio['equity'])
        cash = float(account_details.get('cash')) + float(account_details.get('uncleared_deposits'))

        total_pnl = 0
        # 1. Fetch and process stocks first
        stock_positions = get_open_stock_positions(account_number=account_number)
        all_positions_data = []

        if stock_positions:
            for pos in stock_positions:
                if not pos or float(pos.get('quantity', 0)) == 0:
                    continue

                instrument_data = get_instrument_by_url_cached(pos['instrument'])
                ticker = instrument_data['symbol']
                fundamentals = get_fundamentals(ticker)[0]
                latest_price_str = get_latest_price(ticker)[0]
                if not latest_price_str:
                    continue

                quantity = float(pos['quantity'])
                avg_cost = float(pos['average_buy_price'])
                latest_price = float(latest_price_str)
                market_value = quantity * latest_price
                unrealized_pnl = market_value - (quantity * avg_cost)
                total_pnl += unrealized_pnl
                high_52_weeks = float(fundamentals.get('high_52_weeks', 0)) if fundamentals.get('high_52_weeks', 0) else 0
                low_52_weeks  = float(fundamentals.get('low_52_weeks', 0))  if fundamentals.get('low_52_weeks', 0)  else 0

                all_positions_data.append({
                    "type": "stock",
                    "ticker": ticker,
                    "quantity": quantity,
                    "marketValue": market_value,
                    "avgCost": avg_cost,
                    "unrealizedPnl": unrealized_pnl,
                    "returnPct": (unrealized_pnl / (quantity * avg_cost)) * 100 if avg_cost > 0 else 0,
                    "strike": None, "expiry": None, "option_type": None,
                    "earnedPremium": premiums_by_ticker.get(ticker, 0.0),
                    "name": get_name_by_symbol(ticker),
                    "intraday_percent_change": (latest_price - float(pos['intraday_average_buy_price'])) * 100 / float(pos['intraday_average_buy_price']) if float(pos['intraday_average_buy_price']) != 0 else 0,
                    "pe_ratio": float(fundamentals.get('pe_ratio')) if fundamentals.get('pe_ratio') else 0.0,
                    "portfolio_percent": (market_value / total_equity) * 100 if total_equity > 0 else 0,
                    "high_52_weeks": high_52_weeks,
                    "low_52_weeks": low_52_weeks,
                    "position_52_week": (latest_price - low_52_weeks) * 100 / (high_52_weeks - low_52_weeks) if high_52_weeks > low_52_weeks else 0,
                    "side": 'long' if market_value > 0 else 'short',
                    "one_week_change": get_price_change_percentage(ticker, 7),
                    "one_month_change": get_price_change_percentage(ticker, 30),
                    "three_month_change": get_price_change_percentage(ticker, 90),
                    "one_year_change": get_price_change_percentage(ticker, 365),
                })

        # 2. then, Fetch and process options
        option_positions = get_open_option_positions(account_number=account_number)
        if option_positions:
            for pos in option_positions:
                if not pos or float(pos['quantity']) == 0: continue
                option_id = pos.get('option_id')
                market_data_list = get_option_market_data_by_id(option_id)
                if not market_data_list or not market_data_list[0]: continue
                market_data = market_data_list[0]

                ticker = pos.get('chain_symbol')
                quantity = float(pos['quantity'])
                avg_price = float(pos['average_price']) / 100
                mark_price = float(market_data.get('mark_price', 0))
                market_value = quantity * mark_price * 100

                pnl_per_share = mark_price - avg_price
                if pos.get('type') == 'short':
                    pnl_per_share *= -1

                unrealized_pnl = pnl_per_share * quantity * 100
                total_pnl += unrealized_pnl

                expiry, option_type, strike = parse_occ_symbol(market_data.get('occ_symbol'))

                all_positions_data.append({
                     "type": "option",
                    "ticker": ticker,
                    "quantity": quantity,
                    "marketValue": market_value,
                    "avgCost": avg_price,
                    "unrealizedPnl": unrealized_pnl,
                    "returnPct": (pnl_per_share / avg_price) * 100 if avg_price > 0 else 0,
                    "strike": strike, "expiry": expiry, "option_type": option_type,
                    "earnedPremium": premiums_by_ticker.get(pos.get('chain_symbol'), 0.0),
                    "name": get_name_by_symbol(pos.get('chain_symbol')),
                    "intraday_percent_change": 0,
                    "pe_ratio": 0,
                    "portfolio_percent": 0,
                    "high_52_weeks": 0,
                    "low_52_weeks": 0,
                    "position_52_week": 0,
                    "side": pos.get('type'),
                    "one_week_change": 0,
                    "one_month_change": 0,
                    "three_month_change": 0,
                    "one_year_change": 0,
                })

        # Add cash as a position
        all_positions_data.append({
            "type": "cash", "ticker": "USD Cash", "quantity": 1,
            "marketValue": cash, "avgCost": cash, "unrealizedPnl": 0, "returnPct": 0,
            "strike": None, "expiry": None, "option_type": None,
            "earnedPremium": 0.0,
            "name": "Cash",
            "intraday_percent_change": 0,
            "pe_ratio": 0,
            "portfolio_percent": (cash/total_equity)*100,
            "high_52_weeks": 0,
            "low_52_weeks": 0,
            "position_52_week": 0,
            "side": 'long',
            "one_week_change": 0,
            "one_month_change": 0,
            "three_month_change": 0,
            "one_year_change": 0
        })

        if float(portfolio['adjusted_portfolio_equity_previous_close']) == 0:
            change_today_abs = 0.0
            change_today_pct = 0.0
        else:
            change_today_abs = total_equity - float(portfolio['adjusted_portfolio_equity_previous_close'])
            change_today_pct = (change_today_abs / float(portfolio['adjusted_portfolio_equity_previous_close'])) * 100

        # 4. Calculate unique tickers
        # Exclude 'USD Cash' from the count
        unique_tickers = set(pos['ticker'] for pos in all_positions_data if pos['ticker'] != 'USD Cash')
        total_tickers = len(unique_tickers)

        summary = {
            "totalEquity": total_equity,
            "changeTodayAbs": change_today_abs,
            "changeTodayPct": change_today_pct,
            "totalPnl": total_pnl,
            "totalTickers": total_tickers,
            "earnedPremium": total_earned_premium
        }

        # --- Save the fresh data to cache before returning ---
        data_to_cache = {
            "timestamp": datetime.now().isoformat(),
            "data": {
                "summary": summary,
                "positions": all_positions_data
            }
        }
        with open(portfolio_cache_file, 'w') as f:
            json.dump(data_to_cache, f, indent=2)

        response_data = data_to_cache.get("data", {})
        response_data['timestamp'] = data_to_cache.get("timestamp")
        return response_data, 200

    except Exception as e:
        # Adding more detailed error logging to the console
        print(f"ERROR in get_data_for_account for account '{account_name}': {e}")
        traceback.print_exc()
        return {"error": f"An internal error occurred. Check the backend console for details. Error: {e}"}, 500

# --- API Endpoints ---

@app.route('/api/portfolio/<string:account_name>', methods=['GET'])
def get_portfolio(account_name):
    """API endpoint to get portfolio data."""
    # Check for the 'force' query parameter
    force_refresh = request.args.get('force', 'false').lower() == 'true'
    data, status_code = get_data_for_account(account_name, force_refresh=force_refresh)
    return jsonify(data), status_code

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    """API endpoint to get the list of available accounts."""
    try:
        with open("robinhood_secrets.json") as f:
            return jsonify(list(json.load(f)["ACCOUNTS"].keys()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/notes/<string:account_name>', methods=['GET'])
def get_notes(account_name):
    """API endpoint to get notes for a specific account."""
    notes_path = os.path.join('..', 'cache', account_name, 'notes.json')
    if os.path.exists(notes_path):
        with open(notes_path, 'r') as f:
            return jsonify(json.load(f))
    return jsonify({})

@app.route('/api/notes/<string:account_name>', methods=['POST'])
def update_note(account_name):
    """API endpoint to update a note for a specific ticker in an account."""
    data = request.get_json()
    if not data or 'ticker' not in data or 'note' not in data:
        return jsonify({"error": "Invalid payload"}), 400
    notes_dir = os.path.join('..', 'cache', account_name)
    os.makedirs(notes_dir, exist_ok=True)
    notes_path = os.path.join(notes_dir, 'notes.json')
    notes = {}
    if os.path.exists(notes_path):
        with open(notes_path, 'r') as f: notes = json.load(f)
    notes[data['ticker']] = data['note']
    with open(notes_path, 'w') as f:
        json.dump(notes, f, indent=2)
    return jsonify({"success": True, **data})

@app.route('/api/orders/<string:account_name>', methods=['GET'])
def get_orders(account_name):
    """API endpoint to get historical orders for a specific account."""
    try:
        with open("robinhood_secrets.json") as f:
            accounts_map = json.load(f)["ACCOUNTS"]
        account_number = accounts_map.get(account_name)
        if not account_number:
            return jsonify({"error": "Account not found"}), 404

        start_date_str = request.args.get('start_date')
        end_date_str = request.args.get('end_date')

        stock_orders = get_all_stock_orders(account_number, start_date=start_date_str)
        for order in stock_orders:
            order['ticker'] = get_instrument_by_url(order['instrument'])['symbol']

        option_orders = get_all_option_orders(account_number, start_date=start_date_str)
        for order in option_orders:
            order['ticker'] = order['chain_symbol']

        all_orders = stock_orders + option_orders

        # Sort orders by date, most recent first
        all_orders.sort(key=lambda o: o.get('updated_at'), reverse=True)

        # Filter by date if parameters are provided
        end_date = None
        start_date = None
        filtered_all_orders = []

        if start_date_str:
            start_date = datetime.fromisoformat(start_date_str)

        if end_date_str:
            end_date = datetime.fromisoformat(end_date_str)


        for order in all_orders:
            order_later_than_start = None
            order_earlienr_than_end = None

            try:
                if start_date:
                    order_later_than_start = (datetime.fromisoformat(order['updated_at'].replace('Z', '+00:00')) >= start_date)
                if end_date:
                    order_earlienr_than_end = (datetime.fromisoformat(order['updated_at'].replace('Z', '+00:00')) <= end_date)
            except:
                pp.pprint(order)
                continue

            if start_date and end_date:
                if order_later_than_start and order_earlienr_than_end:
                    filtered_all_orders.append(order)
                    continue
            elif start_date:
                if order_later_than_start:
                    filtered_all_orders.append(order)
                    continue
            elif end_date:
                if order_earlienr_than_end:
                    filtered_all_orders.append(order)
                    continue
            else:
                filtered_all_orders.append(order)
                continue

        with open('all_orders_' + account_number + '.json', 'w') as f:
            json.dump(all_orders, f, indent=4)
        return jsonify(all_orders)

    except Exception as e:
        print(f"ERROR in get_orders for account '{account_name}': {e}")
        traceback.print_exc()
        return jsonify({"error": f"An internal error occurred. Check backend console. Error: {e}"}), 500

# --- Run the App ---
if __name__ == '__main__':
    # Use port 5001 to avoid conflict with React's default 3000
    # Host '0.0.0.0' makes it accessible on your local network
    # app.run(debug=True, port=5001, host='0.0.0.0')
    app.run(debug=True, host='0.0.0.0', port=5001)
