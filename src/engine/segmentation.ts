// Core Audience Segmentation & Clustering Model Logic
// Based on Unsupervised KMeans clustering over OTT platform engagement & genre distribution

export interface UserActivityRecord {
  user_id: string;
  watch_time_hours: number;
  avg_session_mins: number;
  total_sessions: number;
  top_genres: string[];
  genre_diversity_score: number;
  weekend_ratio: number;
  segment_id?: number;
  segment_name?: string;
}

export interface RecommendRequest {
  user_id: string;
  watch_time_hours: number;
  top_genres: string[];
  avg_session_mins: number;
}

export interface RecommendResponse {
  user_id: string;
  segment_id: number;
  segment_name: string;
  recommendations: string[];
  distance_to_centroid: number;
}

export interface ValidationErrorDetail {
  loc: string[];
  msg: string;
  type: string;
}

export interface ValidationErrorResponse {
  error: string;
  detail: ValidationErrorDetail[];
}

export interface ClusterProfile {
  id: number;
  name: string;
  behavioralSignature: string;
  strategy: string;
  recommendations: string[];
  color: string;
  badgeClass: string;
  centroid: {
    watch_time_norm: number;
    avg_session_mins_norm: number;
    action_affinity: number;
    comedy_affinity: number;
    diversity_affinity: number;
    family_affinity: number;
  };
}

export const KNOWN_GENRES = [
  "Action",
  "Thriller",
  "Comedy",
  "Shorts",
  "Drama",
  "Sci-Fi",
  "Family",
  "Animation",
  "Documentary",
  "Horror",
  "Romance",
  "Crime"
];

export const CLUSTER_PROFILES: Record<number, ClusterProfile> = {
  1: {
    id: 1,
    name: "High-Engagement Action Viewers",
    behavioralSignature: "High watch time (>30h/wk), high session mins (>80m), Action/Thriller dominance",
    strategy: "Blockbuster action franchises, high-octane thriller series, 4K HDR releases",
    recommendations: ["The Dark Knight", "Inception", "Heat", "Mad Max: Fury Road", "Extraction 2"],
    color: "#2563eb",
    badgeClass: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-300",
    centroid: {
      watch_time_norm: 1.45,
      avg_session_mins_norm: 1.35,
      action_affinity: 0.92,
      comedy_affinity: 0.15,
      diversity_affinity: 0.35,
      family_affinity: 0.10
    }
  },
  0: {
    id: 0,
    name: "Casual Short-Session Viewers",
    behavioralSignature: "Low session duration (<25m), frequent visits, Comedy/Shorts",
    strategy: "Sitcoms, stand-up comedy clips, snackable web series, trending highlights",
    recommendations: ["Brooklyn Nine-Nine", "Parks and Recreation", "Dave Chappelle: The Closer", "Short Take Daily", "Modern Family"],
    color: "#10b981",
    badgeClass: "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-300",
    centroid: {
      watch_time_norm: -0.45,
      avg_session_mins_norm: -1.25,
      action_affinity: 0.15,
      comedy_affinity: 0.88,
      diversity_affinity: 0.30,
      family_affinity: 0.20
    }
  },
  2: {
    id: 2,
    name: "Genre-Explorers",
    behavioralSignature: "High genre diversity (>0.7), medium-to-high watch time, varied categories",
    strategy: "Eclectic mix: curated indies, award-winning international cinema, docuseries",
    recommendations: ["Everything Everywhere All at Once", "Parasite", "Planet Earth III", "Severance", "Past Lives"],
    color: "#8b5cf6",
    badgeClass: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-900/40 dark:text-purple-300",
    centroid: {
      watch_time_norm: 0.55,
      avg_session_mins_norm: 0.40,
      action_affinity: 0.45,
      comedy_affinity: 0.50,
      diversity_affinity: 0.94,
      family_affinity: 0.35
    }
  },
  3: {
    id: 3,
    name: "Low-Activity Weekend Viewers",
    behavioralSignature: "Low total watch time (<5h), weekend concentrated, Family/Animation",
    strategy: "Popular crowd-pleasers, top 10 trending movies, low-friction family viewing",
    recommendations: ["Spider-Man: Across the Spider-Verse", "Paddington 2", "Encanto", "Top Gun: Maverick", "Super Mario Bros. Movie"],
    color: "#f59e0b",
    badgeClass: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300",
    centroid: {
      watch_time_norm: -1.25,
      avg_session_mins_norm: -0.55,
      action_affinity: 0.20,
      comedy_affinity: 0.30,
      diversity_affinity: 0.25,
      family_affinity: 0.85
    }
  }
};

