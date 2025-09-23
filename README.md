# Robinhood Portfolio Tracker

A comprehensive full-stack web application that provides advanced portfolio management and analytics for Robinhood trading accounts. This application offers detailed position tracking, options analysis, performance metrics, and historical order management beyond what's available in the standard Robinhood app.

## Features

### Portfolio Management
- **Real-time Portfolio Overview**: Track total equity, daily P/L, total unrealized P/L, and performance metrics
- **Multi-Account Support**: Manage multiple Robinhood accounts from a single interface
- **Comprehensive Position Tracking**: View stocks, options, and cash positions with detailed analytics
- **Smart Caching**: Intelligent caching system with different refresh intervals for market hours vs. after-hours
- **Portfolio Grouping**: Create custom groups to organize positions with calculated group metrics

### Advanced Analytics
- **Options Trading Analysis**:
  - Earned premium calculations from theta decay strategies
  - Option position tracking with strike prices, expiration dates, and P/L
  - Classification of theta-generating trades (STO, BTC combinations)
- **Performance Metrics**:
  - 52-week high/low positioning
  - 1-week, 1-month, 3-month, and 1-year price changes
  - Revenue growth analysis (yearly and quarterly)
  - PE ratios and fundamental data
- **Sector & Industry Analysis**: Categorization and analysis by sector and industry

### Interactive Interface
- **Customizable Data Tables**:
  - Drag-and-drop column reordering
  - Show/hide columns based on preference
  - Sortable columns with visual indicators
- **Editable Notes System**: Add and edit notes/comments for individual positions
- **Historical Orders View**: Complete order history with filtering capabilities
- **Portfolio Groups Management**:
  - Create custom groups with names and colors
  - Collapsible group views with expand/collapse functionality
  - Group metrics: total market value, P/L, return %, sector breakdown
  - Persistent group assignments across sessions
- **Responsive Design**: Works on desktop and mobile devices

### Data Integration
- **Robinhood API Integration**: Direct integration with Robinhood's private API
- **Yahoo Finance Data**: Enhanced with yfinance for additional market data and fundamental analysis
- **Persistent Storage**: Local caching and note storage for improved performance

## Technology Stack

### Backend (Python Flask)
- **Flask**: Web framework with CORS support
- **robin_stocks**: Robinhood API integration
- **yfinance**: Yahoo Finance data integration
- **pytz**: Timezone handling for market hours
- **Caching System**: File-based caching for API responses

### Frontend (React)
- **React 19**: Modern React with hooks and functional components
- **Tailwind CSS**: Utility-first CSS framework for styling
- **@dnd-kit**: Drag-and-drop functionality for column reordering
- **Local Storage**: Client-side caching and preferences

## Project Structure

```
robinhood_app/
├── backend/
│   ├── app.py                 # Main Flask application
│   ├── cache_utils.py         # Caching utilities
│   ├── robinhood_secrets.json # Account credentials (not in repo)
│   └── *.json                 # Order data cache files
├── frontend/
│   ├── src/
│   │   ├── App.js            # Main React application
│   │   ├── Orders.js         # Orders page component
│   │   └── index.css         # Tailwind CSS styles
│   ├── package.json          # Node.js dependencies
│   └── public/               # Static assets
├── cache/                    # API response cache directory
└── requirements.txt          # Python dependencies
```

## Installation and Setup

### Prerequisites
- Python 3.7+
- Node.js 14+
- Active Robinhood account with 2FA enabled

### Backend Setup

1. **Clone the repository and navigate to the project directory**
   ```bash
   git clone <repository-url>
   cd robinhood_app
   ```

2. **Create a virtual environment**
   ```bash
   python -m venv .venv
   source .venv/bin/activate  # On Windows: .venv\Scripts\activate
   ```

3. **Install Python dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Configure Robinhood credentials**
   Create `backend/robinhood_secrets.json`:
   ```json
   {
     "USER": "your_robinhood_email",
     "PASSWORD": "your_robinhood_password",
     "MY_2FA_APP_HERE": "your_2fa_code",
     "ACCOUNTS": {
       "account_name_1": "account_number_1",
       "account_name_2": "account_number_2"
     }
   }
   ```

5. **Start the backend server**
   ```bash
   cd backend
   python app.py
   ```
   Server will run on `http://localhost:5001`

### Frontend Setup

1. **Navigate to frontend directory**
   ```bash
   cd frontend
   ```

2. **Install Node.js dependencies**
   ```bash
   npm install
   ```

3. **Start the development server**
   ```bash
   npm start
   ```
   Application will open at `http://localhost:3000`

## Usage

### Portfolio Dashboard
1. Select an account from the sidebar
2. View real-time portfolio metrics in the summary cards
3. Analyze individual positions in the detailed table
4. Customize table columns using the settings gear icon
5. Add notes to positions by clicking in the Notes column

### Options Analysis
- The application automatically calculates earned premium from options strategies
- View option positions with strike prices, expiration dates, and current P/L
- Track theta decay strategies and premium collection

### Portfolio Groups
1. Select an account from the sidebar
2. Click "Groups" in the Views section
3. Create new groups with custom names and colors
4. View group metrics including total market value, P/L, and sector breakdown
5. Expand/collapse groups to manage screen space
6. Rename or delete groups as needed

### Historical Orders
1. Click "Orders" in the sidebar navigation
2. Filter orders by date range
3. View both stock and option order history
4. Analyze order execution details

## Configuration

### Market Hours Caching
- **Market Hours**: 5-minute cache refresh
- **After Hours**: 60-minute cache refresh
- **Force Refresh**: Use the refresh button to bypass cache

### Column Customization
Customize visible columns through the settings panel:
- Ticker, Name, Market Value, Quantity
- P/L metrics and performance indicators
- Options-specific data (Strike, Expiry, Type)
- Fundamental data (PE Ratio, 52-week ranges)
- Custom notes and comments

## Security Considerations

- **Credentials**: Store Robinhood credentials securely in `robinhood_secrets.json`
- **2FA Required**: Two-factor authentication must be enabled on your Robinhood account
- **Local Network**: Backend configured for local network access (192.168.x.x)
- **API Limits**: Implements caching to respect Robinhood API rate limits

## Development

### Backend Development
- **Debugging**: Flask runs in debug mode for development
- **API Endpoints**:
  - `GET /api/accounts` - List available accounts
  - `GET /api/portfolio/<account_name>` - Get portfolio data
  - `GET /api/orders/<account_name>` - Get order history
  - `POST /api/notes/<account_name>` - Save position notes

### Frontend Development
- **Hot Reload**: React development server with hot reload
- **State Management**: React hooks for local state management
- **Responsive Design**: Tailwind CSS for responsive layouts

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Make your changes
4. Test thoroughly with your Robinhood account
5. Commit your changes (`git commit -am 'Add new feature'`)
6. Push to the branch (`git push origin feature/new-feature`)
7. Create a Pull Request

## Disclaimer

This application is for educational and personal use only. It is not affiliated with Robinhood Financial LLC. Use at your own risk and ensure compliance with Robinhood's Terms of Service. The developers are not responsible for any financial losses or account restrictions that may result from using this application.

## License

This project is for personal use. Please respect Robinhood's Terms of Service and API usage guidelines.