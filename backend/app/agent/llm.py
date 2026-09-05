import os
import json
import logging
import time
from collections import defaultdict
from groq import Groq
from sqlalchemy import text
from dotenv import load_dotenv

from app.db.session import engine

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

logger = logging.getLogger("vyaya.agent")
logging.basicConfig(level=logging.INFO)

MODEL = "openai/gpt-oss-120b"

CATEGORY_DEFINITIONS = {
    "DUPLICATE_UTR": "Two separate, legitimate settlement batches were recorded against the same bank UTR reference number — a reference-number collision, NOT necessarily a duplicate payment. Do not assume money was received twice unless explicitly shown by two distinct credit amounts for the same order.",
    "TIMING_DRIFT": "The settlement was credited to the bank account later than the expected T+2 business days. Amounts match exactly; only the credit date is delayed. There is NO monetary discrepancy — do not propose any revenue, bank, or suspense entry for this category.",
    "SPLIT_SETTLEMENT": "A single order's payout was divided across multiple settlement batches (e.g., crossing a settlement cutoff). Each individual settlement row shows a fraction of the order's total — this is NOT a discrepancy by itself. Only a genuine shortfall exists if the SUM across all of the order's settlement rows does not match its expected net amount.",
    "GST_ROUNDING_DELTA": "The claimed GST on the MDR differs slightly (<= Rs 0.10) from the expected calculated GST due to platform-side rounding.",
    "WRONG_MDR_TIER": "The payment gateway applied an incorrect Merchant Discount Rate (MDR) percentage compared to the contracted rate. The correction amount is the DIFFERENCE between what was charged and what should have been charged — not the order's full net amount.",
    "TDS_MISMATCH": "The Tax Deducted at Source (TDS) withheld does not match the expected 1% statutory rate under Section 194-O. The correction amount is the DIFFERENCE between claimed and expected TDS — not the order's full net amount.",
    "UNLINKED_DEDUCTION": "A deduction was applied, but the provided order_id is unknown or cannot be linked to a gross transaction.",
    "NEGATIVE_NET_PAYOUT": "Total deductions (refunds, MDR, GST, TDS) exceed the gross amount, resulting in a negative net settlement. The correction amount is the SHORTFALL between what the merchant should have received (expected_net_amount) and what was actually claimed (claimed_net_amount) — this is always a positive figure representing money owed back to the merchant."
}

FIELD_LABELS = {
    "mdr": "MDR",
    "gst_on_mdr": "GST on MDR",
    "tds": "TDS",
    "net_amount": "Net Amount",
    "claimed_mdr_amount": "Claimed MDR",
    "expected_mdr": "Expected MDR",
    "claimed_gst_on_mdr": "Claimed GST on MDR",
    "expected_gst_on_mdr": "Expected GST on MDR",
    "claimed_tds": "Claimed TDS",
    "expected_tds": "Expected TDS",
    "claimed_net_amount": "Claimed Net Amount",
    "expected_net_amount": "Expected Net Amount",
}

DISCLAIMER = "Draft — requires human approval before posting to ERP."

