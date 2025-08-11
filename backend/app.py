from collections import defaultdict
import os
import json
import pprint
import traceback
import pandas as pd
from flask_cors import CORS
from datetime import datetime
from flask import Flask, jsonify, request
import robin_stocks.robinhood as r

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

def is_order_eligible_for_premium(order):
    """
    Identifies if an option order is eligible for earned premium calculation.
    Only 'sell to open' and 'buy to close' orders are eligible.
    """
    if order.get("state") != "filled" or not order.get("legs"):
        return False

    sell_to_open = any(leg["side"] == "sell" and leg["position_effect"] == "open" for leg in order["legs"])
    buy_to_close = any(leg["side"] == "buy" and leg["position_effect"] == "close" for leg in order["legs"])

    return sell_to_open or buy_to_close

def calculate_premium_per_ticker(account_number):
    """
    Calculates the net premium from all historical filled option orders
    and groups it by ticker.
    """
    premiums = defaultdict(float)
    try:
        all_orders = r.orders.get_all_option_orders(account_number=account_number)
        if not all_orders:
            return premiums

        for order in all_orders:
            if not is_order_eligible_for_premium(order):
                continue

            ticker = order.get("chain_symbol")
            direction = order.get("direction") # Use 'direction' for overall order credit/debit
            amount_str = order.get("price") # Use 'price' which is the net amount for the order
            quantity_str = order.get("quantity")

            if not all([ticker, direction, amount_str, quantity_str]):
                continue

            try:
                amount = float(amount_str)
                quantity = float(quantity_str)
                net_amount = amount * quantity

                # For multi-leg orders, the premium is the net result.
                # 'direction' tells us if it was a net credit or debit.
                if direction == "credit":
                    premiums[ticker] += net_amount
                elif direction == "debit":
                    premiums[ticker] -= net_amount
            except (ValueError, TypeError) as e:
                print(f"Warning: Could not parse amount/quantity for order {order.get('id')}. Error: {e}")
                continue
        return premiums
    except Exception as e:
        print(f"ERROR in calculate_premium_per_ticker: {e}")
        traceback.print_exc()
        return premiums


def parse_occ_symbol(occ_symbol_full):
    """Parses the OCC option symbol to extract expiry, type, and strike."""
    if not occ_symbol_full or not isinstance(occ_symbol_full, str) or len(occ_symbol_full.split()) <= 1:
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

