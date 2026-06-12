import csv
import os
from bs4 import BeautifulSoup

HTML_FILE = '../templates/editor-ui.html'
CSV_FILE = './data-config-legend.csv'

def get_element_type(tag):
    """Attempt to guess the element type based on HTML tags."""
    if tag.name == 'button':
        return 'Button'
    elif tag.name == 'input':
        inp_type = tag.get('type', 'text').lower()
        if inp_type == 'checkbox': return 'Checkbox'
        if inp_type == 'range': return 'Range Input'
        if inp_type == 'color': return 'Color Picker'
        if inp_type == 'number': return 'Number Input'
        return 'Text Input'
    elif tag.name == 'select':
        return 'Select Dropdown'
    elif tag.name == 'div':
        return 'Div (Interactive)'
    elif tag.name == 'span':
        return 'Text Display'
    return tag.name.capitalize()

def get_ui_location(tag):
    """Find the closest parent with an ID to guess the UI location."""
    parent = tag.find_parent(id=True)
    if parent:
        # Convert hyphenated IDs to Title Case for the legend (e.g., 'text-edit-panel' -> 'Text Edit Panel')
        return parent['id'].replace('-', ' ').title()
    return 'Unknown Layout'

def update_legend():
    # 1. Scrape the HTML for all active data-config-ids
    with open(HTML_FILE, 'r', encoding='utf-8') as f:
        soup = BeautifulSoup(f, 'html.parser')
        
    html_elements = soup.find_all(attrs={"data-config-id": True})
    
    # 2. Read existing CSV so we don't overwrite manual descriptions
    existing_ids = set()
    csv_rows = []
    
    if os.path.exists(CSV_FILE):
        with open(CSV_FILE, 'r', encoding='utf-8') as f:
            reader = csv.reader(f)
            header = next(reader, None)
            if header:
                csv_rows.append(header)
            for row in reader:
                if row:
                    # Strip spaces or quotes just in case
                    existing_id = row[0].replace('"', '').replace("'", "").strip()
                    # Handle comma-separated grouped IDs (e.g., "font-size-up, font-size-down")
                    for sub_id in [s.strip() for s in existing_id.split(',')]:
                        existing_ids.add(sub_id)
                csv_rows.append(row)
    else:
        csv_rows.append(['data-config-id', 'Element Type', 'UI Location'])

    # 3. Find completely new IDs and prepare them for appending
    new_entries = []
    for tag in html_elements:
        config_id = tag['data-config-id'].strip()
        
        if config_id not in existing_ids:
            elem_type = get_element_type(tag)
            ui_loc = get_ui_location(tag)
            new_entries.append([config_id, elem_type, ui_loc])
            existing_ids.add(config_id) # Prevent duplicates if multiple identical IDs exist
            print(f"[+] Found new config element: {config_id}")

    # 4. Append new rows and rewrite the CSV
    if new_entries:
        csv_rows.extend(new_entries)
        with open(CSV_FILE, 'w', newline='', encoding='utf-8') as f:
            writer = csv.writer(f)
            writer.writerows(csv_rows)
        print(f"\nSuccessfully added {len(new_entries)} new items to {CSV_FILE}.")
    else:
        print("\nLegend is already up to date. No new IDs found.")

if __name__ == '__main__':
    update_legend()
