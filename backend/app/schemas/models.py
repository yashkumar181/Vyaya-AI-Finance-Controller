from pydantic import BaseModel
from datetime import date
from typing import Optional
from decimal import Decimal
from enum import Enum

class PaymentInstrument(str, Enum):
    UPI = "UPI"
    CARD = "Card"
    NETBANKING = "NetBanking"
    WALLET = "Wallet"
    INTL_CARD = "International Card"

class InjectedIssue(str, Enum):
    TIMING_DRIFT = "TIMING_DRIFT"
    SPLIT_SETTLEMENT = "SPLIT_SETTLEMENT"
    GST_ROUNDING_DELTA = "GST_ROUNDING_DELTA"
    UNLINKED_DEDUCTION = "UNLINKED_DEDUCTION"
    WRONG_MDR_TIER = "WRONG_MDR_TIER"
    TDS_MISMATCH = "TDS_MISMATCH"
    DUPLICATE_UTR = "DUPLICATE_UTR"
    NEGATIVE_NET_PAYOUT = "NEGATIVE_NET_PAYOUT"

class Order(BaseModel):
    order_id: str
    order_date: date
    customer_id: str
    gross_amount: Decimal
    payment_instrument: PaymentInstrument
    contracted_mdr_rate: Decimal
    refund_amount: Decimal = Decimal("0.0")
    refund_date: Optional[date] = None
    expected_mdr: Decimal
    expected_gst_on_mdr: Decimal
    expected_tds: Decimal
    expected_net_amount: Decimal

class SettlementReport(BaseModel):
    settlement_id: str
    settlement_date: date
    order_id: str
    claimed_gross_amount: Decimal
    claimed_mdr_amount: Decimal
    claimed_gst_on_mdr: Decimal
    claimed_tds: Decimal
    claimed_refund_deducted: Decimal
    claimed_net_amount: Decimal

class BankStatement(BaseModel):
    settlement_id: str
    utr: str
    credit_date: date
    credit_amount: Decimal

class GroundTruth(BaseModel):
    order_id: str
    injected_issue: Optional[InjectedIssue] = None