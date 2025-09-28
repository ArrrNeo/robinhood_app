import os
import pytz
import json
import pprint
import traceback
import yfinance
from collections import defaultdict
from flask_cors import CORS
from datetime import datetime, timedelta
from flask import Flask, jsonify, request
import robin_stocks.robinhood as r
from cache_utils import cache_robinhood_response
from datetime import datetime, timedelta, time
import uuid
from ticker_data_cache import (
    ticker_cache,
    get_fundamentals_cached,
    get_latest_price_cached,
    get_name_by_symbol_cached,
    get_all_price_changes_cached,
    get_revenue_changes_cached
)


# --- Load Configuration ---
with open('config.json', 'r') as f:
    config = json.load(f)

with open('market-config.json', 'r') as f:
    market_config = json.load(f)

# --- Flask App Initialization ---
app = Flask(__name__)
CORS(app, resources={r"/api/*": {"origins": config['cors']['origins']}})

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

# Global dictionary to cache Ticker objects
yfinance_ticker_cache = {}
def get_yfinance_ticker(symbol, refresh_interval_minutes=None):
    if refresh_interval_minutes is None:
        refresh_interval_minutes = config['cache']['yfinance_refresh_interval_minutes']
    """
    Checks the cache for a Ticker object. If it's stale or not found,
    it creates/updates and caches it with a new timestamp.
    """
    # Replace invalid characters in the symbol
    symbol = symbol.replace('.', '-')
    # Check if the symbol is in the cache
    if symbol in yfinance_ticker_cache:
        # Check if the cached data is still fresh
        last_call_time = yfinance_ticker_cache[symbol]['timestamp']
        time_diff = datetime.now() - last_call_time
        if time_diff.total_seconds() < refresh_interval_minutes * 60:
            # Data is fresh, return the cached Ticker object
            return yfinance_ticker_cache[symbol]['ticker']
    # If the ticker is not in the cache or is stale, create a new Ticker object
    # and update the cache with the current timestamp
    try:
        ticker = yfinance.Ticker(symbol)
        yfinance_ticker_cache[symbol] = {
            'ticker': ticker,
            'timestamp': datetime.now()
        }
        return ticker
    except Exception as e:
        print(f"Failed to create yfinance Ticker object for {ticker}: {e}")
        return None

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
INSTRUMENT_URL_CACHE_FILE = config['paths']['instrument_cache_file']

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

# These functions now use the optimized ticker cache
def get_fundamentals(ticker):
    return get_fundamentals_cached(ticker)

def get_latest_price(ticker):
    return get_latest_price_cached(ticker)

def get_name_by_symbol(ticker):
    return get_name_by_symbol_cached(ticker)

@cache_robinhood_response
def get_open_option_positions(account_number):
    return r.options.get_open_option_positions(account_number=account_number)

@cache_robinhood_response
def get_option_market_data_by_id(option_id):
    return r.options.get_option_market_data_by_id(option_id)

@cache_robinhood_response
def get_all_stock_orders(account_number, start_date=None):
    return r.orders.get_all_stock_orders(account_number=account_number, start_date=start_date)

@cache_robinhood_response
def load_phoenix_account():
    return r.account.load_phoenix_account()

def get_crypto_equity_for_account(account_number):
    """
    Gets crypto equity for a specific account using cached phoenix account data.
    Returns the crypto equity value for the specified account.
    """
    try:
        with open("robinhood_secrets.json") as f:
            secrets = json.load(f)

        # Get all account data (cached)
        phoenix_data = load_phoenix_account()

        if not phoenix_data or 'results' not in phoenix_data:
            return 0.0

        # Find the account by account number
        for account_data in phoenix_data['results']:
            if account_data.get('account_number') == account_number:
                crypto_data = account_data.get('crypto', {})

                # Handle the case where equity might be a dict or a direct value
                equity_value = crypto_data.get('equity', 0.0)

                if isinstance(equity_value, dict):
                    # If it's a dict, look for a 'amount' field
                    crypto_equity = float(equity_value.get('amount', 0.0))
                else:
                    crypto_equity = float(equity_value)

                return crypto_equity

        return 0.0
    except Exception as e:
        print(f"ERROR in get_crypto_equity_for_account: {e}")
        return 0.0