def get_data_for_account(account_name):
    """
    Fetches and processes portfolio data for a given account name.
    This function is designed to be called by our API endpoint.
    """
    try:
        with open("robinhood_secrets.json") as f:
            accounts_map = json.load(f)["ACCOUNTS"]

        account_number = accounts_map.get(account_name)
        if not account_number:
            return {"error": "Account not found"}, 404

        # --- Calculate Earned Premium ---
        premiums_by_ticker = calculate_premium_per_ticker(account_number)
        total_earned_premium = sum(premiums_by_ticker.values())

        total_pnl = 0
        # 1. Fetch and process stocks first
        stock_positions = r.account.get_open_stock_positions(account_number=account_number)
        all_positions_data = []

        if stock_positions:
            for pos in stock_positions:
                if not pos or float(pos['quantity']) == 0: continue
                instrument_data = r.get_instrument_by_url(pos['instrument'])
                ticker = instrument_data['symbol']
                latest_price_str = r.get_latest_price(ticker)[0]
                if not latest_price_str: continue

                quantity = float(pos['quantity'])
                avg_cost = float(pos['average_buy_price'])
                latest_price = float(latest_price_str)
                market_value = quantity * latest_price
                unrealized_pnl = market_value - (quantity * avg_cost)
                total_pnl += unrealized_pnl

                all_positions_data.append({
                    "type": "stock",
                    "ticker": ticker,
                    "quantity": quantity,
                    "marketValue": market_value,
                    "avgCost": avg_cost,
                    "unrealizedPnl": unrealized_pnl,
                    "returnPct": (unrealized_pnl / (quantity * avg_cost)) * 100 if avg_cost > 0 else 0,
                    "strike": None, "expiry": None, "option_type": None,
                    "earnedPremium": premiums_by_ticker.get(ticker, 0.0)
                })

        # 2. then, Fetch and process options
        option_positions = r.options.get_open_option_positions(account_number=account_number)
        if option_positions:
            for pos in option_positions:
                if not pos or float(pos['quantity']) == 0: continue
                option_id = pos.get('option_id')
                market_data_list = r.options.get_option_market_data_by_id(option_id)
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
                    "earnedPremium": premiums_by_ticker.get(ticker, 0.0)
                })

        # 3. lastly, Fetch portfolio summary and cash
        # for total equity
        portfolio = r.account.load_portfolio_profile(account_number=account_number + '/')
        # for cash and uncleared deposits
        account_details = r.account.load_account_profile(account_number=account_number + '/')

        equity = float(portfolio.get('extended_hours_equity') or portfolio['equity'])
        cash = float(account_details.get('cash')) + float(account_details.get('uncleared_deposits'))

        # Add cash as a position
        all_positions_data.append({
            "type": "cash", "ticker": "USD Cash", "quantity": 1,
            "marketValue": cash, "avgCost": cash, "unrealizedPnl": 0, "returnPct": 0,
            "strike": None, "expiry": None, "option_type": None,
            "earnedPremium": 0.0
        })

        if float(portfolio['equity_previous_close']) == 0:
            change_today_abs = 0.0
            change_today_pct = 0.0
        else:
            change_today_abs = equity - float(portfolio['equity_previous_close'])
            change_today_pct = (change_today_abs / float(portfolio['equity_previous_close'])) * 100

        # 4. Calculate unique tickers
        # Exclude 'USD Cash' from the count
        unique_tickers = set(pos['ticker'] for pos in all_positions_data if pos['ticker'] != 'USD Cash')
        total_tickers = len(unique_tickers)

        summary = {
            "totalEquity": equity,
            "changeTodayAbs": change_today_abs,
            "changeTodayPct": change_today_pct,
            "totalPnl": total_pnl,
            "totalTickers": total_tickers,
            "earnedPremium": total_earned_premium
        }

        return {
            "summary": summary,
            "positions": all_positions_data
        }, 200

    except Exception as e:
        # Adding more detailed error logging to the console
        print(f"ERROR in get_data_for_account for account '{account_name}': {e}")
        traceback.print_exc()
        return {"error": f"An internal error occurred. Check the backend console for details. Error: {e}"}, 500

# --- API Endpoints ---

@app.route('/api/portfolio/<string:account_name>', methods=['GET'])
def get_portfolio(account_name):
    """API endpoint to get portfolio data."""
    data, status_code = get_data_for_account(account_name)
    return jsonify(data), status_code

@app.route('/api/accounts', methods=['GET'])
def get_accounts():
    """API endpoint to get the list of available accounts."""
    try:
        with open("robinhood_secrets.json") as f:
            accounts = json.load(f)["ACCOUNTS"]
        return jsonify(list(accounts.keys()))
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/api/notes/<string:account_name>', methods=['GET'])
def get_notes(account_name):
    """API endpoint to get notes for a specific account."""
    notes_path = os.path.join('..', 'cache', account_name, 'notes.json')
    if os.path.exists(notes_path):
        with open(notes_path, 'r') as f:
            notes = json.load(f)
        return jsonify(notes)
    return jsonify({})

@app.route('/api/notes/<string:account_name>', methods=['POST'])
def update_note(account_name):
    """API endpoint to update a note for a specific ticker in an account."""
    data = request.get_json()
    if not data or 'ticker' not in data or 'note' not in data:
        return jsonify({"error": "Invalid payload. 'ticker' and 'note' are required."}), 400

    ticker = data['ticker']
    note_content = data['note']
    notes_dir = os.path.join('..', 'cache', account_name)
    notes_path = os.path.join(notes_dir, 'notes.json')

    os.makedirs(notes_dir, exist_ok=True)

    notes = {}
    if os.path.exists(notes_path):
        with open(notes_path, 'r') as f:
            notes = json.load(f)

    notes[ticker] = note_content

    with open(notes_path, 'w') as f:
        json.dump(notes, f, indent=2)

    return jsonify({"success": True, "ticker": ticker, "note": note_content})


# --- Run the App ---
if __name__ == '__main__':
    # Use port 5001 to avoid conflict with React's default 3000
    # Host '0.0.0.0' makes it accessible on your local network
    # app.run(debug=True, port=5001, host='0.0.0.0')
    app.run(debug=True, host='0.0.0.0', port=5001)
