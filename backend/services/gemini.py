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


# 新しい世代から順に試す候補リスト。
# live / preview / image / audio 系は画像解析用途には使わない想定なので入れない。
CANDIDATE_MODELS = [
    GEMINI_MODEL,          # config.py の設定値を最優先
    "gemini-3.6-flash",
    "gemini-3.1-flash",
    "gemini-3-flash",
]


def _is_model_unavailable_error(e: Exception) -> bool:
    """
    404 (NOT_FOUND) など「そのモデル自体が使えない」エラーかどうかを判定する。
    混雑(429/5xx)など一時的なエラーとは区別する。
    """
    status_code = getattr(e, "status_code", None)
    if status_code == 404:
        return True
    if "NOT_FOUND" in str(e):
        return True
    return False


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

    # GEMINI_MODEL が候補リストに重複して入っている場合の重複除去（順序は保持）
    candidate_models = list(dict.fromkeys(CANDIDATE_MODELS))

    max_retries = 3
    last_error: Exception | None = None

    for model_name in candidate_models:
        for attempt in range(max_retries):
            try:
                print(f"Gemini API 呼び出し中 (モデル: {model_name})...")
                response = gemini_client.models.generate_content(
                    model=model_name,
                    contents=[part_file, prompt],
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                    ),
                )
                # 成功したらそのまま結果を返す（以降の候補モデルは試さない）
                return json.loads(response.text)

            except errors.ClientError as e:
                if _is_model_unavailable_error(e):
                    # モデル自体が使えない → リトライせず次の候補モデルへ切り替え
                    print(f"[Gemini] '{model_name}' は利用不可のため次のモデルへ切り替えます。({e})")
                    last_error = e
                    break  # 内側のリトライループを抜けて次の model_name へ
                # 404以外のClientError（例: 400系のリクエスト不正）はそのまま投げる
                raise e

            except (errors.ServerError, errors.APIError) as e:
                # 混雑・一時的な障害等は同じモデルでリトライ
                last_error = e
                if attempt < max_retries - 1:
                    wait_time = (attempt + 1) * 2
                    print(f"Gemini API 混雑等のため {wait_time} 秒後に再試行します... ({attempt + 1}/{max_retries})")
                    await asyncio.sleep(wait_time)
                else:
                    print(f"[Gemini] '{model_name}' はリトライ上限に達したため次のモデルへ切り替えます。")
                    break  # このモデルは断念し、次の候補モデルへ

    # すべての候補モデルで失敗した場合
    raise last_error or RuntimeError("すべてのモデル候補で失敗しました。")

