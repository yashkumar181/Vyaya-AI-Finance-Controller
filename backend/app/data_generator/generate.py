import os
import pandas as pd
import numpy as np
from datetime import date, timedelta
from decimal import Decimal, ROUND_HALF_UP

NUM_ORDERS = 2000
RANDOM_SEED = int(os.getenv("RANDOM_SEED", 42))

np.random.seed(RANDOM_SEED)

INSTRUMENT_WEIGHTS = {
    "UPI": 0.55,
    "Card": 0.25,
    "NetBanking": 0.10,
    "Wallet": 0.08,
    "International Card": 0.02
}

MDR_RATES = {
    "UPI": Decimal("0.00"),
    "Card": Decimal("0.02"),
    "NetBanking": Decimal("0.015"),
    "Wallet": Decimal("0.018"),
    "International Card": Decimal("0.03")
}

def to_decimal(val) -> Decimal:
    return Decimal(str(val)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)

def add_business_days(start_date: date, add_days: int) -> date:
    curr = start_date
    added = 0
    while added < add_days:
        curr += timedelta(days=1)
        if curr.weekday() < 5:
            added += 1
    return curr

def generate_orders() -> pd.DataFrame:
    orders = []
    start_date = date(2026, 1, 1)
    
    for i in range(1, NUM_ORDERS + 1):
        order_id = f"ORD-{10000 + i}"
        order_date = start_date + timedelta(days=int(np.random.randint(0, 30)))
        customer_id = f"CUST-{np.random.randint(1000, 9999)}"
        gross_amount = to_decimal(np.random.uniform(200, 15000))
        instrument = np.random.choice(list(INSTRUMENT_WEIGHTS.keys()), p=list(INSTRUMENT_WEIGHTS.values()))
        contracted_mdr_rate = MDR_RATES[instrument]
        
        refund_amount = Decimal("0.00")
        refund_date = None
        if np.random.rand() < 0.05:  
            refund_amount = to_decimal(float(gross_amount) * np.random.uniform(0.1, 1.0))
            refund_date = add_business_days(order_date, int(np.random.randint(1, 5)))

        expected_mdr = to_decimal(gross_amount * contracted_mdr_rate)
        expected_gst_on_mdr = to_decimal(expected_mdr * Decimal("0.18"))
        expected_tds = to_decimal(gross_amount * Decimal("0.01"))
        expected_net_amount = gross_amount - expected_mdr - expected_gst_on_mdr - expected_tds - refund_amount

        orders.append({
            "order_id": order_id,
            "order_date": order_date,
            "customer_id": customer_id,
            "gross_amount": gross_amount,
            "payment_instrument": instrument,
            "contracted_mdr_rate": contracted_mdr_rate,
            "refund_amount": refund_amount,
            "refund_date": refund_date,
            "expected_mdr": expected_mdr,
            "expected_gst_on_mdr": expected_gst_on_mdr,
            "expected_tds": expected_tds,
            "expected_net_amount": expected_net_amount
        })
        
    return pd.DataFrame(orders)

