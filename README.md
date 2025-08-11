# Robinhood App

This project is designed to create a simplified application for managing and visualizing financial data from a Robinhood-like platform. The main purpose of this application is to allow users to track their account information, option orders, and premium calculations. It aims to provide a user-friendly interface for analyzing and processing financial data efficiently.

---

## Future Development (TODO)

This section outlines the features from the original Streamlit app that need to be implemented in the new React/Flask application to achieve feature parity.

### Backend (Flask API)
- [ ] **Expand Stock Metrics:** Enhance the `/api/portfolio` endpoint to include the following data points for each stock:
    - [ ] PE Ratio
    - [ ] 52-week high and low
    - [ ] Historical price change (1w, 1m, 3m, 1y) using `yfinance`.
    - [ ] Total premium earned from options.
- [ ] **Notes Endpoint:**
    - [ ] Create a `GET /api/notes/<account>` endpoint to retrieve saved notes.
    - [ ] Create a `POST /api/notes/<account>` endpoint to save or update notes for a ticker.

### Frontend (React App)
- [ ] **Enhance Positions Table:**
    - [ ] Add columns for the new stock metrics (PE Ratio, 52-week range, etc.).
    - [ ] Implement sorting functionality for all columns.
    - [ ] Add a filtering mechanism to search for specific tickers.
    - [ ] Add feature to sort table based on column
- [ ] **Implement Notes Feature:**
    - [ ] Add a "Notes" column to the positions table.
    - [ ] Allow users to click and edit notes, triggering a save to the backend.