# These functions are now handled by the ticker cache system
# get_price_change_percentage and get_revenue_change_percent are integrated into the cache

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
    cache_dir = os.path.join(config['cache']['cache_directory'], account_name)
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

def is_market_hours(now=None):
    """Checks if the current time is within US stock market hours."""
    if now is None:
        now = datetime.now(pytz.utc)

    eastern = pytz.timezone(market_config['market_hours']['timezone'])
    now_eastern = now.astimezone(eastern)

    # Parse market hours from config
    open_time_str = market_config['market_hours']['open_time']
    close_time_str = market_config['market_hours']['close_time']

    market_open = time(*map(int, open_time_str.split(':')))
    market_close = time(*map(int, close_time_str.split(':')))

    # Check if it's a trading day and within market hours
    is_trading_day = now_eastern.weekday() in market_config['market_hours']['trading_days']
    is_market_time = market_open <= now_eastern.time() <= market_close

    return is_trading_day and is_market_time

def get_data_for_account(account_name, force_refresh=False):
    """
    Fetches and processes portfolio data for a given account name.
    This function is designed to be called by our API endpoint.
    It uses a cache to avoid fetching data too frequently, with different
    durations for market vs. off-market hours.
    """
    cache_dir = os.path.join(config['cache']['cache_directory'], account_name)
    os.makedirs(cache_dir, exist_ok=True)
    portfolio_cache_file = os.path.join(cache_dir, 'portfolio_data.json')

    # Determine cache duration based on market hours
    if is_market_hours():
        CACHE_DURATION_SECONDS = config['cache']['market_hours_duration_seconds']
        print(f"Market is open. Using {CACHE_DURATION_SECONDS//60}-minute cache.")
    else:
        CACHE_DURATION_SECONDS = config['cache']['after_hours_duration_seconds']
        print(f"Market is closed. Using {CACHE_DURATION_SECONDS//60}-minute cache.")

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
        crypto_equity = get_crypto_equity_for_account(account_number)
        total_equity += crypto_equity
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

                # Get all price changes in one cached call
                price_changes = get_all_price_changes_cached(ticker, ticker, get_yfinance_ticker)

                # Get revenue changes in one cached call
                revenue_changes = get_revenue_changes_cached(ticker, ticker, get_yfinance_ticker)

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
                    "one_week_change": price_changes['one_week_change'],
                    "one_month_change": price_changes['one_month_change'],
                    "three_month_change": price_changes['three_month_change'],
                    "one_year_change": price_changes['one_year_change'],
                    "yearly_revenue_change": revenue_changes['yearly_revenue_change'],
                    "sector": fundamentals.get('sector'),
                    "industry": fundamentals.get('industry'),
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
                fundamentals = get_fundamentals(ticker)[0]

                # Get revenue changes in one cached call for options underlying
                revenue_changes = get_revenue_changes_cached(ticker, ticker, get_yfinance_ticker)

                try:
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
                        "yearly_revenue_change": revenue_changes['yearly_revenue_change'],
                        "sector": fundamentals.get('sector'),
                        "industry": fundamentals.get('industry'),
                    })
                except Exception as e:
                    print(f"ticker: {ticker}, error: {e}")
                    pp.pprint(fundamentals)

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
            "one_year_change": 0,
            "yearly_revenue_change": 0,
        })

        # Add crypto as a position if there is any
        if crypto_equity > 0:
            all_positions_data.append({
                "type": "crypto", "ticker": "Cryptocurrency", "quantity": 1,
                "marketValue": crypto_equity, "avgCost": crypto_equity, "unrealizedPnl": 0, "returnPct": 0,
                "strike": None, "expiry": None, "option_type": None,
                "earnedPremium": 0.0,
                "name": "Cryptocurrency",
                "intraday_percent_change": 0,
                "pe_ratio": 0,
                "portfolio_percent": (crypto_equity/total_equity)*100,
                "high_52_weeks": 0,
                "low_52_weeks": 0,
                "position_52_week": 0,
                "side": 'long',
                "one_week_change": 0,
                "one_month_change": 0,
                "three_month_change": 0,
                "one_year_change": 0,
                "yearly_revenue_change": 0,
                "sector": "Cryptocurrency",
                "industry": "Digital Assets",
            })

        if float(portfolio['adjusted_portfolio_equity_previous_close']) == 0:
            change_today_abs = 0.0
            change_today_pct = 0.0
        else:
            change_today_abs = total_equity - float(portfolio['adjusted_portfolio_equity_previous_close']) - crypto_equity
            change_today_pct = (change_today_abs / float(portfolio['adjusted_portfolio_equity_previous_close'])) * 100

        # 4. Calculate unique tickers
        # Exclude 'USD Cash' and 'Cryptocurrency' from the count
        unique_tickers = set(pos['ticker'] for pos in all_positions_data if pos['ticker'] not in ['USD Cash', 'Cryptocurrency'])
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
    notes_path = config['paths']['notes_file']
    if os.path.exists(notes_path):
        with open(notes_path, 'r') as f:
            return jsonify(json.load(f))
    return jsonify({})

