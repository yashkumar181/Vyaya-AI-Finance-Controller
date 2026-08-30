import os
import json
from openai import OpenAI
from app.agent.tools import TOOLS, execute_tool

client = OpenAI(
    api_key=os.environ.get("GROQ_API_KEY"),
    base_url="https://api.groq.com/openai/v1"
)

SYSTEM_PROMPT = """You are the AI Finance Controller agent. Your job is to explain reconciliation discrepancies and draft accounting corrections.
HARD RULES:
1. NEVER compute, estimate, or invent a monetary figure. Only state numbers that are explicitly returned to you by a tool.
2. ALWAYS cite the specific order_id, settlement_id, and exception category when explaining a discrepancy.
3. If asked to draft a correction, call the generate_journal_entry tool. ALWAYS explicitly label the resulting output as a "DRAFT requiring human approval before posting to the ERP."
If you do not have the data to answer, call the relevant tool to get it.
"""

def chat_with_agent(user_message: str) -> str:
    messages = [
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": user_message}
    ]

    response = client.chat.completions.create(
        model="llama-3.3-70b-versatile",
        messages=messages,
        tools=TOOLS,
        tool_choice="auto",
        temperature=0.0
    )

    response_message = response.choices[0].message
    messages.append(response_message)

    if response_message.tool_calls:
        for tool_call in response_message.tool_calls:
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            
            tool_response = execute_tool(function_name, function_args)
            
            messages.append({
                "tool_call_id": tool_call.id,
                "role": "tool",
                "name": function_name,
                "content": tool_response,
            })
            
        final_response = client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=messages,
            temperature=0.0
        )
        return final_response.choices[0].message.content

    return response_message.content