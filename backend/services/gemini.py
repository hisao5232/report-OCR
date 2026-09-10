import json
import asyncio
import traceback
from google import genai
from google.genai import types, errors
from config import GEMINI_MODEL

try:
    gemini_client = genai.Client()
except Exception as e:
    print(f"Gemini Client Init Error: {e}")
    gemini_client = None

def get_gemini_client():
    return gemini_client

async def analyze_report_image(file_content: bytes, content_type: str) -> dict:
    if not gemini_client:
        raise RuntimeError("Gemini Client is not initialized.")

    prompt = """
    添付された建設機械の修理報告書/日報（画像またはPDF）を解析し、手書き文字を含めて以下の指示に従って厳密なJSON形式で出力してください。

    【出力フォーマット】
    {
      "raw_text": "帳票に書かれているすべての文字（活字・手書き問わず）を読み取ったそのままの全文テキスト。読み取り順に改行区切りで出力。",
      "extracted_data": {
        "report_no": "日報No (例: A-101160)",
        "receipt_no": "修理受品書No. (例: 12345)",
        "date": "日付 (例: 2026-09-08 または 2026年9月8日)",
        "customer": "得意先名",
        "billing_to": "請求先",
        "site_name": "現場名",
        "machine_name": "機械名 (例: RX306)",
        "management_no": "管理番号",
        "hour_meter": "アワーメーター",
        "repair_staff": "修理担当者名",
        "repair_summary": "修理内容・作業概要 (例: 特定自主点検)",
        "work_time": "工賃の作業時間 (例: 1H30M)",
        "travel_time": "出張費の作業時間・移動時間 (例: 1H30M)",
        "mileage": "走行距離 (例: 10km)",
        "total_amount": "請求金額",
        "parts_list": [
          {
            "part_name": "品名・部品名",
            "quantity": "数量・個数",
            "category": "仕入区分・分類",
            "amount": "金額"
          }
        ],
        "other_notes": "上記項目以外の枠外メモ、特記事項、指示内容など、帳票内のすべての記載事項"
      }
    }

    【読み取り時の注意事項】
    - 日付（例: 2026年9月8日）は、見つかった表記通りに読み取ってください。
    - 工賃や出張費の時間表現（例: 1H30M）や走行距離（例: 10km）などの単位付き手書き文字も正確に抽出してください。
    - 略称や崩し文字（例: 「特自ン」→「特定自主点検」）は、文脈から正しい表記に補正して読み取ってください。
    - 帳票内のすべての手書き文字・数字を漏らさず拾い上げてください。
    - 該当する記載がない項目は null または空文字にしてください。
    """

    part_file = types.Part.from_bytes(
        data=file_content,
        mime_type=content_type if content_type else "application/pdf",
    )

    max_retries = 3
    for attempt in range(max_retries):
        try:
            print(f"Gemini API 呼び出し中 (モデル: {GEMINI_MODEL})...")
            response = gemini_client.models.generate_content(
                model=GEMINI_MODEL,
                contents=[part_file, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                ),
            )
            return json.loads(response.text)
        except (errors.ServerError, errors.APIError) as e:
            if attempt < max_retries - 1:
                wait_time = (attempt + 1) * 2
                print(f"Gemini API 混雑等のため {wait_time} 秒後に再試行します... ({attempt + 1}/{max_retries})")
                await asyncio.sleep(wait_time)
            else:
                raise e
