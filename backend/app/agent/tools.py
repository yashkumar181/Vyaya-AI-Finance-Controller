import json

TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "query_ledger",
            "description": "Queries the reconciled ledger for matching clean orders.",
            "parameters": {
                "type": "object",
                "properties": {
                    "order_id": {"type": "string"},
                    "settlement_id": {"type": "string"},
                    "date_range": {"type": "string"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "query_exceptions",
            "description": "Queries the categorized exception queue for failed reconciliations.",
            "parameters": {
                "type": "object",
                "properties": {
                    "category": {"type": "string"},
                    "settlement_id": {"type": "string"},
                    "order_id": {"type": "string"}
                }
            }
        }
    },
    {
        "type": "function",
        "function": {
            "name": "generate_journal_entry",
            "description": "Drafts an ERP adjustment entry to correct an exception.",
            "parameters": {
                "type": "object",
                "properties": {
                    "exception_id": {"type": "string", "description": "The order_id or settlement_id tied to the exception"}
                },
                "required": ["exception_id"]
            }
        }
    }
]

def execute_tool(name: str, arguments: dict) -> str:
    # TODO: Wire these up to your actual database queries
    if name == "query_ledger":
        return json.dumps({"status": "success", "data": "Mock ledger data for: " + str(arguments)})
    elif name == "query_exceptions":
        return json.dumps({"status": "success", "data": "Mock exception data for: " + str(arguments)})
    elif name == "generate_journal_entry":
        return json.dumps({
            "status": "success",
            "draft_entry": {
                "account": "Suspense/Clearing",
                "debit_credit": "Debit",
                "amount": "TBD based on exception",
                "narration": f"Draft adjustment for {arguments.get('exception_id')}"
            }
        })
    return json.dumps({"error": "Unknown tool"})