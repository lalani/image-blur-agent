import base64
import io
import json
import os
from typing import List
from PIL import Image, ImageFilter, ImageDraw
from pydantic import BaseModel, Field
from google import genai
from google.genai import types

# --- Pydantic Schema for Structured JSON Output ---
class FaceDetection(BaseModel):
    box_2d: List[int] = Field(description="Bounding box [ymin, xmin, ymax, xmax] normalized on a 0 to 1000 scale.")
    age: int = Field(description="Estimated age in years.")
    is_child: bool = Field(description="Whether the person is under 18 years old.")

class FaceList(BaseModel):
    faces: List[FaceDetection]

# --- Client Initializer ---
def get_genai_client():
    api_key = os.environ.get("GOOGLE_API_KEY")
    use_vertex = os.environ.get("GOOGLE_GENAI_USE_VERTEXAI", "True") == "True"
    if api_key and not use_vertex:
        return genai.Client(api_key=api_key)
    else:
        # Default to Vertex AI (which uses GCP Application Default Credentials)
        return genai.Client(vertexai=True)

# --- Face Blurring Tool ---
def detect_and_blur_faces(
    image_base64: str, 
    blur_only_children: bool = False, 
    manual_boxes: List[dict] = None,
    skip_ai: bool = False
) -> str:
    """Detects faces in an image and blurs them. Can optionally blur only children.
    Also accepts custom manual boxes to blur with specific shapes.

    Args:
        image_base64: The base64-encoded image string, or a local file path to the image.
        blur_only_children: If True, only blurs faces estimated to be under 18 years old.
        manual_boxes: Optional list of manual boxes dicts: [{"box_2d": [ymin,xmin,ymax,xmax], "shape": "oval"|"square"}]
        skip_ai: If True, bypasses Gemini API face detection entirely.

    Returns:
        A JSON string containing details of detected and blurred faces.
    """
    if not image_base64:
        return json.dumps({"error": "No image data provided."})

    # Check if image_base64 is a local file path
    is_file_path = False
    if os.path.exists(image_base64) and os.path.isfile(image_base64):
        is_file_path = True
        input_path = image_base64
        try:
            with open(input_path, "rb") as f:
                img_bytes = f.read()
                ext = os.path.splitext(input_path)[1].lower()
                mime = "image/png" if ext == ".png" else "image/jpeg"
                image_base64 = f"data:{mime};base64,{base64.b64encode(img_bytes).decode('utf-8')}"
        except Exception as e:
            return json.dumps({"error": f"Failed to read local file path: {str(e)}"})

    # 1. Clean and Decode Base64
    img_format = "JPEG"
    if "," in image_base64:
        header, base64_data = image_base64.split(",", 1)
        if "png" in header.lower():
            img_format = "PNG"
    else:
        base64_data = image_base64

    try:
        image_bytes = base64.b64decode(base64_data.strip())
    except Exception as e:
        return json.dumps({"error": f"Failed to decode base64 image data: {str(e)}"})

    # 2. Load Image and Get Dimensions
    try:
        image = Image.open(io.BytesIO(image_bytes))
        width, height = image.size
    except Exception as e:
        return json.dumps({"error": f"Failed to open image using Pillow: {str(e)}"})

    # 3. Invoke Gemini API for Face Bounding Boxes
    faces = []
    if not skip_ai:
        try:
            client = get_genai_client()
            png_arr = io.BytesIO()
            image.save(png_arr, format="PNG")
            png_bytes = png_arr.getvalue()
            image_part = types.Part.from_bytes(data=png_bytes, mime_type="image/png")

            prompt = (
                "Locate all human faces in this image. For each face, return its bounding box coordinates "
                "normalized as [ymin, xmin, ymax, xmax] on a 0-1000 scale, its estimated age, and whether "
                "they are a child under 18 (true/false)."
            )
            
            response = client.models.generate_content(
                model="gemini-2.5-flash",
                contents=[image_part, prompt],
                config=types.GenerateContentConfig(
                    response_mime_type="application/json",
                    response_schema=FaceList,
                )
            )
            
            result_data = json.loads(response.text)
            faces = result_data.get("faces", [])
        except Exception as e:
            # If Gemini fails, we will still allow manual blurring if manual boxes are provided
            if not manual_boxes:
                return json.dumps({"error": f"Gemini Face Detection request failed: {str(e)}"})

    # 4. Apply Privacy Blur to Detected & Manual Regions
    blurred_count = 0
    faces_details = []

    # Process Gemini Faces (AI defaults to square)
    for face in faces:
        box = face.get("box_2d")
        if not box or len(box) != 4:
            continue

        is_child = face.get("is_child", False)
        age = face.get("age", 25)
        
        faces_details.append({
            "box_2d": box,
            "age": age,
            "is_child": is_child,
            "is_manual": False,
            "shape": "square"
        })

        if blur_only_children and not is_child:
            continue

        # Map normalized coordinates back to pixels
        ymin, xmin, ymax, xmax = box
        ymin_px = int((ymin / 1000) * height)
        xmin_px = int((xmin / 1000) * width)
        ymax_px = int((ymax / 1000) * height)
        xmax_px = int((xmax / 1000) * width)

        # Bounds safety checks
        ymin_px = max(0, min(ymin_px, height))
        xmin_px = max(0, min(xmin_px, width))
        ymax_px = max(0, min(ymax_px, height))
        xmax_px = max(0, min(xmax_px, width))

        if (xmax_px - xmin_px) <= 0 or (ymax_px - ymin_px) <= 0:
            continue

        # Crop, Apply Gaussian Blur, and Paste Back
        try:
            crop_box = (xmin_px, ymin_px, xmax_px, ymax_px)
            cropped = image.crop(crop_box)
            blurred = cropped.filter(ImageFilter.GaussianBlur(radius=30))
            image.paste(blurred, crop_box)
            blurred_count += 1
        except Exception as e:
            print(f"Failed to blur AI face region: {str(e)}")

    # Process Manual Boxes
    if manual_boxes:
        for mbox in manual_boxes:
            box = mbox.get("box_2d")
            shape = mbox.get("shape", "square")
            if not box or len(box) != 4:
                continue

            faces_details.append({
                "box_2d": box,
                "age": -1,
                "is_child": False,
                "is_manual": True,
                "shape": shape
            })

            # Map normalized coordinates back to pixels
            ymin, xmin, ymax, xmax = box
            ymin_px = int((ymin / 1000) * height)
            xmin_px = int((xmin / 1000) * width)
            ymax_px = int((ymax / 1000) * height)
            xmax_px = int((xmax / 1000) * width)

            ymin_px = max(0, min(ymin_px, height))
            xmin_px = max(0, min(xmin_px, width))
            ymax_px = max(0, min(ymax_px, height))
            xmax_px = max(0, min(xmax_px, width))

            if (xmax_px - xmin_px) <= 0 or (ymax_px - ymin_px) <= 0:
                continue

            try:
                crop_box = (xmin_px, ymin_px, xmax_px, ymax_px)
                cropped = image.crop(crop_box)
                blurred = cropped.filter(ImageFilter.GaussianBlur(radius=30))
                
                if shape == "oval":
                    # Generate stencil mask for ellipse blurring
                    mask = Image.new("L", cropped.size, 0)
                    draw = ImageDraw.Draw(mask)
                    draw.ellipse((0, 0, cropped.width, cropped.height), fill=255)
                    image.paste(blurred, crop_box, mask=mask)
                else:
                    # Default rectangular blur
                    image.paste(blurred, crop_box)
                    
                blurred_count += 1
            except Exception as e:
                print(f"Failed to blur manual region: {str(e)}")

    # 6. Re-Encode Blurred Image to Base64
    try:
        output_arr = io.BytesIO()
        image.save(output_arr, format=img_format)
        output_bytes = output_arr.getvalue()
        output_base64 = base64.b64encode(output_bytes).decode("utf-8")
        output_url = f"data:image/{img_format.lower()};base64,{output_base64}"
    except Exception as e:
        return json.dumps({"error": f"Failed to encode blurred output image: {str(e)}"})

    # If it was a file path, we can also save the output back to disk for CLI convenience
    output_path = None
    if is_file_path:
        try:
            base_dir, filename = os.path.split(input_path)
            name, ext = os.path.splitext(filename)
            output_path = os.path.join(base_dir, f"{name}_blurred{ext}")
            
            output_b64 = output_url.split(",")[1] if "," in output_url else output_url
            with open(output_path, "wb") as f:
                f.write(base64.b64decode(output_b64))
        except Exception as e:
            print(f"Failed to write output to file path: {str(e)}")

    return json.dumps({
        "status": "SUCCESS",
        "detected_faces_count": len(faces),
        "blurred_faces_count": blurred_count,
        "faces_details": faces_details,
        "image_base64": output_url,
        "output_path": output_path
    }, indent=2)
