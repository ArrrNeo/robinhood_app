import streamlit as st
import pandas as pd
import json
import os
from get_account_info import get_processed_positions, OUTPUT_CSV_FILE as DEFAULT_POSITIONS_CSV # Assuming get_account_info.py is in the same directory

NOTES_FILE = 'notes.json'

# --- Notes Management ---
def load_notes():
    """Loads notes from the JSON file."""
    if os.path.exists(NOTES_FILE):
        try:
            with open(NOTES_FILE, 'r') as f:
                return json.load(f)
        except json.JSONDecodeError:
            return {} # Return empty if file is corrupted
    return {}

def save_notes(notes_data):
    """Saves notes to the JSON file."""
    with open(NOTES_FILE, 'w') as f:
        json.dump(notes_data, f, indent=4)

# --- Streamlit App ---
st.set_page_config(layout="wide") # Use wide layout for better table display

st.title("Robinhood Positions Dashboard")

# --- Data Loading and Caching ---
if 'positions_df' not in st.session_state:
    st.session_state.positions_df = pd.DataFrame()
if 'notes' not in st.session_state:
    st.session_state.notes = load_notes()

def fetch_data(force_refresh=False):
    """Fetches data from robinhood_data_manager and prepares the DataFrame."""
    # In Streamlit, GET_LATEST_DATA from get_account_info will control API fetch vs cache for underlying data.
    # The force_refresh here is for the Streamlit app's own refresh button.
    st.toast("Fetching positions data...")
    positions_dict = get_processed_positions(force_refresh=force_refresh)
    if not positions_dict:
        st.error("Failed to fetch positions data.")
        return pd.DataFrame()

    df = pd.DataFrame.from_dict(positions_dict, orient='index')
    # Ensure 'id' is a column if it's an index
    if 'id' not in df.columns and df.index.name == 'id':
         df.reset_index(inplace=True) # Puts 'id' from index to a column
    elif 'id' not in df.columns and 'id' in df.index.names: # Multi-index case, less likely here
        df.reset_index(inplace=True)
    
    # Add/Update notes column
    # Use ticker as the primary key for notes if 'id' is too volatile or not user-friendly
    # For now, using 'id' as it's unique per position entry from get_account_info
    if 'id' in df.columns:
        df['notes'] = df['id'].apply(lambda x: st.session_state.notes.get(str(x), ''))
    else:
        st.warning("'id' column not found in positions data. Notes cannot be loaded/saved correctly tied to specific entries.")
        df['notes'] = '' # Add an empty notes column

    # Define a desired column order
    # Make sure 'notes' is one of the first few columns for visibility
    desired_columns = ['id', 'ticker', 'notes', 'type', 'side', 'quantity', 'avg_price', 'mark_price',
                       'equity', 'pnl', 'pnl_percent', 'portfolio_percent', 'pe_ratio',
                       'strike', 'option_type', 'expiry']
    
    # Reorder columns, adding any missing ones (e.g., if a new field appears from source)
    current_columns = df.columns.tolist()
    final_columns = [col for col in desired_columns if col in current_columns] \
                    + [col for col in current_columns if col not in desired_columns]
    df = df[final_columns]

    st.session_state.positions_df = df
    st.toast("Data refreshed!")
    return df

# --- UI Elements ---
col1, col2 = st.columns([1, 5]) # Adjust column width as needed
with col1:
    if st.button("🔄 Refresh Data (from API if configured)", use_container_width=True):
        fetch_data(force_refresh=True) # Force underlying script to fetch from API
    if st.button("🔄 Refresh View (use local cache)", use_container_width=True):
        fetch_data(force_refresh=False) # Use underlying script's cache

if st.session_state.positions_df.empty:
    st.write("Click 'Refresh Data' to load your positions.")
    if not os.path.exists(DEFAULT_POSITIONS_CSV) and not os.path.exists(NOTES_FILE):
        st.info("It looks like this might be the first run or cache is empty. "
                "Ensure `get_account_info.py` can fetch data (credentials, 2FA setup). ")
else:
    st.subheader("Your Positions")

    # Make a copy for editing to compare changes
    df_to_edit = st.session_state.positions_df.copy()

    # --- Display and Edit Data Table ---
    # Configure which columns are editable. For now, only 'notes'.
    # `disabled` takes a list of columns that should NOT be editable.
    all_columns_except_notes = [col for col in df_to_edit.columns if col != 'notes']
    
    edited_df = st.data_editor(
        df_to_edit,
        #key="positions_editor", # Adding a key can help preserve edit states better in some cases
        disabled=all_columns_except_notes,
        num_rows="dynamic", # Allows adding/deleting rows if needed in future, though not the primary use here
        use_container_width=True,
        height=600 # Adjust height as needed
    )

    # --- Save Changes (Notes) ---
    # Compare the edited DataFrame with the original session state to find changes in notes
    # This is crucial because st.data_editor returns the entire modified DataFrame on any change.
    # We only want to save if notes have actually changed.
    notes_changed = False
    if 'id' in edited_df.columns:
        for index, row in edited_df.iterrows():
            position_id = str(row['id'])
            new_note = row['notes']
            # Check against the original notes loaded into session_state.notes, 
            # or if the id was not in original notes but now has a note.
            if st.session_state.notes.get(position_id, '') != new_note:
                st.session_state.notes[position_id] = new_note
                notes_changed = True
        
        if notes_changed:
            save_notes(st.session_state.notes)
            st.toast("Notes saved!")
            # To see the change reflected immediately if we re-run, we might need to update positions_df as well
            # or ideally, the data_editor should reflect changes directly if its input is updated.
            # For now, let's ensure the notes column in the displayed df is also up-to-date for next render.
            st.session_state.positions_df['notes'] = st.session_state.positions_df['id'].apply(lambda x: st.session_state.notes.get(str(x), ''))

    else:
        st.warning("'id' column is missing, cannot save notes.")

    # Display some summary or other info
    st.caption(f"Displaying {len(edited_df)} positions.")

# For running the app: streamlit run app.py 