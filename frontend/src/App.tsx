import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Download, 
  Shield, 
  Users, 
  ChevronRight, 
  AlertCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  Sliders,
  Edit,
  Eye,
  Trash2
} from 'lucide-react';
import confetti from 'canvas-confetti';

// --- Interfaces ---
interface FaceDetail {
  box_2d: number[];
  age: number;
  is_child: boolean;
  is_manual?: boolean;
  shape?: string;
}

interface ManualBox {
  box_2d: number[];
  shape: 'square' | 'oval';
  is_manual?: boolean;
  age?: number;
  is_child?: boolean;
}

export default function App() {
  // Images and Processing States
  const [originalImage, setOriginalImage] = useState<string | null>(null);
  const [blurredImage, setBlurredImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progressStep, setProgressStep] = useState('');
  const [detectedFaces, setDetectedFaces] = useState<FaceDetail[]>([]);
  const [blurredCount, setBlurredCount] = useState(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Settings & Modes
  const [processingMode, setProcessingMode] = useState<'auto' | 'manual'>('auto');
  const [blurOnlyChildren, setBlurOnlyChildren] = useState(false);
  const [showGuide, setShowGuide] = useState(true);
  const [activeMode, setActiveMode] = useState<'slider' | 'edit'>('slider');
  const [selectedShape, setSelectedShape] = useState<'square' | 'oval'>('square');
  
  // Custom manual bounding boxes state with shape metadata (acting as local drafts)
  const [manualBoxes, setManualBoxes] = useState<ManualBox[]>([]);
  const [hasUnappliedEdits, setHasUnappliedEdits] = useState(false);
  
  // Drag and Drop State
  const [isDragActive, setIsDragActive] = useState(false);
  
  // Slider State
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isDraggingSlider, setIsDraggingSlider] = useState(false);
  
  // Drawing custom bounding boxes state
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawCurrent, setDrawCurrent] = useState<{ x: number; y: number } | null>(null);

  // Image sizing/letterbox state for overlays
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0, left: 0, top: 0 });
  const containerRef = useRef<HTMLDivElement | null>(null);

  // --- Drag and Drop Handlers ---
  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      loadImage(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      loadImage(e.target.files[0]);
    }
  };

  const loadImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Please upload an image file (PNG, JPG, WebP, etc.)');
      return;
    }
    
    setErrorMessage(null);
    setBlurredImage(null);
    setDetectedFaces([]);
    setBlurredCount(0);
    setManualBoxes([]);
    setHasUnappliedEdits(false);
    setSelectedShape('square');

    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        const imageSrc = e.target.result as string;
        setOriginalImage(imageSrc);
        
        // If they already selected manual mode, initialize the canvas immediately on upload
        if (processingMode === 'manual') {
          setActiveMode('edit');
        }
      }
    };
    reader.readAsDataURL(file);
  };

  // --- Processing Mode Change (AI vs Manual) ---
  const handleProcessingModeChange = (mode: 'auto' | 'manual') => {
    setProcessingMode(mode);
    setHasUnappliedEdits(false);
    
    if (!originalImage) return;

    if (mode === 'manual') {
      // Auto-initialize canvas to edit mode for manual blurring (start clean without blurs)
      setBlurredImage(null);
      setActiveMode('edit');
      setDetectedFaces([]);
      setManualBoxes([]);
      
      confetti({
        particleCount: 30,
        spread: 60,
        origin: { y: 0.8 },
        colors: ['#fbbf24', '#f59e0b', '#3b82f6']
      });
    } else {
      // Revert back to pre-processing state
      setBlurredImage(null);
      setActiveMode('slider');
      setDetectedFaces([]);
      setManualBoxes([]);
    }
  };

  // --- Image Processing Call ---
  const handleProcessImage = async (customBoxes = manualBoxes) => {
    if (!originalImage) return;

    setIsProcessing(true);
    setErrorMessage(null);

    // Bypass Gemini if in Manual mode, OR if we are updating edits on an already-processed image
    const shouldSkipAI = processingMode === 'manual' || !!blurredImage;
    setProgressStep(shouldSkipAI ? 'Applying local Gaussian blur using Pillow...' : 'Uploading image to parser...');

    const progressIntervals = [];
    if (!shouldSkipAI) {
      progressIntervals.push(
        setTimeout(() => setProgressStep('Invoking Gemini Multimodal Face Detector...'), 1000),
        setTimeout(() => setProgressStep('Estimating age & mapping coordinates...'), 2200),
        setTimeout(() => setProgressStep('Applying local Gaussian blur using Pillow...'), 3500)
      );
    }

    try {
      const res = await fetch('/api/blur-faces', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          image: originalImage,
          blur_only_children: blurOnlyChildren,
          manual_boxes: customBoxes,
          skip_ai: shouldSkipAI
        })
      });

      const data = await res.json();
      progressIntervals.forEach(clearTimeout);

      if (data.error) {
        setErrorMessage(data.error);
        setIsProcessing(false);
        return;
      }

      setBlurredImage(data.image_base64);
      setDetectedFaces(data.faces_details || []);
      setBlurredCount(data.blurred_faces_count || 0);
      setHasUnappliedEdits(false);
      setActiveMode('slider'); // Auto-switch to Slider view when blurred image is returned

      if (customBoxes.length === 0) {
        setSliderPosition(50);
      }

      // Sync all returned face bounding boxes (both AI detected and Manual) into local manualBoxes state.
      const returnedBoxes = (data.faces_details || []).map((f: FaceDetail) => ({
        box_2d: f.box_2d,
        shape: (f.shape as 'square' | 'oval') || 'square',
        is_manual: f.is_manual !== false,
        age: f.age,
        is_child: f.is_child
      }));
      setManualBoxes(returnedBoxes);

      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#3b82f6', '#60a5fa', '#2dd4bf']
      });

    } catch (e: any) {
      progressIntervals.forEach(clearTimeout);
      console.error('Failed to process image:', e);
      setErrorMessage(e.message || 'Error communicating with backend face-blurring server.');
    } finally {
      setIsProcessing(false);
    }
  };

  // --- Calculate Image bounds inside container ---
  const calculateRenderedImageBounds = (imgElement: HTMLImageElement) => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth;
    const containerHeight = containerRef.current.clientHeight;
    
    const imgRatio = imgElement.naturalWidth / imgElement.naturalHeight;
    const containerRatio = containerWidth / containerHeight;
    
    let renderedWidth = containerWidth;
    let renderedHeight = containerHeight;
    let left = 0;
    let top = 0;
    
    if (imgRatio > containerRatio) {
      renderedHeight = containerWidth / imgRatio;
      top = (containerHeight - renderedHeight) / 2;
    } else {
      renderedWidth = containerHeight * imgRatio;
      left = (containerWidth - renderedWidth) / 2;
    }
    
    setImageDimensions({
      width: renderedWidth,
      height: renderedHeight,
      left,
      top
    });
  };

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    calculateRenderedImageBounds(e.currentTarget);
  };

  // Trigger resize boundaries
  useEffect(() => {
    const handleResize = () => {
      const img = containerRef.current?.querySelector('img');
      if (img && img.complete) {
        calculateRenderedImageBounds(img);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // --- Bounding Box Drawing Mouse Handlers ---
  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (activeMode !== 'edit' || !originalImage || isProcessing) return;

    // Prevent default browser image-dragging behavior
    e.preventDefault();

    // Ignore if clicking on overlay delete trash icon
    if ((e.target as HTMLElement).closest('.btn-delete-overlay')) {
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const { left, top, width, height } = imageDimensions;

    // Inside image check
    if (
      clickX < left || clickX > left + width ||
      clickY < top || clickY > top + height
    ) {
      return; 
    }

    setIsDrawing(true);
    setDrawStart({ x: clickX, y: clickY });
    setDrawCurrent({ x: clickX, y: clickY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    let x = e.clientX - rect.left;
    let y = e.clientY - rect.top;

    // Clamp coordinates to image borders
    const { left, top, width, height } = imageDimensions;
    x = Math.max(left, Math.min(x, left + width));
    y = Math.max(top, Math.min(y, top + height));

    setDrawCurrent({ x, y });
  };

  const handleMouseUp = () => {
    if (!isDrawing || !drawStart || !drawCurrent) return;
    setIsDrawing(false);

    const x1 = drawStart.x;
    const y1 = drawStart.y;
    const x2 = drawCurrent.x;
    const y2 = drawCurrent.y;

    const deltaX = Math.abs(x2 - x1);
    const deltaY = Math.abs(y2 - y1);

    // If drag is tiny, treat as a single click and place a default sized box
    if (deltaX < 6 && deltaY < 6) {
      handleTapPlace(x1, y1);
      setDrawStart(null);
      setDrawCurrent(null);
      return;
    }

    // Process drag bounds
    const xmin_px = Math.min(x1, x2);
    const xmax_px = Math.max(x1, x2);
    const ymin_px = Math.min(y1, y2);
    const ymax_px = Math.max(y1, y2);

    const { left, top, width, height } = imageDimensions;

    const rel_xmin = xmin_px - left;
    const rel_xmax = xmax_px - left;
    const rel_ymin = ymin_px - top;
    const rel_ymax = ymax_px - top;

    const ymin = Math.round(Math.max(0, (rel_ymin / height) * 1000));
    const xmin = Math.round(Math.max(0, (rel_xmin / width) * 1000));
    const ymax = Math.round(Math.min(1000, (rel_ymax / height) * 1000));
    const xmax = Math.round(Math.min(1000, (rel_xmax / width) * 1000));

    const newBox: ManualBox = {
      box_2d: [ymin, xmin, ymax, xmax],
      shape: selectedShape,
      is_manual: true
    };

    const updatedBoxes = [...manualBoxes, newBox];
    setManualBoxes(updatedBoxes);
    setHasUnappliedEdits(true);

    setDrawStart(null);
    setDrawCurrent(null);
  };

  // --- Touch Drawing Handlers for Mobile ---
  const handleTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    if (activeMode !== 'edit' || !originalImage || isProcessing) return;

    // Prevent screen scroll while drawing blurs
    e.preventDefault();

    if ((e.target as HTMLElement).closest('.btn-delete-overlay')) {
      return;
    }

    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    const clickX = touch.clientX - rect.left;
    const clickY = touch.clientY - rect.top;

    const { left, top, width, height } = imageDimensions;

    if (
      clickX < left || clickX > left + width ||
      clickY < top || clickY > top + height
    ) {
      return; 
    }

    setIsDrawing(true);
    setDrawStart({ x: clickX, y: clickY });
    setDrawCurrent({ x: clickX, y: clickY });
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    if (!isDrawing || !drawStart || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const touch = e.touches[0];
    let x = touch.clientX - rect.left;
    let y = touch.clientY - rect.top;

    const { left, top, width, height } = imageDimensions;
    x = Math.max(left, Math.min(x, left + width));
    y = Math.max(top, Math.min(y, top + height));

    setDrawCurrent({ x, y });
  };

  // --- Tap Placement fallback ---
  const handleTapPlace = (clickX: number, clickY: number) => {
    const { left, top, width, height } = imageDimensions;
    const imgX = clickX - left;
    const imgY = clickY - top;

    const xCenter = (imgX / width) * 1000;
    const yCenter = (imgY / height) * 1000;

    const boxSize = 90;
    const ymin = Math.round(Math.max(0, yCenter - boxSize / 2));
    const xmin = Math.round(Math.max(0, xCenter - boxSize / 2));
    const ymax = Math.round(Math.min(1000, yCenter + boxSize / 2));
    const xmax = Math.round(Math.min(1000, xCenter + boxSize / 2));

    const newBox: ManualBox = {
      box_2d: [ymin, xmin, ymax, xmax],
      shape: selectedShape,
      is_manual: true
    };
    const updatedBoxes = [...manualBoxes, newBox];
    setManualBoxes(updatedBoxes);
    setHasUnappliedEdits(true);
  };

  // --- Bounding Box Delete Handler (Removes manual or AI boxes locally) ---
  const handleDeleteManualBox = (targetBox: number[]) => {
    const updatedBoxes = manualBoxes.filter(box => 
      !(box.box_2d[0] === targetBox[0] && box.box_2d[1] === targetBox[1] && box.box_2d[2] === targetBox[2] && box.box_2d[3] === targetBox[3])
    );
    setManualBoxes(updatedBoxes);
    setHasUnappliedEdits(true);
  };

  // --- Clear all selections/edits ---
  const handleClearSelections = () => {
    setManualBoxes([]);
    setHasUnappliedEdits(true);
    
    if (processingMode === 'manual' && !blurredImage) {
      setBlurredImage(null);
    }
  };

  // --- Compare Slider Drag Handlers ---
  const startSliderDrag = () => {
    if (activeMode !== 'slider') return;
    setIsDraggingSlider(true);
  };

  useEffect(() => {
    const handleMouseUpGlobal = () => setIsDraggingSlider(false);
    const handleMouseMoveGlobal = (e: MouseEvent) => {
      if (!isDraggingSlider || !containerRef.current || activeMode !== 'slider') return;
      const rect = containerRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percent);
    };

    const handleTouchMoveGlobal = (e: TouchEvent) => {
      if (!isDraggingSlider || !containerRef.current || activeMode !== 'slider') return;
      const rect = containerRef.current.getBoundingClientRect();
      const touch = e.touches[0];
      const x = touch.clientX - rect.left;
      const percent = Math.max(0, Math.min(100, (x / rect.width) * 100));
      setSliderPosition(percent);
    };

    window.addEventListener('mouseup', handleMouseUpGlobal);
    window.addEventListener('mousemove', handleMouseMoveGlobal);
    window.addEventListener('touchend', handleMouseUpGlobal);
    window.addEventListener('touchmove', handleTouchMoveGlobal);

    return () => {
      window.removeEventListener('mouseup', handleMouseUpGlobal);
      window.removeEventListener('mousemove', handleMouseMoveGlobal);
      window.removeEventListener('touchend', handleMouseUpGlobal);
      window.removeEventListener('touchmove', handleTouchMoveGlobal);
    };
  }, [isDraggingSlider, activeMode]);

  // --- Download Blurred Output ---
  const handleDownload = () => {
    if (!blurredImage) return;
    const link = document.createElement('a');
    link.href = blurredImage;
    link.download = 'anonymized_image.jpg';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleReset = () => {
    setOriginalImage(null);
    setBlurredImage(null);
    setDetectedFaces([]);
    setBlurredCount(0);
    setErrorMessage(null);
    setManualBoxes([]);
    setHasUnappliedEdits(false);
    setProcessingMode('auto');
    setActiveMode('slider');
    setSelectedShape('square');
  };

  // Drawing live preview style calculations
  let previewStyle: React.CSSProperties | null = null;
  if (isDrawing && drawStart && drawCurrent) {
    const x1 = drawStart.x;
    const y1 = drawStart.y;
    const x2 = drawCurrent.x;
    const y2 = drawCurrent.y;

    const xmin = Math.min(x1, x2);
    const ymin = Math.min(y1, y2);
    const w = Math.abs(x2 - x1);
    const h = Math.abs(y2 - y1);

    previewStyle = {
      position: 'absolute',
      left: `${xmin}px`,
      top: `${ymin}px`,
      width: `${w}px`,
      height: `${h}px`,
      border: '2px dashed #fbbf24',
      backgroundColor: 'rgba(251, 191, 36, 0.12)',
      borderRadius: selectedShape === 'oval' ? '50%' : '4px',
      pointerEvents: 'none',
      zIndex: 20
    };
  }

  return (
    <div className="app-container">
      
      {/* Header */}
      <header className="app-header">
        <div className="brand-section">
          <div className="brand-logo">
            <Shield style={{ height: '24px', width: '24px', color: 'white' }} />
          </div>
          <div className="brand-info">
            <h1 className="brand-title text-gradient">Anonymizer AI</h1>
            <p className="brand-subtitle">Smart Face-Blurring Privacy Guard</p>
          </div>
        </div>
      </header>

      {/* Main Container Layout */}
      <main className="main-grid">
        
        {/* Workspace Column */}
        <div className="workspace-column">
          
          {/* Collapsible Stepper Guide */}
          <div className="guide-card">
            <button 
              onClick={() => setShowGuide(!showGuide)}
              className="guide-toggle-btn"
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <HelpCircle style={{ height: '18px', width: '18px', color: '#60a5fa' }} />
                How to Use Anonymizer AI & Manual Blurring
              </span>
              <span>{showGuide ? <ChevronUp style={{ height: '16px', width: '16px' }} /> : <ChevronDown style={{ height: '16px', width: '16px' }} />}</span>
            </button>

            {showGuide && (
              <div className="guide-steps-grid">
                <div className="step-item">
                  <div className="step-meta">
                    <span className="step-number">1</span>
                    <h4 className="step-title">Upload Photo</h4>
                  </div>
                  <p className="step-desc">
                    Upload your picture and choose between 🤖 **Automatic (AI)** or ✏️ **Manual** mode.
                  </p>
                </div>
                <div className="step-item">
                  <div className="step-meta">
                    <span className="step-number">2</span>
                    <h4 className="step-title">Draw Custom Blurs</h4>
                  </div>
                  <p className="step-desc">
                    In Edit mode, click and drag over the image to draw custom box sizes. Double click or tap to place a quick default blur.
                  </p>
                </div>
                <div className="step-item">
                  <div className="step-meta">
                    <span className="step-number">3</span>
                    <h4 className="step-title">Shape Selection</h4>
                  </div>
                  <p className="step-desc">
                    Switch between 🟦 **Square** and ⭕ **Oval** segments before drawing.
                  </p>
                </div>
                <div className="step-item">
                  <div className="step-meta">
                    <span className="step-number">4</span>
                    <h4 className="step-title">Compare & Export</h4>
                  </div>
                  <p className="step-desc">
                    Use the compare slider to inspect blurs before clicking Download to export.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Dedicated Workspace Toolbar (Prevents button overcrowding below) */}
          {originalImage && !isProcessing && (
            <div className="workspace-toolbar animate-fade-in">
              <div className="toolbar-left">
                {/* Pre-Processing Mode Switcher */}
                {!blurredImage && (
                  <div className="segment-control">
                    <button 
                      onClick={() => handleProcessingModeChange('auto')}
                      className={`segment-button ${processingMode === 'auto' ? 'active' : ''}`}
                    >
                      🤖 Auto (AI)
                    </button>
                    <button 
                      onClick={() => handleProcessingModeChange('manual')}
                      className={`segment-button ${processingMode === 'manual' ? 'active' : ''}`}
                    >
                      ✏️ Manual
                    </button>
                  </div>
                )}

                {/* Shape Selector (Visible in Edit Mode always, regardless of blurred image presence) */}
                {activeMode === 'edit' && originalImage && (
                  <div className="segment-control" style={{ border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                    <button 
                      onClick={() => setSelectedShape('square')}
                      className={`segment-button ${selectedShape === 'square' ? 'active' : ''}`}
                      style={{ background: selectedShape === 'square' ? '#fbbf24' : 'transparent', color: selectedShape === 'square' ? '#000' : '#9ca3af' }}
                    >
                      🟦 Square
                    </button>
                    <button 
                      onClick={() => setSelectedShape('oval')}
                      className={`segment-button ${selectedShape === 'oval' ? 'active' : ''}`}
                      style={{ background: selectedShape === 'oval' ? '#fbbf24' : 'transparent', color: selectedShape === 'oval' ? '#000' : '#9ca3af' }}
                    >
                      ⭕ Oval
                    </button>
                  </div>
                )}
              </div>

              <div className="toolbar-right">
                {/* Post-Processing Visualizer Switcher */}
                {blurredImage && (
                  <div className="segment-control">
                    <button 
                      onClick={() => setActiveMode('slider')}
                      className={`segment-button ${activeMode === 'slider' ? 'active' : ''}`}
                    >
                      <Eye style={{ height: '14px', width: '14px' }} /> Slider
                    </button>
                    <button 
                      onClick={() => setActiveMode('edit')}
                      className={`segment-button ${activeMode === 'edit' ? 'active' : ''}`}
                    >
                      <Edit style={{ height: '14px', width: '14px' }} /> Edit
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Working Canvas Card */}
          <div className="canvas-card">
            
            {/* Error Message Box */}
            {errorMessage && (
              <div className="error-banner">
                <AlertCircle style={{ height: '18px', width: '18px', flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Error processing image:</strong> {errorMessage}
                </div>
              </div>
            )}

            {/* Step 1: Upload Box */}
            {!originalImage && (
              <label 
                className={`drag-drop-zone ${isDragActive ? 'active' : ''}`}
                onDragEnter={handleDrag}
                onDragOver={handleDrag}
                onDragLeave={handleDrag}
                onDrop={handleDrop}
              >
                <input type="file" style={{ display: 'none' }} accept="image/*" onChange={handleFileChange} />
                <div className="upload-icon-wrapper">
                  <Upload style={{ height: '32px', width: '32px' }} />
                </div>
                <div>
                  <h3 className="upload-title">Upload image to anonymize</h3>
                  <p className="upload-desc font-sans">
                    Drag and drop your JPEG, PNG, or WebP file here, or click to browse.
                  </p>
                </div>
                <div className="btn-premium select-none">
                  Select File
                </div>
              </label>
            )}

            {/* Step 2: Processing Spinner */}
            {isProcessing && (
              <div className="processing-wrapper animate-fade-in">
                <div className="loading-spinner"></div>
                <div>
                  <h3 className="processing-title">Applying Blurs...</h3>
                  <p className="processing-desc">{progressStep}</p>
                </div>
              </div>
            )}

            {/* Step 3: Visualizer Arena */}
            {originalImage && !isProcessing && (
              <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Visualizer Frame */}
                <div 
                  ref={containerRef}
                  className="image-compare-container"
                  onMouseDown={activeMode === 'edit' ? handleMouseDown : startSliderDrag}
                  onMouseMove={activeMode === 'edit' ? handleMouseMove : undefined}
                  onMouseUp={activeMode === 'edit' ? handleMouseUp : undefined}
                  onMouseLeave={activeMode === 'edit' ? handleMouseUp : undefined}
                  onTouchStart={activeMode === 'edit' ? handleTouchStart : startSliderDrag}
                  onTouchMove={activeMode === 'edit' ? handleTouchMove : undefined}
                  onTouchEnd={activeMode === 'edit' ? handleMouseUp : undefined}
                  style={{ cursor: activeMode === 'edit' ? 'crosshair' : 'default' }}
                >
                  
                  {activeMode === 'slider' && blurredImage ? (
                    <>
                      {/* Original image underlay */}
                      <img 
                        src={originalImage} 
                        alt="Original" 
                        className="image-compare-before" 
                        onLoad={handleImageLoad}
                      />
                      
                      {/* Blurred image crop overlay */}
                      <div 
                        className="image-compare-after-wrapper"
                        style={{ width: `${sliderPosition}%` }}
                      >
                        <img 
                          src={blurredImage} 
                          alt="Blurred" 
                          className="image-compare-after" 
                          style={{ width: containerRef.current?.clientWidth || '100%' }}
                        />
                      </div>

                      {/* Drag Handle line */}
                      <div 
                        className="image-compare-handle"
                        style={{ left: `${sliderPosition}%` }}
                      >
                        <div className="image-compare-handle-button">
                          ↔
                        </div>
                      </div>
                    </>
                  ) : (
                    /* Edit Canvas: Always displays original raw image so user can see faces when placing stencils */
                    <div style={{ position: 'relative', width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                      <img 
                        src={originalImage} 
                        alt="Edit Canvas" 
                        style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                        onLoad={handleImageLoad}
                        className="pointer-events-none"
                      />

                      {/* Live dragging preview box */}
                      {previewStyle && <div style={previewStyle} />}

                      {/* Coordinate Overlays */}
                      {manualBoxes.map((face, index) => {
                        const [ymin, xmin, ymax, xmax] = face.box_2d;
                        const top = imageDimensions.top + (ymin / 1000) * imageDimensions.height;
                        const left = imageDimensions.left + (xmin / 1000) * imageDimensions.width;
                        const w = ((xmax - xmin) / 1000) * imageDimensions.width;
                        const h = ((ymax - ymin) / 1000) * imageDimensions.height;

                        return (
                          <div 
                            key={index}
                            className={`face-box-overlay group ${face.is_manual ? 'manual-added' : 'ai-detected'}`}
                            style={{
                              top: `${top}px`,
                              left: `${left}px`,
                              width: `${w}px`,
                              height: `${h}px`,
                              zIndex: 15,
                              borderRadius: face.shape === 'oval' ? '50%' : '4px'
                            }}
                          >
                            {/* Hover Tooltip Info badge */}
                            <div className={`overlay-tooltip group-hover:opacity-100 transition-opacity duration-150 ${
                              face.is_manual ? 'manual' : 'ai'
                            }`} style={{ opacity: 0 }}>
                              {face.is_manual ? `Manual ${face.shape === 'oval' ? 'Oval' : 'Square'}` : `AI: ${face.is_child ? 'Minor' : 'Adult'} (~${face.age}y)`}
                              
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleDeleteManualBox(face.box_2d);
                                }}
                                className="btn-delete-overlay"
                                title="Delete Blur Selection"
                              >
                                <Trash2 style={{ height: '10px', width: '10px' }} />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>

                {/* Bottom Workspace Action Controls */}
                <div className="controls-row">
                  
                  {/* Left Side Controls */}
                  <div className="left-actions">
                    <button 
                      onClick={handleReset} 
                      className="tab-button" 
                      style={{ 
                        border: '1px solid rgba(255, 255, 255, 0.08)', 
                        background: 'rgba(255, 255, 255, 0.02)',
                        minHeight: '40px',
                        flex: 'none'
                      }}
                    >
                      Reset Photo 🔄
                    </button>
                    
                    {/* Clear Selections Button */}
                    {manualBoxes.length > 0 && (
                      <button 
                        onClick={handleClearSelections} 
                        className="tab-button" 
                        style={{ 
                          border: '1px solid rgba(245, 158, 11, 0.2)', 
                          background: 'rgba(245, 158, 11, 0.02)',
                          color: '#fbbf24',
                          minHeight: '40px',
                          flex: 'none'
                        }}
                      >
                        Clear Selections 🗑️
                      </button>
                    )}
                  </div>

                  {/* Pre-Processing Actions (Right Side) */}
                  {!blurredImage && (
                    <div className="right-actions">
                      {/* Children checkbox toggle (only show in Auto mode) */}
                      {processingMode === 'auto' && (
                        <div 
                          className="toggle-container" 
                          onClick={() => setBlurOnlyChildren(!blurOnlyChildren)}
                        >
                          <div>
                            <div className="toggle-label">Only Children (Under 18)</div>
                            <div className="toggle-desc">Estimates ages & targets minors</div>
                          </div>
                          <label style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', pointerEvents: 'none' }}>
                            <input 
                              type="checkbox" 
                              checked={blurOnlyChildren} 
                              onChange={(e) => setBlurOnlyChildren(e.target.checked)}
                              className="sr-only peer switch-input" 
                            />
                            <div className="w-9 h-5 bg-gray-700 rounded-full peer switch-bg relative">
                              <div className="absolute top-[2px] left-[2px] bg-gray-400 rounded-full h-4 w-4 transition-all switch-dot"></div>
                            </div>
                          </label>
                        </div>
                      )}

                      {processingMode === 'auto' ? (
                        <button 
                          onClick={() => handleProcessImage()}
                          className="btn-premium px-5 text-sm"
                        >
                          Start Blurring <ChevronRight style={{ height: '16px', width: '16px' }} />
                        </button>
                      ) : (
                        manualBoxes.length > 0 && (
                          <button 
                            onClick={() => handleProcessImage()}
                            className="btn-premium px-5 text-sm"
                            style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}
                          >
                            Apply Blurs ✨
                          </button>
                        )
                      )}
                    </div>
                  )}

                  {/* Post-Processing Actions (Right Side) */}
                  {blurredImage && (
                    <div className="right-actions" style={{ flexGrow: 1, justifySelf: 'end', justifyContent: 'flex-end' }}>
                      <div className="mode-instruction-tip font-sans">
                        {activeMode === 'edit' ? (
                          <span className="mode-tip-highlight">✏️ Click and drag over target regions to draw custom {selectedShape} blurs</span>
                        ) : (
                          <span className="mode-slider-highlight"><Sliders style={{ height: '14px', width: '14px' }} /> Slide across image to compare</span>
                        )}
                      </div>

                      {/* Display Update Blurs button if there are uncommitted edits */}
                      {hasUnappliedEdits && (
                        <button 
                          onClick={() => handleProcessImage()}
                          className="btn-premium px-5 text-sm"
                          style={{ background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)', boxShadow: '0 4px 15px rgba(16, 185, 129, 0.2)' }}
                        >
                          Apply Changes ✨
                        </button>
                      )}

                      <button 
                        onClick={handleDownload}
                        className="btn-premium font-semibold text-white"
                        style={{ minHeight: '44px' }}
                      >
                        Download Image <Download style={{ height: '14px', width: '14px' }} />
                      </button>
                    </div>
                  )}
                </div>

              </div>
            )}

          </div>

          {/* Face Detection Details Summary Card */}
          {blurredImage && (detectedFaces.length > 0 || manualBoxes.length > 0) && (
            <div className="summary-card animate-fade-in">
              <h3 className="summary-title">
                <Users style={{ height: '18px', width: '18px' }} /> Detected Regions Summary ({blurredCount} blurred)
              </h3>
              <div className="summary-grid">
                {detectedFaces.map((face, index) => (
                  <div key={index} className={`face-detail-card ${
                    face.is_manual 
                      ? 'manual' 
                      : face.is_child ? 'minor' : ''
                  }`}>
                    {face.is_manual && (
                      <button 
                        onClick={() => handleDeleteManualBox(face.box_2d)}
                        className="btn-card-delete"
                        title="Delete custom blur"
                      >
                        <Trash2 style={{ height: '14px', width: '14px' }} />
                      </button>
                    )}
                    
                    <div className="face-card-header">
                      <span className="face-card-index">Region #{index + 1}</span>
                      <span className={`face-card-badge ${
                        face.is_manual 
                          ? 'manual' 
                          : face.is_child ? 'minor' : 'adult'
                      }`}>
                        {face.is_manual ? `Custom (${face.shape || 'square'})` : face.is_child ? 'Minor' : 'Adult'}
                      </span>
                    </div>
                    <div>
                      <p className="face-card-meta">
                        {face.is_manual ? `Manual ${face.shape === 'oval' ? 'Oval' : 'Square'} Blur` : `Age Est: ~${face.age} yrs`}
                      </p>
                      <p className="face-card-status">
                        Status:{' '}
                        <span className={`face-card-status-value ${
                          (face.is_manual || !blurOnlyChildren || face.is_child) 
                            ? 'blurred' 
                            : 'skipped'
                        }`}>
                          {(face.is_manual || !blurOnlyChildren || face.is_child) ? 'Blurred ✅' : 'Skipped ⏭️'}
                        </span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

        </div>

      </main>
    </div>
  );
}
