import os
import json
import urllib.request
import urllib.error
from dotenv import load_dotenv
from google import genai

load_dotenv()

def suggest_dependencies_llm(task_title: str, task_description: str, other_tasks: list[dict]) -> dict:
    api_key = os.environ.get('LLM_API_KEY')
    if not api_key:
        raise ValueError("LLM_API_KEY environment variable is not set")

    prompt = f"""
    You are an AI assistant that suggests prerequisites for tasks.
    Target Task:
    Title: {task_title}
    Description: {task_description or ''}
    
    Available Tasks:
    {json.dumps(other_tasks, indent=2)}
    
    Instructions:
    Only select prerequisite task IDs from the list of task IDs provided.
    Never invent new IDs or tasks.
    Respond ONLY in a strict JSON format exactly like this:
    {{"suggested_prerequisite_ids": [2, 4], "reasoning": "short explanation"}}
    """

    try:
        if api_key.startswith("sk-or-"):
            # OpenRouter
            url = "https://openrouter.ai/api/v1/chat/completions"
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
            data = {
                "model": "openrouter/free",
                "messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": prompt}],
                "temperature": 0.2
            }
            req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.loads(response.read().decode("utf-8"))
                content = result["choices"][0]["message"]["content"]
        elif api_key.startswith("sk-"):
            # OpenAI fallback
            url = "https://api.openai.com/v1/chat/completions"
            headers = {"Content-Type": "application/json", "Authorization": f"Bearer {api_key}"}
            data = {
                "model": "gpt-3.5-turbo",
                "messages": [{"role": "system", "content": "You are a helpful assistant."}, {"role": "user", "content": prompt}],
                "temperature": 0.2
            }
            req = urllib.request.Request(url, data=json.dumps(data).encode("utf-8"), headers=headers)
            with urllib.request.urlopen(req, timeout=15) as response:
                result = json.loads(response.read().decode("utf-8"))
                content = result["choices"][0]["message"]["content"]
        else:
            # Gemini via google-genai SDK
            client = genai.Client(api_key=api_key)
            response = client.models.generate_content(
                model='gemini-2.0-flash',
                contents=prompt,
                config={'temperature': 0.2}
            )
            content = response.text
            
        # Try to find JSON block
        if "{" in content and "}" in content:
            content = content[content.find("{"):content.rfind("}")+1]
        return json.loads(content)
    except Exception as e:
        raise Exception(f"Failed to get AI suggestions: {str(e)}")
