import os
import csv
import json
import pyotp
import pprint
import robin_stocks
import robinhood_secrets

get_latest = 1

def write_to_file(obj, filenme):
    with open(filenme + '.json', 'w') as fout:
        json.dump(obj, fout)

def read_from_file(filenme):
    return json.load(open(filenme + '.json'))

login = robin_stocks.robinhood.login('rawat.nav@gmail.com', robinhood_secrets.PASSWORD, mfa_code=pyotp.TOTP(robinhood_secrets.MY_2FA_APP_HERE).now())

if get_latest:
    my_stocks = robin_stocks.robinhood.account.build_holdings()
    write_to_file(my_stocks, 'json/my_stocks')
else:
    my_stocks = read_from_file('json/my_stocks')

if get_latest:
    my_options = robin_stocks.robinhood.options.get_open_option_positions()
    write_to_file(my_options, 'json/my_options')
else:
    my_options = read_from_file('json/my_options')

my_total_positions = {}

for key, value in my_stocks.items():
    my_custom_data = {}
    my_custom_data['ticker'] = key
    my_custom_data['avg_price'] = float(value['average_buy_price'])
    my_custom_data['mark_price'] = float(value['price'])
    my_custom_data['quantity'] = float(value['quantity'])
    my_custom_data['equity'] = float(value['equity'])
    if value['pe_ratio']:
        my_custom_data['pe_ratio'] = float(value['pe_ratio'])
    else:
        my_custom_data['pe_ratio'] = 0
    my_custom_data['pnl_percent'] = float(value['percent_change'])
    my_custom_data['portfolio_percent'] = float(value['percentage'])
    my_custom_data['type'] = 'stock'
    my_custom_data['pnl'] = (my_custom_data['mark_price'] - my_custom_data['avg_price']) * my_custom_data['quantity']
    if my_custom_data['equity'] > 0:
        my_custom_data['side'] = 'long'
    else:
        my_custom_data['side'] = 'short'
        my_custom_data['pnl'] = -1 * my_custom_data['pnl']
    my_custom_data['strike'] = 0
    my_custom_data['option_type'] = 'N/A'
    my_custom_data['expiry'] = 'N/A'
    my_custom_data['id'] = value['id']
    if get_latest:
        fundamentals = robin_stocks.robinhood.stocks.get_fundamentals(my_custom_data['ticker'])
        write_to_file(fundamentals, 'json/fundamentals_' + my_custom_data['ticker'])
    my_total_positions[my_custom_data['id']] = my_custom_data

for position in my_options:
    my_custom_data = {}
    if get_latest:
        data = robin_stocks.robinhood.options.get_option_market_data_by_id(position['option_id'])
        write_to_file(data, 'json/option_market_data_' + position['option_id'])
    else:
        data = read_from_file('json/option_market_data_' + position['option_id'])
    my_custom_data['ticker'] = position['chain_symbol']
    my_custom_data['avg_price'] = float(position['average_price']) / 100
    my_custom_data['mark_price'] = float(data[0]['mark_price'])
    my_custom_data['quantity'] = float(position['quantity'])
    my_custom_data['equity'] = float(position['quantity']) * my_custom_data['mark_price'] * 100
    if get_latest:
        fundamentals = robin_stocks.robinhood.stocks.get_fundamentals(my_custom_data['ticker'])
        write_to_file(fundamentals, 'json/fundamentals_' + my_custom_data['ticker'])
    else:
        fundamentals = read_from_file('json/fundamentals_' + my_custom_data['ticker'])
    if fundamentals[0]['pe_ratio']:
        my_custom_data['pe_ratio'] = float(fundamentals[0]['pe_ratio'])
    my_custom_data['portfolio_percent'] = 0 #todo
    my_custom_data['type'] = 'option'
    my_custom_data['pnl'] = (my_custom_data['mark_price'] - my_custom_data['avg_price']) * my_custom_data['quantity'] * 100
    if my_custom_data['avg_price']:
        my_custom_data['pnl_percent'] = (my_custom_data['mark_price'] - my_custom_data['avg_price']) * 100 / my_custom_data['avg_price']
    my_custom_data['side'] = position['type']
    if my_custom_data['side'] == 'short':
        my_custom_data['equity'] = my_custom_data['equity'] * (-1)
        my_custom_data['pnl'] = -1 * my_custom_data['pnl']
        if my_custom_data['avg_price']:
            my_custom_data['pnl_percent'] = -1 * my_custom_data['pnl_percent']
    occ_symbol = data[0]['occ_symbol'].split()[1]
    expiry=occ_symbol[2:4] + '/' + occ_symbol[4:6] + '/20' + occ_symbol[0:2]
    my_custom_data['expiry'] = expiry
    if occ_symbol[6] == 'C':
        my_custom_data['option_type'] = 'call'
    if occ_symbol[6] == 'P':
        my_custom_data['option_type'] = 'put'
    my_custom_data['strike'] = float(occ_symbol[7:])/1000
    my_custom_data['id'] = position['option_id']
    my_total_positions[my_custom_data['id']] = my_custom_data

# pprint.PrettyPrinter(indent=4).pprint(my_total_positions)

def round_dict(value, num_decimals=2):
    if isinstance(value, dict):
        return {k: round_dict(v, num_decimals) for k, v in value.items()}
    elif isinstance(value, list):
        return [round_dict(item, num_decimals) for item in value]
    elif isinstance(value, float):
        return round(value, num_decimals)
    else:
        return value

my_total_positions = round_dict(my_total_positions, 2)

# my_total_positions.
keys = list(my_total_positions.values())[0].keys()
with open('my_positions.csv', 'w', newline='') as output_file:
    dict_writer = csv.DictWriter(output_file, keys)
    dict_writer.writeheader()
    dict_writer.writerows(list(my_total_positions.values()))
