// MODIFIED FEATURE: Upgraded to Deep Accumulate Frames over exactly 46 Seconds (46000ms)
const triggerAnalysis = () => {
  if (!isStreamActive || !videoRef.current) {
    setStatusMessage("Error: Connect screen first!");
    return;
  }

  setIsScanning(true);
  setStatusMessage("YoddhaX Deep Analysis Active: Streaming matrix frames continuously for 46 seconds...");
  setAiSignal('WAIT');

  const samples: { green: number; red: number; regions: { x: number; color: 'GREEN' | 'RED' }[]; body: number; topW: number; botW: number; }[] = [];

  // Continuous accumulation sampler running over the extended 46-second block
  const sampleInterval = setInterval(() => {
    if (!canvasRef.current || !videoRef.current) return;
    const ctx = canvasRef.current.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    ctx.drawImage(videoRef.current, 0, 0, 800, 400);
    const frameData = ctx.getImageData(0, 0, 800, 400).data;
    const analysis = analyzePixelDistribution(frameData);
    samples.push({ 
      green: analysis.greenPixels, 
      red: analysis.redPixels, 
      regions: analysis.candleRegions,
      body: analysis.actualBodySize,
      topW: analysis.actualTopWickSize,
      botW: analysis.actualBottomWickSize
    });
  }, 200); // Sample every 200ms across 46 seconds for unmatched volumetric resolution

  setTimeout(() => {
    clearInterval(sampleInterval);
    finalizeAnalysis(samples);
  }, 46000); // 46-Seconds Master Processing Window
};