_SHARED_GUARDRAILS = """1. NEVER calculate, estimate, or invent a number. Every figure in your answer must come from a tool result you actually retrieved in this conversation. If you don't have the data, call a tool to get it — don't guess.
2. ALWAYS explicitly cite the order_id, settlement_id, and exception category backing any claim you make.
3. If you don't have enough information after calling the available tools, say so plainly instead of filling the gap with a plausible-sounding guess.
4. NARRATION HEDGING: For the DUPLICATE_UTR category, never declare it an outright duplicate payment in the narration. Force the narration to use hedged language, such as: "Reversal for possible duplicate/reference collision, pending manual verification."
5. TOOL RESTRICTION: Only call `generate_journal_entry` when the user explicitly asks for a fix, correction, or journal entry to be drafted. Do NOT call it automatically if they just ask why an order is flagged. Do not expose the internal tool names to the user in your responses to them.
6. JOURNAL PRESENTATION: When returning a generated journal entry to the user, present the key fields (debit account, credit account, amount, and narration) clearly in a markdown table or structured list, and ALWAYS append the required human approval disclaimer.
8. EXCEPTION PRESENTATION: When explaining why an order is flagged or providing its details, ALWAYS start your response with a Markdown table summarizing the key data points retrieved from the database. Use human-readable labels (MDR, GST on MDR, TDS, Net Amount) instead of raw field names like "gst_on_mdr".
9. LANGUAGE & TONE: Respond in the same language the user writes their message in — English, Hindi, Hinglish, or any other language. Always explain financial and technical terms in plain, simple, everyday language, avoiding unnecessary jargon, unless the user's own question uses technical terminology first — in that case you may match their level.
10. SPLIT_SETTLEMENT — CRITICAL, READ CAREFULLY: For this category specifically, `query_exceptions` may return MULTIPLE rows for the same order_id, one per settlement batch. Before stating whether there is a real discrepancy, you MUST sum the `claimed_net_amount` field across ALL returned rows for that order_id, then compare that SUM to `expected_net_amount` (which is identical across all rows for the same order). If the summed total matches expected_net_amount within about ₹0.10, the order settled correctly across multiple batches and there is NO discrepancy — state this plainly and do NOT describe it as money being "missing", "only half credited", or similar language implying a shortfall. Only describe a real shortfall if the SUMMED total genuinely falls short of expected_net_amount.
11. NEVER reference or quote the credit_amount field in any explanation to the user — it is the aggregate bank credit for the ENTIRE settlement batch, which may cover many unrelated orders, not this specific order's amount. Only use claimed_net_amount, expected_net_amount, claimed_mdr_amount, and other order-specific fields when describing a single order's figures."""

CHAT_SYSTEM_PROMPT = f"""You are Vyaya, an AI Finance Controller for Razorpay merchants.

ARCHITECTURAL GUARDRAILS (never violate these):
{_SHARED_GUARDRAILS}
7. DRAFTING A JOURNAL ENTRY: To draft a journal entry for an order, simply call `generate_journal_entry` with just the order_id. You do NOT need to know or supply the correction amount yourself — it is computed automatically inside the tool from the exception's underlying data. NEVER ask the user to provide "the required correction amount" — that information is not something the user has or needs to give you; just call the tool.

CONVERSATION CONTEXT: You may be shown earlier turns from this same conversation above the current message. Use that context naturally — e.g. if the user previously asked about a specific order and then says "now draft a fix for it", use the order_id from the earlier turn without asking them to repeat it.
"""

JOURNAL_DRAFT_SYSTEM_PROMPT = f"""You are Vyaya, an AI Finance Controller for Razorpay merchants.

ARCHITECTURAL GUARDRAILS (never violate these):
{_SHARED_GUARDRAILS}
7. AMOUNT SELECTION: When drafting a journal entry, you will be given an exact "REQUIRED CORRECTION AMOUNT" in the prompt. You MUST use that exact figure as the `amount` field — it has already been computed correctly in code. Do NOT substitute `credit_amount` (a settlement batch's aggregate total, never a single order's amount), `net_amount`, or any other field from the raw data. The required amount always wins over any number you see elsewhere in the record. If the required amount is 0.00, this means there is NO monetary discrepancy — state that clearly instead of inventing a correcting entry.

ACCOUNTING DIRECTION RULES (apply carefully — this is a common mistake):
- A normal incoming receipt: DEBIT the Bank Account, CREDIT Revenue. Money increases in the bank.
- A REVERSAL of an erroneous or duplicate credit (money that shouldn't have landed, or landed twice): CREDIT the Bank Account (this removes the erroneous amount), DEBIT a Suspense/Clearing Account (this holds the amount pending resolution). This is the OPPOSITE direction from a normal receipt.
- A CORRECTION of a fee overcharge or shortfall owed back to the merchant (e.g. WRONG_MDR_TIER, TDS_MISMATCH, GST_ROUNDING_DELTA, NEGATIVE_NET_PAYOUT where the merchant received less than expected): DEBIT the Bank Account (money owed back to the merchant), CREDIT a Suspense/Clearing Account pending resolution.
- If the required amount is 0.00 (e.g. TIMING_DRIFT, or a SPLIT_SETTLEMENT that sums correctly), do NOT apply any direction rule — there is nothing to book. State plainly that no financial correction is needed.
- Example: reversing an erroneous credit of Rs 5,000 → Credit Bank Account Rs 5,000; Debit Suspense/Clearing Account Rs 5,000.
- Example: recording a normal sale receipt of Rs 5,000 → Debit Bank Account Rs 5,000; Credit Revenue Rs 5,000.
- Example: correcting a Rs 145 MDR overcharge owed back to the merchant → Debit Bank Account Rs 145; Credit Suspense/Clearing Account Rs 145.
- Before finalizing a journal entry, check: does this entry match whether money should be REMOVED (reversal), ADDED (correction owed to merchant), or NOTHING (zero-amount, timing-only or correctly-split issue)? Get this right before answering.
"""

