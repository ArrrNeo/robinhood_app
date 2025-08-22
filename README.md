# Robinhood App

This project is designed to create a simplified application for managing and visualizing financial data from a Robinhood-like platform. The main purpose of this application is to allow users to track their account information, option orders, and premium calculations. It aims to provide a user-friendly interface for analyzing and processing financial data efficiently.

---

## Future Development (TODO)

This section outlines the features from the original Streamlit app that need to be implemented in the new React/Flask application to achieve feature parity.

### Backend (Flask API)

### Frontend (React App)

- [ ] **Component-Based Architecture**: Break down the main `App` component into smaller, reusable components for better maintainability and scalability. For example, create separate components for the header, the main content, and the footer.
- [ ] **State Management**: Introduce a state management library like Redux or Zustand to handle the application's state more efficiently. This will make it easier to manage data and pass it between components without prop drilling.
- [ ] **Styling Improvements**: Use a CSS framework like Tailwind CSS or Material-UI to improve the application's styling and create a more modern and responsive user interface. This will also help to ensure consistency across the application.

### Portfolio Features
- [ ] **Portfolio Value Chart**: Display a historical chart of the user's portfolio value over different time ranges (e.g., 1D, 1W, 1M, 1Y, All).
- [ ] **Asset Allocation Donut Chart**: Show a donut chart visualizing the portfolio's diversification by asset type (e.g., Stocks, ETFs, Crypto).
- [ ] **Holdings Table**: A detailed table listing all current holdings with columns for symbol, quantity, average cost, current price, total value, and daily/total gain/loss.
