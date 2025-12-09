import json
import os
from datetime import datetime, timedelta
from functools import wraps
import robin_stocks.robinhood as r

# Load ticker cache configuration
with open('ticker_cache.json', 'r') as f:
    ticker_cache_config = json.load(f)

class TickerDataCache:
    def __init__(self, cache_dir="../cache/ticker_data"):
        self.cache_dir = cache_dir
        os.makedirs(cache_dir, exist_ok=True)
        self.settings = ticker_cache_config['cache_settings']

    def _get_cache_file(self, ticker, data_type):
        """Generate cache file path for ticker and data type"""
        ticker_dir = os.path.join(self.cache_dir, ticker.upper())
        os.makedirs(ticker_dir, exist_ok=True)
        return os.path.join(ticker_dir, f"{data_type}.json")

    def _is_cache_valid(self, cache_file, cache_hours=None, cache_minutes=None):
        """Check if cache file exists and is within valid time range"""
        if not os.path.exists(cache_file):
            return False

        try:
            with open(cache_file, 'r') as f:
                data = json.load(f)

            timestamp = datetime.fromisoformat(data.get('timestamp', ''))
            now = datetime.now()

            if cache_hours:
                valid_until = timestamp + timedelta(hours=cache_hours)
            elif cache_minutes:
                valid_until = timestamp + timedelta(minutes=cache_minutes)
            else:
                return False

            return now <= valid_until
        except (json.JSONDecodeError, ValueError, KeyError):
            return False

    def _save_to_cache(self, cache_file, data):
        """Save data to cache with timestamp"""
        cache_data = {
            'timestamp': datetime.now().isoformat(),
            'data': data
        }
        try:
            with open(cache_file, 'w') as f:
                json.dump(cache_data, f, indent=2)
        except Exception as e:
            print(f"Error saving to cache {cache_file}: {e}")

    def _load_from_cache(self, cache_file):
        """Load data from cache file"""
        try:
            with open(cache_file, 'r') as f:
                data = json.load(f)
            return data.get('data')
        except (json.JSONDecodeError, FileNotFoundError):
            return None

    def get_fundamentals(self, ticker):
        """Get fundamentals with caching"""
        cache_file = self._get_cache_file(ticker, 'fundamentals')
        cache_hours = self.settings['fundamentals_cache_hours']

        if self._is_cache_valid(cache_file, cache_hours=cache_hours):
            print(f"Using cached fundamentals for {ticker}")
            return self._load_from_cache(cache_file)

        print(f"Fetching fresh fundamentals for {ticker}")
        data = r.stocks.get_fundamentals(ticker)
        self._save_to_cache(cache_file, data)
        return data

    def get_latest_price(self, ticker):
        """Get latest price with caching"""
        cache_file = self._get_cache_file(ticker, 'latest_price')
        cache_minutes = self.settings['price_cache_minutes']

        if self._is_cache_valid(cache_file, cache_minutes=cache_minutes):
            print(f"Using cached price for {ticker}")
            return self._load_from_cache(cache_file)

        print(f"Fetching fresh price for {ticker}")
        data = r.get_latest_price(ticker)
        self._save_to_cache(cache_file, data)
        return data

    def get_name_by_symbol(self, ticker):
        """Get company name with caching (names rarely change)"""
        cache_file = self._get_cache_file(ticker, 'name')
        cache_hours = self.settings['name_cache_hours']

        if self._is_cache_valid(cache_file, cache_hours=cache_hours):
            print(f"Using cached name for {ticker}")
            return self._load_from_cache(cache_file)

        print(f"Fetching fresh name for {ticker}")
        data = r.stocks.get_name_by_symbol(ticker)
        self._save_to_cache(cache_file, data)
        return data

    def get_price_changes(self, ticker, symbol, get_yfinance_ticker_func):
        """Get all price changes with caching"""
        cache_file = self._get_cache_file(ticker, 'price_changes')
        cache_hours = self.settings['historical_cache_hours']

        if self._is_cache_valid(cache_file, cache_hours=cache_hours):
            print(f"Using cached price changes for {ticker}")
            return self._load_from_cache(cache_file)

        print(f"Fetching fresh price changes for {ticker}")

        def get_price_change_percentage(symbol, days_ago):
            """Helper function from original code"""
            try:
                ticker_obj = get_yfinance_ticker_func(symbol)
                from datetime import datetime, timedelta
                end_date = datetime.now()
                start_date = end_date - timedelta(days=days_ago)
                hist = ticker_obj.history(start=start_date, end=end_date)
                if hist.empty or len(hist) < 2:
                    return 0.0
                old_price = hist['Close'].iloc[0]
                new_price = hist['Close'].iloc[-1]
                if old_price == 0:
                    return 0.0
                return ((new_price - old_price) / old_price) * 100
            except Exception as e:
                print(f"yfinance failed for {symbol} over {days_ago} days: {e}")
                return 0.0

        data = {
            'one_week_change': get_price_change_percentage(symbol, 7),
            'one_month_change': get_price_change_percentage(symbol, 30),
            'three_month_change': get_price_change_percentage(symbol, 90),
            'one_year_change': get_price_change_percentage(symbol, 365)
        }

        self._save_to_cache(cache_file, data)
        return data

    def get_revenue_change(self, ticker, symbol, get_yfinance_ticker_func):
        """Get revenue change data with caching"""
        cache_file = self._get_cache_file(ticker, 'revenue_change')
        cache_hours = self.settings['revenue_cache_hours']

        if self._is_cache_valid(cache_file, cache_hours=cache_hours):
            print(f"Using cached revenue change for {ticker}")
            return self._load_from_cache(cache_file)

        print(f"Fetching fresh revenue change for {ticker}")

        def get_revenue_change_percent(symbol, type="yearly"):
            """Helper function from original code"""
            try:
                ticker_obj = get_yfinance_ticker_func(symbol)
                if type == "yearly":
                    statement = ticker_obj.financials
                elif type == "quarterly":
                    statement = ticker_obj.quarterly_income_stmt
                this = statement.loc['Total Revenue'].iloc[0]
                prev = statement.loc['Total Revenue'].iloc[1]
                if prev == 0:
                    revenue_change = 0
                    print('symbol: ', symbol, ' type: ', type, ' revenue_change: ', revenue_change)
                    return revenue_change

                revenue_change = ((this - prev) * 100 / prev)
                print('symbol: ', symbol, ' type: ', type, ' revenue_change: ', revenue_change)
                return revenue_change
            except Exception as e:
                revenue_change = 0
                print('symbol: ', symbol, ' type: ', type, ' revenue_change: ', revenue_change, f' Error: {e}')
                return 0

        data = {
            'yearly_revenue_change': get_revenue_change_percent(symbol, "yearly"),
            'quarterly_revenue_change': get_revenue_change_percent(symbol, "quarterly")
        }

        self._save_to_cache(cache_file, data)
        return data

    def get_previous_close(self, ticker):
        """Get yesterday's closing price with caching"""
        cache_file = self._get_cache_file(ticker, 'previous_close')
        cache_minutes = self.settings['previous_close_cache_minutes']

        if self._is_cache_valid(cache_file, cache_minutes=cache_minutes):
            print(f"Using cached previous close for {ticker}")
            return self._load_from_cache(cache_file)

        print(f"Fetching fresh previous close for {ticker}")
        try:
            # Get the last day's historical data (yesterday's close)
            historicals = r.get_stock_historicals(ticker, interval='day', span='week')
            if historicals and len(historicals) >= 2:
                # [-1] is today's data, [-2] is yesterday's close
                previous_close = float(historicals[-2]['close_price'])
                self._save_to_cache(cache_file, previous_close)
                return previous_close
            return None
        except Exception as e:
            print(f"Error getting previous close price for {ticker}: {e}")
            return None

    def clear_expired_cache(self):
        """Clean up expired cache files"""
        if not os.path.exists(self.cache_dir):
            return

        for ticker_dir in os.listdir(self.cache_dir):
            ticker_path = os.path.join(self.cache_dir, ticker_dir)
            if not os.path.isdir(ticker_path):
                continue

            for cache_file in os.listdir(ticker_path):
                cache_path = os.path.join(ticker_path, cache_file)
                data_type = cache_file.replace('.json', '')

                # Determine cache duration based on data type
                cache_hours = None
                cache_minutes = None

                if data_type == 'fundamentals':
                    cache_hours = self.settings['fundamentals_cache_hours']
                elif data_type == 'latest_price':
                    cache_minutes = self.settings['price_cache_minutes']
                elif data_type == 'name':
                    cache_hours = self.settings['name_cache_hours']
                elif data_type in ['price_changes']:
                    cache_hours = self.settings['historical_cache_hours']
                elif data_type == 'revenue_change':
                    cache_hours = self.settings['revenue_cache_hours']
                elif data_type == 'previous_close':
                    cache_minutes = self.settings['previous_close_cache_minutes']

                if not self._is_cache_valid(cache_path, cache_hours, cache_minutes):
                    try:
                        os.remove(cache_path)
                        print(f"Removed expired cache: {cache_path}")
                    except OSError:
                        pass

# Global instance
ticker_cache = TickerDataCache()

# Wrapper functions to replace the original cached functions
def get_fundamentals_cached(ticker):
    return ticker_cache.get_fundamentals(ticker)

def get_latest_price_cached(ticker):
    return ticker_cache.get_latest_price(ticker)

def get_name_by_symbol_cached(ticker):
    return ticker_cache.get_name_by_symbol(ticker)

def get_all_price_changes_cached(ticker, symbol, get_yfinance_ticker_func):
    return ticker_cache.get_price_changes(ticker, symbol, get_yfinance_ticker_func)

def get_revenue_changes_cached(ticker, symbol, get_yfinance_ticker_func):
    return ticker_cache.get_revenue_change(ticker, symbol, get_yfinance_ticker_func)

def get_previous_close_cached(ticker):
    return ticker_cache.get_previous_close(ticker)