# ---------------------------------------------------------------------
# Real tool implementations — these actually query the database.
# ---------------------------------------------------------------------

def _query_ledger_impl(order_id: str = None, settlement_id: str = None) -> list:
    conditions = []
    params = {}
    if order_id:
        conditions.append("order_id = :order_id")
        params["order_id"] = order_id
    if settlement_id:
        conditions.append("settlement_id = :settlement_id")
        params["settlement_id"] = settlement_id

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = text(f"SELECT * FROM ledger {where_clause} LIMIT 20")

    with engine.connect() as conn:
        df = pd_read_sql_safe(query, conn, params)
    return df.to_dict(orient="records")


def _query_exceptions_impl(category: str = None, order_id: str = None, settlement_id: str = None) -> list:
    conditions = []
    params = {}
    if category:
        conditions.append("exception_category = :category")
        params["category"] = category
    if order_id:
        conditions.append("order_id = :order_id")
        params["order_id"] = order_id
    if settlement_id:
        conditions.append("settlement_id = :settlement_id")
        params["settlement_id"] = settlement_id

    where_clause = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    query = text(f"SELECT * FROM exceptions {where_clause} LIMIT 20")

    with engine.connect() as conn:
        df = pd_read_sql_safe(query, conn, params)
    return df.to_dict(orient="records")


def pd_read_sql_safe(query, conn, params):
    import pandas as pd
    return pd.read_sql(query, conn, params=params)


def _f(record: dict, key: str) -> float:
    v = record.get(key)
    try:
        return float(v) if v is not None else 0.0
    except (TypeError, ValueError):
        return 0.0


def _generate_journal_entry_impl(order_id: str) -> dict:
    records = _query_exceptions_impl(order_id=order_id)
    if not records:
        return {"error": "No exception found for this order_id"}

    category = records[0].get("exception_category")

    if category == "SPLIT_SETTLEMENT" and len(records) > 1:
        return _draft_split_settlement_entry(order_id, records)

    exception_record = records[0]
    return draft_journal_entry(exception_record)


def _draft_split_settlement_entry(order_id: str, records: list) -> dict:
    settlement_ids = [r.get("settlement_id") for r in records]
    total_claimed = round(sum(_f(r, "claimed_net_amount") for r in records), 2)
    expected = _f(records[0], "expected_net_amount")
    delta = round(abs(expected - total_claimed), 2)

    if delta <= 0.10:
        return {
            "root_cause_analysis": (
                f"Order {order_id} was settled across {len(records)} separate batches "
                f"({', '.join(settlement_ids)}). This is expected split-settlement behavior, "
                f"not a discrepancy."
            ),
            "account_debit": "N/A",
            "account_credit": "N/A",
            "amount": 0.00,
            "narration": (
                f"Order {order_id} settled correctly across {len(records)} batches "
                f"({', '.join(settlement_ids)}). Total claimed ({total_claimed}) matches "
                f"expected net amount ({expected}). No journal entry required."
            ),
            "status": DISCLAIMER,
        }

    return {
        "root_cause_analysis": (
            f"Order {order_id} was split across {len(records)} batches "
            f"({', '.join(settlement_ids)}), but the combined claimed total "
            f"({total_claimed}) does not match the expected net amount ({expected})."
        ),
        "account_debit": "Bank Account",
        "account_credit": "Suspense/Clearing Account",
        "amount": delta,
        "narration": (
            f"Shortfall of {delta} across split settlement for order {order_id} "
            f"({', '.join(settlement_ids)}). Expected {expected}, claimed total {total_claimed}."
        ),
        "status": DISCLAIMER,
    }


