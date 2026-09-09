<button
  onClick={triggerAnalysis}
  disabled={!isStreamActive || isScanning}
  className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${
    !isStreamActive || isScanning
      ? 'bg-slate-700 text-slate-500 cursor-not-allowed'
      : 'bg-cyan-600 hover:bg-cyan-500 text-white shadow-lg shadow-cyan-600/30'
  }`}
>
  {isScanning ? (
    <span className="flex items-center justify-center gap-2">
      <span className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
      46s Deep Scanning...
    </span>
  ) : (
    'ANALYZE NOW (46s Scan)'
  )}
</button>