import json
import sys

import akshare as ak


def pick_col(df, candidates):
    for c in candidates:
        if c in df.columns:
            return c
    return None


def detect_board(exchange_code, symbol):
    s = str(symbol)
    if exchange_code == "SH":
        if s.startswith("688"):
            return "科创板"
        return "沪主板"
    if exchange_code == "SZ":
        if s.startswith("300") or s.startswith("301"):
            return "创业板"
        return "深主板"
    if exchange_code == "BJ":
        return "北交所"
    return None


def df_to_rows(df, exchange_code, creation_source):
    code_col = pick_col(df, ["证券代码", "代码", "股票代码", "A股代码", "公司代码", "symbol", "code"])
    name_col = pick_col(df, ["证券简称", "简称", "股票简称", "A股简称", "公司简称", "名称", "name"])
    board_col = pick_col(df, ["板块", "市场", "板块名称"])
    if code_col is None:
        code_col = df.columns[0]
    if name_col is None:
        name_col = df.columns[1] if len(df.columns) > 1 else df.columns[0]

    rows = []
    for _, r in df.iterrows():
        symbol = str(r[code_col]).strip()
        name = str(r[name_col]).strip()
        if not symbol or not symbol.isdigit() or len(symbol) != 6:
            continue
        if name == "nan" or name == "None":
            name = ""
        board = None
        if board_col is not None:
            b = str(r[board_col]).strip()
            if b and b != "nan" and b != "None":
                if b == "主板":
                    board = "深主板" if exchange_code == "SZ" else b
                elif b == "创业板":
                    board = "创业板"
                else:
                    board = b
        if board is None:
            board = detect_board(exchange_code, symbol)
        rows.append(
            {
                "exchange_code": exchange_code,
                "symbol": symbol,
                "name": name,
                "board": board,
                "type": "stock",
                "creation_source": creation_source,
            }
        )
    return rows


def main():
    out = []
    sh = ak.stock_info_sh_name_code()
    out.extend(df_to_rows(sh, "SH", "akshare:stock_info_sh_name_code"))
    sz = ak.stock_info_sz_name_code()
    out.extend(df_to_rows(sz, "SZ", "akshare:stock_info_sz_name_code"))
    bj = ak.stock_info_bj_name_code()
    out.extend(df_to_rows(bj, "BJ", "akshare:stock_info_bj_name_code"))

    uniq = {}
    for x in out:
        k = f'{x["exchange_code"]}:{x["symbol"]}'
        if k not in uniq:
            uniq[k] = x
        else:
            if not uniq[k].get("name") and x.get("name"):
                uniq[k]["name"] = x["name"]

    payload = {"stocks": list(uniq.values())}
    json.dump(payload, sys.stdout, ensure_ascii=False)


if __name__ == "__main__":
    main()