TOOL_FUNCTIONS = {
    "query_ledger": _query_ledger_impl,
    "query_exceptions": _query_exceptions_impl,
    "generate_journal_entry": _generate_journal_entry_impl
}

CHAT_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_ledger",
            "description": "Query the reconciled ledger table. Use this to look up a specific order or settlement's reconciled details.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "Optional order ID to filter by, e.g. ORD-10004"},
                    "settlement_id": {"type": "string", "description": "Optional settlement ID to filter by, e.g. SET-20260119"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_exceptions",
            "description": "Query the exception queue. Use this to look up flagged discrepancies, optionally filtered by category, order, or settlement. NOTE: for SPLIT_SETTLEMENT orders this can return multiple rows for the same order_id — see guardrail 10.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {
                        "type": ["string", "null"],
                        "description": "Optional exception category, e.g. TIMING_DRIFT, DUPLICATE_UTR, WRONG_MDR_TIER. Leave null if not specified."
                    },
                    "order_id": {
                        "type": ["string", "null"],
                        "description": "Optional order ID to filter by. Leave null if asking for general exceptions."
                    },
                    "settlement_id": {
                        "type": ["string", "null"],
                        "description": "Optional settlement ID to filter by. Leave null if not specified."
                    }
                },
                "required": []
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_journal_entry",
            "description": "Generates a structured, correcting ERP journal entry for a specific exception. Only call this when the user explicitly asks for a fix, correction, or journal entry to be drafted — not just when they ask why something is flagged. Only requires order_id; the correction amount is computed automatically.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string", "description": "The order ID of the exception to generate a journal entry for"}
                },
                "required": ["order_id"]
            }
        }
    }
]

JOURNAL_ENTRY_TOOL = [
    {
        "type": "function",
        "function": {
            "name": "generate_journal_entry",
            "description": "Generates a structured ERP journal entry to correct the exception. The exact amount will be provided to you in the prompt and MUST be used exactly as given.",
            "parameters": {
                "type": "object",
                "properties": {
                    "root_cause_analysis": {"type": "string", "description": "1-2 sentence explanation of what went wrong, using the category's actual structural meaning, not an assumption."},
                    "account_debit": {"type": "string"},
                    "account_credit": {"type": "string"},
                    "amount": {"type": "number"},
                    "narration": {"type": "string", "description": "ERP narration citing order_id, settlement_id, and category."}
                },
                "required": ["root_cause_analysis", "account_debit", "account_credit", "amount", "narration"]
            }
        }
    }
]

# ---------------------------------------------------------------------
# Deterministic correction-amount calculation — NEVER left to the LLM.
# ---------------------------------------------------------------------

def compute_correction_amount(exception_record: dict) -> float:
    category = exception_record.get("exception_category")

    if category == "WRONG_MDR_TIER":
        return round(abs(_f(exception_record, "claimed_mdr_amount") - _f(exception_record, "expected_mdr")), 2)

    if category == "GST_ROUNDING_DELTA":
        return round(abs(_f(exception_record, "claimed_gst_on_mdr") - _f(exception_record, "expected_gst_on_mdr")), 2)

    if category == "TDS_MISMATCH":
        return round(abs(_f(exception_record, "claimed_tds") - _f(exception_record, "expected_tds")), 2)

    if category == "NEGATIVE_NET_PAYOUT":
        return round(abs(_f(exception_record, "expected_net_amount") - _f(exception_record, "claimed_net_amount")), 2)

    if category in ("DUPLICATE_UTR", "UNLINKED_DEDUCTION"):
        claimed = _f(exception_record, "claimed_net_amount")
        return round(abs(claimed if claimed else _f(exception_record, "expected_net_amount")), 2)

    if category == "TIMING_DRIFT":
        return 0.00

    if category == "SPLIT_SETTLEMENT":
        claimed = _f(exception_record, "claimed_net_amount")
        return round(abs(claimed if claimed else _f(exception_record, "expected_net_amount")), 2)

    claimed = _f(exception_record, "claimed_net_amount")
    return round(abs(claimed if claimed else _f(exception_record, "expected_net_amount")), 2)


