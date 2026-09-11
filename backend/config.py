import os

PROJECT_ID = os.getenv("GCP_PROJECT_ID")
FIRESTORE_COLLECTION = os.getenv("FIRESTORE_COLLECTION", "handwritten_reports")
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-3.6-flash")