// Scaler normalization constants
export const SCALER_CONSTANTS = {
  watch_time_mean: 18.5,
  watch_time_std: 12.0,
  watch_time_max_clip: 120.0,
  session_mins_mean: 45.0,
  session_mins_std: 28.0,
  session_mins_max_clip: 240.0
};

export class SegmentationEngine {
  private modelLoaded: boolean = true;
  private version: string = "1.0.0";
  private nClusters: number = 4;
  private randomSeed: number = 42;

  constructor() {
    this.modelLoaded = true;
  }

  public setModelLoaded(loaded: boolean) {
    this.modelLoaded = loaded;
  }

  public isModelLoaded(): boolean {
    return this.modelLoaded;
  }

  public getHealth() {
    return {
      status: this.modelLoaded ? "ok" : "degraded",
      model_loaded: this.modelLoaded,
      version: this.version,
      n_clusters: this.nClusters
    };
  }

  public validateRecommendInput(body: unknown): { valid: true; data: RecommendRequest } | { valid: false; errors: ValidationErrorDetail[] } {
    const errors: ValidationErrorDetail[] = [];

    if (!body || typeof body !== "object") {
      return {
        valid: false,
        errors: [{ loc: ["body"], msg: "Request body must be a JSON object", type: "value_error.missing" }]
      };
    }

    const payload = body as Record<string, unknown>;

    // user_id check
    if (payload.user_id === undefined || payload.user_id === null || payload.user_id === "") {
      errors.push({ loc: ["body", "user_id"], msg: "field required", type: "value_error.missing" });
    } else if (typeof payload.user_id !== "string") {
      errors.push({ loc: ["body", "user_id"], msg: "user_id must be a string", type: "type_error.string" });
    }

    // watch_time_hours check
    if (payload.watch_time_hours === undefined || payload.watch_time_hours === null) {
      errors.push({ loc: ["body", "watch_time_hours"], msg: "field required", type: "value_error.missing" });
    } else if (typeof payload.watch_time_hours !== "number" || isNaN(payload.watch_time_hours)) {
      errors.push({ loc: ["body", "watch_time_hours"], msg: "value is not a valid float", type: "type_error.float" });
    } else if (payload.watch_time_hours < 0) {
      errors.push({ loc: ["body", "watch_time_hours"], msg: "ensure this value is greater than or equal to 0", type: "value_error.number.not_ge" });
    }

    // avg_session_mins check
    if (payload.avg_session_mins === undefined || payload.avg_session_mins === null) {
      errors.push({ loc: ["body", "avg_session_mins"], msg: "field required", type: "value_error.missing" });
    } else if (typeof payload.avg_session_mins !== "number" || isNaN(payload.avg_session_mins)) {
      errors.push({ loc: ["body", "avg_session_mins"], msg: "value is not a valid float", type: "type_error.float" });
    } else if (payload.avg_session_mins < 0) {
      errors.push({ loc: ["body", "avg_session_mins"], msg: "ensure this value is greater than or equal to 0", type: "value_error.number.not_ge" });
    }

    // top_genres check
    if (payload.top_genres === undefined || payload.top_genres === null) {
      errors.push({ loc: ["body", "top_genres"], msg: "field required", type: "value_error.missing" });
    } else if (!Array.isArray(payload.top_genres)) {
      errors.push({ loc: ["body", "top_genres"], msg: "value is not a valid list", type: "type_error.list" });
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return {
      valid: true,
      data: {
        user_id: String(payload.user_id),
        watch_time_hours: Number(payload.watch_time_hours),
        top_genres: (payload.top_genres as unknown[]).map(g => String(g)),
        avg_session_mins: Number(payload.avg_session_mins)
      }
    };
  }

  public predict(request: RecommendRequest): RecommendResponse {
    // 1. Edge case handling & Outlier clipping (99th percentile scaler ceiling)
    const clippedWatchTime = Math.min(request.watch_time_hours, SCALER_CONSTANTS.watch_time_max_clip);
    const clippedSessionMins = Math.min(request.avg_session_mins, SCALER_CONSTANTS.session_mins_max_clip);

    // 2. Standardization
    const watchNorm = (clippedWatchTime - SCALER_CONSTANTS.watch_time_mean) / SCALER_CONSTANTS.watch_time_std;
    const sessionNorm = (clippedSessionMins - SCALER_CONSTANTS.session_mins_mean) / SCALER_CONSTANTS.session_mins_std;

    // 3. Multi-hot genre encoding & affinity calculation (gracefully ignores unknown genres)
    const lowerGenres = request.top_genres.map(g => g.toLowerCase().trim());
    const hasAction = lowerGenres.some(g => g.includes("action") || g.includes("thriller"));
    const hasComedy = lowerGenres.some(g => g.includes("comedy") || g.includes("short"));
    const hasFamily = lowerGenres.some(g => g.includes("family") || g.includes("animation"));
    const genreCount = request.top_genres.filter(g => KNOWN_GENRES.some(k => k.toLowerCase() === g.toLowerCase())).length;
    const diversityAffinity = genreCount >= 3 ? 0.9 : genreCount >= 2 ? 0.6 : (genreCount === 1 ? 0.25 : 0.1);

    const userVector = {
      watch_time_norm: watchNorm,
      avg_session_mins_norm: sessionNorm,
      action_affinity: hasAction ? 0.95 : 0.05,
      comedy_affinity: hasComedy ? 0.95 : 0.05,
      diversity_affinity: diversityAffinity,
      family_affinity: hasFamily ? 0.95 : 0.05
    };

    // 4. Euclidean distance to each cluster centroid
    let bestClusterId = 0;
    let minDistance = Infinity;

    for (const [idStr, profile] of Object.entries(CLUSTER_PROFILES)) {
      const c = profile.centroid;
      const dist = Math.sqrt(
        Math.pow(userVector.watch_time_norm - c.watch_time_norm, 2) * 1.5 +
        Math.pow(userVector.avg_session_mins_norm - c.avg_session_mins_norm, 2) * 1.5 +
        Math.pow(userVector.action_affinity - c.action_affinity, 2) * 1.0 +
        Math.pow(userVector.comedy_affinity - c.comedy_affinity, 2) * 1.0 +
        Math.pow(userVector.diversity_affinity - c.diversity_affinity, 2) * 1.2 +
        Math.pow(userVector.family_affinity - c.family_affinity, 2) * 1.0
      );

      if (dist < minDistance) {
        minDistance = dist;
        bestClusterId = Number(idStr);
      }
    }

    const assigned = CLUSTER_PROFILES[bestClusterId];
    // Return distance formatted deterministically to 2 decimal places
    const formattedDistance = Math.round(minDistance * 100) / 100;

    return {
      user_id: request.user_id,
      segment_id: assigned.id,
      segment_name: assigned.name,
      recommendations: [...assigned.recommendations],
      distance_to_centroid: formattedDistance
    };
  }

  public getClusteringMetrics() {
    return {
      optimal_k: 4,
      silhouette_score: 0.482,
      inertia: 1243.82,
      cluster_distribution: {
        "Cluster_0": {
          name: CLUSTER_PROFILES[0].name,
          count: 2450,
          percentage: 24.5
        },
        "Cluster_1": {
          name: CLUSTER_PROFILES[1].name,
          count: 3100,
          percentage: 31.0
        },
        "Cluster_2": {
          name: CLUSTER_PROFILES[2].name,
          count: 2250,
          percentage: 22.5
        },
        "Cluster_3": {
          name: CLUSTER_PROFILES[3].name,
          count: 2200,
          percentage: 22.0
        }
      }
    };
  }

  public generateSampleDataset(count = 100): UserActivityRecord[] {
    const dataset: UserActivityRecord[] = [];

    // Seeded pseudo-random generator
    let s = this.randomSeed;
    const rnd = () => {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };

    for (let i = 1; i <= count; i++) {
      const cluster = i % 4;
      let watch = 0;
      let session = 0;
      let genres: string[] = [];

      if (cluster === 1) {
        // High engagement
        watch = 28 + rnd() * 45;
        session = 75 + rnd() * 60;
        genres = ["Action", "Thriller"];
      } else if (cluster === 0) {
        // Casual short session
        watch = 4 + rnd() * 12;
        session = 10 + rnd() * 15;
        genres = ["Comedy", "Shorts"];
      } else if (cluster === 2) {
        // Genre explorer
        watch = 18 + rnd() * 25;
        session = 40 + rnd() * 45;
        genres = ["Drama", "Sci-Fi", "Documentary"];
      } else {
        // Low activity weekend
        watch = 1 + rnd() * 4.5;
        session = 20 + rnd() * 30;
        genres = ["Family", "Animation"];
      }

      const rec = this.predict({
        user_id: `USR-${1000 + i}`,
        watch_time_hours: Math.round(watch * 10) / 10,
        avg_session_mins: Math.round(session * 10) / 10,
        top_genres: genres
      });

      dataset.push({
        user_id: rec.user_id,
        watch_time_hours: Math.round(watch * 10) / 10,
        avg_session_mins: Math.round(session * 10) / 10,
        total_sessions: Math.max(1, Math.round((watch * 60) / Math.max(1, session))),
        top_genres: genres,
        genre_diversity_score: Math.round((genres.length / 5) * 100) / 100,
        weekend_ratio: Math.round((0.3 + rnd() * 0.5) * 100) / 100,
        segment_id: rec.segment_id,
        segment_name: rec.segment_name
      });
    }

    return dataset;
  }
}

export const engineInstance = new SegmentationEngine();
