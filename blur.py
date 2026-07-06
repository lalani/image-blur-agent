import argparse
import base64
import json
import os
import sys
from app.tools import detect_and_blur_faces

def main():
    parser = argparse.ArgumentParser(description="Anonymizer AI - Bounding Box Face Blurring CLI")
    parser.add_argument("input_image", help="Path to the input image file (JPEG or PNG)")
    parser.add_argument("output_image", help="Path to save the blurred output image")
    parser.add_argument("--only-children", action="store_true", help="Blur only faces estimated to be under 18 years old")
    parser.add_argument("--skip-ai", action="store_true", help="Bypass Gemini AI face detection (useful if you only want to apply manual coordinates)")
    parser.add_argument("--manual-box", nargs=4, type=int, action="append", metavar=("ymin", "xmin", "ymax", "xmax"),
                        help="Add manual bounding box coordinates normalized on a 0-1000 scale. Can be specified multiple times.")
    parser.add_argument("--manual-shape", choices=["square", "oval"], default="square", help="Shape for manual stencils (default: square)")
    
    args = parser.parse_args()
    
    if not os.path.exists(args.input_image):
        print(f"Error: Input image file '{args.input_image}' does not exist.", file=sys.stderr)
        sys.exit(1)
        
    # Read and encode input image
    try:
        with open(args.input_image, "rb") as f:
            image_bytes = f.read()
            img_base64 = base64.b64encode(image_bytes).decode("utf-8")
    except Exception as e:
        print(f"Error reading input image: {e}", file=sys.stderr)
        sys.exit(1)
        
    # Determine format header
    ext = os.path.splitext(args.input_image)[1].lower()
    mime_type = "image/png" if ext == ".png" else "image/jpeg"
    image_payload = f"data:{mime_type};base64,{img_base64}"
    
    # Structure manual boxes
    manual_boxes = []
    if args.manual_box:
        for box in args.manual_box:
            manual_boxes.append({
                "box_2d": box,
                "shape": args.manual_shape
            })
            
    print("Processing image via Gemini API + Pillow local blur...")
    # Invoke core blur tool
    try:
        result_json_str = detect_and_blur_faces(
            image_base64=image_payload,
            blur_only_children=args.only_children,
            manual_boxes=manual_boxes if manual_boxes else None,
            skip_ai=args.skip_ai
        )
        result = json.loads(result_json_str)
    except Exception as e:
        print(f"Error processing image: {e}", file=sys.stderr)
        sys.exit(1)
        
    if "error" in result:
        print(f"Error from Anonymizer tool: {result['error']}", file=sys.stderr)
        sys.exit(1)
        
    # Decode and save blurred output
    try:
        output_url = result["image_base64"]
        base64_data = output_url.split(",")[1] if "," in output_url else output_url
        output_bytes = base64.b64decode(base64_data)
        
        with open(args.output_image, "wb") as f:
            f.write(output_bytes)
            
        print(f"Success! Blurred image saved to '{args.output_image}'")
        print(f"AI Detected Faces: {result.get('detected_faces_count', 0)}")
        print(f"Total Blurred Regions: {result.get('blurred_faces_count', 0)}")
    except Exception as e:
        print(f"Error saving output image: {e}", file=sys.stderr)
        sys.exit(1)

if __name__ == "__main__":
    main()
