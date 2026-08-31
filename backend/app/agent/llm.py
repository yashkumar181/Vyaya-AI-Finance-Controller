import os
import json
from groq import Groq
from sqlalchemy import text
from dotenv import load_dotenv

from app.db.session import engine

load_dotenv()
client = Groq(api_key=os.getenv("GROQ_API_KEY"))

MODEL = "openai/gpt-oss-120b"

CATEGORY_DEFINITIONS = {
    "DUPLICATE_UTR": "Two separate, legitimate settlement batches were recorded against the same bank UTR reference number — a reference-number collision, NOT necessarily a duplicate payment. Do not assume money was received twice unless explicitly shown by two distinct credit amounts for the same order.",
    "TIMING_DRIFT": "The settlement was credited to the bank account later than the expected T+2 business days. Amounts match; only the date is delayed.",
    "SPLIT_SETTLEMENT": "A single order was settled across multiple separate settlement entries (e.g., partial payments across batches).",
    "GST_ROUNDING_DELTA": "The claimed GST on the MDR differs slightly (<= Rs 0.10) from the expected calculated GST due to platform-side rounding.",
    "WRONG_MDR_TIER": "The payment gateway applied an incorrect Merchant Discount Rate (MDR) percentage compared to the contracted rate.",
    "TDS_MISMATCH": "The Tax Deducted at Source (TDS) withheld does not match the expected 1% statutory rate under Section 194-O.",
    "UNLINKED_DEDUCTION": "A deduction was applied, but the provided order_id is unknown or cannot be linked to a gross transaction.",
    "NEGATIVE_NET_PAYOUT": "Total deductions (refunds, MDR, GST, TDS) exceed the gross amount, resulting in a negative net settlement."
}

DISCLAIMER = "Draft — requires human approval before posting to ERP."