@app.route('/api/notes/<string:account_name>', methods=['POST'])
def update_note(account_name):
    """API endpoint to update a note for a specific ticker in an account."""
    data = request.get_json()
    if not data or 'ticker' not in data or not ('note' in data or 'comment' in data):
        return jsonify({"error": "Invalid payload"}), 400
    notes_dir = os.path.dirname(config['paths']['notes_file'])
    os.makedirs(notes_dir, exist_ok=True)
    notes_path = os.path.join(notes_dir, 'global_notes.json')
    notes = {}
    if os.path.exists(notes_path):
        with open(notes_path, 'r') as f:
            try:
                notes = json.load(f)
            except json.JSONDecodeError:
                print(f"Warning: Could not decode JSON from {notes_path}. Starting fresh.")

    ticker = data['ticker']
    if ticker not in notes:
        notes[ticker] = {"note": "", "comment": ""}

    if 'note' in data:
        notes[ticker]['note'] = data['note']
    if 'comment' in data:
        notes[ticker]['comment'] = data['comment']

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
        # with open('stock_orders_' + account_number + '.json', 'w') as f:
        #     json.dump(stock_orders, f, indent=4)

        for order in stock_orders:
            if order['state'] == 'filled':
                order['ticker'] = get_instrument_by_url(order['instrument'])['symbol']
                order['net_amount'] = order['executed_notional']['amount']

        option_orders = get_all_option_orders(account_number, start_date=start_date_str)
        # with open('option_orders_' + account_number + '.json', 'w') as f:
        #     json.dump(option_orders, f, indent=4)

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

        return jsonify(all_orders)

    except Exception as e:
        print(f"ERROR in get_orders for account '{account_name}': {e}")
        traceback.print_exc()
        return jsonify({"error": f"An internal error occurred. Check backend console. Error: {e}"}), 500

# --- Portfolio Groups Management ---
def get_groups_file_path(account_name):
    """Get the file path for storing account groups"""
    groups_dir = os.path.join(config['cache']['cache_directory'], account_name)
    os.makedirs(groups_dir, exist_ok=True)
    return os.path.join(groups_dir, 'portfolio_groups.json')

