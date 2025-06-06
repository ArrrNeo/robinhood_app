import os
import json
import pandas as pd
import streamlit as st
from st_aggrid import AgGrid, GridOptionsBuilder, GridUpdateMode

st.set_page_config(layout="wide")
st.title("📊 Interactive Table with Notes")

# Load data from CSV file
data_path = "my_positions.csv"
df = pd.read_csv(data_path)

# Load notes from JSON file or initialize empty dictionary if not exists
notes_path = "notes_sample.json"
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
    height=40 * len(df) + 40,  # Rough estimate: 40px per row + header
)

# Capture updated rows
updated_df = grid_response['data']

# Detect which names had edited notes
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

    with open(notes_path, "w") as f:
        json.dump(new_notes_dict, f, indent=2)

    # Inform user & rerun
    st.success("✅ Note changed and saved. Refreshing...")
    st.rerun()
