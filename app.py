import pprint
import streamlit as st
import pandas as pd
import json
import os
from get_account_info import get_processed_positions, OUTPUT_CSV_FILE as DEFAULT_POSITIONS_CSV # Assuming get_account_info.py is in the same directory

NOTES_FILE = 'notes.json'

pp = pprint.PrettyPrinter(indent=4)

# --- Notes Management ---
def load_notes():
    """Loads notes from the JSON file."""
    abs_path = os.path.abspath(NOTES_FILE)
    # print(f"LOAD_NOTES: Attempting to load notes from: {abs_path}")
    if os.path.exists(NOTES_FILE):
        try:
            with open(NOTES_FILE, 'r') as f:
                notes_data = json.load(f)
                # print(f"LOAD_NOTES: Successfully loaded notes: {notes_data}")
                return notes_data
        except json.JSONDecodeError:
            # print(f"LOAD_NOTES: Error decoding JSON from {NOTES_FILE}. Returning empty notes.")
            return {} # Return empty if file is corrupted
        except Exception as e:
            # print(f"LOAD_NOTES: An unexpected error occurred while loading notes from {abs_path}: {e}")
            return {}
    else:
        # print(f"LOAD_NOTES: Notes file not found at {abs_path}. Returning empty notes.")
        return {}

def save_notes(notes_data):
    """Saves notes to the JSON file."""
    abs_path = os.path.abspath(NOTES_FILE)
    # print(f"SAVE_NOTES: Attempting to save notes to: {abs_path}")
    # print(f"SAVE_NOTES: Data to save: {notes_data}")
    try:
        with open(NOTES_FILE, 'w') as f:
            json.dump(notes_data, f, indent=4)
        # print(f"SAVE_NOTES: Successfully saved notes to {abs_path}.")
    except IOError as e:
        print(f"SAVE_NOTES: IOError saving notes to {abs_path}: {e}")
    except OSError as e:
        print(f"SAVE_NOTES: OSError saving notes to {abs_path}: {e}")
    except Exception as e:
        print(f"SAVE_NOTES: An unexpected error occurred while saving notes to {abs_path}: {e}")

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
    if 'ticker' in df.columns:
        df['notes'] = df['ticker'].apply(lambda x: st.session_state.notes.get(str(x), ''))
    else:
        st.warning("'ticker' column not found in positions data. Notes cannot be loaded/saved correctly tied to specific entries.")
        df['notes'] = '' # Add an empty notes column

    # Define a desired column order
    # Make sure 'notes' is one of the first few columns for visibility
    desired_columns = ['ticker', 'notes', 'type', 'side', 'quantity', 'avg_price', 'mark_price',
                       'equity', 'pnl', 'premium_earned', 'pnl_percent', 'portfolio_percent', 'pe_ratio',
                       'strike', 'option_type', 'expiry']
    
    # Reorder columns, adding any missing ones (e.g., if a new field appears from source)
    current_columns = df.columns.tolist()
    final_columns = [col for col in desired_columns if col in current_columns] \
                    + [col for col in current_columns if col not in desired_columns]
    df = df[final_columns]
    df = df.reset_index(drop=True)
    st.session_state.positions_df = df
    st.toast("Data refreshed!")
    return df

# --- Streamlit App ---
st.set_page_config(layout="wide") # Use wide layout for better table display

st.title("Robinhood Positions Dashboard")

# --- Data Loading and Caching ---
if 'positions_df' not in st.session_state:
    st.session_state.positions_df = pd.DataFrame()
if 'notes' not in st.session_state:
    st.session_state.notes = load_notes()

# Automatically fetch data using local cache if the dataframe is empty on initial load/refresh
if st.session_state.positions_df.empty:
    # print("DEBUG: positions_df is empty on initial load. Attempting to fetch data from cache.")
    fetch_data(force_refresh=False) # Simulate "Refresh View (use local cache)"

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
    # Prepare DataFrame for display by dropping the 'id' column
    df_for_display = df_to_edit.drop(columns=['id'], errors='ignore')

    # Configure which columns are editable. For now, only 'notes'.
    # `disabled` takes a list of columns that should NOT be editable.
    all_columns_except_notes = [col for col in df_for_display.columns if col != 'notes']
    
    edited_df = st.data_editor(
        df_for_display, # Pass the DataFrame without 'id'
        key="positions_editor", 
        disabled=all_columns_except_notes,
        # num_rows="dynamic", # Temporarily commented out to troubleshoot index/note editing issue
        use_container_width=True,
        height=600 
    )

    # print("DEBUG: --- After st.data_editor ---")
    # print("DEBUG: edited_df.head(5):")
    # print(edited_df.head(5))
    # print("DEBUG: edited_df.index:")
    # print(edited_df.index)
    # print("DEBUG: --- End After st.data_editor ---")

    # --- Save Changes (Notes) ---
    # Compare the edited DataFrame with the original session state to find changes in notes
    # This is crucial because st.data_editor returns the entire modified DataFrame on any change.
    # We only want to save if notes have actually changed.
    notes_changed = False
    # print(f"DEBUG: Just before checking 'ticker' in edited_df.columns. edited_df columns: {edited_df.columns.tolist()}")
    # print(f"DEBUG: Current st.session_state.notes: {st.session_state.notes}")

    if 'ticker' in edited_df.columns:
        # print("DEBUG: Entered 'ticker' in edited_df.columns block.")
        for index, row in edited_df.iterrows():
            position_ticker = str(row['ticker'])
            new_note = row['notes']
            existing_note = st.session_state.notes.get(position_ticker, '')
            
            # print(f"DEBUG: Processing row index {index}, ticker {position_ticker}. New note: '{new_note}', Existing note: '{existing_note}'")

            if existing_note != new_note:
                # print(f"DEBUG: Note changed for ticker {position_ticker}. Updating st.session_state.notes.")
                st.session_state.notes[position_ticker] = new_note
                notes_changed = True
            # else:
            #     print(f"DEBUG: Note for ticker {position_ticker} is unchanged.")
        
        # print(f"DEBUG: After loop. notes_changed = {notes_changed}")
        if notes_changed:
            # print(f"MAIN_LOGIC: Notes changed. Current st.session_state.notes before saving: {st.session_state.notes}")
            save_notes(st.session_state.notes)
            st.toast("Notes saved!")
            if 'ticker' in st.session_state.positions_df.columns:
                st.session_state.positions_df['notes'] = st.session_state.positions_df['ticker'].apply(lambda x: st.session_state.notes.get(str(x), ''))
            else:
                st.warning("Cannot update notes in displayed DataFrame as 'ticker' column is missing.")

    else:
        st.warning("'ticker' column is missing, cannot save notes.")

    # Display some summary or other info
    st.caption(f"Displaying {len(edited_df)} positions.")

# For running the app: streamlit run app.py 