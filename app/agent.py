import os
from dotenv import load_dotenv

# Load environment variables from .env
load_dotenv()

import google.auth
from google.adk.agents import Agent
from google.adk.apps import App
from google.adk.models import Gemini
from google.genai import types

# Configure Vertex AI vs Google AI Studio fallback
try:
    _, project_id = google.auth.default()
    os.environ["GOOGLE_CLOUD_PROJECT"] = project_id
    os.environ["GOOGLE_CLOUD_LOCATION"] = "global"
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
except Exception:
    # If Application Default Credentials are not found, fall back to AI Studio via GOOGLE_API_KEY
    if os.environ.get("GOOGLE_API_KEY"):
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "False"
        os.environ["GOOGLE_CLOUD_PROJECT"] = "mock-gcp-project"
    else:
        # Default fallback so imports don't crash
        os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"
        os.environ["GOOGLE_CLOUD_PROJECT"] = "mock-gcp-project"

from app.tools import detect_and_blur_faces

# --- Define Root Agent ---
root_agent = Agent(
    name="image_blur_agent",
    model=Gemini(
        model="gemini-flash-latest",
        retry_options=types.HttpRetryOptions(attempts=3),
    ),
    instruction=(
        "You are an AI Privacy Assistant specializing in image anonymization. You help users protect "
        "their privacy by automatically detecting and blurring faces in their images. "
        "You have a tool called `detect_and_blur_faces` which accepts a base64 image and can selectively "
        "blur only children under the age of 18 (using estimation).\n\n"
        "When users discuss images, suggest blurring options and explain the results of face detection "
        "(such as the number of detected faces and their approximate age groups) based on the tool's outputs."
    ),
    tools=[detect_and_blur_faces],
)

app = App(
    root_agent=root_agent,
    name="app",
)
