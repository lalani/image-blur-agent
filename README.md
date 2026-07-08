# Anonymizer AI - Intelligent Face Blurring Privacy Shield

🚀 **Try it out here:** [https://image-blur-agent-320837497086.us-east1.run.app](https://image-blur-agent-320837497086.us-east1.run.app)

Anonymizer AI is a modern, high-performance web application designed for fast and secure image anonymization. It leverages the **Google Gemini API** for smart face detection and age estimation, coupled with an **interactive drag-and-draw canvas** for manual censoring stencils.

---

## ✨ Key Features

- 🤖 **Auto (AI) Mode:** Automatically detects all human faces in a photo and estimates their ages.
- 👶 **Targeted Child Protection:** Toggle the "Only Children (Under 18)" mode to blur only minors' faces, leaving adults unblurred.
- ✏️ **Manual Edit Canvas:** Click and drag directly on the original image to outline custom regions to blur.
- 🟦 ⭕ **Oval & Square Stencils:** Switch shape segments on the fly before drawing custom blur regions.
- 🗑️ **Interactive Selection Editing:** Click the trash icon on any face outline (whether detected by AI or drawn manually) to exclude it before committing changes.
- 🔍 **Before/After Comparison Slider:** Use a side-by-side sliding divider overlay to compare the original and anonymized results.
- ⚙️ **Fully Local Processing:** All image blurring calculations (Gaussian blur operations via Pillow) occur locally on the FastAPI backend, guaranteeing data security.

---

## 🏗️ Project Structure

```
image-blur-agent/
├── app/                        # FastAPI Backend & Agent logic
│   ├── tools.py                # Core OpenCV/Pillow face detection & blurring stencils
│   ├── fast_api_app.py         # REST endpoints for image processing
│   └── agent.py                # ReAct agent handler definition
├── frontend/                   # React + TypeScript Vite client
│   ├── src/
│   │   ├── App.tsx             # Interactive drag-and-draw workspace canvas
│   │   └── index.css           # Styling system
├── pyproject.toml              # Python backend dependencies
└── uv.lock                     # Python locked dependencies
```

---

## 🚀 Quick Start (Local Setup)

### 1. Prerequisites
- **uv:** Fast Python package manager ([Install Guide](https://docs.astral.sh/uv/getting-started/installation/))
- **Node.js:** For building/running the React frontend

### 2. Configure Environment Variables
Copy `.env.example` to a new file named `.env` and fill in your credentials:
```bash
cp .env.example .env
```
Open `.env` and set your Google AI Studio API key:
```ini
GOOGLE_API_KEY=your_free_gemini_api_key_here
```

### 3. Start Python FastAPI Backend
From the root directory, install Python dependencies and run the server:
```bash
# Install backend packages
uv sync

# Launch the FastAPI server (runs on port 8000)
uv run python app/fast_api_app.py
```

### 4. Start Vite React Frontend
In a new terminal window, navigate to the `frontend/` directory and spin up the developer server:
```bash
cd frontend

# Install Node modules
npm install

# Run the dev server (runs on http://localhost:5173)
npm run dev
```

---

## 🛠️ Programmatic Usage (Bypassing the Frontend)

If you need to process images programmatically or automate blurring in external applications, you can query the backend endpoints directly:

### 1. REST API (`curl` example)
Submit a `POST` request to `/api/blur-faces` with a base64 encoded image:

```bash
curl -X POST http://localhost:8000/api/blur-faces \
  -H "Content-Type: application/json" \
  -d '{
    "image": "data:image/jpeg;base64,/9j/4AAQSk...",
    "blur_only_children": false,
    "skip_ai": false
  }'
```

**JSON Response Schema:**
```json
{
  "image_base64": "data:image/png;base64,iVBORw0KGg...",
  "faces_details": [
    {
      "box_2d": [120, 340, 240, 480],
      "age": 28,
      "is_child": false,
      "is_manual": false,
      "shape": "square"
    }
  ],
  "blurred_faces_count": 1
}
```

### 2. Direct Python Script Call
You can import the core blurring function directly into your Python scripts without launching a web server:

```python
import base64
import json
from app.tools import detect_and_blur_faces

# 1. Encode local image to base64
with open("test.jpg", "rb") as img_file:
    base64_image = base64.b64encode(img_file.read()).decode("utf-8")

# 2. Call the Pillow-based tool
result_json = detect_and_blur_faces(
    image_base64=base64_image,
    blur_only_children=False
)

# 3. Decode and save result
data = json.loads(result_json)
output_b64 = data["image_base64"].split(",")[1] if "," in data["image_base64"] else data["image_base64"]

with open("output_blurred.jpg", "wb") as out_file:
    out_file.write(base64.b64decode(output_b64))
```
