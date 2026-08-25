// ==========================================
// YODDHA X AI - SCREEN OBSERVER ENGINE
// Visual Pixel-Based Analysis System
// ==========================================

export interface CapturedFrame {
  timestamp: number;
  imageData: ImageData;
  candleData: CandleData[];
  sourceId: string;
}

export interface CandleData {
  x: number;
  y: number;
  width: number;
  height: number;
  color: "GREEN" | "RED" | "DOJI";
  openPrice: number;
  closePrice: number;
  highPrice: number;
  lowPrice: number;
  pattern: string;
}

export interface ScreenShareState {
  isActive: boolean;
  stream: MediaStream | null;
  videoElement: HTMLVideoElement | null;
  canvas: HTMLCanvasElement | null;
  context: CanvasRenderingContext2D | null;
  frameRate: number;
}

let screenState: ScreenShareState = {
  isActive: false,
  stream: null,
  videoElement: null,
  canvas: null,
  context: null,
  frameRate: 1, // 1 frame per second by default
};

// Hidden analysis canvas
let analysisCanvas: HTMLCanvasElement | null = null;
let analysisContext: CanvasRenderingContext2D | null = null;

// Initialize hidden analysis canvas
function initAnalysisCanvas(): void {
  if (!analysisCanvas) {
    analysisCanvas = document.createElement("canvas");
    analysisCanvas.width = 1920;
    analysisCanvas.height = 1080;
    analysisCanvas.style.display = "none";
    analysisCanvas.id = "yoddha-analysis-canvas";
    document.body.appendChild(analysisCanvas);
    analysisContext = analysisCanvas.getContext("2d", { willReadFrequently: true });
  }
}

// Start screen sharing
export async function startScreenShare(): Promise<boolean> {
  try {
    // Request screen share
    const stream = await navigator.mediaDevices.getDisplayMedia({
      video: {
        displaySurface: "browser",
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 30 },
      },
      audio: false,
    });

    screenState.stream = stream;
    screenState.isActive = true;

    // Create hidden video element
    const video = document.createElement("video");
    video.srcObject = stream;
    video.style.display = "none";
    video.id = "yoddha-screen-video";
    video.muted = true;
    video.playsInline = true;
    document.body.appendChild(video);

    await video.play();
    screenState.videoElement = video;

    // Create capture canvas
    screenState.canvas = document.createElement("canvas");
    screenState.canvas.width = 1920;
    screenState.canvas.height = 1080;
    screenState.canvas.style.display = "none";
    screenState.canvas.id = "yoddha-capture-canvas";
    document.body.appendChild(screenState.canvas);

    screenState.context = screenState.canvas.getContext("2d", { willReadFrequently: true });

    // Initialize analysis canvas
    initAnalysisCanvas();

    // Handle stream end
    stream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

    console.log("[YODDHA AI] Screen share started successfully");
    return true;
  } catch (error) {
    console.error("[YODDHA AI] Screen share error:", error);
    screenState.isActive = false;
    return false;
  }
}

// Stop screen sharing
export function stopScreenShare(): void {
  if (screenState.stream) {
    screenState.stream.getTracks().forEach(track => track.stop());
    screenState.stream = null;
  }

  if (screenState.videoElement) {
    screenState.videoElement.srcObject = null;
    screenState.videoElement.remove();
    screenState.videoElement = null;
  }

  screenState.isActive = false;
  screenState.canvas = null;
  screenState.context = null;

  console.log("[YODDHA AI] Screen share stopped");
}

// Capture current frame
export function captureFrame(): CapturedFrame | null {
  if (!screenState.isActive || !screenState.videoElement || !screenState.canvas || !screenState.context || !analysisContext) {
    return null;
  }

  try {
    const video = screenState.videoElement;
    const canvas = screenState.canvas;
    const ctx = screenState.context;

    // Draw video frame to canvas
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Copy to analysis canvas
    analysisContext.drawImage(canvas, 0, 0);

    // Get image data for analysis
    const imageData = analysisContext.getImageData(0, 0, 1920, 1080);

    return {
      timestamp: Date.now(),
      imageData,
      candleData: [],
      sourceId: "screen-share",
    };
  } catch (error) {
    console.error("[YODDHA AI] Frame capture error:", error);
    return null;
  }
}

// Analyze captured frame for candle patterns
export function analyzeFrameForCandles(frame: CapturedFrame): CandleData[] {
  const candles: CandleData[] = [];
  const data = frame.imageData.data;
  const width = frame.imageData.width;
  const height = frame.imageData.height;

  // Detect green and red regions (candle colors)
  // GREEN: High green value, low red
  // RED: High red value, low green
  const greenRegions: { x: number; y: number; w: number; h: number }[] = [];
  const redRegions: { x: number; y: number; w: number; h: number }[] = [];

  // Scan with pixel steps for performance
  const step = 10; // Every 10 pixels
  let currentGreenRegion: { x: number; y: number; w: number; h: number } | null = null;
  let currentRedRegion: { x: number; y: number; w: number; h: number } | null = null;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      // Check for GREEN candle (typically #00ff88 or similar)
      const isGreen = g > 200 && r < 100 && b < 150;
      // Check for RED candle (typically #ff0000 or similar)
      const isRed = r > 200 && g < 100 && b < 100;

      if (isGreen) {
        if (!currentGreenRegion) {
          currentGreenRegion = { x, y, w: 10, h: 10 };
        } else {
          currentGreenRegion.w = Math.max(currentGreenRegion.w, x - currentGreenRegion.x + 10);
          currentGreenRegion.h = Math.max(currentGreenRegion.h, y - currentGreenRegion.y + 10);
        }
      } else if (currentGreenRegion) {
        greenRegions.push(currentGreenRegion);
        currentGreenRegion = null;
      }

      if (isRed) {
        if (!currentRedRegion) {
          currentRedRegion = { x, y, w: 10, h: 10 };
        } else {
          currentRedRegion.w = Math.max(currentRedRegion.w, x - currentRedRegion.x + 10);
          currentRedRegion.h = Math.max(currentRedRegion.h, y - currentRedRegion.y + 10);
        }
      } else if (currentRedRegion) {
        redRegions.push(currentRedRegion);
        currentRedRegion = null;
      }
    }
  }

  // Convert detected regions to candle data
  greenRegions.forEach((region, index) => {
    candles.push({
      x: region.x,
      y: region.y,
      width: region.w,
      height: region.h,
      color: "GREEN",
      openPrice: region.y + region.h,
      closePrice: region.y,
      highPrice: region.y,
      lowPrice: region.y + region.h,
      pattern: "GREEN_CANDLE",
    });
  });

  redRegions.forEach((region, index) => {
    candles.push({
      x: region.x,
      y: region.y,
      width: region.w,
      height: region.h,
      color: "RED",
      openPrice: region.y,
      closePrice: region.y + region.h,
      highPrice: region.y,
      lowPrice: region.y + region.h,
      pattern: "RED_CANDLE",
    });
  });

  return candles;
}

// Get screen share state
export function getScreenShareState(): ScreenShareState {
  return { ...screenState };
}

// Check if screen share is active
export function isScreenShareActive(): boolean {
  return screenState.isActive;
}