def load_account_groups(account_name):
    """Load groups configuration for an account"""
    groups_file = get_groups_file_path(account_name)
    if os.path.exists(groups_file):
        try:
            with open(groups_file, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            print(f"Warning: Could not decode groups file for {account_name}. Starting fresh.")

    # Default structure
    return {
        "groups": {},
        "ungrouped": [],
        "settings": {
            "default_collapsed": False,
            "show_group_metrics": True
        }
    }

def save_account_groups(account_name, groups_data):
    """Save groups configuration for an account"""
    groups_file = get_groups_file_path(account_name)
    try:
        with open(groups_file, 'w') as f:
            json.dump(groups_data, f, indent=2)
        return True
    except Exception as e:
        print(f"Error saving groups for {account_name}: {e}")
        return False

def calculate_group_metrics(positions, group_position_ids):
    """Calculate metrics for a group of positions"""
    group_positions = []

    # Find positions that belong to this group
    for pos in positions:
        position_id = get_position_id(pos)
        if position_id in group_position_ids:
            group_positions.append(pos)

    if not group_positions:
        return {
            "total_market_value": 0,
            "total_pnl": 0,
            "total_return_pct": 0,
            "day_change_abs": 0,
            "position_count": 0,
            "sectors": {}
        }

    # Calculate totals
    total_market_value = sum(pos.get('marketValue', 0) for pos in group_positions)
    total_pnl = sum(pos.get('unrealizedPnl', 0) for pos in group_positions)
    total_cost = sum(pos.get('quantity', 0) * pos.get('avgCost', 0) for pos in group_positions if pos.get('type') != 'cash')

    # Calculate weighted return percentage
    total_return_pct = (total_pnl / total_cost * 100) if total_cost > 0 else 0

    # Calculate day change (using intraday change)
    day_change_abs = sum(
        pos.get('marketValue', 0) * pos.get('intraday_percent_change', 0) / 100
        for pos in group_positions if pos.get('type') != 'cash'
    )

    # Sector breakdown
    sectors = {}
    for pos in group_positions:
        if pos.get('sector') and pos.get('type') != 'cash':
            sector = pos['sector']
            if sector not in sectors:
                sectors[sector] = {"count": 0, "value": 0}
            sectors[sector]["count"] += 1
            sectors[sector]["value"] += pos.get('marketValue', 0)

    return {
        "total_market_value": total_market_value,
        "total_pnl": total_pnl,
        "total_return_pct": total_return_pct,
        "day_change_abs": day_change_abs,
        "position_count": len(group_positions),
        "sectors": sectors
    }

def get_position_id(position):
    """Generate a unique ID for a position"""
    if position.get('type') == 'option':
        return f"{position['ticker']}-{position.get('option_type', '')}-{position.get('strike', '')}-{position.get('expiry', '')}"
    else:
        return position.get('ticker', '')

# --- Groups API Endpoints ---
@app.route('/api/groups/<string:account_name>', methods=['GET'])
def get_groups(account_name):
    """Get all groups for an account"""
    try:
        groups_data = load_account_groups(account_name)
        return jsonify(groups_data), 200
    except Exception as e:
        return jsonify({"error": f"Failed to load groups: {str(e)}"}), 500

@app.route('/api/groups/<string:account_name>', methods=['POST'])
def create_group(account_name):
    """Create a new group"""
    try:
        data = request.get_json()
        if not data or 'name' not in data:
            return jsonify({"error": "Group name is required"}), 400

        groups_data = load_account_groups(account_name)

        # Generate unique group ID
        group_id = str(uuid.uuid4())

        # Available colors for groups
        colors = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#8B5CF6", "#06B6D4", "#84CC16", "#F97316"]

        # Create new group
        new_group = {
            "name": data['name'],
            "color": data.get('color', colors[len(groups_data['groups']) % len(colors)]),
            "collapsed": data.get('collapsed', groups_data['settings']['default_collapsed']),
            "positions": data.get('positions', []),
            "created_at": datetime.now().isoformat()
        }

        groups_data['groups'][group_id] = new_group

        if save_account_groups(account_name, groups_data):
            return jsonify({"group_id": group_id, "group": new_group}), 201
        else:
            return jsonify({"error": "Failed to save group"}), 500

    except Exception as e:
        return jsonify({"error": f"Failed to create group: {str(e)}"}), 500

@app.route('/api/groups/<string:account_name>/<string:group_id>', methods=['PUT'])
def update_group(account_name, group_id):
    """Update group properties"""
    try:
        data = request.get_json()
        if not data:
            return jsonify({"error": "No data provided"}), 400

        groups_data = load_account_groups(account_name)

        if group_id not in groups_data['groups']:
            return jsonify({"error": "Group not found"}), 404

        # Update allowed fields
        if 'name' in data:
            groups_data['groups'][group_id]['name'] = data['name']
        if 'color' in data:
            groups_data['groups'][group_id]['color'] = data['color']
        if 'collapsed' in data:
            groups_data['groups'][group_id]['collapsed'] = data['collapsed']

        groups_data['groups'][group_id]['updated_at'] = datetime.now().isoformat()

        if save_account_groups(account_name, groups_data):
            return jsonify({"group": groups_data['groups'][group_id]}), 200
        else:
            return jsonify({"error": "Failed to save group"}), 500

    except Exception as e:
        return jsonify({"error": f"Failed to update group: {str(e)}"}), 500

@app.route('/api/groups/<string:account_name>/<string:group_id>', methods=['DELETE'])
def delete_group(account_name, group_id):
    """Delete a group and move its positions to ungrouped"""
    try:
        groups_data = load_account_groups(account_name)

        if group_id not in groups_data['groups']:
            return jsonify({"error": "Group not found"}), 404

        # Move positions back to ungrouped
        group_positions = groups_data['groups'][group_id].get('positions', [])
        groups_data['ungrouped'].extend(group_positions)

        # Remove duplicates
        groups_data['ungrouped'] = list(set(groups_data['ungrouped']))

        # Delete the group
        del groups_data['groups'][group_id]

        if save_account_groups(account_name, groups_data):
            return jsonify({"message": "Group deleted successfully"}), 200
        else:
            return jsonify({"error": "Failed to delete group"}), 500

    except Exception as e:
        return jsonify({"error": f"Failed to delete group: {str(e)}"}), 500

@app.route('/api/groups/<string:account_name>/assign', methods=['POST'])
def assign_position_to_group(account_name):
    """Move a position to a group or ungrouped"""
    try:
        data = request.get_json()
        if not data or 'position_id' not in data:
            return jsonify({"error": "Position ID is required"}), 400

        position_id = data['position_id']
        target_group_id = data.get('group_id')  # None means ungrouped

        groups_data = load_account_groups(account_name)

        # Remove position from all current locations
        # Remove from ungrouped
        if position_id in groups_data['ungrouped']:
            groups_data['ungrouped'].remove(position_id)

        # Remove from any existing group
        for gid, group in groups_data['groups'].items():
            if position_id in group['positions']:
                group['positions'].remove(position_id)

        # Add to target location
        if target_group_id is None:
            # Move to ungrouped
            groups_data['ungrouped'].append(position_id)
        else:
            # Move to specified group
            if target_group_id not in groups_data['groups']:
                return jsonify({"error": "Target group not found"}), 404
            groups_data['groups'][target_group_id]['positions'].append(position_id)

        if save_account_groups(account_name, groups_data):
            return jsonify({"message": "Position assigned successfully"}), 200
        else:
            return jsonify({"error": "Failed to assign position"}), 500

    except Exception as e:
        return jsonify({"error": f"Failed to assign position: {str(e)}"}), 500

@app.route('/api/groups/<string:account_name>/metrics', methods=['GET'])
def get_group_metrics(account_name):
    """Calculate and return metrics for all groups"""
    try:
        # Get portfolio data
        portfolio_data, status_code = get_data_for_account(account_name)
        if status_code != 200:
            return jsonify({"error": "Failed to get portfolio data"}), status_code

        # Get groups data
        groups_data = load_account_groups(account_name)

        # Calculate metrics for each group
        group_metrics = {}
        for group_id, group in groups_data['groups'].items():
            group_metrics[group_id] = calculate_group_metrics(
                portfolio_data['positions'],
                group['positions']
            )

        # Calculate ungrouped metrics
        group_metrics['ungrouped'] = calculate_group_metrics(
            portfolio_data['positions'],
            groups_data['ungrouped']
        )

        return jsonify(group_metrics), 200

    except Exception as e:
        return jsonify({"error": f"Failed to calculate group metrics: {str(e)}"}), 500

# --- Cleanup Endpoint ---
@app.route('/api/cleanup-cache', methods=['POST'])
def cleanup_cache():
    """Endpoint to manually trigger cache cleanup"""
    try:
        ticker_cache.clear_expired_cache()
        return jsonify({"message": "Cache cleanup completed successfully"}), 200
    except Exception as e:
        return jsonify({"error": f"Cache cleanup failed: {str(e)}"}), 500

# --- Run the App ---
if __name__ == '__main__':
    # Clean up expired cache on startup
    print("Cleaning up expired ticker cache...")
    ticker_cache.clear_expired_cache()

    # Load server configuration from config
    app.run(
        debug=config['server']['debug'],
        host=config['server']['host'],
        port=config['server']['port']
    )
