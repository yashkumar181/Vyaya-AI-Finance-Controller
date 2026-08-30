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

# Target counts for each corruption category — kept explicit so the
# demo/eval numbers are predictable instead of emerging from randomness.
TARGET_COUNTS = {
    "GST_ROUNDING_DELTA": 25,
    "WRONG_MDR_TIER": 25,
    "TDS_MISMATCH": 18,
    "UNLINKED_DEDUCTION": 18,
    "NEGATIVE_NET_PAYOUT": 2,
    "SPLIT_SETTLEMENT": 18,
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
            # FIX: capped at 0.6 instead of 1.0 — a near-100% refund combined
            # with MDR+GST+TDS was pushing some "clean" orders' expected_net
            # negative, which silently polluted NEGATIVE_NET_PAYOUT's ground truth.
            refund_amount = to_decimal(float(gross_amount) * np.random.uniform(0.1, 0.6))
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

    df = pd.DataFrame(orders)

    # Safety net: confirm the refund cap actually solved the negative-net problem.
    # If any order is still negative here, it hasn't been touched by any
    # corruption yet (corruptions happen later), so this is a real data bug.
    negative_clean = df[df["expected_net_amount"] < 0]
    if len(negative_clean) > 0:
        print(f"WARNING: {len(negative_clean)} orders have negative expected_net_amount "
              f"before any corruption was applied. Consider lowering the refund cap further.")
        print(negative_clean[["order_id", "gross_amount", "refund_amount", "expected_net_amount"]])

    return df


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

    # `reserved_order_ids` tracks every order_id already claimed by a
    # corruption category, so no order can ever be double-tagged and no
    # category can accidentally mask another's ground truth.
    reserved_order_ids = set()

    # ---- 1. TIMING_DRIFT — delay one whole, moderately-sized batch ----
    batch_counts = settlements_df["settlement_id"].value_counts()
    # FIX: the old 20-35 filter matched zero real batches (actual batches
    # run ~1 to ~240 orders, mean ~61), which silently fell back to
    # `.index[0]` — and since value_counts() sorts descending by default,
    # that picked the LARGEST batch in the dataset, not a moderate one.
    # Sort ascending and pick the smallest batch with at least 15 orders,
    # so the drift is real but doesn't balloon the category's row count.
    ascending = batch_counts.sort_values(ascending=True)
    candidates = ascending[ascending >= 15]
    target_batch = candidates.index[0] if len(candidates) > 0 else ascending.index[0]
    print(f"[TIMING_DRIFT] Selected batch {target_batch} with {batch_counts[target_batch]} orders")

    timing_idx = settlements_df[settlements_df["settlement_id"] == target_batch].index
    timing_order_ids = set(settlements_df.loc[timing_idx, "order_id"])
    gt_df.loc[gt_df["order_id"].isin(timing_order_ids), "injected_issue"] = "TIMING_DRIFT"
    reserved_order_ids |= timing_order_ids
    delayed_batch_id = target_batch

    # ---- 2. DUPLICATE_UTR — two OTHER whole batches share one UTR ----
    # FIX: previously this only mutated bank_statement.csv's utr column with
    # no ground-truth propagation to order_id, and reconciler.py had no rule
    # to catch it — so it was untestable and undetectable (0.00/0.00).
    remaining_batches = ascending.drop(labels=[target_batch], errors="ignore")
    remaining_batches = remaining_batches[remaining_batches >= 5]
    dup_utr_batches = list(remaining_batches.index[:2]) if len(remaining_batches) >= 2 else []
    print(f"[DUPLICATE_UTR] Selected batches {dup_utr_batches}")

    dup_utr_order_ids = set()
    if dup_utr_batches:
        dup_idx = settlements_df[settlements_df["settlement_id"].isin(dup_utr_batches)].index
        dup_utr_order_ids = set(settlements_df.loc[dup_idx, "order_id"])
        gt_df.loc[gt_df["order_id"].isin(dup_utr_order_ids), "injected_issue"] = "DUPLICATE_UTR"
        reserved_order_ids |= dup_utr_order_ids

    def available_pool():
        return settlements_df[
            (~settlements_df["order_id"].isin(reserved_order_ids)) &
            (gt_df.set_index("order_id").loc[settlements_df["order_id"], "injected_issue"].isnull().values)
        ]

    # ---- 3. GST_ROUNDING_DELTA ----
    pool = available_pool()
    gst_idx = pool.sample(TARGET_COUNTS["GST_ROUNDING_DELTA"]).index
    deltas = [to_decimal(np.random.choice([0.02, -0.02, 0.05, -0.05])) for _ in range(len(gst_idx))]
    settlements_df.loc[gst_idx, "claimed_gst_on_mdr"] += deltas
    affected = set(settlements_df.loc[gst_idx, "order_id"])
    gt_df.loc[gt_df["order_id"].isin(affected), "injected_issue"] = "GST_ROUNDING_DELTA"
    reserved_order_ids |= affected

    # ---- 4. WRONG_MDR_TIER ----
    pool = available_pool()
    mdr_idx = pool.sample(TARGET_COUNTS["WRONG_MDR_TIER"]).index
    for idx in mdr_idx:
        settlements_df.at[idx, "claimed_mdr_amount"] = to_decimal(
            settlements_df.at[idx, "claimed_gross_amount"] * Decimal("0.025")
        )
    affected = set(settlements_df.loc[mdr_idx, "order_id"])
    gt_df.loc[gt_df["order_id"].isin(affected), "injected_issue"] = "WRONG_MDR_TIER"
    reserved_order_ids |= affected

    # ---- 5. TDS_MISMATCH ----
    pool = available_pool()
    tds_idx = pool.sample(TARGET_COUNTS["TDS_MISMATCH"]).index
    for idx in tds_idx:
        settlements_df.at[idx, "claimed_tds"] = to_decimal(
            settlements_df.at[idx, "claimed_gross_amount"] * Decimal("0.02")
        )
    affected = set(settlements_df.loc[tds_idx, "order_id"])
    gt_df.loc[gt_df["order_id"].isin(affected), "injected_issue"] = "TDS_MISMATCH"
    reserved_order_ids |= affected

    # ---- 6. UNLINKED_DEDUCTION ----
    pool = available_pool()
    unlinked_idx = pool.sample(TARGET_COUNTS["UNLINKED_DEDUCTION"]).index
    original_ids = set(settlements_df.loc[unlinked_idx, "order_id"])
    for idx in unlinked_idx:
        fake_id = f"UNKNOWN-{np.random.randint(1000, 9999)}"
        real_id = settlements_df.at[idx, "order_id"]
        settlements_df.at[idx, "order_id"] = fake_id
        settlements_df.at[idx, "claimed_refund_deducted"] = Decimal("500.00")
        # Update gt_df for the ORIGINAL order_id (it no longer settles under
        # its real id) and add a fresh row for the fake id so evaluate.py
        # has something to score against.
        gt_df.loc[gt_df["order_id"] == real_id, "injected_issue"] = "UNLINKED_DEDUCTION"
        gt_df.loc[gt_df["order_id"] == real_id, "order_id"] = fake_id
    reserved_order_ids |= original_ids

    # ---- 7. NEGATIVE_NET_PAYOUT ----
    pool = available_pool()
    neg_idx = pool.sample(TARGET_COUNTS["NEGATIVE_NET_PAYOUT"]).index
    for idx in neg_idx:
        settlements_df.at[idx, "claimed_refund_deducted"] = (
            settlements_df.at[idx, "claimed_gross_amount"] + Decimal("1000.00")
        )
        settlements_df.at[idx, "claimed_net_amount"] = Decimal("-1000.00")
    affected = set(settlements_df.loc[neg_idx, "order_id"])
    gt_df.loc[gt_df["order_id"].isin(affected), "injected_issue"] = "NEGATIVE_NET_PAYOUT"
    reserved_order_ids |= affected

    # ---- 8. SPLIT_SETTLEMENT ----
    # FIX: this now draws only from the same exclusive pool as everything
    # else, so it can never overlap with a DUPLICATE_UTR batch or any other
    # category's rows (this was the suspected cause of the 0.89 precision).
    pool = available_pool()
    split_idx = pool.sample(TARGET_COUNTS["SPLIT_SETTLEMENT"]).index
    split_orders = []
    for idx in split_idx:
        row = settlements_df.loc[idx].copy()
        half_net = to_decimal(row["claimed_net_amount"] / 2)
        settlements_df.at[idx, "claimed_net_amount"] = half_net
        row["settlement_id"] = f"{row['settlement_id']}-SPLIT"
        row["claimed_net_amount"] = half_net
        split_orders.append(row)
    if split_orders:
        settlements_df = pd.concat([settlements_df, pd.DataFrame(split_orders)], ignore_index=True)
    affected = set(settlements_df.loc[split_idx, "order_id"])
    gt_df.loc[gt_df["order_id"].isin(affected), "injected_issue"] = "SPLIT_SETTLEMENT"
    reserved_order_ids |= affected

    # ---- Bank statement generation, one row per settlement batch ----
    bank_statements = []
    unique_settlements = settlements_df.groupby("settlement_id").agg({
        "settlement_date": "first",
        "claimed_net_amount": "sum"
    }).reset_index()

    utr_by_settlement = {}
    for _, s_row in unique_settlements.iterrows():
        s_date = s_row["settlement_date"]
        c_date = add_business_days(s_date, 2)

        if s_row["settlement_id"] == delayed_batch_id:
            c_date = add_business_days(c_date, 3)

        utr = f"UTR-{np.random.randint(100000, 999999)}"
        utr_by_settlement[s_row["settlement_id"]] = utr

        bank_statements.append({
            "settlement_id": s_row["settlement_id"],
            "utr": utr,
            "credit_date": c_date,
            "credit_amount": s_row["claimed_net_amount"]
        })

    bank_df = pd.DataFrame(bank_statements)

    # Force the two DUPLICATE_UTR batches to genuinely share one UTR value.
    # This ONLY touches bank_statement.csv — it never duplicates or adds
    # rows in settlement_report.csv, which was the suspected cause of
    # SPLIT_SETTLEMENT's false positives.
    if len(dup_utr_batches) == 2:
        shared_utr = f"UTR-{np.random.randint(100000, 999999)}"
        bank_df.loc[bank_df["settlement_id"].isin(dup_utr_batches), "utr"] = shared_utr
        print(f"[DUPLICATE_UTR] Batches {dup_utr_batches} now share UTR {shared_utr}")

    return settlements_df, bank_df, gt_df


def run():
    orders_df = generate_orders()
    settlements_df, bank_df, gt_df = apply_corruptions(orders_df)

    # Sanity check: no order_id should ever carry more than one injected
    # issue label — if this fires, two categories collided somewhere.
    dupes = gt_df[gt_df["order_id"].duplicated(keep=False)]
    if len(dupes) > 0:
        print("WARNING: some order_ids appear more than once in ground truth:")
        print(dupes.sort_values("order_id"))

    os.makedirs("backend/data", exist_ok=True)
    orders_df.to_csv("backend/data/orders.csv", index=False)
    settlements_df.to_csv("backend/data/settlement_report.csv", index=False)
    bank_df.to_csv("backend/data/bank_statement.csv", index=False)
    gt_df.to_csv("backend/data/_ground_truth.csv", index=False)

    print("\nData generation complete! Injected ground truth counts:")
    print(gt_df["injected_issue"].value_counts(dropna=False))


if __name__ == "__main__":
    run()