# ---------------------------------------------------------------------
# Groq call wrapper — adds timing logs and converts a 429 / rate-limit
# style error into a clean, catchable message instead of an unhandled
# exception bubbling up as a raw 500 / generic timeout to the frontend.
# ---------------------------------------------------------------------

class AgentUnavailableError(Exception):
    """Raised when the underlying model call fails in a way the user
    should see a clean message for (rate limit, timeout, etc.)."""
    pass


def _call_groq(**kwargs):
    start = time.monotonic()
    try:
        response = client.chat.completions.create(**kwargs)
        elapsed = time.monotonic() - start
        logger.info(f"[groq] call completed in {elapsed:.2f}s, model={kwargs.get('model')}")
        return response
    except Exception as e:
        elapsed = time.monotonic() - start
        status_code = getattr(e, "status_code", None)
        logger.error(f"[groq] call FAILED after {elapsed:.2f}s, status_code={status_code}, error={e}")

        if status_code == 429:
            raise AgentUnavailableError(
                "The assistant is receiving too many requests right now — please wait a moment and try again."
            ) from e
        if status_code in (500, 502, 503, 504):
            raise AgentUnavailableError(
                "The assistant service is temporarily unavailable — please try again in a moment."
            ) from e
        raise AgentUnavailableError(
            "Something went wrong while processing that request — please try again."
        ) from e


# ---------------------------------------------------------------------
# Journal entry drafting (single forced tool call, grounded in the
# exception_record already fetched by the API layer)
# ---------------------------------------------------------------------

