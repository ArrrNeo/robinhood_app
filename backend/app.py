import json
import pprint
import traceback
import pandas as pd
from flask_cors import CORS
from datetime import datetime
from flask import Flask, jsonify
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
        username=None,
        password=secrets["PASSWORD"],
        store_session=True,
        mfa_code=secrets["MY_2FA_APP_HERE"]
    )
    print("Robinhood login successful.")
except Exception as e:
    print(f"CRITICAL: Robinhood login failed on startup. {e}")
    # The app will still run, but API calls will fail.

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

        # 1. Fetch positions
        positions = r.account.get_open_stock_positions(account_number=account_number)
        all_positions_data = []

        if positions:
            for pos in positions:
                if not pos or float(pos['quantity']) == 0:
                    continue

                instrument_data = r.get_instrument_by_url(pos['instrument'])
                ticker = instrument_data['symbol']

                # For speed in the API, we'll skip the ATH calculation for now.
                # This is a heavy operation and better handled differently in a real app.

                quantity = float(pos['quantity'])
                avg_cost = float(pos['average_buy_price'])
                latest_price_str = r.get_latest_price(ticker)[0]
                if latest_price_str is None: continue # Skip if price is not available

                latest_price = float(latest_price_str)
                market_value = quantity * latest_price
                total_cost = quantity * avg_cost
                unrealized_pnl = market_value - total_cost
                unrealized_return_pct = (unrealized_pnl / total_cost) * 100 if total_cost > 0 else 0

                created_at = datetime.strptime(pos['created_at'], "%Y-%m-%dT%H:%M:%S.%fZ")
                days_held = (datetime.now() - created_at).days
                annualized_return = ((1 + (unrealized_return_pct / 100)) ** (365.0 / days_held) - 1) * 100 if days_held > 0 else 0

                all_positions_data.append({
                    "ticker": ticker,
                    "quantity": quantity,
                    "marketValue": market_value,
                    "avgCost": avg_cost,
                    "totalCost": total_cost,
                    "unrealizedPnl": unrealized_pnl,
                    "returnPct": unrealized_return_pct,
                    "annualizedPct": annualized_return,
                })

        # 2. Fetch portfolio summary
        portfolio = r.account.load_portfolio_profile(account_number=account_number + '/')
        # naveen
        print("account_name: ", account_name)
        print("account_number: ", account_number)
        print("portfolio")
        pp.pprint(portfolio)
        equity = float(portfolio.get('extended_hours_equity') or portfolio['equity'])
        change_today_abs = equity - float(portfolio['equity_previous_close'])
        if float(portfolio['equity_previous_close']) == 0:
            change_today_pct = 0.0
        else:
            change_today_pct = (change_today_abs / float(portfolio['equity_previous_close'])) * 100

        summary = {
            "totalEquity": equity,
            "changeTodayAbs": change_today_abs,
            "changeTodayPct": change_today_pct,
            "totalPnl": sum(p['unrealizedPnl'] for p in all_positions_data)
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

# --- API Endpoint ---
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

# --- Run the App ---
if __name__ == '__main__':
    # Use port 5001 to avoid conflict with React's default 3000
    # Host '0.0.0.0' makes it accessible on your local network
    # app.run(debug=True, port=5001, host='0.0.0.0')
    app.run(debug=True, host='0.0.0.0', port=5001)
