import os
import json
import pandas as pd
import streamlit as st
from st_aggrid import AgGrid, GridOptionsBuilder, GridUpdateMode

# Import the function
from helpers import SECRETS
from get_account_info import get_processed_positions

st.set_page_config(layout="wide")
st.title("📊 Interactive Portfolio with Notes")

# Get account names from secrets
accounts = list(SECRETS["ACCOUNTS"].keys())
tabs = st.tabs(accounts)

for account_idx, account in enumerate(accounts):
    with tabs[account_idx]:
        st.subheader(f"Positions for {account}")

        # Call get_processed_positions to get the latest data
        positions_list = get_processed_positions(account)
        if not positions_list:
            st.warning("No positions data available for this account.")
            continue

        df = pd.DataFrame(positions_list)

        # Load notes from JSON file or initialize empty dictionary if not exists
        notes_path = f"cache/{account}/notes.json"
        if os.path.exists(notes_path):
            with open(notes_path, "r") as f:
                notes_dict = json.load(f)
        else:
            notes_dict = {}

        # Map notes to 'Notes' column in DataFrame using ticker as key
        df["Notes"] = df["ticker"].apply(lambda ticker: notes_dict.get(ticker, ""))

        # Configure AgGrid with default column settings for better readability
        gb = GridOptionsBuilder.from_dataframe(df)
        gb.configure_default_column(editable=False, sortable=True, filter=True, resizable=True)
        gb.configure_column("Notes", editable=True)
        gb.configure_column("id", hide=True)
        grid_options = gb.build()

        # Show grid with better update tracking
        grid_response = AgGrid(
            df,
            gridOptions=grid_options,
            enable_enterprise_modules=False,
            update_mode=GridUpdateMode.VALUE_CHANGED,  # ensures edit registers immediately
            theme='material',
            stopEditingWhenCellsLoseFocus=True,
            fit_columns_on_grid_load=True,
            height=40 * len(df) + 40,
            key=f"grid_{account}"  # Unique key for each grid
        )

        # Capture updated rows
        updated_df = grid_response['data']

        # Detect and handle changed notes
        changed_notes = []
        for i, row in enumerate(updated_df.itertuples(index=False)):
            original_note = df.iloc[i]["Notes"]
            new_note = row.Notes
            if original_note != new_note:
                changed_notes.append((row.ticker, new_note))

# Remove duplicates
        changed_notes = list(set(changed_notes))

# If any notes changed, propagate + save + reload
        if changed_notes:
    # Propagate note change across all rows
            for ticker, new_note in changed_notes:
                updated_df.loc[updated_df["ticker"] == ticker, "Notes"] = new_note

    # Save to JSON immediately
            new_notes_dict = {}
            for ticker in updated_df["ticker"].unique():
                notes = updated_df[updated_df["ticker"] == ticker]["Notes"]
                note = notes[notes != ""].iloc[0] if not notes[notes != ""].empty else ""
                new_notes_dict[ticker] = note

            os.makedirs(f"cache/{account}", exist_ok=True)
            with open(notes_path, "w") as f:
                json.dump(new_notes_dict, f, indent=2)

             # Inform user & rerun
            st.success(f"✅ Notes for {account} saved. Refreshing...")
            st.rerun()
