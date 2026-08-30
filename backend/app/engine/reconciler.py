import pandas as pd
import time
from datetime import timedelta


def load_data(data_dir: str = "backend/data"):
    orders = pd.read_csv(f"{data_dir}/orders.csv")
    settlements = pd.read_csv(f"{data_dir}/settlement_report.csv")
    bank = pd.read_csv(f"{data_dir}/bank_statement.csv")
    return orders, settlements, bank


def add_business_days_pd(start_date, add_days: int) -> pd.Timestamp:
    curr = pd.to_datetime(start_date)
    added = 0
    while added < add_days:
        curr += timedelta(days=1)
        if curr.weekday() < 5:
            added += 1
    return curr


def run_reconciliation(data_dir: str = "backend/data"):
    start_time = time.time()
    orders, settlements, bank = load_data(data_dir)

    order_counts = settlements.groupby("order_id").size().to_dict()

    # FIX: new — detect any UTR that appears on more than one settlement_id.
    # Previously there was no rule for this at all, so DUPLICATE_UTR could
    # never be caught (0.00 precision/recall regardless of the data).
    utr_counts = bank.groupby("utr")["settlement_id"].nunique()
    duplicated_utrs = set(utr_counts[utr_counts > 1].index)
    settlement_ids_with_dup_utr = set(
        bank[bank["utr"].isin(duplicated_utrs)]["settlement_id"]
    )

    settlement_bank = pd.merge(settlements, bank, on="settlement_id", how="left")
    merged = pd.merge(settlement_bank, orders, on="order_id", how="left")

    merged["exception_category"] = "RECONCILED"

    for idx, row in merged.iterrows():
        # R1: Unlinked Deduction
        if pd.isna(row["gross_amount"]) or str(row["order_id"]).startswith("UNKNOWN"):
            merged.at[idx, "exception_category"] = "UNLINKED_DEDUCTION"
            continue

        # R2: Duplicate UTR — checked early, before rules that depend on
        # otherwise-normal-looking fields, since a shared UTR is a bank-side
        # anomaly independent of whether the order's own numbers look fine.
        if row["settlement_id"] in settlement_ids_with_dup_utr:
            merged.at[idx, "exception_category"] = "DUPLICATE_UTR"
            continue

        # R3: Negative Net Payout
        if float(row["claimed_net_amount"]) < 0:
            merged.at[idx, "exception_category"] = "NEGATIVE_NET_PAYOUT"
            continue

        # R4: Split Settlement
        if order_counts.get(row["order_id"], 1) > 1:
            merged.at[idx, "exception_category"] = "SPLIT_SETTLEMENT"
            continue

        # R5: Timing Drift
        if pd.notna(row["settlement_date"]) and pd.notna(row["credit_date"]):
            expected_credit = add_business_days_pd(row["settlement_date"], 2)
            actual_credit = pd.to_datetime(row["credit_date"])
            if (actual_credit - expected_credit).days >= 1:
                merged.at[idx, "exception_category"] = "TIMING_DRIFT"
                continue

        claimed_gst = float(row.get("claimed_gst_on_mdr", 0))
        expected_gst = float(row.get("expected_gst_on_mdr", 0))
        claimed_mdr = float(row.get("claimed_mdr_amount", 0))
        expected_mdr = float(row.get("expected_mdr", 0))
        claimed_tds = float(row.get("claimed_tds", 0))
        expected_tds = float(row.get("expected_tds", 0))

        # R6: GST Rounding Delta
        if 0.005 < abs(claimed_gst - expected_gst) <= 0.10:
            merged.at[idx, "exception_category"] = "GST_ROUNDING_DELTA"
            continue

        # R7: Wrong MDR Tier
        if abs(claimed_mdr - expected_mdr) > 0.10:
            merged.at[idx, "exception_category"] = "WRONG_MDR_TIER"
            continue

        # R8: TDS Mismatch
        if abs(claimed_tds - expected_tds) > 0.05:
            merged.at[idx, "exception_category"] = "TDS_MISMATCH"
            continue

    elapsed = time.time() - start_time
    reconciled = merged[merged["exception_category"] == "RECONCILED"]
    exceptions = merged[merged["exception_category"] != "RECONCILED"]

    print("=" * 50)
    print("RECONCILIATION SUMMARY")
    print(f"Processed: {len(merged)} records in {elapsed:.4f}s")
    print(f"Auto-matched: {len(reconciled)} ({(len(reconciled)/len(merged))*100:.2f}%)")
    print(f"Exceptions: {len(exceptions)}")
    print("-" * 50)
    print(exceptions["exception_category"].value_counts())
    print("=" * 50)

    return merged


if __name__ == "__main__":
    run_reconciliation()