def apply_corruptions(orders_df: pd.DataFrame):
    settlements = []
    ground_truth = []
    
    for _, row in orders_df.iterrows():
        settlement_date = add_business_days(row["order_date"], 1)
        settlement_id = f"SET-{settlement_date.strftime('%Y%m%d')}"
        
        settlements.append({
            "settlement_id": settlement_id,
            "settlement_date": settlement_date,
            "order_id": row["order_id"],
            "claimed_gross_amount": row["gross_amount"],
            "claimed_mdr_amount": row["expected_mdr"],
            "claimed_gst_on_mdr": row["expected_gst_on_mdr"],
            "claimed_tds": row["expected_tds"],
            "claimed_refund_deducted": row["refund_amount"],
            "claimed_net_amount": row["expected_net_amount"]
        })
        ground_truth.append({"order_id": row["order_id"], "injected_issue": None})
        
    settlements_df = pd.DataFrame(settlements)
    gt_df = pd.DataFrame(ground_truth)

    # 1. TIMING_DRIFT - Delay one entire batch of ~20-30 orders
    batch_counts = settlements_df['settlement_id'].value_counts()
    valid_batches = batch_counts[(batch_counts >= 20) & (batch_counts <= 35)].index
    target_batch = valid_batches[0] if len(valid_batches) > 0 else batch_counts.index[0]
    
    timing_idx = settlements_df[settlements_df['settlement_id'] == target_batch].index
    gt_df.loc[timing_idx, 'injected_issue'] = 'TIMING_DRIFT'
    delayed_batch_id = target_batch

    # 2. GST_ROUNDING_DELTA 
    gst_idx = settlements_df[gt_df['injected_issue'].isnull()].sample(25).index
    deltas = [to_decimal(np.random.choice([0.02, -0.02, 0.05, -0.05])) for _ in range(25)]
    settlements_df.loc[gst_idx, 'claimed_gst_on_mdr'] += deltas
    gt_df.loc[gst_idx, 'injected_issue'] = 'GST_ROUNDING_DELTA'

    # 3. WRONG_MDR_TIER 
    mdr_idx = settlements_df[gt_df['injected_issue'].isnull()].sample(25).index
    for idx in mdr_idx:
        settlements_df.at[idx, 'claimed_mdr_amount'] = to_decimal(settlements_df.at[idx, 'claimed_gross_amount'] * Decimal("0.025"))
    gt_df.loc[mdr_idx, 'injected_issue'] = 'WRONG_MDR_TIER'

    # 4. TDS_MISMATCH 
    tds_idx = settlements_df[gt_df['injected_issue'].isnull()].sample(18).index
    for idx in tds_idx:
        settlements_df.at[idx, 'claimed_tds'] = to_decimal(settlements_df.at[idx, 'claimed_gross_amount'] * Decimal("0.02"))
    gt_df.loc[tds_idx, 'injected_issue'] = 'TDS_MISMATCH'

    # 5. UNLINKED_DEDUCTION 
    unlinked_idx = settlements_df[gt_df['injected_issue'].isnull()].sample(18).index
    for idx in unlinked_idx:
        fake_id = f"UNKNOWN-{np.random.randint(1000, 9999)}"
        settlements_df.at[idx, 'order_id'] = fake_id
        settlements_df.at[idx, 'claimed_refund_deducted'] = Decimal("500.00")
        gt_df.at[idx, 'order_id'] = fake_id
    gt_df.loc[unlinked_idx, 'injected_issue'] = 'UNLINKED_DEDUCTION'
    
    # 6. NEGATIVE_NET_PAYOUT
    neg_idx = settlements_df[gt_df['injected_issue'].isnull()].sample(2).index
    for idx in neg_idx:
        settlements_df.at[idx, 'claimed_refund_deducted'] = settlements_df.at[idx, 'claimed_gross_amount'] + Decimal("1000.00")
        settlements_df.at[idx, 'claimed_net_amount'] = Decimal("-1000.00")
    gt_df.loc[neg_idx, 'injected_issue'] = 'NEGATIVE_NET_PAYOUT'

    # 7. SPLIT_SETTLEMENT 
    split_idx = settlements_df[gt_df['injected_issue'].isnull()].sample(18).index
    split_orders = []
    for idx in split_idx:
        row = settlements_df.loc[idx].copy()
        half_net = to_decimal(row['claimed_net_amount'] / 2)
        settlements_df.at[idx, 'claimed_net_amount'] = half_net
        row['settlement_id'] = f"{row['settlement_id']}-SPLIT"
        row['claimed_net_amount'] = half_net
        split_orders.append(row)
    if split_orders:
        settlements_df = pd.concat([settlements_df, pd.DataFrame(split_orders)], ignore_index=True)
    gt_df.loc[split_idx, 'injected_issue'] = 'SPLIT_SETTLEMENT'

    # Bank Statements generation per settlement_id batch
    bank_statements = []
    unique_settlements = settlements_df.groupby("settlement_id").agg({
        "settlement_date": "first",
        "claimed_net_amount": "sum"
    }).reset_index()

    for _, s_row in unique_settlements.iterrows():
        s_date = s_row["settlement_date"]
        # T+2 business days
        c_date = add_business_days(s_date, 2)
        
        # Apply delay ONLY to the targeted batch
        if s_row["settlement_id"] == delayed_batch_id:
            c_date = add_business_days(c_date, 3)

        bank_statements.append({
            "settlement_id": s_row["settlement_id"],
            "utr": f"UTR-{np.random.randint(100000, 999999)}",
            "credit_date": c_date,
            "credit_amount": s_row["claimed_net_amount"]
        })
        
    bank_df = pd.DataFrame(bank_statements)

    # DUPLICATE_UTR 
    if len(bank_df) >= 2:
        dup_indices = bank_df.sample(2).index
        bank_df.loc[dup_indices, 'utr'] = "UTR-999999"

    return settlements_df, bank_df, gt_df

def run():
    orders_df = generate_orders()
    settlements_df, bank_df, gt_df = apply_corruptions(orders_df)
    
    os.makedirs("backend/data", exist_ok=True)
    orders_df.to_csv("backend/data/orders.csv", index=False)
    settlements_df.to_csv("backend/data/settlement_report.csv", index=False)
    bank_df.to_csv("backend/data/bank_statement.csv", index=False)
    gt_df.to_csv("backend/data/_ground_truth.csv", index=False)

    print("Data generation complete! Injected ground truth counts:")
    print(gt_df['injected_issue'].value_counts(dropna=False))

if __name__ == "__main__":
    run()