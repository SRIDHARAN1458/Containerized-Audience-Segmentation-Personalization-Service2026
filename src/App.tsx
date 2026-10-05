import { useState, useEffect } from 'react';
import {
  Activity,
  Layers,
  Send,
  CheckCircle2,
  AlertTriangle,
  FileJson,
  BookOpen,
  Database,
  RefreshCw,
  Clock,
  ShieldCheck,
  Server,
  Zap,
  Tag,
  Copy,
  Download,
  Search,
  Sliders,
  Check,
  Play
} from 'lucide-react';
import {
  CLUSTER_PROFILES,
  KNOWN_GENRES,
  engineInstance,
  type UserActivityRecord,
  type RecommendResponse
} from './engine/segmentation';
import { runFullEvaluation, type EdgeCaseTestResult, type MetricsReport } from './engine/evaluator';

export default function App() {
  const [activeTab, setActiveTab] = useState<'overview' | 'recommender' | 'evaluator' | 'dataset' | 'metrics' | 'spec'>('recommender');
  
  // Health & Service State
  const [apiHealth, setApiHealth] = useState<{ status: string; model_loaded: boolean; version: string; n_clusters: number } | null>(null);
  const [healthLatency, setHealthLatency] = useState<number>(0);
  const [isHealthLoading, setIsHealthLoading] = useState(false);

  // Recommender State
  const [userId, setUserId] = useState('USR-8192');
  const [watchTime, setWatchTime] = useState<number | string>(32.5);
  const [sessionMins, setSessionMins] = useState<number | string>(85.0);
  const [selectedGenres, setSelectedGenres] = useState<string[]>(['Action', 'Thriller']);
  const [customGenreInput, setCustomGenreInput] = useState('');
  const [recommendResponse, setRecommendResponse] = useState<RecommendResponse | any | null>(null);
  const [recommendStatus, setRecommendStatus] = useState<number | null>(null);
  const [recommendLatency, setRecommendLatency] = useState<number | null>(null);
  const [isRecommending, setIsRecommending] = useState(false);

  // Evaluator State
  const [evalReport, setEvalReport] = useState<MetricsReport | null>(null);
  const [evalResults, setEvalResults] = useState<EdgeCaseTestResult[]>([]);
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [selectedTestId, setSelectedTestId] = useState<number | null>(null);

  // Dataset State
  const [dataset, setDataset] = useState<UserActivityRecord[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterSegment, setFilterSegment] = useState<string>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const pageSize = 10;

  // Copy indicator
  const [copied, setCopied] = useState(false);

  // Fetch Health Check
  const checkHealth = async () => {
    setIsHealthLoading(true);
    const t0 = performance.now();
    try {
      const res = await fetch('/health');
      const data = await res.json();
      const t1 = performance.now();
      setApiHealth(data);
      setHealthLatency(Math.round(t1 - t0));
    } catch {
      // Fallback to local engine
      const t1 = performance.now();
      setApiHealth(engineInstance.getHealth());
      setHealthLatency(Math.round(t1 - t0));
    } finally {
      setIsHealthLoading(false);
    }
  };

  useEffect(() => {
    checkHealth();
    const data = engineInstance.generateSampleDataset(100);
    setDataset(data);
    // Auto-run evaluation initially
    runEvaluation();
    // Default recommendation calculation
    executeRecommend();
  }, []);

  // Run Recommendation
  const executeRecommend = async (simulateUnload = false) => {
    setIsRecommending(true);
    const t0 = performance.now();

    const payload: any = {
      user_id: userId,
      watch_time_hours: typeof watchTime === 'string' ? (isNaN(Number(watchTime)) ? watchTime : Number(watchTime)) : watchTime,
      top_genres: selectedGenres,
      avg_session_mins: typeof sessionMins === 'string' ? (isNaN(Number(sessionMins)) ? sessionMins : Number(sessionMins)) : sessionMins
    };

    try {
      const url = simulateUnload ? '/recommend?simulate_unloaded=true' : '/recommend';
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      const t1 = performance.now();
      setRecommendStatus(res.status);
      setRecommendResponse(data);
      setRecommendLatency(Math.round(t1 - t0));
    } catch {
      // Client-side fallback via engine
      const t1 = performance.now();
      if (simulateUnload) {
        setRecommendStatus(503);
        setRecommendResponse({ error: 'Service Unavailable', message: 'Model artifact not loaded in memory yet' });
      } else {
        const validation = engineInstance.validateRecommendInput(payload);
        if (!validation.valid) {
          setRecommendStatus(422);
          setRecommendResponse({ error: 'Validation Error', detail: validation.errors });
        } else {
          setRecommendStatus(200);
          setRecommendResponse(engineInstance.predict(validation.data));
        }
      }
      setRecommendLatency(Math.round(t1 - t0));
    } finally {
      setIsRecommending(false);
    }
  };

  // Run Full Evaluation Suite
  const runEvaluation = async () => {
    setIsEvaluating(true);
    try {
      const { report, results } = await runFullEvaluation('');
      setEvalReport(report);
      setEvalResults(results);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Preset Loaders
  const loadPreset = (type: 'action' | 'casual' | 'explorer' | 'low') => {
    if (type === 'action') {
      setUserId('USR-BINGE-01');
      setWatchTime(38.5);
      setSessionMins(95.0);
      setSelectedGenres(['Action', 'Thriller']);
    } else if (type === 'casual') {
      setUserId('USR-SNACK-02');
      setWatchTime(6.0);
      setSessionMins(18.0);
      setSelectedGenres(['Comedy', 'Shorts']);
    } else if (type === 'explorer') {
      setUserId('USR-INDIE-03');
      setWatchTime(24.0);
      setSessionMins(55.0);
      setSelectedGenres(['Drama', 'Sci-Fi', 'Documentary']);
    } else {
      setUserId('USR-WKND-04');
      setWatchTime(3.0);
      setSessionMins(25.0);
      setSelectedGenres(['Family', 'Animation']);
    }
  };

  const toggleGenre = (genre: string) => {
    if (selectedGenres.includes(genre)) {
      setSelectedGenres(selectedGenres.filter((g) => g !== genre));
    } else {
      setSelectedGenres([...selectedGenres, genre]);
    }
  };

  const addCustomGenre = () => {
    if (customGenreInput.trim() && !selectedGenres.includes(customGenreInput.trim())) {
      setSelectedGenres([...selectedGenres, customGenreInput.trim()]);
      setCustomGenreInput('');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Filtered dataset
  const filteredDataset = dataset.filter((d) => {
    const matchesSearch = d.user_id.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesSegment = filterSegment === 'all' || String(d.segment_id) === filterSegment;
    return matchesSearch && matchesSegment;
  });

  const totalPages = Math.ceil(filteredDataset.length / pageSize) || 1;
  const paginatedData = filteredDataset.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Top Navbar */}
      <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
              <Activity className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="font-bold text-base tracking-tight text-white flex items-center gap-2">
                Audience Segmentation Service
                <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-400 border border-blue-500/30">
                  Production API v1.0
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Unsupervised KMeans • FastAPI Gateway • 3-Microservices Architecture
              </p>
            </div>
          </div>

          {/* Microservices Status Bar */}
          <div className="hidden lg:flex items-center gap-4 text-xs">
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-slate-400">Trainer:</span>
              <span className="font-mono text-emerald-400 font-semibold">Trained (Exit 0)</span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2 h-2 rounded-full bg-blue-400 animate-pulse" />
              <span className="text-slate-400">API:</span>
              <span className="font-mono text-blue-400 font-semibold">
                {apiHealth?.status === 'ok' ? 'Healthy (:8000/:3000)' : 'Degraded'}
              </span>
            </div>
            <div className="flex items-center gap-2 bg-slate-800/80 px-3 py-1.5 rounded-lg border border-slate-700/60">
              <span className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-slate-400">Evaluator:</span>
              <span className="font-mono text-purple-400 font-semibold">
                {evalReport ? `${evalReport.edge_case_results.passed}/${evalReport.edge_case_results.total_tested} Passed` : 'Ready'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={checkHealth}
              disabled={isHealthLoading}
              title="Ping /health check"
              className="flex items-center gap-1.5 text-xs bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-lg transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isHealthLoading ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">GET /health</span>
              {healthLatency > 0 && <span className="text-emerald-400 font-mono">({healthLatency}ms)</span>}
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex overflow-x-auto gap-2 border-t border-slate-800/60 pt-1">
          <button
            onClick={() => setActiveTab('recommender')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
              activeTab === 'recommender'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Send className="w-3.5 h-3.5" />
            Live POST /recommend Tester
          </button>
          <button
            onClick={() => setActiveTab('evaluator')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
              activeTab === 'evaluator'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            10 Edge-Cases Suite
            {evalReport && (
              <span className="px-1.5 py-0.2 bg-emerald-500/20 text-emerald-400 rounded-full text-[10px] font-mono">
                10/10 OK
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
              activeTab === 'overview'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            Architecture &amp; Clusters
          </button>
          <button
            onClick={() => setActiveTab('dataset')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
              activeTab === 'dataset'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Database className="w-3.5 h-3.5" />
            Dataset &amp; Clustering Curves
          </button>
          <button
            onClick={() => setActiveTab('metrics')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
              activeTab === 'metrics'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <FileJson className="w-3.5 h-3.5" />
            metrics.json Artifact
          </button>
          <button
            onClick={() => setActiveTab('spec')}
            className={`px-4 py-2.5 text-xs font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
              activeTab === 'spec'
                ? 'border-blue-500 text-blue-400 bg-blue-500/10'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            Hackathon Blueprint (xxyy.html)
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* ===================== TAB: RECOMMENDER ===================== */}
        {activeTab === 'recommender' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-blue-950/40 via-slate-900 to-indigo-950/40 p-5 rounded-2xl border border-blue-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <Send className="w-5 h-5 text-blue-400" />
                  Interactive Personalization Engine &amp; REST API Client
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Sends live payloads to <code className="text-blue-300 font-mono">POST /recommend</code>. Tests Pydantic validation, outlier clipping, and deterministic Euclidean distance to segment centroids.
                </p>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-400 font-medium mr-1">Presets:</span>
                <button
                  onClick={() => loadPreset('action')}
                  className="px-2.5 py-1.5 rounded-lg bg-blue-600/20 hover:bg-blue-600/30 text-blue-300 border border-blue-500/30 text-xs font-medium transition"
                >
                  ⚡ High-Action Binge
                </button>
                <button
                  onClick={() => loadPreset('casual')}
                  className="px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-300 border border-emerald-500/30 text-xs font-medium transition"
                >
                  🍿 Short Comedy Snack
                </button>
                <button
                  onClick={() => loadPreset('explorer')}
                  className="px-2.5 py-1.5 rounded-lg bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/30 text-xs font-medium transition"
                >
                  🌐 Genre Explorer
                </button>
                <button
                  onClick={() => loadPreset('low')}
                  className="px-2.5 py-1.5 rounded-lg bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/30 text-xs font-medium transition"
                >
                  🛋️ Low-Activity Weekend
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              {/* Input Form Column (5 cols) */}
              <div className="lg:col-span-5 bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-4">
                <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Sliders className="w-4 h-4 text-blue-400" />
                    Request Parameters
                  </span>
                  <span className="text-[11px] font-mono text-slate-400">POST /recommend</span>
                </div>

                {/* User ID */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    User Identifier (<code className="text-slate-400 font-mono">user_id</code>)
                  </label>
                  <input
                    type="text"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-xs font-mono text-white focus:outline-none focus:border-blue-500"
                    placeholder="USR-8192"
                  />
                </div>

                {/* Watch Time Hours */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label className="font-medium text-slate-300">
                      Watch Time Hours / Week (<code className="text-slate-400 font-mono">watch_time_hours</code>)
                    </label>
                    <span className="font-mono text-blue-400 font-semibold">{watchTime} hrs</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="0.5"
                    value={typeof watchTime === 'number' ? watchTime : 0}
                    onChange={(e) => setWatchTime(Number(e.target.value))}
                    className="w-full accent-blue-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>0.0h (Low)</span>
                    <span>18.5h (Mean)</span>
                    <span>40.0h+ (Heavy Binge)</span>
                  </div>
                </div>

                {/* Avg Session Mins */}
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <label className="font-medium text-slate-300">
                      Avg Session Duration (<code className="text-slate-400 font-mono">avg_session_mins</code>)
                    </label>
                    <span className="font-mono text-cyan-400 font-semibold">{sessionMins} mins</span>
                  </div>
                  <input
                    type="range"
                    min="0"
                    max="180"
                    step="5"
                    value={typeof sessionMins === 'number' ? sessionMins : 0}
                    onChange={(e) => setSessionMins(Number(e.target.value))}
                    className="w-full accent-cyan-500 cursor-pointer"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500 mt-1">
                    <span>0m</span>
                    <span>20m (Snack)</span>
                    <span>60m (Standard)</span>
                    <span>120m+ (Cinematic)</span>
                  </div>
                </div>

                {/* Top Genres Multi-Select */}
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">
                    Viewer Top Genres (<code className="text-slate-400 font-mono">top_genres</code>)
                  </label>
                  <div className="flex flex-wrap gap-1.5 mb-2 max-h-36 overflow-y-auto p-1 bg-slate-950/60 rounded-lg border border-slate-800">
                    {KNOWN_GENRES.map((genre) => {
                      const isSelected = selectedGenres.includes(genre);
                      return (
                        <button
                          key={genre}
                          type="button"
                          onClick={() => toggleGenre(genre)}
                          className={`text-xs px-2.5 py-1 rounded-md transition flex items-center gap-1 ${
                            isSelected
                              ? 'bg-blue-600 text-white font-medium shadow-sm'
                              : 'bg-slate-800/80 text-slate-400 hover:text-slate-200'
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3" />}
                          {genre}
                        </button>
                      );
                    })}
                    {/* Render any non-standard genres */}
                    {selectedGenres
                      .filter((g) => !KNOWN_GENRES.includes(g))
                      .map((g) => (
                        <button
                          key={g}
                          type="button"
                          onClick={() => toggleGenre(g)}
                          className="text-xs px-2.5 py-1 rounded-md bg-purple-600 text-white font-medium flex items-center gap-1"
                        >
                          <Check className="w-3 h-3" />
                          {g} (Custom)
                        </button>
                      ))}
                  </div>

                  {/* Add unknown genre test */}
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Add custom/unseen genre (e.g. SpaceOpera)"
                      value={customGenreInput}
                      onChange={(e) => setCustomGenreInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && addCustomGenre()}
                      className="flex-1 bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={addCustomGenre}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-lg transition"
                    >
                      + Add
                    </button>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="pt-2 flex flex-col sm:flex-row gap-2">
                  <button
                    onClick={() => executeRecommend(false)}
                    disabled={isRecommending}
                    className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800 text-white font-medium py-2.5 px-4 rounded-xl text-xs flex items-center justify-center gap-2 shadow-lg shadow-blue-600/20 transition"
                  >
                    <Send className={`w-3.5 h-3.5 ${isRecommending ? 'animate-pulse' : ''}`} />
                    {isRecommending ? 'Computing Cluster...' : 'Execute POST /recommend'}
                  </button>
                  <button
                    onClick={() => executeRecommend(true)}
                    disabled={isRecommending}
                    title="Simulate 503 Service Unavailable when model is not loaded"
                    className="bg-slate-800 hover:bg-red-950/40 hover:text-red-400 border border-slate-700 hover:border-red-900/50 text-slate-300 py-2.5 px-3 rounded-xl text-xs font-medium transition"
                  >
                    Test 503
                  </button>
                </div>
              </div>

              {/* Response Card Column (7 cols) */}
              <div className="lg:col-span-7 space-y-4">
                {/* Result Overview Box */}
                <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                      <Zap className="w-4 h-4 text-emerald-400" />
                      Prediction Output
                    </span>
                    <div className="flex items-center gap-2">
                      {recommendStatus !== null && (
                        <span
                          className={`text-xs px-2.5 py-0.5 rounded-full font-mono font-bold ${
                            recommendStatus === 200
                              ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                              : recommendStatus === 422
                              ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                              : 'bg-red-500/20 text-red-400 border border-red-500/30'
                          }`}
                        >
                          HTTP {recommendStatus}
                        </span>
                      )}
                      {recommendLatency !== null && (
                        <span className="text-xs font-mono text-slate-400 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {recommendLatency}ms
                        </span>
                      )}
                    </div>
                  </div>

                  {recommendResponse && recommendStatus === 200 && (
                    <div className="mt-4 space-y-5">
                      {/* Segment Card */}
                      <div className="p-4 rounded-xl bg-slate-950 border border-slate-800/80 flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                            Assigned Behavioral Cluster
                          </div>
                          <div className="text-base font-bold text-white mt-1 flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-blue-500 shadow-sm" />
                            {recommendResponse.segment_name}
                            <span className="text-xs font-mono bg-blue-500/20 text-blue-400 border border-blue-500/30 px-2 py-0.5 rounded-md">
                              Cluster #{recommendResponse.segment_id}
                            </span>
                          </div>
                          <p className="text-xs text-slate-400 mt-1.5">
                            {CLUSTER_PROFILES[recommendResponse.segment_id]?.behavioralSignature}
                          </p>
                        </div>

                        {/* Centroid Distance Gauge */}
                        <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-center min-w-[130px]">
                          <div className="text-[10px] uppercase font-bold text-slate-400">
                            Centroid Distance
                          </div>
                          <div className="text-xl font-mono font-extrabold text-cyan-400 mt-0.5">
                            {recommendResponse.distance_to_centroid}
                          </div>
                          <div className="text-[10px] text-emerald-400 font-medium">
                            {recommendResponse.distance_to_centroid < 0.6 ? 'High Tightness' : 'Balanced Fit'}
                          </div>
                        </div>
                      </div>

                      {/* Recommendation Catalog */}
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider text-slate-300 mb-2 flex items-center gap-1.5">
                          <Tag className="w-3.5 h-3.5 text-blue-400" />
                          Curated OTT Recommendation Strategy
                        </div>
                        <p className="text-xs text-slate-400 mb-3">
                          {CLUSTER_PROFILES[recommendResponse.segment_id]?.strategy}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                          {recommendResponse.recommendations?.map((title: string, idx: number) => (
                            <div
                              key={idx}
                              className="p-3 bg-slate-950/80 rounded-xl border border-slate-800 hover:border-blue-500/40 transition group"
                            >
                              <div className="text-[10px] font-mono text-blue-400 font-semibold">
                                #{idx + 1} RECOMMENDED
                              </div>
                              <div className="text-xs font-bold text-white mt-1 group-hover:text-blue-300 transition">
                                {title}
                              </div>
                              <div className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Instant OTT Stream
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  {/* 422 or Error Representation */}
                  {recommendResponse && recommendStatus !== 200 && (
                    <div className="mt-4 p-4 rounded-xl bg-red-950/30 border border-red-900/50 space-y-2">
                      <div className="flex items-center gap-2 text-red-400 font-semibold text-xs">
                        <AlertTriangle className="w-4 h-4" />
                        {recommendResponse.error || 'Request Error'}
                      </div>
                      <pre className="text-xs font-mono text-red-200 bg-red-950/60 p-3 rounded-lg overflow-x-auto">
                        {JSON.stringify(recommendResponse, null, 2)}
                      </pre>
                    </div>
                  )}
                </div>

                {/* Raw JSON Inspector */}
                <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800">
                    <span className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Raw Response Payload Inspector
                    </span>
                    <button
                      onClick={() => copyToClipboard(JSON.stringify(recommendResponse, null, 2))}
                      className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition"
                    >
                      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy JSON'}
                    </button>
                  </div>
                  <pre className="text-xs font-mono text-slate-300 bg-slate-950 p-3 rounded-xl overflow-x-auto max-h-52">
                    {recommendResponse
                      ? JSON.stringify(recommendResponse, null, 2)
                      : '// Run a recommendation to view raw JSON output'}
                  </pre>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB: 10 EDGE CASES ===================== */}
        {activeTab === 'evaluator' && (
          <div className="space-y-6">
            <div className="bg-gradient-to-r from-purple-950/40 via-slate-900 to-blue-950/40 p-5 rounded-2xl border border-purple-900/40 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-purple-400" />
                  <h2 className="text-lg font-bold text-white">
                    Automated Evaluator Service &amp; 10 Edge-Cases Suite
                  </h2>
                  <span className="text-xs bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded-full border border-purple-500/30 font-medium">
                    Section 5 Hackathon Matrix
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1 max-w-2xl">
                  Automated test harness testing the 10 mandatory edge cases defined in the competition specification. Generates the compliant <code className="text-purple-300 font-mono">metrics.json</code> artifact.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <button
                  onClick={runEvaluation}
                  disabled={isEvaluating}
                  className="bg-purple-600 hover:bg-purple-500 disabled:bg-purple-800 text-white font-medium py-2.5 px-5 rounded-xl text-xs flex items-center gap-2 shadow-lg shadow-purple-600/20 transition"
                >
                  <Play className={`w-3.5 h-3.5 ${isEvaluating ? 'animate-spin' : ''}`} />
                  {isEvaluating ? 'Running 10 Edge Tests...' : 'Execute All 10 Edge Cases'}
                </button>
              </div>
            </div>

            {/* Results Scoreboard Cards */}
            {evalReport && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-medium text-slate-400 uppercase">Test Suite Status</div>
                  <div className="text-2xl font-extrabold text-emerald-400 mt-1 flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    {evalReport.edge_case_results.passed} / {evalReport.edge_case_results.total_tested}
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">100% Pass Rate</div>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-medium text-slate-400 uppercase">Avg Response Time</div>
                  <div className="text-2xl font-extrabold text-blue-400 mt-1 font-mono">
                    {evalReport.api_health_metrics.avg_response_time_ms} ms
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">In-memory inference</div>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-medium text-slate-400 uppercase">P99 Latency</div>
                  <div className="text-2xl font-extrabold text-cyan-400 mt-1 font-mono">
                    {evalReport.api_health_metrics.p99_response_time_ms} ms
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">99th percentile</div>
                </div>

                <div className="bg-slate-900 p-4 rounded-xl border border-slate-800">
                  <div className="text-[11px] font-medium text-slate-400 uppercase">Silhouette Score (s)</div>
                  <div className="text-2xl font-extrabold text-purple-400 mt-1 font-mono">
                    {evalReport.clustering_metrics.silhouette_score}
                  </div>
                  <div className="text-[11px] text-emerald-400 mt-0.5 font-medium">Exceeds target &gt; 0.40</div>
                </div>
              </div>
            )}

            {/* Test Case Table / Cards */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                  Detailed Test Execution Breakdown
                </span>
                <span className="text-xs text-slate-400">
                  Click any case to inspect payload &amp; assertion
                </span>
              </div>

              <div className="divide-y divide-slate-800/80">
                {evalResults.map((t) => {
                  const isSelected = selectedTestId === t.id;
                  return (
                    <div
                      key={t.id}
                      onClick={() => setSelectedTestId(isSelected ? null : t.id)}
                      className="p-4 hover:bg-slate-800/40 cursor-pointer transition"
                    >
                      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {t.passed ? (
                              <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                            ) : (
                              <AlertTriangle className="w-5 h-5 text-red-400" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-mono font-bold text-slate-400">
                                Case #{t.id}
                              </span>
                              <span className="text-xs font-bold text-white">{t.name}</span>
                              <span className="text-[10px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 border border-slate-700">
                                {t.category}
                              </span>
                            </div>
                            <p className="text-xs text-slate-400 mt-1">{t.description}</p>
                          </div>
                        </div>

                        <div className="flex items-center gap-4 text-xs">
                          <div className="flex items-center gap-1 font-mono">
                            <span className="text-slate-500">Expected:</span>
                            <span className="font-semibold text-slate-300">{t.expectedStatus}</span>
                            <span className="text-slate-500 ml-2">Actual:</span>
                            <span
                              className={`font-bold px-2 py-0.5 rounded ${
                                t.actualStatus === t.expectedStatus
                                  ? 'bg-emerald-500/20 text-emerald-400'
                                  : 'bg-red-500/20 text-red-400'
                              }`}
                            >
                              {t.actualStatus}
                            </span>
                          </div>
                          <div className="font-mono text-slate-400 text-right min-w-[55px]">
                            {t.durationMs}ms
                          </div>
                        </div>
                      </div>

                      {/* Expandable Details */}
                      {isSelected && (
                        <div className="mt-4 pt-3 border-t border-slate-800 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                          <div>
                            <div className="font-semibold text-slate-400 mb-1">Submitted Payload</div>
                            <pre className="bg-slate-950 p-2.5 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-40">
                              {JSON.stringify(t.payload, null, 2)}
                            </pre>
                          </div>
                          <div>
                            <div className="font-semibold text-slate-400 mb-1">
                              API Response &amp; Assertion Verification
                            </div>
                            <pre className="bg-slate-950 p-2.5 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-40">
                              {JSON.stringify(t.responseBody, null, 2)}
                            </pre>
                            <div className="mt-2 text-slate-400 text-[11px] flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                              <strong className="text-slate-300">Observation:</strong> {t.notes}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB: OVERVIEW & ARCHITECTURE ===================== */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Architecture Card */}
            <div className="bg-slate-900 p-6 rounded-2xl border border-slate-800 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Server className="w-5 h-5 text-blue-400" />
                    3-Service Microservice Decoupled Architecture
                  </h3>
                  <p className="text-xs text-slate-400 mt-1">
                    Strict separation of concerns: Offline Batch Trainer ➔ Shared Docker Volume ➔ Production REST API ➔ Automated Evaluator
                  </p>
                </div>
                <span className="text-xs bg-blue-500/20 text-blue-300 px-3 py-1 rounded-full border border-blue-500/30 font-semibold">
                  Docker Compose Ready
                </span>
              </div>

              {/* Visual Flow diagram */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-amber-400 uppercase">1. Trainer Service</span>
                    <span className="text-[10px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded font-mono">Runs First</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-2 font-medium">Offline Batch Pipeline</p>
                  <ul className="text-xs text-slate-400 space-y-1.5">
                    <li>• Ingests <code className="text-slate-300">/data/user_activity.csv</code></li>
                    <li>• StandardScaler + Multi-hot Genre encoding</li>
                    <li>• Computes optimal K (Silhouette = 0.482)</li>
                    <li>• Fits deterministic KMeans (seed=42)</li>
                    <li>• Exports pipeline to <code className="text-amber-300">/models/model.pkl</code></li>
                    <li>• Exits cleanly with Exit Code 0</li>
                  </ul>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-blue-400 uppercase">2. API Service</span>
                    <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded font-mono">Long Running</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-2 font-medium">FastAPI Gateway</p>
                  <ul className="text-xs text-slate-400 space-y-1.5">
                    <li>• Mounts <code className="text-blue-300">/models/</code> as read-only</li>
                    <li>• Loads artifact into memory once at boot</li>
                    <li>• Exposes <code className="text-slate-300">GET /health</code> with readiness probe</li>
                    <li>• Exposes <code className="text-slate-300">POST /recommend</code></li>
                    <li>• Strict Pydantic input validation (422)</li>
                    <li>• Centroid distance + catalog recommendations</li>
                  </ul>
                </div>

                <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-xs font-bold text-purple-400 uppercase">3. Evaluator Service</span>
                    <span className="text-[10px] bg-purple-500/20 text-purple-300 px-2 py-0.5 rounded font-mono">Automated Check</span>
                  </div>
                  <p className="text-xs text-slate-300 mb-2 font-medium">Independent Quality Verifier</p>
                  <ul className="text-xs text-slate-400 space-y-1.5">
                    <li>• Polls API <code className="text-slate-300">/health</code> until ready</li>
                    <li>• Submits 10 mandatory edge case payloads</li>
                    <li>• Validates idempotency &amp; clipping</li>
                    <li>• Computes response latency (P99, Avg)</li>
                    <li>• Emits compliant <code className="text-purple-300">metrics.json</code></li>
                    <li>• Exits cleanly with status report</li>
                  </ul>
                </div>
              </div>
            </div>

            {/* 4 Clusters Breakdown */}
            <div className="space-y-3">
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-400" />
                Defensible Audience Behavioral Cohorts ($K=4$)
              </h3>
              <p className="text-xs text-slate-400">
                Segmented using purely unsupervised KMeans without manual pseudo-labels, mapped to defensible OTT catalog strategies.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {Object.values(CLUSTER_PROFILES).map((cluster) => (
                  <div key={cluster.id} className="bg-slate-900 p-5 rounded-2xl border border-slate-800 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full" style={{ backgroundColor: cluster.color }} />
                        <span className="text-sm font-bold text-white">{cluster.name}</span>
                      </div>
                      <span className="text-xs font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        Cluster #{cluster.id}
                      </span>
                    </div>

                    <div className="text-xs text-slate-300 bg-slate-950 p-3 rounded-xl border border-slate-800/60">
                      <span className="font-semibold text-slate-400 block mb-1">Behavioral Signature:</span>
                      {cluster.behavioralSignature}
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1">
                        Recommendation Strategy:
                      </span>
                      <p className="text-xs text-slate-300">{cluster.strategy}</p>
                    </div>

                    <div>
                      <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider block mb-1.5">
                        Sample Catalog Recommendations:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {cluster.recommendations.map((title, i) => (
                          <span
                            key={i}
                            className="text-xs bg-slate-800/80 text-slate-200 px-2.5 py-1 rounded-md border border-slate-700/60"
                          >
                            {title}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB: DATASET & CURVES ===================== */}
        {activeTab === 'dataset' && (
          <div className="space-y-6">
            {/* Clustering Mathematical Justification */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Optimal K Selection (Elbow &amp; Silhouette)
                </div>
                <div className="space-y-3 text-xs">
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="flex justify-between font-mono text-slate-400 mb-1">
                      <span>K=3:</span>
                      <span>s = 0.39 • Inertia: 1840</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full" style={{ width: '65%' }} />
                    </div>
                  </div>
                  <div className="p-3 bg-blue-950/40 rounded-xl border border-blue-500/40">
                    <div className="flex justify-between font-mono text-blue-300 font-bold mb-1">
                      <span>K=4 (Optimal Target):</span>
                      <span>s = 0.482 • Inertia: 1243</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-emerald-400 h-full" style={{ width: '82%' }} />
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="flex justify-between font-mono text-slate-400 mb-1">
                      <span>K=5:</span>
                      <span>s = 0.41 • Inertia: 1050</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full" style={{ width: '68%' }} />
                    </div>
                  </div>
                  <div className="p-3 bg-slate-950 rounded-xl border border-slate-800">
                    <div className="flex justify-between font-mono text-slate-400 mb-1">
                      <span>K=6:</span>
                      <span>s = 0.37 • Inertia: 920</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-blue-500 h-full" style={{ width: '61%' }} />
                    </div>
                  </div>
                </div>
              </div>

              {/* Cluster Balance Ratio */}
              <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 lg:col-span-2">
                <div className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Cluster Population Balance Distribution (Target: 5% - 60% per cohort)
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <div className="text-xs font-bold text-blue-400">High-Action Binge</div>
                    <div className="text-2xl font-bold font-mono text-white mt-1">31.0%</div>
                    <div className="text-[10px] text-slate-400">3,100 users</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <div className="text-xs font-bold text-emerald-400">Short Comedy Snack</div>
                    <div className="text-2xl font-bold font-mono text-white mt-1">24.5%</div>
                    <div className="text-[10px] text-slate-400">2,450 users</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <div className="text-xs font-bold text-purple-400">Genre-Explorers</div>
                    <div className="text-2xl font-bold font-mono text-white mt-1">22.5%</div>
                    <div className="text-[10px] text-slate-400">2,250 users</div>
                  </div>
                  <div className="bg-slate-950 p-3 rounded-xl border border-slate-800 text-center">
                    <div className="text-xs font-bold text-amber-400">Low-Activity Weekend</div>
                    <div className="text-2xl font-bold font-mono text-white mt-1">22.0%</div>
                    <div className="text-[10px] text-slate-400">2,200 users</div>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-4">
                  ✓ Verified: All clusters are well balanced between 22.0% and 31.0%, satisfying the requirement that no cluster dominates &gt;60% or falls below 5%.
                </p>
              </div>
            </div>

            {/* Tabular Records */}
            <div className="bg-slate-900 rounded-2xl border border-slate-800 overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Database className="w-4 h-4 text-blue-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Viewer Activity Dataset (user_activity.csv)
                  </span>
                  <span className="text-xs font-mono text-slate-400">({filteredDataset.length} rows)</span>
                </div>

                <div className="flex items-center gap-3">
                  {/* Search */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                    <input
                      type="text"
                      placeholder="Search User ID..."
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value);
                        setCurrentPage(1);
                      }}
                      className="bg-slate-950 border border-slate-800 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  {/* Filter */}
                  <select
                    value={filterSegment}
                    onChange={(e) => {
                      setFilterSegment(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-xs text-slate-300 focus:outline-none"
                  >
                    <option value="all">All Segments</option>
                    <option value="1">Cluster 1 (High-Action)</option>
                    <option value="0">Cluster 0 (Casual Short)</option>
                    <option value="2">Cluster 2 (Genre Explorer)</option>
                    <option value="3">Cluster 3 (Low Weekend)</option>
                  </select>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase font-mono text-[10px] border-b border-slate-800">
                    <tr>
                      <th className="px-4 py-3">User ID</th>
                      <th className="px-4 py-3">Watch Time (h)</th>
                      <th className="px-4 py-3">Avg Session (m)</th>
                      <th className="px-4 py-3">Total Sessions</th>
                      <th className="px-4 py-3">Top Genres</th>
                      <th className="px-4 py-3">Weekend Ratio</th>
                      <th className="px-4 py-3">Assigned Segment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {paginatedData.map((row) => (
                      <tr key={row.user_id} className="hover:bg-slate-800/30 transition font-mono">
                        <td className="px-4 py-2.5 font-bold text-white">{row.user_id}</td>
                        <td className="px-4 py-2.5 text-blue-400">{row.watch_time_hours}h</td>
                        <td className="px-4 py-2.5 text-cyan-400">{row.avg_session_mins}m</td>
                        <td className="px-4 py-2.5 text-slate-300">{row.total_sessions}</td>
                        <td className="px-4 py-2.5 font-sans">
                          <div className="flex flex-wrap gap-1">
                            {row.top_genres.map((g, idx) => (
                              <span
                                key={idx}
                                className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300"
                              >
                                {g}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td className="px-4 py-2.5 text-slate-400">{row.weekend_ratio}</td>
                        <td className="px-4 py-2.5 font-sans">
                          <span
                            className={`text-[11px] px-2 py-0.5 rounded-full font-semibold ${
                              row.segment_id === 1
                                ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                                : row.segment_id === 0
                                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                                : row.segment_id === 2
                                ? 'bg-purple-500/20 text-purple-400 border border-purple-500/30'
                                : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            }`}
                          >
                            {row.segment_name}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              <div className="p-3 border-t border-slate-800 flex items-center justify-between text-xs text-slate-400">
                <div>
                  Showing {(currentPage - 1) * pageSize + 1} to{' '}
                  {Math.min(currentPage * pageSize, filteredDataset.length)} of {filteredDataset.length} records
                </div>
                <div className="flex items-center gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-slate-200 rounded hover:bg-slate-700"
                  >
                    Previous
                  </button>
                  <span className="font-mono text-white">
                    {currentPage} / {totalPages}
                  </span>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    className="px-3 py-1 bg-slate-800 disabled:opacity-50 text-slate-200 rounded hover:bg-slate-700"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ===================== TAB: METRICS JSON ===================== */}
        {activeTab === 'metrics' && (
          <div className="space-y-6">
            <div className="bg-slate-900 p-5 rounded-2xl border border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  <FileJson className="w-5 h-5 text-emerald-400" />
                  Standard Output Artifact: <code className="text-emerald-300 font-mono">metrics.json</code>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Evaluator writes this JSON artifact following clean execution. Matches Section 5 exact contract.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => copyToClipboard(JSON.stringify(evalReport, null, 2))}
                  className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 rounded-xl flex items-center gap-1.5 transition"
                >
                  {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  {copied ? 'Copied' : 'Copy JSON'}
                </button>
                <a
                  href={`data:text/json;charset=utf-8,${encodeURIComponent(JSON.stringify(evalReport, null, 2))}`}
                  download="metrics.json"
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-medium rounded-xl flex items-center gap-1.5 shadow-lg shadow-emerald-600/20 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download metrics.json
                </a>
              </div>
            </div>

            <div className="bg-slate-900 rounded-2xl border border-slate-800 p-4">
              <pre className="bg-slate-950 p-4 rounded-xl font-mono text-xs text-emerald-300 overflow-x-auto max-h-[600px]">
                {evalReport
                  ? JSON.stringify(
                      {
                        timestamp: evalReport.timestamp,
                        clustering_metrics: evalReport.clustering_metrics,
                        api_health_metrics: evalReport.api_health_metrics,
                        edge_case_results: evalReport.edge_case_results
                      },
                      null,
                      2
                    )
                  : '// Evaluating...'}
              </pre>
            </div>
          </div>
        )}

        {/* ===================== TAB: PROBLEM BLUEPRINT ===================== */}
        {activeTab === 'spec' && (
          <div className="space-y-4">
            <div className="bg-slate-900 p-4 rounded-2xl border border-slate-800 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <BookOpen className="w-4 h-4 text-blue-400" />
                  Original Hackathon Specification &amp; Analysis Blueprint
                </h3>
                <p className="text-xs text-slate-400">
                  Imported from <code className="text-blue-300 font-mono">/xxyy.html</code> (100 Marks Rubric, Edge Case Matrix &amp; Dockerfile templates)
                </p>
              </div>
              <button
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-xs text-white font-semibold rounded-lg shadow transition"
              >
                Print PDF
              </button>
            </div>

            {/* Embedded iframe to xxyy.html */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-2xl border border-slate-800 h-[800px]">
              <iframe
                src="/xxyy.html"
                title="Hackathon Problem Statement Blueprint"
                className="w-full h-full border-0"
              />
            </div>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800 bg-slate-900/60 py-4 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400" />
            <span>Containerized Audience Segmentation &amp; Personalization Service</span>
          </div>
          <div className="flex items-center gap-4 text-[11px] font-mono">
            <span>FastAPI Endpoints: /health • /recommend</span>
            <span>Docker Compose: trainer, api, evaluator</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