SYSTEM_PROMPT = """You are Vyaya, an AI Finance Controller for Razorpay merchants.

ARCHITECTURAL GUARDRAILS (never violate these):
1. NEVER calculate, estimate, or invent a number. Every figure in your answer must come from a tool result you actually retrieved in this conversation. If you don't have the data, call a tool to get it — don't guess.
2. ALWAYS explicitly cite the order_id, settlement_id, and exception category backing any claim you make.
3. If you don't have enough information after calling the available tools, say so plainly instead of filling the gap with a plausible-sounding guess.
4. NARRATION HEDGING: For the DUPLICATE_UTR category, never declare it an outright duplicate payment in the narration. Force the narration to use hedged language, such as: "Reversal for possible duplicate/reference collision, pending manual verification."
5. TOOL RESTRICTION: Only call `generate_journal_entry` when the user explicitly asks for a fix, correction, or journal entry to be drafted. Do NOT call it automatically if they just ask why an order is flagged.
6. JOURNAL PRESENTATION: When returning a generated journal entry to the user, present the key fields (debit account, credit account, amount, and narration) clearly in a markdown table or structured list, and ALWAYS append the required human approval disclaimer.
7. AMOUNT SELECTION: `credit_amount` in the data represents the aggregate total for an entire settlement batch. DO NOT use `credit_amount` for an individual order's journal entry. Always use `claimed_net_amount` or `expected_net_amount`, which represent the specific order's individual value.
8. EXCEPTION PRESENTATION: When explaining why an order is flagged or providing its details, ALWAYS start your response with a Markdown table summarizing the key data points retrieved from the database (e.g., Order ID, Settlement ID, Exception Category, UTR, Expected Net Amount, etc.) before writing your prose explanation.

ACCOUNTING DIRECTION RULES (apply carefully — this is a common mistake):
- A normal incoming receipt: DEBIT the Bank Account, CREDIT Revenue. Money increases in the bank.
- A REVERSAL of an erroneous or duplicate credit (money that shouldn't have landed, or landed twice): CREDIT the Bank Account (this removes the erroneous amount), DEBIT a Suspense/Clearing Account (this holds the amount pending resolution). This is the OPPOSITE direction from a normal receipt.
- Example: reversing an erroneous credit of Rs 5,000 → Credit Bank Account Rs 5,000; Debit Suspense/Clearing Account Rs 5,000.
- Example: recording a normal sale receipt of Rs 5,000 → Debit Bank Account Rs 5,000; Credit Revenue Rs 5,000.
- Before finalizing a journal entry, check: does this entry match whether money should be REMOVED (reversal) or ADDED (normal receipt/adjustment owed to merchant)? Get the direction right before answering.
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


# Maps tool name -> actual Python callable, used by the chat tool-call loop
TOOL_FUNCTIONS = {
    "query_ledger": _query_ledger_impl,
    "query_exceptions": _query_exceptions_impl,
}
def _generate_journal_entry_impl(order_id: str) -> dict:
    records = _query_exceptions_impl(order_id=order_id)
    if not records:
        return {"error": "No exception found for this order_id"}
    
    exception_record = records[0]
    return draft_journal_entry(exception_record)

# Maps tool name -> actual Python callable, used by the chat tool-call loop
TOOL_FUNCTIONS = {
    "query_ledger": _query_ledger_impl,
    "query_exceptions": _query_exceptions_impl,
    "generate_journal_entry": _generate_journal_entry_impl
}

# ---------------------------------------------------------------------
# Tool schemas sent to Groq
# ---------------------------------------------------------------------

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
            "description": "Query the exception queue. Use this to look up flagged discrepancies, optionally filtered by category, order, or settlement.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "Optional exception category, e.g. TIMING_DRIFT, DUPLICATE_UTR, WRONG_MDR_TIER"},
                    "order_id": {"type": "string", "description": "Optional order ID to filter by"},
                    "settlement_id": {"type": "string", "description": "Optional settlement ID to filter by"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_journal_entry",
            "description": "Generates a structured, correcting ERP journal entry for a specific exception. Only call this when the user explicitly asks for a fix, correction, or journal entry to be drafted — not just when they ask why something is flagged.",
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
            "description": "Generates a structured ERP journal entry to correct the exception. Follow the accounting direction rules in the system prompt exactly.",
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
# Journal entry drafting (single forced tool call, grounded in the
# exception_record already fetched by the API layer)
# ---------------------------------------------------------------------

import logging

def draft_journal_entry(exception_record: dict) -> dict:
    category = exception_record.get("exception_category")
    definition = CATEGORY_DEFINITIONS.get(category, "Unknown category.")

    prompt = (
        f"Analyze this reconciliation exception and draft the correcting journal entry.\n\n"
        f"Exception data: {exception_record}\n\n"
        f"Category '{category}' means: {definition}\n\n"
        f"IMPORTANT: `credit_amount` in this record is the TOTAL for the entire settlement batch. "
        f"Do NOT use it as this order's amount. Use `claimed_net_amount` or `expected_net_amount` instead.\n\n"
        f"Base your root cause analysis strictly on this definition and the provided data. "
        f"Apply the accounting direction rules from your system prompt carefully before choosing "
        f"debit_account and credit_account."
    )

    response = client.chat.completions.create(
        model=MODEL,
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ],
        tools=JOURNAL_ENTRY_TOOL,
        tool_choice={"type": "function", "function": {"name": "generate_journal_entry"}},
        temperature=0.1
    )

    tool_call = response.choices[0].message.tool_calls[0]
    result = json.loads(tool_call.function.arguments)
    
    # Programmatic Sanity Check: Ensure the LLM didn't grab the batch total
    expected_amt = float(exception_record.get("expected_net_amount") or 0)
    claimed_amt = float(exception_record.get("claimed_net_amount") or 0)
    drafted_amt = float(result.get("amount") or 0)
    
    # Allow a small tolerance for rounding discrepancies
    if abs(drafted_amt - expected_amt) > 1.0 and abs(drafted_amt - claimed_amt) > 1.0:
        logging.warning(f"Sanity Check Failed for {exception_record.get('order_id')}: LLM drafted {drafted_amt} vs Expected {expected_amt}")
        result["warning"] = f"CRITICAL: Drafted amount (₹{drafted_amt}) deviates significantly from the order's expected/claimed net amount. Verify batch vs. order totals."

    # Guarantee the disclaimer is present
    result["status"] = DISCLAIMER
    return result

# ---------------------------------------------------------------------
# Open-ended chat — now actually grounded via a real tool-call loop
# ---------------------------------------------------------------------

def handle_chat(message: str, max_rounds: int = 3) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": message}
    ]

    for _ in range(max_rounds):
        response = client.chat.completions.create(
            model=MODEL,
            messages=messages,
            tools=CHAT_TOOLS,
            temperature=0.2
        )

        choice = response.choices[0].message

        # No tool calls -> the model has a final grounded answer
        if not choice.tool_calls:
            return choice.content

        # Model wants to call one or more tools — execute them for real
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

            if fn is None:
                tool_result = {"error": f"Unknown tool: {fn_name}"}
            else:
                try:
                    tool_result = fn(**fn_args)
                except Exception as e:
                    tool_result = {"error": str(e)}

            messages.append({
                "role": "tool",
                "tool_call_id": tc.id,
                "name": fn_name,
                "content": json.dumps(tool_result, default=str)
            })

    # Safety net if it somehow never converges within max_rounds
    return "I wasn't able to fully resolve this question with the available data — please try rephrasing or ask about a specific order/settlement ID."