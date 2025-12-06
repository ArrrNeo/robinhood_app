# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a full-stack Robinhood Portfolio Tracker application that provides advanced portfolio management and analytics beyond the standard Robinhood app. The project consists of:

- **Backend**: Flask API (Python) that integrates with Robinhood's API and Yahoo Finance
- **Frontend**: React 19 application with Tailwind CSS
- **Legacy**: Older Streamlit-based application in root directory (not actively developed)

**Important**: Focus all development work on the `frontend/` and `backend/` directories. The root directory contains legacy Streamlit code that is not actively maintained.

## Development Commands

### Backend (Flask API)

```bash
# Start backend server (runs on port 5001)
cd backend
python app.py
```

**Note**: Backend has auto-reload enabled in debug mode. Do not start/restart servers manually unless explicitly requested.

### Frontend (React)

```bash
# Start frontend development server (runs on port 3000)
cd frontend
npm start

# Build for production
cd frontend
npm run build

# Run tests
cd frontend
npm test
```

**Note**: Frontend has hot-reload enabled. Do not start/restart servers manually unless explicitly requested.

### Python Environment

```bash
# Activate virtual environment
source .venv/bin/activate  # On Windows: .venv\Scripts\activate

# Install Python dependencies
pip install -r requirements.txt
```

## Architecture Overview

### Backend Architecture (backend/app.py)

The Flask backend is organized around several key systems:

**1. Multi-Layer Caching System**
- `cache_utils.py`: Decorator for caching Robinhood API responses to `cache/api_responses/`
- `ticker_data_cache.py`: TickerDataCache class with configurable TTLs for different data types (fundamentals: hours, prices: minutes, names: hours)
- `yfinance_ticker_cache`: In-memory cache dict for yfinance Ticker objects
- Market-hours-aware caching: 5-minute refresh during market hours, 60-minute after hours

**2. API Endpoints** (all routes prefixed with `/api/`)
- `/api/accounts` - List available Robinhood accounts
- `/api/portfolio/<account_name>` - Portfolio data with positions, metrics, and calculated analytics
- `/api/orders/<account_name>` - Historical orders (stocks and options)
- `/api/notes` - Global notes across all accounts
- `/api/notes/<account_name>` - Account-specific notes (GET/POST)
- `/api/groups/<account_name>` - Portfolio groups (GET/POST/PUT/DELETE)
- `/api/groups/<account_name>/assign` - Assign positions to groups
- `/api/groups/<account_name>/metrics` - Group-level analytics
- `/api/auth/login` - Robinhood authentication
- `/api/auth/status` - Authentication status check
- `/api/cleanup-cache` - Manual cache cleanup

**3. Options Trading Analysis**
- `calculate_theta_premium_for_account()`: Calculates earned premium from theta decay strategies
- `is_order_eligible_for_premium()`: Identifies STO (Sell to Open) and BTC (Buy to Close) option combinations
- Tracks earned premium by ticker across multiple accounts

**4. Data Enrichment Pipeline**
Each position is enriched with:
- Robinhood API data (holdings, P/L, account info)
- Yahoo Finance data (52-week ranges, PE ratios, revenue growth, sector/industry)
- Custom calculated fields (position in 52-week range, price changes over multiple periods)
- User-generated notes and group assignments

**5. Configuration Files**
- `backend/robinhood_secrets.json`: Account credentials and account mapping (not in repo)
- `backend/config.json`: Server settings, CORS origins, cache durations
- `backend/market-config.json`: Market hours configuration
- `backend/ticker_cache.json`: Cache TTL settings for different data types

### Frontend Architecture (frontend/src/)

**Main Components:**
- `App.js`: Main portfolio view with account selection, position tables, drag-and-drop column reordering, editable notes
- `AllAccounts.js`: Consolidated view across all accounts with aggregated metrics
- `Orders.js`: Historical orders page with filtering
- `GroupManager.js`: Portfolio grouping system with modals and assignment dropdowns

**Key Features:**
- **Drag-and-Drop**: Uses @dnd-kit for column reordering
- **Customizable Columns**: Show/hide columns via settings panel, preferences stored in localStorage
- **Editable Cells**: Inline editing for notes/comments with auto-resize textareas
- **Tab Navigation**: Switches between "Positions", "Groups", and "All" views
- **Group Management**: Create custom groups with colors, assign positions, view group metrics

