from pydantic import BaseModel
from typing import Dict, Any, Optional

class ReportUpdateRequest(BaseModel):
    extracted_data: Dict[str, Any]
    raw_text: Optional[str] = None