def draft_journal_entry(exception_record: dict) -> dict:
    category = exception_record.get("exception_category")
    definition = CATEGORY_DEFINITIONS.get(category, "Unknown category.")

    required_amount = compute_correction_amount(exception_record)
    is_zero_amount = required_amount == 0.00

    prompt = (
        f"Analyze this reconciliation exception and draft the correcting journal entry.\n\n"
        f"Exception data: {exception_record}\n\n"
        f"Category '{category}' means: {definition}\n\n"
        f"REQUIRED CORRECTION AMOUNT: {required_amount}\n"
        + (
            "This is ZERO — there is NO monetary discrepancy for this exception. "
            "Do not propose a bank/revenue/suspense entry. Set account_debit and account_credit "
            "to \"N/A\", set amount to 0.00, and write a root_cause_analysis and narration explaining "
            "this is a timing-only issue with no financial impact.\n\n"
            if is_zero_amount else
            "You MUST use exactly this figure as the `amount` field in your response. "
            "This has already been computed correctly (it is the specific delta/amount relevant "
            "to this exception category, not a settlement batch total or an unrelated field). "
            "Do not substitute any other number you see in the exception data.\n\n"
        )
        + f"Base your root cause analysis strictly on this definition and the provided data. "
        f"Apply the accounting direction rules from your system prompt carefully before choosing "
        f"debit_account and credit_account."
    )

    response = _call_groq(
        model=MODEL,
        messages=[
            {"role": "system", "content": JOURNAL_DRAFT_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        tools=JOURNAL_ENTRY_TOOL,
        tool_choice={"type": "function", "function": {"name": "generate_journal_entry"}},
        temperature=0.1
    )

    tool_call = response.choices[0].message.tool_calls[0]
    result = json.loads(tool_call.function.arguments)

    model_amount = float(result.get("amount") or 0)
    if abs(model_amount - required_amount) > 0.5:
        logger.warning(
            f"Model drafted amount {model_amount} for {exception_record.get('order_id')} "
            f"({category}) but required amount was {required_amount}. Overriding."
        )
    result["amount"] = required_amount

    if is_zero_amount:
        result["account_debit"] = "N/A"
        result["account_credit"] = "N/A"
        if not result.get("narration") or "no financial" not in result.get("narration", "").lower():
            result["narration"] = (
                f"No financial correction required for order {exception_record.get('order_id')} "
                f"in settlement {exception_record.get('settlement_id')} (category: {category}). "
                f"Expected and claimed amounts match exactly — this is a timing/date discrepancy only."
            )

    result["status"] = DISCLAIMER
    return result


# ---------------------------------------------------------------------
# Conversation memory — simple in-process store keyed by conversation_id.
# ---------------------------------------------------------------------

_conversation_store: dict = defaultdict(list)
MAX_HISTORY_TURNS = 12


def get_conversation_history(conversation_id: str) -> list:
    return list(_conversation_store.get(conversation_id, []))


def clear_conversation_history(conversation_id: str) -> None:
    _conversation_store.pop(conversation_id, None)


# ---------------------------------------------------------------------
# Open-ended chat — grounded via a real tool-call loop, now with
# conversation memory, per-round timing logs, and clean error handling
# so a slow/failed Groq call never surfaces as a raw crash.
# ---------------------------------------------------------------------

def handle_chat(message: str, conversation_id: str = "default", max_rounds: int = 3) -> str:
    request_start = time.monotonic()
    history = _conversation_store[conversation_id]

    messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}] + history + [
        {"role": "user", "content": message}
    ]

    final_reply = "I wasn't able to fully resolve this question with the available data — please try rephrasing or ask about a specific order/settlement ID."

    try:
        for round_num in range(max_rounds):
            round_start = time.monotonic()
            response = _call_groq(
                model=MODEL,
                messages=messages,
                tools=CHAT_TOOLS,
                temperature=0.2
            )

            choice = response.choices[0].message

            if not choice.tool_calls:
                final_reply = choice.content
                logger.info(
                    f"[chat] conversation={conversation_id} round={round_num} "
                    f"-> final reply, round_time={time.monotonic()-round_start:.2f}s, "
                    f"total_time={time.monotonic()-request_start:.2f}s"
                )
                break

            tool_names = [tc.function.name for tc in choice.tool_calls]
            logger.info(
                f"[chat] conversation={conversation_id} round={round_num} "
                f"tool_calls={tool_names}, round_time={time.monotonic()-round_start:.2f}s"
            )

            messages.append({
                "role": "assistant",
                "content": choice.content or "",
                "tool_calls": [
                    {
                        "id": tc.id,
                        "type": "function",
                        "function": {"name": tc.function.name, "arguments": tc.function.arguments}
                    }
                    for tc in choice.tool_calls
                ]
            })

            for tc in choice.tool_calls:
                fn_name = tc.function.name
                fn_args = json.loads(tc.function.arguments or "{}")
                fn = TOOL_FUNCTIONS.get(fn_name)

                tool_start = time.monotonic()
                if fn is None:
                    tool_result = {"error": f"Unknown tool: {fn_name}"}
                else:
                    try:
                        tool_result = fn(**fn_args)
                    except Exception as e:
                        tool_result = {"error": str(e)}
                logger.info(f"[chat] tool={fn_name} took {time.monotonic()-tool_start:.2f}s")

                messages.append({
                    "role": "tool",
                    "tool_call_id": tc.id,
                    "name": fn_name,
                    "content": json.dumps(tool_result, default=str)
                })
        else:
            logger.warning(
                f"[chat] conversation={conversation_id} hit max_rounds={max_rounds} "
                f"without a final answer, total_time={time.monotonic()-request_start:.2f}s"
            )

    except AgentUnavailableError as e:
        # Clean, user-facing message — no crash, no raw timeout.
        final_reply = str(e)
        logger.error(
            f"[chat] conversation={conversation_id} AgentUnavailableError after "
            f"{time.monotonic()-request_start:.2f}s: {e}"
        )

    history.append({"role": "user", "content": message})
    history.append({"role": "assistant", "content": final_reply})

    max_messages = MAX_HISTORY_TURNS * 2
    if len(history) > max_messages:
        del history[: len(history) - max_messages]

    _conversation_store[conversation_id] = history

    logger.info(f"[chat] conversation={conversation_id} TOTAL request_time={time.monotonic()-request_start:.2f}s")

    return final_reply
    