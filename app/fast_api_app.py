import os
from fastapi import FastAPI
from pydantic import BaseModel
from google.adk.cli.fast_api import get_fast_api_app
from app.app_utils.telemetry import setup_telemetry
from app.app_utils.typing import Feedback

setup_telemetry()

# Handle local credentials fallback for logging
try:
    import google.auth
    from google.cloud import logging as google_cloud_logging
    _, project_id = google.auth.default()
    logging_client = google_cloud_logging.Client()
    logger = logging_client.logger(__name__)
except Exception:
    project_id = "mock-project"
    class MockLogger:
        def log_struct(self, data, severity="INFO"):
            print(f"[{severity}] {data}")
    logger = MockLogger()

allow_origins = ["http://localhost:5173", "http://127.0.0.1:5173"]
if os.getenv("ALLOW_ORIGINS"):
    allow_origins.extend(os.getenv("ALLOW_ORIGINS", "").split(","))

logs_bucket_name = os.environ.get("LOGS_BUCKET_NAME")
AGENT_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
session_service_uri = None
artifact_service_uri = f"gs://{logs_bucket_name}" if logs_bucket_name else None

app: FastAPI = get_fast_api_app(
    agents_dir=AGENT_DIR,
    web=True,
    artifact_service_uri=artifact_service_uri,
    allow_origins=allow_origins,
    session_service_uri=session_service_uri,
    otel_to_cloud=False, # Disable GCP telemetry exporting for local run
)
app.title = "image-blur-agent"
app.description = "API for interacting with the Agent image-blur-agent"

# --- Request Schemas ---
class ManualBox(BaseModel):
    box_2d: list[int]
    shape: str = "square"

class BlurRequest(BaseModel):
    image: str
    blur_only_children: bool = False
    manual_boxes: list[ManualBox] | None = None
    skip_ai: bool = False

# --- Endpoints ---
@app.post("/api/blur-faces")
def blur_faces_endpoint(req: BlurRequest) -> dict:
    """Detects faces in a base64 image and blurs them according to settings."""
    from app.tools import detect_and_blur_faces
    import json
    
    manual_dicts = None
    if req.manual_boxes:
        manual_dicts = [box.model_dump() for box in req.manual_boxes]
    
    result_str = detect_and_blur_faces(
        image_base64=req.image,
        blur_only_children=req.blur_only_children,
        manual_boxes=manual_dicts,
        skip_ai=req.skip_ai
    )
    return json.loads(result_str)

@app.post("/feedback")
def collect_feedback(feedback: Feedback) -> dict[str, str]:
    """Collect and log feedback."""
    logger.log_struct(feedback.model_dump(), severity="INFO")
    return {"status": "success"}

# Main execution
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