**Configuration Files:**
- `frontend/src/config.json`: API base URL and endpoints configuration
- `frontend/src/table-columns.json`: Column definitions (visibility, labels, formatting)

**LocalStorage Keys:**
- `portfolio-columns`: Column visibility settings
- `portfolio-column-order`: User's custom column order
- `selectedAccount`: Currently selected account
- `currentPage`: Current view/tab
- `portfolio-data-<account>`: Cached portfolio data per account

### Data Flow

1. **Authentication**: App loads → checks `/api/auth/status` → if not logged in, triggers login flow
2. **Account Selection**: User selects account → frontend fetches `/api/portfolio/<account_name>` with optional `?force=true` to bypass cache
3. **Data Enrichment**: Backend fetches Robinhood positions → enriches with yfinance data → applies caching layers → returns enriched portfolio
4. **Group Management**: Groups stored in `cache/groups/<account_name>.json` → synchronized via API calls
5. **Notes**: Notes stored in `cache/global_notes.json` → editable inline → saved via POST to `/api/notes`

## Important Development Guidelines

### Code Style
- **Do not change unnecessary code**: Avoid moving code to previous lines without logical changes, removing relevant comments, or removing empty lines
- **Only use emojis if explicitly requested**: This applies to both code and file content

### Server Management
- **Never start/stop servers**: Both frontend and backend have auto-reload enabled
- **Never restart servers**: Changes are automatically picked up

### Focus Areas
- All development work should focus on `frontend/` and `backend/` directories
- The root directory contains a legacy Streamlit application - do not modify unless explicitly requested

### API Integration
- Backend integrates with Robinhood's private API via `robin_stocks` library
- 2FA authentication is required for Robinhood login
- Respect rate limits via multi-layer caching system
- Be aware of market hours vs. after-hours caching behavior

### Caching Strategy
- Use `@cache_robinhood_response` decorator for new Robinhood API calls
- Use `TickerDataCache` methods for ticker-specific data
- Consider market hours when implementing time-sensitive features
- Cache files are stored in `cache/` directory hierarchy

### Testing API Endpoints

```bash
# Check authentication status
curl -s "http://127.0.0.1:5001/api/auth/status"

# Get accounts list
curl -s "http://127.0.0.1:5001/api/accounts"

# Get portfolio data (cached)
curl -s "http://127.0.0.1:5001/api/portfolio/INDIVIDUAL"

# Force refresh portfolio data
curl -s "http://127.0.0.1:5001/api/portfolio/INDIVIDUAL?force=true"

# Get all accounts view
curl -s "http://127.0.0.1:5001/api/portfolio/ALL"

# Cleanup cache
curl -X POST "http://127.0.0.1:5001/api/cleanup-cache"

# Get notes
curl -s "http://127.0.0.1:5001/api/notes"

# Add a note
curl -X POST "http://127.0.0.1:5001/api/notes" \
  -H "Content-Type: application/json" \
  -d '{"ticker": "TEST", "note": "test note", "comment": "test comment"}'
```

## Common Development Patterns

### Adding a New Column to Portfolio Table

1. Update `frontend/src/table-columns.json` with new column definition
2. Update backend's `get_data_for_account()` to include new data in position enrichment
3. Add rendering logic in `App.js` table cell rendering section
4. Consider adding sort/filter functionality if applicable

### Adding a New API Endpoint

1. Define route in `backend/app.py` with `@app.route` decorator
2. Update `frontend/src/config.json` with new endpoint path
3. Implement API call in relevant frontend component
4. Add caching strategy if endpoint returns expensive data

### Implementing New Metrics

1. Add calculation logic in `get_data_for_account()` or dedicated helper function
2. Consider caching strategy (API response cache vs. ticker data cache)
3. Add to position enrichment pipeline
4. Update frontend table column definitions if displaying in UI

## Dependencies

**Backend (Python):**
- `flask`, `flask-cors`: Web framework
- `robin_stocks`: Robinhood API client
- `yfinance`: Yahoo Finance data
- `pytz`: Timezone handling
- `pandas`, `plotly`, `streamlit`: Legacy dependencies (for root Streamlit app)

**Frontend (JavaScript):**
- `react@19.1.1`, `react-dom@19.1.1`: UI framework
- `@dnd-kit/*`: Drag-and-drop functionality
- `tailwindcss`: Utility-first CSS framework
- `react-scripts`: Build tooling (Create React App)
