/**
 * GEOMETRY DASH COGNITIVE ANALYZER v8.3-PRO
 * Synchronized with Python reference implementation v2.6
 * Fixes: Route overlap, completion threshold, virtual run count, 
 *        attempt estimation, decimal formatting, heatmap tier sync
 * ============================================================
 */

const RANGE_PATTERN = /(?:^|\s)(\d{1,3})\s*%?\s*-\s*(\d{1,3})\s*%?\s*x\s*(\d+)(?=[\s,]|$)/gi;
const SINGLE_PATTERN = /(?:^|\s)(\d{1,3})\s*%?\s*x\s*(\d+)(?=[\s,]|$)/gi;
const BEAT_PATTERN = /(?:beat|beats|beaten|completed|cleared?|clear|won)\s*x\s*(\d+)/gi;
const COMPLETION_LABEL_PATTERN = /(?:completion(?:s)?|clear(?:s)?|beaten|beat(?:s)?|completed|won)\s*:\s*(?:x\s*)?(\d+)(?=[\s,]|$)(?!\s*%)/gi;
const COMPLETION_SECTION_PREFIX_PATTERN = /^\s*(?:completion(?:s)?|clear(?:s)?|cleared|beaten|beat(?:s)?|completed|won)\s*:/i;
const COMPLETION_100_PATTERN = /(?:^|\s)100\s*%?\s*x\s*(\d+)(?=[\s,]|$)/gi;

const MAX_PATHWAYS = 5000;
const MAX_BFS_ITERATIONS = 100000;
const BFS_TIMEOUT_MS = 2000;
const MAX_OPTS_PER_NODE = 12;

const DIFFICULTY_MATRIX = {
    "auto": 0.2, "easy": 0.4, "normal": 0.6, "hard": 0.8,
    "harder": 1.0, "insane": 1.2, "easy demon": 1.5,
    "medium demon": 2.0, "hard demon": 3.0,
    "insane demon": 4.5, "extreme demon": 7.0
};

const WEIGHT_STATUS = {
    FINAL: "final",
    PROVISIONAL: "provisional",
    FALLBACK: "fallback"
};

const WEIGHT_REGISTRY = {
    "completionProbability.bestFrom0": { value: 0.217, baseline: 0.20, status: WEIGHT_STATUS.PROVISIONAL },
    "completionProbability.nervesControl": { value: 0.273, baseline: 0.25, status: WEIGHT_STATUS.PROVISIONAL },
    "completionProbability.proofScore": { value: 0.25, baseline: 0.20, status: WEIGHT_STATUS.PROVISIONAL },
    "completionProbability.consistencyIndex": { value: 0.080, baseline: 0.10, status: WEIGHT_STATUS.PROVISIONAL },
    "completionProbability.coverage": { value: 0.036, baseline: 0.05, status: WEIGHT_STATUS.PROVISIONAL },
    "skillScore.peakSkill": { value: 0.270, baseline: 0.30, status: WEIGHT_STATUS.PROVISIONAL },
    "skillScore.consistentSkill": { value: 0.202, baseline: 0.20, status: WEIGHT_STATUS.FINAL },
    "skillScore.midSkill": { value: 0.224, baseline: 0.20, status: WEIGHT_STATUS.FINAL },
    "skillScore.floorSkill": { value: 0.204, baseline: 0.20, status: WEIGHT_STATUS.FINAL }
};

function getWeight(name, datasetStats) {
    const weight = WEIGHT_REGISTRY[name];
    if (!weight) return 0;

    if (weight.status === WEIGHT_STATUS.FINAL) return weight.value;
    if (weight.status === WEIGHT_STATUS.FALLBACK) return weight.value;

    const totalLevels = safeNum(datasetStats?.totalLevels, 0);
    if (totalLevels < 20) return weight.baseline;
    return weight.value;
}

function getEffectiveWeight(name, featureValues, datasetStats) {
    const weight = WEIGHT_REGISTRY[name];
    if (!weight) return 0;
    const values = (featureValues || []).map(Number).filter(v => isFinite(v));
    const hasVariance = values.length >= 2 && (Math.max(...values) - Math.min(...values)) > 0.1 && (new Set(values)).size > 1;
    if (!hasVariance) return weight.baseline;
    return getWeight(name, datasetStats);
}

// ============================================================================
// PARSING
// ============================================================================

function parseRunsSegment(blob) {
    const entries = [];
    const cleaned = blob
        .toLowerCase()
        .replace(/[–—]/g, "-")
        .replace(/[^0-9xto\-\s%]/g, "")
        .replace(/\s*to\s*/g, "-");
    let match;
    RANGE_PATTERN.lastIndex = 0;
    while ((match = RANGE_PATTERN.exec(cleaned)) !== null) {
        const start = parseInt(match[1], 10);
        const end = parseInt(match[2], 10);
        const count = parseInt(match[3], 10);
        if (start > 100 || end > 100) continue;
        if (end < start) continue;
        entries.push({ type: "run", start, end, count, source: "startpos" });
    }
    return entries;
}

function parseFrom0Segment(blob) {
    const entries = [];
    const cleaned = blob
        .toLowerCase()
        .replace(/[–—]/g, "-")
        .replace(/[^0-9xto\-\s%]/g, "")
        .replace(/\s*to\s*/g, "-");
    let match;
    SINGLE_PATTERN.lastIndex = 0;
    while ((match = SINGLE_PATTERN.exec(cleaned)) !== null) {
        const percent = parseInt(match[1], 10);
        const count = parseInt(match[2], 10);
        if (percent > 100) continue;
        entries.push({ type: "from0", percent, count, source: "from0" });
    }
    return entries;
}

function parseCompletionSegment(blob, allowPercent100) {
    const entries = [];
    const text = (blob || "").toLowerCase();
    let match;
    BEAT_PATTERN.lastIndex = 0;
    while ((match = BEAT_PATTERN.exec(text)) !== null) {
        const count = parseInt(match[1], 10);
        entries.push({ type: "completion", start: 0, end: 100, count, length: 100, source: "explicit_completion" });
    }
    COMPLETION_LABEL_PATTERN.lastIndex = 0;
    while ((match = COMPLETION_LABEL_PATTERN.exec(text)) !== null) {
        const count = parseInt(match[1], 10);
        entries.push({ type: "completion", start: 0, end: 100, count, length: 100, source: "explicit_completion" });
    }
    if (allowPercent100) {
        COMPLETION_100_PATTERN.lastIndex = 0;
        while ((match = COMPLETION_100_PATTERN.exec(text)) !== null) {
            const count = parseInt(match[1], 10);
            entries.push({ type: "completion", start: 0, end: 100, count, length: 100, source: "explicit_completion" });
        }
    }
    return entries;
}

function validateInput(text) {
    return text && text.trim().length > 0;
}

function parseMetricsLine(line) {
    const normalized = (line || "").trim();
    if (!normalized) return [];
    const lower = normalized.toLowerCase();

    if (COMPLETION_SECTION_PREFIX_PATTERN.test(lower)) {
        const completions = parseCompletionSegment(normalized, true);
        return completions.length > 0 ? completions : [{ type: "unparseable", raw: normalized, count: 0, source: "unparseable" }];
    }

    const completionTokens = parseCompletionSegment(normalized, false);
    if (completionTokens.length > 0) return completionTokens;

    const runEntries = parseRunsSegment(normalized);
    if (runEntries.length > 0) return runEntries;

    const from0Entries = parseFrom0Segment(normalized);
    if (from0Entries.length > 0) return from0Entries;

    return [{ type: "unparseable", raw: normalized, count: 0, source: "unparseable" }];
}

function countRawAttemptsFromText(text) {
    if (!text) return 0;
    const lines = text.split('\n');
    let total = 0;
    for (const line of lines) {
        const entries = parseMetricsLine(line);
        for (const e of entries) total += e.count;
    }
    return total;
}

function computeAttemptTotals(entries) {
    let total = 0, from0Deaths = 0, startpos = 0, completions = 0;
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        total += e.count;
        if (e.source === "from0" || e.type === "from0") from0Deaths += e.count;
        else if (e.source === "explicit_completion" || e.type === "completion") completions += e.count;
        else if (e.source === "startpos" || e.type === "run") startpos += e.count;
    }
    return { totalAttempts: total, from0Deaths, startposAttempts: startpos, completions, totalFrom0Attempts: from0Deaths + completions };
}

// ============================================================================
// RUN BUILDING — Synchronized with Python build_runs()
// ============================================================================

function buildRuns(entries) {
    const from0ByPercent = new Map();
    const startposByKey = new Map();
    let completionCount = 0;

    for (const raw of entries || []) {
        const e = raw || {};
        const count = Math.floor(safeNum(e.count, 0));
        if (count <= 0) continue;

        if (e.type === "from0" && e.source === "from0") {
            const percent = Math.floor(safeNum(e.percent, -1));
            if (percent < 0 || percent > 100) continue;
            from0ByPercent.set(percent, (from0ByPercent.get(percent) || 0) + count);
            continue;
        }

        if (e.type === "run" && e.source === "startpos") {
            const start = Math.floor(safeNum(e.start, -1));
            const end = Math.floor(safeNum(e.end, -1));
            if (start < 0 || end < 0 || start > 100 || end > 100) continue;
            if (end < start) continue;
            const key = `${start}_${end}`;
            startposByKey.set(key, (startposByKey.get(key) || 0) + count);
            continue;
        }

        if (e.type === "completion" && e.source === "explicit_completion") {
            completionCount += count;
            continue;
        }
    }

    const from0Runs = Array.from(from0ByPercent.entries())
        .sort((a, b) => a[0] - b[0])
        .map(([percent, count]) => ({ type: "from0", percent, count, source: "from0" }));

    const from0Freq = {};
    for (const r of from0Runs) from0Freq[r.percent] = r.count;

    const startposRuns = Array.from(startposByKey.entries()).map(([key, count]) => {
        const [startStr, endStr] = key.split("_");
        const start = parseInt(startStr, 10);
        const end = parseInt(endStr, 10);
        return { type: "run", start, end, length: end - start, count, source: "startpos" };
    });

    const completionRuns = completionCount > 0
        ? [{ type: "completion", start: 0, end: 100, length: 100, count: completionCount, source: "explicit_completion" }]
        : [];

    const bestFrom0 = completionCount > 0
        ? 100
        : (from0Runs.length > 0 ? Math.max(...from0Runs.map(r => r.percent)) : 0);

    const from0AsSegments = from0Runs
        .filter(r => r.percent > 0)
        .map(r => ({ type: "from0_run", start: 0, end: r.percent, length: r.percent, count: r.count, percent: r.percent, source: "from0" }));

    const preferredRuns = startposRuns.length > 0 ? startposRuns : from0AsSegments;
    const actualRunsSorted = preferredRuns.slice().sort((a, b) => (b.length * Math.log(b.count + 1)) - (a.length * Math.log(a.count + 1)));
    const actualRunsByLength = preferredRuns.slice().sort((a, b) => b.length - a.length);

    const totalStartposAttempts = startposRuns.reduce((s, r) => s + safeNum(r.count), 0);

    return {
        bestFrom0,
        completions: completionCount,
        actualRuns: startposRuns,
        from0Runs,
        startposRuns,
        completionRuns,
        actualRunsSorted,
        actualRunsByLength,
        from0Freq,
        totalStartposAttempts,
        allRuns: ([]).concat(from0Runs, startposRuns, completionRuns),
        sourceCounts: {
            from0: from0Runs.reduce((s, r) => s + safeNum(r.count), 0),
            startpos: startposRuns.reduce((s, r) => s + safeNum(r.count), 0),
            explicit_completion: completionCount
        }
    };
}

// ============================================================================
// PATHS — Synchronized BFS v3.1 (Python-matched)
// ============================================================================

function canConnect(prevEnd, nextStart) {
    return nextStart <= prevEnd;
}

function pathCoversFullLevel(path) {
    if (!path || path.length === 0) return false;
    const sorted = path.slice().sort((a, b) => a.start - b.start);
    if (sorted[0].start > 0) return false;
    
    let currentEnd = sorted[0].end;
    for (let i = 1; i < sorted.length; i++) {
        const seg = sorted[i];
        if (seg.start > currentEnd) return false;
        currentEnd = Math.max(currentEnd, seg.end);
    }
    return currentEnd >= 100;
}

function analyzePaths(actualRuns, bestFrom0, passRateChunks) {
    // Direct match to Python: routing_pool = list(actual_runs)
    const routingPool = [];
    const seenKeys = new Set();
    
    for (const r of (actualRuns || [])) {
        if (!r || r.start === undefined || r.end === undefined) continue;
        const start = safeNum(r.start);
        const end = safeNum(r.end);
        if (start < 0 || end < 0 || start > 100 || end > 100) continue;
        if (end <= start) continue;
        // Include ALL runs — no minimum threshold (Python has no threshold)
        routingPool.push({
            type: r.type || "run",
            start, end,
            length: safeNum(r.length, end - start),
            count: safeNum(r.count, 1)
        });
    }
    
    // Python: virtual_from0 with count=1, end=best_from_0
    if (bestFrom0 > 0) {
        const hasExactZeroToBest = routingPool.some(r => r.start === 0 && r.end === bestFrom0);
        if (!hasExactZeroToBest) {
            routingPool.push({
                type: "virtual",
                start: 0,
                end: bestFrom0,
                length: bestFrom0,
                count: 1  // MATCH PYTHON: count is 1, not calculated
            });
        }
    }
    
    if (routingPool.length === 0) {
        return {
            filteredPaths: [], pathsByLength: {}, totalPathLengths: 0,
            allPaths: [], totalCompletionRoutes: 0, totalPathCount: 0
        };
    }
    
    // BFS — exact match to Python
    const queue = [[0, []]];  // [current_pct, current_path]
    const uniquePaths = [];
    
    let head = 0;
    while (head < queue.length && uniquePaths.length < MAX_PATHWAYS) {
        const [currentPct, currentPath] = queue[head++];
        
        if (currentPct >= 100) {
            uniquePaths.push(currentPath);
            continue;
        }
        
        // Python: options = [r for r in routing_pool if r["start"] <= current_pct and r["end"] > current_pct]
        const options = routingPool.filter(r => r.start <= currentPct && r.end > currentPct);
        // Python: options.sort(key=lambda x: x["end"], reverse=True)
        options.sort((a, b) => b.end - a.end);
        
        const currentSignatures = new Set(currentPath.map(r => `${r.start}_${r.end}`));
        
        // Python: for run in options[:12]
        for (let i = 0; i < Math.min(options.length, MAX_OPTS_PER_NODE); i++) {
            const run = options[i];
            const signature = `${run.start}_${run.end}`;
            if (!currentSignatures.has(signature)) {
                queue.push([run.end, [...currentPath, run]]);
            }
        }
    }
    
    // Python: unique_paths.sort(key=len)
    uniquePaths.sort((a, b) => a.length - b.length);
    
    // Python: Filter duplicate path signatures
    const seenPaths = new Set();
    const filteredPaths = [];
    for (const p of uniquePaths) {
        const signature = p.map(r => `${r.start}_${r.end}`).join("|");
        if (!seenPaths.has(signature)) {
            seenPaths.add(signature);
            filteredPaths.push(p);
        }
    }
    
    // Build pathsByLength like Python
    const pathsByLength = {};
    let totalPathLengths = 0;
    for (const p of filteredPaths) {
        const l = p.length;
        totalPathLengths += l;
        if (!pathsByLength[l]) pathsByLength[l] = [];
        pathsByLength[l].push(p);
    }
    
    // Score routes for ranking (enhancement over Python for better UX)
    const scoreRoute = function(path) {
        if (!passRateChunks || passRateChunks.length === 0) {
            let score = 0;
            for (const seg of path) score += seg.length * Math.log(seg.count + 1);
            return score;
        }
        let accumulated = 1.0;
        for (const seg of path) {
            const startBlock = Math.floor(seg.start / 10);
            const endBlock = Math.min(9, Math.floor((seg.end - 1) / 10));
            let blockRateSum = 0, blockCount = 0;
            for (let b = startBlock; b <= endBlock; b++) {
                const chunk = passRateChunks[b];
                if (chunk && chunk.passRate !== undefined) {
                    blockRateSum += chunk.passRate / 100;
                    blockCount++;
                }
            }
            const runEfficiency = blockCount > 0 ? blockRateSum / blockCount : 0.5;
            const experienceWeight = Math.min(1.2, 0.65 + (seg.count || 0) / 50);
            accumulated *= (runEfficiency * experienceWeight);
        }
        return accumulated;
    };
    
    // Filter to completion routes only
    const completionRoutes = filteredPaths.filter(p => pathCoversFullLevel(p));
    
    // Format for output
    const formattedPaths = completionRoutes.map(p => ({
        segments: p.length,
        totalLength: p.reduce((sum, r) => sum + r.length, 0),
        start: 0, end: 100,
        route: p.map(r => `${r.start}-${r.end}%`),
        runs: p,
        score: scoreRoute(p)
    }));
    
    // Sort: shortest first, then by score descending
    formattedPaths.sort((a, b) => {
        if (a.segments !== b.segments) return a.segments - b.segments;
        return b.score - a.score;
    });
    
    return {
        filteredPaths: formattedPaths,
        pathsByLength,
        totalPathLengths,
        allPaths: filteredPaths,
        totalCompletionRoutes: completionRoutes.length,
        totalPathCount: completionRoutes.length,
        hasFrom0Data: bestFrom0 > 0,
        bestFrom0
    };
}

// ============================================================================
// DEATH DISTRIBUTION & HEATMAP — Synchronized with Python
// ============================================================================

// ============================================================================
// DEATH CLUSTER DETECTION — R6: Complete input→distribution→cluster scoring
// ============================================================================

function detectDeathClusters(events, levelDurationSeconds) {
    // === STEP 1: Build visit frequency map ===
    const visitCounts = new Array(101).fill(0);

    // From0 runs: player visits every percent from 0 to death point
    const from0Deaths = (events || []).filter(e => e && e.type === 'from0' && e.source === 'from0');
    from0Deaths.forEach(death => {
        const pct = safeNum(death.percent, 0);
        const count = safeNum(death.count, 1);
        for (let p = 0; p <= pct && p <= 100; p++) visitCounts[p] += count;
    });

    // Startpos runs: player visits from start to end
    const startposAttempts = (events || []).filter(e => e && e.type === 'run' && e.source === 'startpos');
    startposAttempts.forEach(attempt => {
        const start = safeNum(attempt.start, 0);
        const end = safeNum(attempt.end, 0);
        const count = safeNum(attempt.count, 1);
        for (let p = start; p <= end && p <= 100; p++) visitCounts[p] += count;
    });

    // Completions: player visits every percent
    const completions = (events || []).filter(e => e && e.type === 'completion');
    const completionCount = completions.reduce((sum, c) => sum + safeNum(c.count, 0), 0);
    for (let p = 0; p <= 100; p++) visitCounts[p] += completionCount;

    // === STEP 2: Build death distribution (exclude 100%) ===
    const allDeaths = (events || []).filter(e => e && (e.type === 'from0' || e.type === 'death') && safeNum(e.percent, 0) < 100);

    const deathDistribution = [];
    for (let i = 0; i < 100; i++) {
        const deathsAtPercent = allDeaths
            .filter(d => safeNum(d.percent, -1) === i)
            .reduce((sum, d) => sum + safeNum(d.count, 0), 0);

        deathDistribution.push({
            percent: i,
            deaths: deathsAtPercent,
            visits: visitCounts[i]
        });
    }

    // === STEP 3: Find clusters with min size and max gap ===
    const MIN_CLUSTER_SIZE = 3;
    const MAX_GAP = 8;
    const clusters = [];
    let currentCluster = [];

    deathDistribution.forEach((point) => {
        if (point.deaths === 0) {
            if (currentCluster.length >= MIN_CLUSTER_SIZE) {
                clusters.push([...currentCluster]);
            }
            currentCluster = [];
            return;
        }

        if (currentCluster.length > 0) {
            const lastPoint = currentCluster[currentCluster.length - 1];
            const gap = point.percent - lastPoint.percent;
            if (gap > MAX_GAP) {
                if (currentCluster.length >= MIN_CLUSTER_SIZE) {
                    clusters.push([...currentCluster]);
                }
                currentCluster = [];
            }
        }

        currentCluster.push(point);
    });

    if (currentCluster.length >= MIN_CLUSTER_SIZE) {
        clusters.push(currentCluster);
    }

    // === STEP 4: Score clusters ===
    const totalDeaths = allDeaths.reduce((sum, d) => sum + safeNum(d.count, 0), 0);
    const totalVisits = visitCounts.reduce((sum, v) => sum + v, 0);
    const levelAvgFailureRate = totalVisits > 0 ? totalDeaths / totalVisits : 0;

    const scoredClusters = clusters.map(cluster => {
        const clusterDeaths = cluster.reduce((sum, p) => sum + p.deaths, 0);
        const avgPercent = cluster.reduce((sum, p) => sum + p.percent * p.deaths, 0) / Math.max(1, clusterDeaths);
        const spread = cluster[cluster.length - 1].percent - cluster[0].percent;

        const density = clusterDeaths / Math.max(spread, 1);

        const deathCounts = cluster.map(p => p.deaths);
        const avgDeaths = deathCounts.reduce((a, b) => a + b, 0) / deathCounts.length;
        const variance = deathCounts.reduce((sum, c) => sum + Math.pow(c - avgDeaths, 2), 0) / deathCounts.length;
        const consistency = 1.0 / (1.0 + variance / Math.max(avgDeaths, 1));

        const clusterVisits = cluster.reduce((sum, p) => sum + p.visits, 0);
        const failureRate = clusterVisits > 0 ? clusterDeaths / clusterVisits : 0;
        const relativeDifficulty = levelAvgFailureRate > 0 ? failureRate / levelAvgFailureRate : 1.0;

        const score = density * consistency * relativeDifficulty;

        return {
            cluster,
            center: Math.round(avgPercent),
            spread,
            density: parseFloat(density.toFixed(2)),
            consistency: parseFloat(consistency.toFixed(2)),
            relativeDifficulty: parseFloat(relativeDifficulty.toFixed(2)),
            score: parseFloat(score.toFixed(2))
        };
    });

    scoredClusters.sort((a, b) => b.score - a.score);

    // === STEP 5: Identify completion-edge clusters ===
    const completionEdgeCluster = clusters.find(c => 
        c[0].percent >= 95 && c[c.length - 1].percent >= 98
    );

    return {
        clusters: scoredClusters,
        weakestSection: scoredClusters[0] || null,
        completionEdgeWarning: !!completionEdgeCluster,
        completionEdgeNote: completionEdgeCluster 
            ? "Deaths at 95-100% often represent completion attempts. Focus on earlier clusters for practice priorities."
            : null
    };
}

function calculateDeathDistribution(from0Freq) {
    const total = Object.values(from0Freq).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    const maxBlockDeaths = Math.max(...Object.values(from0Freq || {}), 1);
    const dist = [];
    
    for (let i = 0; i < 10; i++) {
        const start = i * 10, end = (i + 1) * 10;
        let deaths = 0;
        for (const [p, c] of Object.entries(from0Freq)) {
            const percent = parseInt(p, 10);
            if (percent >= start && percent < end) deaths += c;
        }
        // Include blocks even with 0 deaths for complete heatmap
        const pct = total > 0 ? (deaths / total) * 100 : 0;
        const ratio = maxBlockDeaths > 0 ? deaths / maxBlockDeaths : 0;
        const colorTier = getColorTier(ratio);
        
        let riskLevel;
        if (deaths === 0) riskLevel = 'None';
        else if (ratio >= 0.7) riskLevel = 'High';
        else if (ratio >= 0.3) riskLevel = 'Medium';
        else riskLevel = 'Low';
        
        dist.push({
            segment: `${start}-${end}`,
            start, end, deaths,
            percentage: Number(safeToFixed(pct, 1)),
            colorTier,
            ratio: Number(safeToFixed(ratio, 3)),
            riskLevel
        });
    }
    return dist.sort((a, b) => b.deaths - a.deaths);
}


// ============================================================================
// ROUTE VIABILITY — R2 Fix: Deduplicated routes with DFS safety
// ============================================================================

function countViableRoutes(startposRuns, from0Runs, bestFrom0) {
    const RELIABILITY_THRESHOLD = 0.20;
    const MIN_ATTEMPTS = 3;
    const MAX_ROUTE_LENGTH = 5;
    const MAX_GAP = 5;
    const MAX_ROUTE_SEARCH = 5000;

    const segmentMap = new Map();

    (startposRuns || []).forEach(run => {
        const reliability = (run.successCount || run.count || 0) / Math.max(1, run.attemptCount || run.count || 1);
        if (reliability >= RELIABILITY_THRESHOLD && (run.attemptCount || run.count || 0) >= MIN_ATTEMPTS) {
            const key = `${run.start}-${run.end}`;
            const existing = segmentMap.get(key);
            if (!existing || reliability > existing.reliability) {
                segmentMap.set(key, {
                    start: run.start,
                    end: run.end,
                    reliability,
                    attempts: run.attemptCount || run.count || 0,
                    source: 'startpos'
                });
            }
        }
    });

    (from0Runs || []).filter(r => r.type === 'from0' && (r.percent || 0) < 100).forEach(run => {
        const key = `0-${run.percent}`;
        segmentMap.set(key, {
            start: 0,
            end: run.percent,
            reliability: 0.10,
            attempts: run.count || 0,
            source: 'from0'
        });
    });

    const uniqueSegments = Array.from(segmentMap.values());
    const routes = [];

    function findRoutes(currentPos, path, depth) {
        if (depth > MAX_ROUTE_LENGTH) return;
        if (routes.length >= MAX_ROUTE_SEARCH) return;
        if (currentPos >= 100) {
            routes.push([...path]);
            return;
        }

        const candidates = uniqueSegments.filter(seg => 
            seg.start <= currentPos + MAX_GAP && seg.end > currentPos
        );

        candidates.forEach(seg => {
            if (path.some(p => p.start === seg.start && p.end === seg.end)) return;
            path.push(seg);
            findRoutes(seg.end, path, depth + 1);
            path.pop();
        });
    }

    findRoutes(0, [], 0);

    const scoredRoutes = routes.map(route => {
        const totalReliability = route.reduce((prod, seg) => prod * seg.reliability, 1);
        const totalLength = route[route.length - 1].end - route[0].start;
        const gapCount = route.length - 1;
        const coverage = totalLength / 100;
        const gapPenalty = Math.pow(0.9, gapCount);

        return {
            segments: route,
            reliability: parseFloat(totalReliability.toFixed(4)),
            coverage: parseFloat(coverage.toFixed(2)),
            gapCount,
            score: parseFloat((totalReliability * coverage * gapPenalty).toFixed(4))
        };
    });

    scoredRoutes.sort((a, b) => b.score - a.score);

    return {
        viableRoutes: scoredRoutes.slice(0, 10),
        routeCount: scoredRoutes.length,
        topRoute: scoredRoutes[0] || null,
        searchLimited: routes.length >= MAX_ROUTE_SEARCH
    };
}

// ============================================================================
// TIER UTILITY — R10
// ============================================================================

function getTierFromScore(score) {
    const clamped = clamp(Math.round(score), 0, 100);
    if (clamped >= 80) return "Strong";
    if (clamped >= 60) return "Good";
    if (clamped >= 40) return "Developing";
    if (clamped >= 20) return "Weak";
    return "Very Weak";
}

function calculateDurationReadinessImpact(buildResult, playerMetrics, levelDurationSeconds) {
    const baselineSeconds = 30;
    const ratio = levelDurationSeconds / baselineSeconds;
    const durationFactor = clamp(1.0 + Math.log10(Math.max(0.01, ratio)) * 0.35, 0.82, 1.90);

    const sustainedRuns = playerMetrics.sustainedRunScore || 50;
    const demonstratedEndurance = sustainedRuns / 100;
    const requiredEndurance = Math.max(0, (durationFactor - 1.0) * 10);

    let adjustment = 0;
    if (requiredEndurance > 0) {
        const enduranceGap = Math.max(0, requiredEndurance - demonstratedEndurance);
        adjustment = -Math.min(10, enduranceGap * 15);
    }

    const hasRouteProof = (buildResult.verifiedRouteCount || 0) >= 2 || 
                          (buildResult.endgameRouteCount || 0) >= 1;
    if (hasRouteProof && adjustment < 0) {
        adjustment *= 0.7;
    }

    return {
        adjustment: Math.round(adjustment),
        reason: adjustment < 0 
            ? `Level duration (${levelDurationSeconds}s) exceeds demonstrated endurance. Penalty: ${adjustment}.`
            : `Level duration (${levelDurationSeconds}s) within demonstrated endurance range.`
    };
}

function detectHotspots(buildResult, levelDurationSeconds) {
    const from0Freq = buildResult.from0Freq || {};
    const startposRuns = buildResult.startposRuns || [];
    const completions = buildResult.completions || 0;
    const bestFrom0 = buildResult.bestFrom0 || 0;

    const visitCounts = new Array(101).fill(0);

    for (const [pStr, count] of Object.entries(from0Freq)) {
        const p = parseInt(pStr, 10);
        if (isNaN(p) || p < 0 || p > 100) continue;
        for (let i = 0; i <= p; i++) visitCounts[i] += count;
    }

    for (const run of startposRuns) {
        const start = safeNum(run.start);
        const end = safeNum(run.end);
        const count = safeNum(run.count);
        for (let p = start; p <= end && p <= 100; p++) visitCounts[p] += count;
    }

    for (let p = 0; p <= 100; p++) visitCounts[p] += completions;

    const totalDeaths = Object.values(from0Freq).reduce((a, b) => a + b, 0);
    const totalVisits = visitCounts.reduce((a, b) => a + b, 0);
    const levelAvgFailureRate = totalVisits > 0 ? totalDeaths / totalVisits : 0;
    const durationFactor = levelDurationSeconds ? getDurationFactor(levelDurationSeconds) : 1.0;

    const segments = [];
    for (let i = 0; i < 10; i++) {
        const start = i * 10;
        const end = (i + 1) * 10;

        let segmentDeaths = 0;
        for (const [pStr, count] of Object.entries(from0Freq)) {
            const p = parseInt(pStr, 10);
            if (p >= start && p < end) segmentDeaths += count;
        }

        const segmentVisits = visitCounts.slice(start, end).reduce((sum, v) => sum + v, 0);
        const failureRate = segmentVisits > 0 ? segmentDeaths / segmentVisits : 0;
        const relativeDifficulty = levelAvgFailureRate > 0 ? failureRate / levelAvgFailureRate : 1.0;
        const deathDensity = segmentVisits > 0 ? (segmentDeaths / segmentVisits) * durationFactor : 0;

        segments.push({
            range: `${start}-${end}%`,
            segment: `${start}-${end}`,
            start, end,
            deaths: segmentDeaths,
            visits: segmentVisits,
            failureRate: Number(safeToFixed(failureRate, 4)),
            relativeDifficulty: Number(safeToFixed(relativeDifficulty, 2)),
            deathDensity: Number(safeToFixed(deathDensity, 4)),
            hotspotScore: 0
        });
    }

    const maxFailureRate = Math.max(...segments.map(s => s.failureRate), 0.001);
    const maxRelDiff = Math.max(...segments.map(s => s.relativeDifficulty), 0.001);
    const maxDensity = Math.max(...segments.map(s => s.deathDensity), 0.001);

    segments.forEach(seg => {
        const normFailure = seg.failureRate / maxFailureRate;
        const normRelDiff = seg.relativeDifficulty / maxRelDiff;
        const normDensity = seg.deathDensity / maxDensity;
        seg.hotspotScore = Number(safeToFixed(
            normFailure * 0.40 + normRelDiff * 0.35 + normDensity * 0.25,
            3
        ));
    });

    segments.sort((a, b) => b.hotspotScore - a.hotspotScore);

    const nonSpawnSegments = segments.filter(s => {
        if (s.range === "0-10%") return s.relativeDifficulty > 1.5;
        if (s.start >= 90 && bestFrom0 < 90 && s.visits < totalVisits * 0.05) return false;
        return true;
    });

    const weakestSection = nonSpawnSegments[0] || segments[0] || null;

    return {
        segments,
        topHotspots: segments.slice(0, 5),
        weakestSection,
        spawnBiasWarning: segments[0]?.range === "0-10%" && segments[0] !== weakestSection
    };
}

function getColorTier(ratio) {
    if (ratio >= 0.7) return 'high';
    if (ratio >= 0.3) return 'medium';
    if (ratio > 0) return 'low';
    return 'safe';
}

// ============================================================================
// PERCENTILES & METRICS
// ============================================================================

function calculateFrom0Percentiles(from0Freq, completions) {
    const sortedPercents = Object.keys(from0Freq).map(Number).sort((a, b) => a - b);
    const totalDeaths = sortedPercents.reduce((sum, p) => sum + (from0Freq[p] || 0), 0);
    const totalAttempts = totalDeaths + completions;
    
    if (totalAttempts === 0) {
        return { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, best: 0, mean: 0, stdDev: 0, attempts: 0, consistencyIndex: 0 };
    }
    
    let cumulative = 0;
    const cumMap = new Map();
    for (const p of sortedPercents) {
        cumulative += from0Freq[p];
        cumMap.set(p, cumulative);
    }
    cumulative += completions;
    
    const getPercentile = function(p) {
        const target = Math.ceil((p / 100) * totalAttempts);
        if (target > totalAttempts - completions) return 100;
        for (const percent of sortedPercents) {
            const cum = cumMap.get(percent);
            if (cum >= target) return percent;
        }
        return sortedPercents[sortedPercents.length - 1] || 0;
    };
    
    const p10 = getPercentile(10);
    const p25 = getPercentile(25);
    const p50 = getPercentile(50);
    const p75 = getPercentile(75);
    const p90 = getPercentile(90);
    const best = sortedPercents.length > 0 ? sortedPercents[sortedPercents.length - 1] : (completions > 0 ? 100 : 0);
    
    let mean = 0, m2 = 0, n = 0;
    for (const p of sortedPercents) {
        const count = Math.floor(safeNum(from0Freq[p]));
        for (let j = 0; j < count; j++) {
            n++;
            const delta = p - mean;
            mean += delta / n;
            m2 += delta * (p - mean);
        }
    }
    
    const safeCompletions = Math.floor(safeNum(completions));
    for (let i = 0; i < safeCompletions; i++) {
        n++;
        const delta = 100 - mean;
        mean += delta / n;
        m2 += delta * (100 - mean);
    }
    
    const variance = n > 1 ? m2 / n : 0;
    const stdDev = Math.sqrt(variance);
    const consistencyIndex = best > 0 ? Math.max(0, 100 - (stdDev / best) * 100) : 0;
    
    return { 
        p10, p25, p50, p75, p90, best, 
        mean: Number(safeToFixed(mean, 1)), 
        stdDev: Number(safeToFixed(stdDev, 1)), 
        attempts: totalAttempts, 
        consistencyIndex: Number(safeToFixed(consistencyIndex, 1)) 
    };
}

function calculateSkillScore(percentiles) {
    const best = percentiles.best;
    const p90 = percentiles.p90, p75 = percentiles.p75, p50 = percentiles.p50;
    const consistencyIndex = parseFloat(percentiles.consistencyIndex);
    const datasetStats = percentiles?.datasetStats || null;
    
    const peakSkill = best * getWeight("skillScore.peakSkill", datasetStats);
    const consistentSkill = p90 * getWeight("skillScore.consistentSkill", datasetStats);
    const midSkill = p75 * getWeight("skillScore.midSkill", datasetStats);
    const floorSkill = Math.max(p50, best * 0.25) * getWeight("skillScore.floorSkill", datasetStats);
    const consistencyBonus = (consistencyIndex / 100) * 15;
    const volumeBonus = Math.min(10, percentiles.attempts / 200);
    
    const rawScore = peakSkill + consistentSkill + midSkill + floorSkill + consistencyBonus + volumeBonus;
    return {
        score: Math.min(100, rawScore),
        baseSkill: peakSkill + consistentSkill + midSkill + floorSkill,
        consistencyBonus, volumeBonus,
        percentiles
    };
}

// ============================================================================
// READINESS & COVERAGE
// ============================================================================

// ============================================================================
// DECOUPLED METRICS — R9: Readiness, Route Proof, Endurance
// ============================================================================

function calculateReadiness(buildResult, playerMetrics, levelDurationSeconds) {
    const bestFrom0 = buildResult.bestFrom0 || 0;
    const nerves = playerMetrics.nervesControlScore || 50;
    const plateauFactor = playerMetrics.plateauFactor || 1.0;
    const volatility = playerMetrics.volatilityLevel === 'High' ? 0.25 :
                      playerMetrics.volatilityLevel === 'Medium' ? 0.10 : 0;
    const skillScore = playerMetrics.skillScore || 50;
    const consistency = playerMetrics.endgameConsistency || 50;

    let score = 0;
    score += bestFrom0 * 0.30;
    score += (100 - nerves) * 0.15;
    score += (100 - (plateauFactor - 1) * 50) * 0.15;
    score += consistency * 0.25;
    score += skillScore * 0.10;
    score -= volatility * 20;

    const durationResult = calculateDurationReadinessImpact(buildResult, playerMetrics, levelDurationSeconds);
    score += durationResult.adjustment;

    return {
        value: clamp(Math.round(score), 0, 100),
        tier: getTierFromScore(score),
        breakdown: {
            bestFrom0: bestFrom0 * 0.30,
            nervesControl: (100 - nerves) * 0.15,
            plateau: (100 - (plateauFactor - 1) * 50) * 0.15,
            consistency: consistency * 0.25,
            skill: skillScore * 0.10,
            volatility: -volatility * 20,
            duration: durationResult.adjustment
        }
    };
}

function calculateRouteProof(buildResult, playerMetrics) {
    const components = {
        routeEvidence: 0,
        coverage: 0,
        deepRuns: 0,
        practiceCompletion: 0,
        routeConsistency: 0
    };

    // 1. Verified routes (0-30)
    const hasFullRoute = buildResult.hasFullCompletionRoute || false;
    const endgameRoutes = buildResult.endgameRouteCount || 0;
    const verifiedRoutes = buildResult.verifiedRouteCount || 0;

    if (hasFullRoute) components.routeEvidence = 30;
    else if (endgameRoutes >= 3) components.routeEvidence = 25;
    else if (endgameRoutes >= 2) components.routeEvidence = 18;
    else if (endgameRoutes >= 1) components.routeEvidence = 10;
    else if (verifiedRoutes >= 3) components.routeEvidence = 8;
    else if (verifiedRoutes >= 1) components.routeEvidence = 3;

    // 2. Coverage (0-25)
    const coverage = buildResult.coverage || 0;
    if (coverage >= 95) components.coverage = 25;
    else if (coverage >= 80) components.coverage = 20;
    else if (coverage >= 65) components.coverage = 14;
    else if (coverage >= 50) components.coverage = 8;
    else if (coverage >= 30) components.coverage = 3;

    // 3. Deep runs (0-20)
    const deepRuns = buildResult.deepRunCount || 0;
    if (deepRuns >= 50) components.deepRuns = 20;
    else if (deepRuns >= 20) components.deepRuns = 15;
    else if (deepRuns >= 10) components.deepRuns = 10;
    else if (deepRuns >= 5) components.deepRuns = 5;

    // 4. Practice completion (0-15)
    const practiceCompletionRate = buildResult.practiceCompletionRate || 0;
    if (practiceCompletionRate >= 0.9) components.practiceCompletion = 15;
    else if (practiceCompletionRate >= 0.7) components.practiceCompletion = 11;
    else if (practiceCompletionRate >= 0.5) components.practiceCompletion = 7;
    else if (practiceCompletionRate >= 0.3) components.practiceCompletion = 3;

    // 5. Route consistency (0-10)
    const routeConsistency = buildResult.routeConsistencyScore || 0;
    if (routeConsistency >= 0.8) components.routeConsistency = 10;
    else if (routeConsistency >= 0.6) components.routeConsistency = 6;
    else if (routeConsistency >= 0.4) components.routeConsistency = 3;

    const score = Object.values(components).reduce((a, b) => a + b, 0);

    return {
        value: Math.min(100, score),
        tier: score >= 80 ? "Strong" : score >= 60 ? "Good" : score >= 40 ? "Developing" : "Weak",
        breakdown: components
    };
}

function calculateEndurance(playerMetrics, levelDurationSeconds) {
    const durationFactor = getDurationFactor(levelDurationSeconds);
    const consistency = playerMetrics.endgameConsistency || 50;
    const sustainedRuns = playerMetrics.sustainedRunScore || 50;
    const lateGameDeathRatio = playerMetrics.lateGameDeathRatio || 0.5;

    let base = (consistency * 0.60) + (sustainedRuns * 0.40);

    const requiredEndurance = Math.max(0, (durationFactor - 1.0) * 16);
    const demonstratedEndurance = (sustainedRuns / 100);

    const endurancePenalty = requiredEndurance * (1.0 - demonstratedEndurance);
    const lateGamePenalty = lateGameDeathRatio > 0.6 ? (lateGameDeathRatio - 0.6) * 20 : 0;

    const rating = Math.max(0, base - endurancePenalty - lateGamePenalty);

    return {
        value: Math.round(rating),
        tier: rating >= 80 ? "Elite" : rating >= 60 ? "Strong" : rating >= 40 ? "Developing" : "Weak",
        breakdown: {
            consistency: consistency * 0.60,
            sustainedRuns: sustainedRuns * 0.40,
            requiredEndurance: Math.round(requiredEndurance),
            demonstratedEndurance: Math.round(demonstratedEndurance * 100),
            endurancePenalty: Math.round(endurancePenalty),
            lateGamePenalty: Math.round(lateGamePenalty)
        }
    };
}

function calculateCoverage(actualRuns) {
    if (!actualRuns || actualRuns.length === 0) {
        return { practice: 0, merged: [], gaps: [{ start: 0, end: 100 }] };
    }
    
    const intervals = actualRuns.map(r => [r.start, r.end]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    let cur = [intervals[0][0], intervals[0][1]];
    
    for (let i = 1; i < intervals.length; i++) {
        if (intervals[i][0] <= cur[1]) {
            cur[1] = Math.max(cur[1], intervals[i][1]);
        } else {
            merged.push([cur[0], cur[1]]);
            cur = [intervals[i][0], intervals[i][1]];
        }
    }
    merged.push([cur[0], cur[1]]);
    
    let total = 0;
    for (const m of merged) total += (m[1] - m[0]);
    
    const gaps = [];
    if (merged[0][0] > 0) gaps.push({ start: 0, end: merged[0][0] });
    for (let i = 1; i < merged.length; i++) {
        if (merged[i][0] > merged[i-1][1]) gaps.push({ start: merged[i-1][1], end: merged[i][0] });
    }
    if (merged[merged.length-1][1] < 100) gaps.push({ start: merged[merged.length-1][1], end: 100 });
    
    return { practice: Math.min(100, total), merged, gaps };
}

// ============================================================================
// ATTEMPT ESTIMATION v8.3 (Python base + endgame-aware calibration)
// ============================================================================

function calculateRealisticAttempts(buildResult, percentiles, difficultyMultiplier, playerMetrics, levelDurationSeconds, events = []) {
    playerMetrics = playerMetrics || {};
    const bestFrom0 = buildResult.bestFrom0 || 0;
    const from0Freq = buildResult.from0Freq || {};
    const totalStartposAttempts = buildResult.totalStartposAttempts || 0;
    const completions = buildResult.completions || 0;
    const remaining = 100 - bestFrom0;

    if (remaining <= 0) return { estimate: 0, confidence: "exact", evidenceScore: 100, breakdown: {} };

    const from0Total = Object.values(from0Freq).reduce((a, b) => a + b, 0);

    let baseEstimate;
    let estimateConfidence = "moderate";
    let baseCalc = 0;

    if (from0Total > 0 && totalStartposAttempts > 0) {
        const earlyGameDeaths = Object.entries(from0Freq)
            .filter(([p]) => parseInt(p, 10) <= 20)
            .reduce((sum, [, c]) => sum + c, 0);

        const earlyChokeRatio = earlyGameDeaths / from0Total;
        const passRateModifier = Math.max(0.05, 1.0 - (bestFrom0 / 100));

        const attemptCap = Math.min(totalStartposAttempts, 5000);
        baseCalc = attemptCap * passRateModifier * (1.1 + earlyChokeRatio * 0.5);
        baseEstimate = Math.max(150, Math.round(baseCalc));

        // === EVIDENCE SCORE (0-100) ===
        let evidenceScore = 0;
        const maxEvidence = 100;

        // 1. Best run proximity (0-25 points)
        if (bestFrom0 >= 98) evidenceScore += 25;
        else if (bestFrom0 >= 95) evidenceScore += 20;
        else if (bestFrom0 >= 90) evidenceScore += 15;
        else if (bestFrom0 >= 85) evidenceScore += 10;
        else if (bestFrom0 >= 80) evidenceScore += 5;

        // 2. Deep run frequency (0-22 points) - using from0Freq as proxy since we don't have canonical events
        const deepRuns = Object.entries(from0Freq)
            .filter(([p]) => parseInt(p, 10) >= 80)
            .reduce((sum, [, c]) => sum + c, 0);
        const deepRunRatio = from0Total > 0 ? deepRuns / from0Total : 0;

        if (deepRunRatio >= 0.25) evidenceScore += 22;
        else if (deepRunRatio >= 0.12) evidenceScore += 14;
        else if (deepRunRatio >= 0.04) evidenceScore += 6;

        // 3. Route coverage (0-22 points) - use coverage from buildResult
        const coverage = buildResult.coverage || 0;
        if (coverage >= 95) evidenceScore += 22;
        else if (coverage >= 80) evidenceScore += 17;
        else if (coverage >= 60) evidenceScore += 11;
        else if (coverage >= 40) evidenceScore += 6;

        // 4. Endgame consistency (0-18 points)
        const endgame = playerMetrics.endgameConsistency || 50;
        if (endgame >= 82) evidenceScore += 18;
        else if (endgame >= 68) evidenceScore += 12;
        else if (endgame >= 52) evidenceScore += 6;

        // 5. Proof score (0-18 points)
        const proof = playerMetrics.proofScore || 0;
        if (proof >= 78) evidenceScore += 18;
        else if (proof >= 58) evidenceScore += 12;
        else if (proof >= 38) evidenceScore += 6;

        // 6. Practice completion (0-6 points)
        const practiceCompletionRate = buildResult.practiceCompletionRate || 0;
        if (practiceCompletionRate > 0.75) evidenceScore += 6;
        else if (practiceCompletionRate > 0.45) evidenceScore += 3;

        evidenceScore = Math.min(maxEvidence, evidenceScore);

        // === CORRECTED DIMINISHING RETURNS ===
        const evidenceRatio = evidenceScore / maxEvidence;
        const estimateMultiplier = 1.0 - (Math.pow(evidenceRatio, 0.7) * 0.40);
        const safeMultiplier = Math.max(0.55, estimateMultiplier);

        baseEstimate = Math.round(baseEstimate * safeMultiplier);

        // === SKILL / DIFFICULTY SPLIT BUCKETS ===
        let skillModifiers = 0.0;
        let difficultyModifiers = 0.0;

        skillModifiers -= Math.min(0.30, proof / 350);
        skillModifiers -= clamp(((playerMetrics.skillScore || 50) - 50) / 300, -0.20, 0.20);
        skillModifiers -= clamp(((playerMetrics.endgameConsistency || 50) - 50) / 300, -0.20, 0.20);

        const nerves = playerMetrics.nervesControlScore || 50;
        difficultyModifiers += clamp(((nerves) - 50) / 300, -0.20, 0.20);

        const plateauFactor = playerMetrics.plateauFactor || 1.0;
        difficultyModifiers += Math.min(0.12, (plateauFactor - 1.0) * 0.4);

        const spikeDensity = playerMetrics.spikeDensity || 0;
        difficultyModifiers += Math.min(0.2, spikeDensity * 0.2);

        const wallClusters = playerMetrics.wallClusters || 0;
        difficultyModifiers += Math.min(0.12, wallClusters * 0.03);

        const volatility = playerMetrics.volatilityLevel === 'High' ? 0.25 :
                          playerMetrics.volatilityLevel === 'Medium' ? 0.10 : 0;
        difficultyModifiers += volatility;

        const clampedSkill = clamp(skillModifiers, -0.5, 0.5);
        const clampedDifficulty = clamp(difficultyModifiers, -0.5, 0.5);
        const totalDeviation = clamp(clampedSkill + clampedDifficulty, -0.5, 0.5);

        baseEstimate = Math.round(baseEstimate * (1.0 + totalDeviation));

        // === ROUTE DEVIATION ===
        const routeReliability = buildResult.routeReliability || 0;
        const coverageVal = buildResult.coverage || 0;
        const consistency = percentiles.consistencyIndex || 0;

        let routeDeviation = 0.0;
        if (routeReliability < 0.3) routeDeviation += 0.35;
        else if (routeReliability > 0.7) routeDeviation -= 0.25;

        if (coverageVal < 50) routeDeviation += 0.20;
        if (consistency < 30) routeDeviation += 0.25;
        if (completions > 0) routeDeviation -= 0.50;

        const practiceCompletionRateVal = buildResult.practiceCompletionRate || 0;
        if (practiceCompletionRateVal > 0.6) routeDeviation -= 0.15;
        else if (practiceCompletionRateVal > 0.3) routeDeviation -= 0.08;

        const clampedRoute = clamp(routeDeviation, -0.5, 0.5);
        baseEstimate = Math.round(baseEstimate * (1.0 + clampedRoute));

        // === DURATION ADJUSTMENT ===
        baseEstimate = calculateDurationAwareAttempts(baseEstimate, levelDurationSeconds, playerMetrics, buildResult);

        // === SAFETY CAPS ===
        const MIN_ESTIMATE_ALL_TIERS = 50;

        if (bestFrom0 >= 95 && baseEstimate > 3000) {
            baseEstimate = Math.round(baseEstimate * 0.75);
            estimateConfidence = "high";
        } else if (bestFrom0 >= 90 && baseEstimate > 4000) {
            baseEstimate = Math.round(baseEstimate * 0.85);
            estimateConfidence = "moderate-high";
        }

        if (completions > 0) {
            baseEstimate = Math.round(baseEstimate * 0.45);
            estimateConfidence = "high";
        }

        return {
            estimate: Math.max(MIN_ESTIMATE_ALL_TIERS, baseEstimate),
            confidence: estimateConfidence,
            evidenceScore,
            breakdown: {
                baseEstimate: Math.round(baseCalc),
                evidenceMultiplier: parseFloat(safeMultiplier.toFixed(3)),
                skillModifier: clampedSkill,
                difficultyModifier: clampedDifficulty,
                routeModifier: clampedRoute,
                durationMultiplier: getDurationFactor(levelDurationSeconds),
                finalEstimate: Math.max(MIN_ESTIMATE_ALL_TIERS, baseEstimate)
            }
        };
    }

    // === FALLBACK ===
    const passRateModifier = Math.max(0.05, 1.0 - (bestFrom0 / 100));
    let fallbackEstimate = remaining * 8 * difficultyMultiplier;

    if (bestFrom0 >= 95) fallbackEstimate *= 2.0;
    else if (bestFrom0 >= 90) fallbackEstimate *= 1.5;
    else if (bestFrom0 >= 80) fallbackEstimate *= 1.3;
    else if (bestFrom0 >= 60) fallbackEstimate *= 1.1;

    fallbackEstimate = calculateDurationAwareAttempts(fallbackEstimate, levelDurationSeconds, playerMetrics, buildResult);

    return {
        estimate: Math.max(30, Math.round(fallbackEstimate)),
        confidence: "low",
        evidenceScore: 0,
        breakdown: { reason: "insufficient_data", fallback: true }
    };
}

// ============================================================================
// PASS RATE BY CHUNKS
// ============================================================================

function calculateTrueConsistency(start, end, actualRuns, from0Freq, completions) {
    const hasStartpos = (actualRuns || []).length > 0;
    const from0Entries = Object.entries(from0Freq || {});
    const hasFrom0 = from0Entries.length > 0 || safeNum(completions) > 0;

    if (hasStartpos && hasFrom0) {
        const successfulPasses = (actualRuns || []).reduce((sum, r) => {
            if (!r) return sum;
            if (r.start <= start && r.end >= end) return sum + (r.count || 0);
            return sum;
        }, 0);

        const deathsAfterReaching = from0Entries.reduce((sum, [p, c]) => {
            const pct = parseInt(p, 10);
            if (pct >= start && pct < end) return sum + c;
            return sum;
        }, 0);

        const totalSamples = successfulPasses + deathsAfterReaching;
        if (totalSamples <= 0) return { passRate: 50.0, samples: 0, successfulPasses, deathsAfterReaching, hasData: false };
        return { passRate: (successfulPasses / totalSamples) * 100, samples: totalSamples, successfulPasses, deathsAfterReaching, hasData: true };
    }

    if (hasFrom0) {
        const failures = from0Entries.reduce((sum, [p, c]) => {
            const pct = parseInt(p, 10);
            if (pct >= start && pct < end) return sum + c;
            return sum;
        }, 0);

        const passes = from0Entries.reduce((sum, [p, c]) => {
            const pct = parseInt(p, 10);
            if (pct >= end) return sum + c;
            return sum;
        }, 0) + safeNum(completions);

        const totalSamples = failures + passes;
        if (totalSamples <= 0) return { passRate: 50.0, samples: 0, successfulPasses: passes, deathsAfterReaching: failures, hasData: false };
        return { passRate: (passes / totalSamples) * 100, samples: totalSamples, successfulPasses: passes, deathsAfterReaching: failures, hasData: true };
    }

    return { passRate: 50.0, samples: 0, successfulPasses: 0, deathsAfterReaching: 0, hasData: false };
}

function calculatePassRateByChunks(actualRuns, from0Freq, completions) {
    const chunks = [];
    for (let chunk = 0; chunk < 10; chunk++) {
        const start = chunk * 10;
        const end = (chunk + 1) * 10;
        const tc = calculateTrueConsistency(start, end, actualRuns, from0Freq, completions);
        const passRate = tc.passRate;
        let color;
        if (passRate >= 80) color = 'safe';
        else if (passRate >= 60) color = 'low';
        else if (passRate >= 30) color = 'medium';
        else color = 'high';
        chunks.push({
            chunk: `${start}-${end}%`, start, end,
            passRate: Math.max(0, Number(safeToFixed(passRate, 1))),
            color,
            hasData: tc.hasData,
            samples: tc.samples,
            successfulPasses: tc.successfulPasses,
            deaths: tc.deathsAfterReaching
        });
    }
    return chunks;
}

function calculateSpikeDensity(from0Freq) {
    const points = [];
    for (let p = 0; p <= 100; p++) {
        points.push({ percent: p, count: safeNum(from0Freq[p], 0) });
    }
    const spikes = [];
    for (let i = 0; i < points.length; i++) {
        const local = points
            .slice(Math.max(0, i - 3), Math.min(points.length, i + 4))
            .filter((_, idx) => Math.max(0, i - 3) + idx !== i)
            .map(p => p.count);
        const mean = local.length ? local.reduce((s, n) => s + n, 0) / local.length : 0;
        const variance = local.length ? local.reduce((s, n) => s + Math.pow(n - mean, 2), 0) / local.length : 0;
        const stdDev = Math.sqrt(variance);
        const threshold = mean + (stdDev * 3);
        if (points[i].count > 0 && points[i].count >= Math.max(3, threshold)) {
            spikes.push({
                percent: points[i].percent,
                deaths: points[i].count,
                localMean: Number(safeToFixed(mean, 2)),
                zScore: stdDev > 0 ? Number(safeToFixed((points[i].count - mean) / stdDev, 2)) : null
            });
        }
    }
    const totalDeaths = Object.values(from0Freq || {}).reduce((s, n) => s + safeNum(n), 0);
    return {
        spikes,
        density: totalDeaths > 0 ? Number(safeToFixed(spikes.reduce((s, p) => s + p.deaths, 0) / totalDeaths, 3)) : 0,
        count: spikes.length,
        source: "from0"
    };
}

function calculateWallClusters(from0Freq) {
    const sortedDeaths = Object.entries(from0Freq || {})
        .map(([p, c]) => ({ percent: parseInt(p, 10), count: safeNum(c) }))
        .filter(d => d.count > 0)
        .sort((a, b) => a.percent - b.percent);
    const clusters = [];
    if (sortedDeaths.length === 0) return clusters;

    let currentCluster = [sortedDeaths[0]];
    for (let i = 1; i < sortedDeaths.length; i++) {
        if (sortedDeaths[i].percent - currentCluster[currentCluster.length - 1].percent <= 3) {
            currentCluster.push(sortedDeaths[i]);
        } else {
            if (currentCluster.length > 1) {
                const totalDeaths = currentCluster.reduce((s, d) => s + d.count, 0);
                clusters.push({ start: currentCluster[0].percent, end: currentCluster[currentCluster.length - 1].percent, totalDeaths, points: currentCluster.length, source: "from0" });
            }
            currentCluster = [sortedDeaths[i]];
        }
    }
    if (currentCluster.length > 1) {
        const totalDeaths = currentCluster.reduce((s, d) => s + d.count, 0);
        clusters.push({ start: currentCluster[0].percent, end: currentCluster[currentCluster.length - 1].percent, totalDeaths, points: currentCluster.length, source: "from0" });
    }
    return clusters.sort((a, b) => b.totalDeaths - a.totalDeaths);
}

function calculatePhaseConsistency(passRateChunks) {
    const phases = (passRateChunks || []).map(c => ({
        start: c.start,
        end: c.end,
        passRate: c.hasData ? c.passRate : null,
        samples: c.samples || 0,
        confidence: c.samples >= 50 ? "high" : c.samples >= 10 ? "medium" : c.samples > 0 ? "low" : "none",
        source: c.hasData ? "hybrid" : "insufficient_data"
    }));
    const measured = phases.filter(p => p.passRate !== null);
    const average = measured.length > 0 ? measured.reduce((s, p) => s + p.passRate, 0) / measured.length : 0;
    const variance = measured.length > 1 ? measured.reduce((s, p) => s + Math.pow(p.passRate - average, 2), 0) / measured.length : 0;
    return {
        phases,
        average: Number(safeToFixed(average, 1)),
        stability: Number(safeToFixed(clamp(100 - Math.sqrt(variance), 0, 100), 1)),
        source: "hybrid"
    };
}

function detectPlateau(entries) {
    let attemptsSinceBest = 0;
    let best = 0;
    let totalFrom0 = 0;
    for (const e of entries || []) {
        if (e.type !== "from0") continue;
        const count = safeNum(e.count);
        totalFrom0 += count;
        if (safeNum(e.percent) > best) {
            best = safeNum(e.percent);
            attemptsSinceBest = 0;
        } else {
            attemptsSinceBest += count;
        }
    }
    const plateau = attemptsSinceBest > 500;
    return {
        plateau,
        attemptsSinceBest,
        best,
        totalFrom0,
        factor: plateau ? Math.min(1.35, 1 + ((attemptsSinceBest - 500) / 5000)) : 1,
        source: totalFrom0 > 0 ? "from0" : "insufficient_data"
    };
}

function getConfidenceLevel(datasetStats) {
    const totalLevels = safeNum(datasetStats?.totalLevels, 0);
    if (totalLevels < 20) return "LOW";
    if (totalLevels < 50) return "MEDIUM";
    return "HIGH";
}

function buildConfidenceReport(attemptStats, buildResult) {
    const datasetStats = {
        totalLevels: 1,
        totalAttempts: attemptStats.totalAttempts,
        from0Attempts: attemptStats.totalFrom0Attempts,
        startposAttempts: attemptStats.startposAttempts,
        completions: buildResult.completions || 0
    };
    const confidenceLevel = getConfidenceLevel(datasetStats);
    const message = confidenceLevel === "LOW"
        ? "Low confidence: single-level analysis uses baseline weights."
        : confidenceLevel === "MEDIUM"
            ? "Medium confidence: weights are provisional."
            : "High confidence: weights are validated.";
    return {
        confidenceLevel,
        datasetStats,
        provisionalWeights: ["proofScore", "routeConfidence", "endgameConsistency"],
        sourceAvailability: {
            from0: datasetStats.from0Attempts > 0,
            startpos: datasetStats.startposAttempts > 0,
            explicitCompletion: datasetStats.completions > 0
        },
        message
    };
}

const DURATION_MODE = Object.freeze({
    NORMAL: "normal",
    HOUR: "hour",
    AUTO: "auto"
});

function detectDurationMode(input) {
    const trimmed = String(input || "").trim();
    if (/^\d{1,3}:\d{2}:\d{2}$/.test(trimmed)) return DURATION_MODE.HOUR;
    if (/^\d{1,3}:\d{2}$/.test(trimmed)) return DURATION_MODE.NORMAL;
    return DURATION_MODE.AUTO;
}

function parseDurationInput(input, mode) {
    mode = mode || detectDurationMode(input);
    const trimmed = String(input || "").trim();
    if (!trimmed) return { valid: false, error: "Duration required" };

    if (mode === DURATION_MODE.HOUR || (mode === DURATION_MODE.AUTO && /^\d{1,3}:\d{2}:\d{2}$/.test(trimmed))) {
        const match = trimmed.match(/^(\d{1,3}):(\d{2}):(\d{2})$/);
        if (!match) return { valid: false, error: "Format: HH:MM:SS (e.g., 01:15:30)" };
        const hours = parseInt(match[1], 10);
        const minutes = parseInt(match[2], 10);
        const seconds = parseInt(match[3], 10);
        if (minutes >= 60 || seconds >= 60) return { valid: false, error: "Minutes and seconds must be < 60" };
        if (hours > 99) return { valid: false, error: "Maximum 99 hours" };
        const totalSeconds = hours * 3600 + minutes * 60 + seconds;
        if (totalSeconds <= 0) return { valid: false, error: "Duration must be greater than zero" };
        return { valid: true, seconds: totalSeconds, display: formatDuration(totalSeconds, DURATION_MODE.HOUR), mode: DURATION_MODE.HOUR };
    }

    const match = trimmed.match(/^(\d{1,3}):(\d{2})$/);
    if (!match) return { valid: false, error: "Format: MM:SS (e.g., 03:20) or HH:MM:SS (e.g., 01:15:30)" };
    const minutes = parseInt(match[1], 10);
    const seconds = parseInt(match[2], 10);
    if (seconds >= 60) return { valid: false, error: "Seconds must be < 60" };
    if (minutes > 999) return { valid: false, error: "Maximum 999 minutes" };
    const totalSeconds = minutes * 60 + seconds;
    if (totalSeconds <= 0) return { valid: false, error: "Duration must be greater than zero" };
    return { valid: true, seconds: totalSeconds, display: formatDuration(totalSeconds, DURATION_MODE.NORMAL), mode: DURATION_MODE.NORMAL };
}

function formatDuration(seconds, mode) {
    if (!isFinite(seconds) || seconds < 0) return "0:00";
    if (mode === DURATION_MODE.HOUR || (mode === DURATION_MODE.AUTO && seconds >= 3600)) {
        const h = Math.floor(seconds / 3600);
        const m = Math.floor((seconds % 3600) / 60);
        const s = seconds % 60;
        return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
    }
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
}

function parseDuration(input, mode) {
    if (input === undefined || input === null || input === "") return null;
    if (typeof input === "number" && isFinite(input) && input > 0) return Math.round(input);
    const trimmed = String(input).trim();
    if (/^\d+$/.test(trimmed)) {
        const seconds = parseInt(trimmed, 10);
        if (seconds <= 0) throw new Error(`Invalid duration: ${input}`);
        return seconds;
    }
    const parsed = parseDurationInput(input, mode || DURATION_MODE.AUTO);
    if (!parsed.valid) throw new Error(parsed.error || `Invalid duration: ${input}`);
    return parsed.seconds;
}

function getDurationFactor(levelDurationSeconds) {
    if (!levelDurationSeconds || levelDurationSeconds <= 0) return 1.0;
    const baselineSeconds = 30;
    const ratio = levelDurationSeconds / baselineSeconds;
    const factor = 1.0 + Math.log10(Math.max(0.01, ratio)) * 0.35;
    return clamp(factor, 0.82, 1.90);
}

function calculateDurationAwareAttempts(baseEstimate, levelDurationSeconds, playerMetrics, buildResult) {
    if (!levelDurationSeconds) return baseEstimate;
    playerMetrics = playerMetrics || {};
    buildResult = buildResult || {};
    const durationFactor = getDurationFactor(levelDurationSeconds);
    let durationMultiplier = 1.0 + (durationFactor - 1.0) * 0.55;

    const longRouteProof = (playerMetrics.proofScore || 0) >= 60 && (playerMetrics.endgameConsistency || 0) >= 70;
    const hasCompletionRoutes = (buildResult.completions || 0) > 0;
    if (longRouteProof || hasCompletionRoutes) durationMultiplier *= 0.85;

    const bestFrom0 = buildResult.bestFrom0 || 0;
    if (bestFrom0 >= 90) durationMultiplier *= 0.90;
    else if (bestFrom0 >= 80) durationMultiplier *= 0.95;

    const maxMultiplier = 1.25;
    const minMultiplier = 0.75;
    durationMultiplier = clamp(durationMultiplier, minMultiplier, maxMultiplier);
    return Math.round(baseEstimate * durationMultiplier);
}

function getDefaultDurationForCategory(category) {
    if (category === "tiny") return 8;
    if (category === "short") return 20;
    if (category === "medium") return 45;
    if (category === "long") return 90;
    if (category === "xl") return 150;
    return null;
}

function getDurationCategory(durationSeconds) {
    if (!durationSeconds) return "unknown";
    if (durationSeconds < 10) return "tiny";
    if (durationSeconds < 30) return "short";
    if (durationSeconds < 60) return "medium";
    if (durationSeconds <= 120) return "long";
    return "xl";
}

function applyDurationConfidence(metric, confidence) {
    const multipliers = { high: 1.0, medium: 0.75, low: 0.50 };
    return metric * (multipliers[confidence] !== undefined ? multipliers[confidence] : 0.50);
}

function getDurationMetadata(options) {
    options = options || {};
    const levelType = options.levelType || "classic";
    const hasCustom = !!(options.durationSeconds || options.duration);
    if (hasCustom) {
        const durationSeconds = parseDuration(options.durationSeconds || options.duration, options.durationMode);
        return {
            enabled: true,
            durationSeconds,
            durationSource: "user_input",
            durationConfidence: "high",
            durationCategory: getDurationCategory(durationSeconds),
            levelType,
            levelTypeConfidence: options.levelType ? "user_selected" : "default"
        };
    }

    const officialCategory = options.officialLengthCategory || options.durationCategory;
    if (officialCategory) {
        const durationSeconds = getDefaultDurationForCategory(officialCategory);
        return {
            enabled: !!durationSeconds,
            durationSeconds,
            durationSource: "official_category",
            durationConfidence: "medium",
            durationCategory: durationSeconds ? getDurationCategory(durationSeconds) : "unknown",
            levelType,
            levelTypeConfidence: options.levelType ? "user_selected" : "default"
        };
    }

    return {
        enabled: false,
        durationSeconds: null,
        durationSource: "none",
        durationConfidence: "low",
        durationCategory: "unknown",
        levelType,
        levelTypeConfidence: options.levelType ? "user_selected" : "default"
    };
}

function getExpectedDeathDensity(difficulty) {
    const expectations = {
        "easy demon": 500,
        "medium demon": 1000,
        "hard demon": 1500,
        "insane demon": 3000,
        "extreme demon": 5000
    };
    return expectations[(difficulty || "").toLowerCase()] || 1000;
}

function getDeathDensityInterpretation(score) {
    if (score < 0.5) return { label: "Light", description: "Below average grind" };
    if (score < 1.0) return { label: "Moderate", description: "Average practice intensity" };
    if (score < 2.0) return { label: "Heavy", description: "Above average grinding" };
    if (score < 3.0) return { label: "Extreme", description: "Intense practice session" };
    return { label: "Absurd", description: "Exceptional grind density" };
}

function calculateDeathDensity(from0Deaths, durationSeconds, difficulty, durationConfidence) {
    if (!durationSeconds) return null;
    const durationMinutes = durationSeconds / 60;
    const rawDensity = safeNum(from0Deaths) / durationMinutes;
    const expectedDensity = getExpectedDeathDensity(difficulty);
    const normalized = expectedDensity > 0 ? (rawDensity / expectedDensity) : null;
    const adjusted = normalized === null ? null : applyDurationConfidence(normalized, durationConfidence);
    return {
        rawDeathsPerMinute: Number(safeToFixed(rawDensity, 2)),
        normalizedScore: adjusted === null ? null : Number(safeToFixed(adjusted, 3)),
        expectedDensity,
        interpretation: normalized === null ? null : getDeathDensityInterpretation(normalized),
        confidence: durationConfidence,
        source: "from0_duration"
    };
}

function calculateConsistencyPerMinute(consistencyIndex, durationSeconds, durationConfidence) {
    if (!durationSeconds) return null;
    const durationMinutes = durationSeconds / 60;
    const normalizedConsistency = safeNum(consistencyIndex) / Math.sqrt(Math.max(0.1, durationMinutes));
    return Number(safeToFixed(applyDurationConfidence(normalizedConsistency, durationConfidence), 1));
}

function calculateTimeNormalizedStress(deathDistribution, durationSeconds, durationConfidence) {
    if (!durationSeconds) return null;
    const durationMinutes = durationSeconds / 60;
    return (deathDistribution || []).map(block => ({
        ...block,
        normalizedDeaths: Number(safeToFixed(safeNum(block.deaths) / durationMinutes, 2)),
        stressScore: Number(safeToFixed(applyDurationConfidence((safeNum(block.deaths) / durationMinutes) * safeNum(block.ratio, 1), durationConfidence), 2))
    }));
}

function getEnduranceWeight(category) {
    if (category === "xl") return 1.30;
    if (category === "long") return 1.15;
    if (category === "medium") return 1.00;
    if (category === "short") return 0.90;
    if (category === "tiny") return 0.80;
    return 1.00;
}

function calculateEnduranceRating(metrics, durationMetadata) {
    if (!durationMetadata || !durationMetadata.enabled) return null;
    const completionScore = metrics.hasCompletion ? 100 : safeNum(metrics.bestFrom0) * 0.8;
    const durationWeight = getEnduranceWeight(durationMetadata.durationCategory);
    const rawRating = (completionScore * 0.35) + (safeNum(metrics.consistencyIndex) * 0.30) + (safeNum(metrics.endgameConsistency) * 0.25) + (durationWeight * 10);
    return Number(safeToFixed(applyDurationConfidence(Math.min(100, rawRating), durationMetadata.durationConfidence), 1));
}

function calculateRouteEfficiency(startposRuns, coverage, durationSeconds, durationConfidence) {
    if (!durationSeconds) return null;
    const durationMinutes = durationSeconds / 60;
    const uniqueSegments = (startposRuns || []).length;
    const rawEfficiency = uniqueSegments > 0 ? safeNum(coverage) / uniqueSegments : 0;
    const durationNormalized = rawEfficiency * Math.sqrt(durationMinutes);
    return Number(safeToFixed(applyDurationConfidence(durationNormalized, durationConfidence), 2));
}

function calculatePracticeDensity(startposAttempts, durationSeconds, durationConfidence) {
    if (!durationSeconds) return null;
    const durationMinutes = durationSeconds / 60;
    const rawDensity = safeNum(startposAttempts) / durationMinutes;
    return Number(safeToFixed(applyDurationConfidence(rawDensity, durationConfidence), 2));
}

function calculateEnduranceExposure(bestFrom0, durationSeconds, from0Attempts, durationConfidence) {
    if (!durationSeconds) return null;
    const progressFactor = safeNum(bestFrom0) / 100;
    const attemptFactor = Math.log10(Math.max(1, safeNum(from0Attempts)));
    const rawExposure = progressFactor * (durationSeconds / 60) * attemptFactor;
    return Number(safeToFixed(applyDurationConfidence(rawExposure, durationConfidence), 2));
}

function validateDurationImpact(baseValue, adjustedValue, maxAdjustment) {
    const actualAdjustment = Math.abs(safeNum(adjustedValue) - safeNum(baseValue));
    if (actualAdjustment > maxAdjustment) {
        return safeNum(baseValue) + Math.sign(safeNum(adjustedValue) - safeNum(baseValue)) * maxAdjustment;
    }
    return adjustedValue;
}

function adjustReadinessForDuration(baseReadiness, durationMetadata, playerStats) {
    if (!durationMetadata || !durationMetadata.enabled || !durationMetadata.durationSeconds) return baseReadiness;
    if (durationMetadata.durationConfidence === "low") return baseReadiness;

    const durationFactor = getDurationFactor(durationMetadata.durationSeconds);
    const enduranceRequired = Math.max(0, (durationFactor - 1.0) * 15);
    const consistencyOffset = (playerStats.endgameConsistency || 50) / 100;
    const proofOffset = Math.min(1.0, (playerStats.proofScore || 0) / 80);
    const offsetFactor = (consistencyOffset * 0.6) + (proofOffset * 0.4);
    const durationPenalty = enduranceRequired * (1.0 - offsetFactor);
    const adjusted = clamp(baseReadiness - durationPenalty, 0, 100);
    return validateDurationImpact(baseReadiness, adjusted, 8);
}

function adjustCompletionProbabilityForDuration(baseProbability, durationMetadata, playerStats) {
    if (!durationMetadata || !durationMetadata.enabled || !durationMetadata.durationSeconds) return baseProbability;
    if (durationMetadata.durationConfidence === "low") return baseProbability;

    const durationFactor = getDurationFactor(durationMetadata.durationSeconds);
    const enduranceRequired = Math.max(0, (durationFactor - 1.0) * 10);
    const consistencyOffset = (playerStats.endgameConsistency || 50) / 100;
    const proofOffset = Math.min(1.0, (playerStats.proofScore || 0) / 80);
    const offsetFactor = (consistencyOffset * 0.6) + (proofOffset * 0.4);
    const durationPenalty = enduranceRequired * (1.0 - offsetFactor);
    const adjusted = clamp(baseProbability - durationPenalty, 0, 100);
    return validateDurationImpact(baseProbability, adjusted, 10);
}

function adjustGradeForDuration(baseGrade, durationMetadata, bestFrom0) {
    if (!durationMetadata || !durationMetadata.enabled || !durationMetadata.durationSeconds) return baseGrade;
    if (bestFrom0 < 50) return baseGrade;

    const durationFactor = getDurationFactor(durationMetadata.durationSeconds);
    const progressWeight = (bestFrom0 - 50) / 50;
    const durationWeight = Math.max(0, durationFactor - 1.0);
    const enduranceBonus = progressWeight * durationWeight * 5;
    return validateDurationImpact(baseGrade, Math.min(100, baseGrade + enduranceBonus), 5);
}

// ============================================================================
// HELPERS
// ============================================================================

function round1(n) {
    const num = Number(n);
    if (!isFinite(num)) return '0.0';
    const rounded = Math.round(num * 10) / 10;
    return safeToFixed(rounded, 1);
}

function formatNumber(num) { return num.toLocaleString(); }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function safeNum(val, fallback) {
    fallback = fallback !== undefined ? fallback : 0;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

function safeToFixed(value, digits) {
    const num = Number(value);
    if (!isFinite(num)) return (0).toFixed(digits);
    return num.toFixed(digits);
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

function analyzeInput(inputText, difficultyMultiplier, options) {
    difficultyMultiplier = difficultyMultiplier || 1.0;
    options = options || {};
    
    if (!validateInput(inputText)) {
        return { hasData: false, error: 'No valid input' };
    }
    
    let processedText = inputText.replace(/\r\n/g, '\n');
    const lines = processedText.split('\n');
    const entries = [];
    
    for (const line of lines) {
        const c = line.trim();
        if (!c || c.toLowerCase() === 'end') continue;
        entries.push(...parseMetricsLine(c));
    }
    
    const attemptStats = computeAttemptTotals(entries);
    const buildResult = buildRuns(entries);
    const rawAttemptCount = countRawAttemptsFromText(inputText);
    const percentiles = calculateFrom0Percentiles(buildResult.from0Freq, buildResult.completions || 0);
    const confidenceReport = buildConfidenceReport(attemptStats, buildResult);
    percentiles.datasetStats = confidenceReport.datasetStats;
    const skillScoreResult = calculateSkillScore(percentiles);
    const coverageResult = calculateCoverage(buildResult.actualRuns);
    const deathDistribution = calculateDeathDistribution(buildResult.from0Freq);
    const passRateChunks = calculatePassRateByChunks(buildResult.actualRuns, buildResult.from0Freq, buildResult.completions || 0);
    const plateauInfo = detectPlateau(entries);
    const spikeDensity = calculateSpikeDensity(buildResult.from0Freq);
    const phaseConsistency = calculatePhaseConsistency(passRateChunks);
    const durationMetadata = getDurationMetadata(options);
    
    let pathResult = null;
    try {
        pathResult = analyzePaths(buildResult.actualRuns, buildResult.bestFrom0, passRateChunks);
    } catch(e) {
        pathResult = { filteredPaths: [], pathsByLength: {}, totalPathLengths: 0, allPaths: [], totalCompletionRoutes: 0, totalPathCount: 0 };
    }
    
    const bestRouteSegments = pathResult.filteredPaths.length > 0 ? (pathResult.filteredPaths[0]?.segments || 0) : 0;
    const routeReliabilityScore = pathResult.filteredPaths.length > 0 ? (pathResult.filteredPaths[0]?.score || 0) : 0;
    const goodScore = Math.max(0.05, 0.40 - Math.max(0, bestRouteSegments - 1) * 0.05);
    const badScore = Math.max(0.0, 0.18 - Math.max(0, bestRouteSegments - 1) * 0.03);
    const routeConfidencePct = bestRouteSegments > 0
        ? clamp(((routeReliabilityScore - badScore) / Math.max(0.0001, (goodScore - badScore))) * 100, 0, 100)
        : 0;

    let routeReliability = "Low";
    if (routeConfidencePct >= 70) routeReliability = "High";
    else if (routeConfidencePct >= 45) routeReliability = "Medium";
    
    // Determine tiers
    const getTier = (score) => {
        if (score >= 85) return 'S';
        if (score >= 75) return 'A';
        if (score >= 60) return 'B';
        if (score >= 45) return 'C';
        if (score >= 30) return 'D';
        return 'F';
    };
    
    const skillTier = getTier(skillScoreResult.score);
    const consistencyTier = getTier(parseFloat(percentiles.consistencyIndex));
    
    // Progress velocity
    const progressVelocity = {
        label: buildResult.bestFrom0 >= 95 ? 'Critical' : 
               buildResult.bestFrom0 >= 80 ? 'High' :
               buildResult.bestFrom0 >= 60 ? 'Medium' :
               buildResult.bestFrom0 >= 40 ? 'Low' : 'Very Low',
        score: Number(safeToFixed(buildResult.bestFrom0 / 100 * 100, 1))
    };
    
    const endgameChunks = passRateChunks.filter(c => c.start >= 70);
    const endgameChunksWithData = endgameChunks.filter(c => c.hasData);
    const endgameConsistency = endgameChunksWithData.length > 0
        ? endgameChunksWithData.reduce((s, c) => s + (c.passRate || 0), 0) / endgameChunksWithData.length
        : (endgameChunks.length > 0 ? endgameChunks.reduce((s, c) => s + (c.passRate || 0), 0) / endgameChunks.length : 50);

    const from0TotalForNerves = (Object.values(buildResult.from0Freq).reduce((a, b) => a + b, 0) || 0) + (buildResult.completions || 0);
    const lateDeaths80 = Object.entries(buildResult.from0Freq)
        .filter(([p]) => parseInt(p, 10) >= 80)
        .reduce((s, [, c]) => s + c, 0);
    const lateDeathPct80 = from0TotalForNerves > 0 ? (lateDeaths80 / from0TotalForNerves) * 100 : 0;
    const endgamePasses = (buildResult.actualRuns || []).reduce((s, r) => {
        if (!r) return s;
        if (safeNum(r.end) >= 100 && safeNum(r.start) >= 70) return s + safeNum(r.count);
        return s;
    }, 0) + safeNum(buildResult.completions);

    const bestFrom0ForScaling = safeNum(buildResult.bestFrom0);
    const endgamePassEvidence = clamp((Math.log10(endgamePasses + 1) / Math.log10(201)) * 100, 0, 100);

    const deep85 = Object.entries(buildResult.from0Freq)
        .filter(([p]) => parseInt(p, 10) >= 85)
        .reduce((s, [, c]) => s + c, 0);
    const deep90 = Object.entries(buildResult.from0Freq)
        .filter(([p]) => parseInt(p, 10) >= 90)
        .reduce((s, [, c]) => s + c, 0);
    const deep95 = Object.entries(buildResult.from0Freq)
        .filter(([p]) => parseInt(p, 10) >= 95)
        .reduce((s, [, c]) => s + c, 0);
    const deepPressureRate = from0TotalForNerves > 0
        ? ((deep85 * 0.35) + (deep90 * 0.60) + (deep95 * 0.90)) / from0TotalForNerves
        : 0;

    const endgameExposure = clamp((bestFrom0ForScaling - 80) / 20, 0, 1);
    const nervesPenalty = clamp(deepPressureRate * 260, 0, 70);
    const completionBonus = (buildResult.completions || 0) > 0 ? 18 : 0;
    const nervesBase = clamp(65 + (endgameExposure * 20) + completionBonus - nervesPenalty, 0, 100);
    const nervesCapNoCompletion = bestFrom0ForScaling >= 95 ? 90 : bestFrom0ForScaling >= 90 ? 85 : 78;
    const nervesControlScore = (buildResult.completions || 0) > 0 ? nervesBase : Math.min(nervesBase, nervesCapNoCompletion);

    const deepFrom0_70 = Object.entries(buildResult.from0Freq)
        .filter(([p]) => parseInt(p, 10) >= 70)
        .reduce((s, [, c]) => s + c, 0);
    const deepFrom0_85 = deep85;
    const weightedDeepRunEvidence = clamp(
        (Math.log10(
            1 +
            (deepFrom0_70 * 1.00) +
            (deep85 * 1.75) +
            (deep90 * 3.00) +
            (deep95 * 5.00) +
            (endgamePasses * 4.00)
        ) / Math.log10(801)) * 100,
        0, 100
    );
    const proofFrom0Evidence70 = clamp((Math.log10(deepFrom0_70 + 1) / Math.log10(401)) * 100, 0, 100);
    const proofFrom0Evidence85 = clamp((Math.log10(deepFrom0_85 + 1) / Math.log10(101)) * 100, 0, 100);

    const proofBase = clamp(
        (bestFrom0ForScaling * 0.30) +
        (proofFrom0Evidence70 * 0.20) +
        (proofFrom0Evidence85 * 0.18) +
        (weightedDeepRunEvidence * 0.24) +
        (routeConfidencePct * 0.08) +
        ((buildResult.completions || 0) > 0 ? 22 : 0),
        0, 100
    );

    const proofCapNoCompletion =
        bestFrom0ForScaling >= 95 ? 92 :
        bestFrom0ForScaling >= 90 ? 84 :
        bestFrom0ForScaling >= 85 ? 65 : 55;
    const proofScore = (buildResult.completions || 0) > 0 ? clamp(proofBase, 0, 100) : clamp(proofBase, 0, proofCapNoCompletion);
    
    const volumePct = Math.min(1, attemptStats.totalAttempts / 1200) * 100;
    const datasetStats = confidenceReport.datasetStats;
    const bestFrom0Weight = getWeight("completionProbability.bestFrom0", datasetStats);
    const nervesWeight = getWeight("completionProbability.nervesControl", datasetStats);
    const proofWeight = Math.min(0.25, getWeight("completionProbability.proofScore", datasetStats));
    const consistencyWeight = getWeight("completionProbability.consistencyIndex", datasetStats);
    const coverageWeight = getWeight("completionProbability.coverage", datasetStats);
    // READINESS CALIBRATION v8.3-PRO
    // Rebalanced toward real GD progression principles:
    // INCREASED: deep-run evidence (0.17→0.21), route proof (0.26→0.27), 
    //            endgame exposure (0.19→0.22), repeated ending access
    // REDUCED: raw mechanical estimates, generic consistency metrics, coverage
    // Total weight = 1.05 (clamped to 100 via Math.min)
    const READINESS_WEIGHTS = {
        bestFrom0: 0.26,           // Proven progression depth: primary driver
        proofScore: 0.27,           // Route proof: INCREASED (completion path evidence)
        deepRuns: 0.21,             // Repeated ending access / deep-run evidence: INCREASED
        endgame: 0.22,              // Endgame exposure: INCREASED (finishing ability)
        nerves: 0.05,               // Nerves: reduced (overlap with proof)
        skill: 0.02,                // Raw mechanical estimate: REDUCED
        consistency: 0.01,          // Generic consistency: REDUCED
        route: 0.02,                // Route confidence: reduced
        coverage: 0.02              // Coverage: reduced
    };
    let readinessScore = Math.min(100, Math.max(0,
        (buildResult.bestFrom0 * READINESS_WEIGHTS.bestFrom0) +
        (proofScore * READINESS_WEIGHTS.proofScore) +
        (weightedDeepRunEvidence * READINESS_WEIGHTS.deepRuns) +
        (endgameConsistency * READINESS_WEIGHTS.endgame) +
        (nervesControlScore * READINESS_WEIGHTS.nerves) +
        (skillScoreResult.score * READINESS_WEIGHTS.skill) +
        (parseFloat(percentiles.consistencyIndex) * READINESS_WEIGHTS.consistency) +
        (routeConfidencePct * READINESS_WEIGHTS.route) +
        (coverageResult.practice * READINESS_WEIGHTS.coverage)
    ));
    // Completion probability is independent of readiness to avoid circular scoring.
    const completionProbabilityRaw = Math.min(100, Math.max(0,
        (bestFrom0ForScaling * bestFrom0Weight) +
        (proofScore * proofWeight) +
        (weightedDeepRunEvidence * 0.16) +
        (endgameConsistency * consistencyWeight) +
        (nervesControlScore * nervesWeight * 0.35) +
        (coverageResult.practice * coverageWeight) +
        (routeConfidencePct * 0.02) +
        (volumePct * 0.005)
    ));
    let completionProbability = (buildResult.completions || 0) > 0
        ? completionProbabilityRaw
        : Math.min(
            completionProbabilityRaw,
            clamp(
                42 +
                (proofScore * 0.28) +
                (weightedDeepRunEvidence * 0.22) +
                (endgameConsistency * 0.16) +
                (bestFrom0ForScaling * 0.18) +
                (nervesControlScore * 0.04),
                0, 96
            )
        );

    const enduranceRating = calculateEnduranceRating({
        hasCompletion: (buildResult.completions || 0) > 0,
        bestFrom0: buildResult.bestFrom0,
        consistencyIndex: percentiles.consistencyIndex,
        endgameConsistency
    }, durationMetadata);
    completionProbability = adjustCompletionProbabilityForDuration(completionProbability, durationMetadata, {
        endgameConsistency,
        proofScore,
        enduranceRating
    });
    readinessScore = adjustReadinessForDuration(readinessScore, durationMetadata, {
        endgameConsistency,
        proofScore,
        enduranceRating
    });

    const deathClusters = calculateWallClusters(buildResult.from0Freq);
    const volatilityLevel = buildResult.bestFrom0 > 80 && parseFloat(percentiles.consistencyIndex) < 40 ? 'High' :
        buildResult.bestFrom0 > 60 && parseFloat(percentiles.consistencyIndex) < 50 ? 'Medium' : 'Low';

    const runsTo100 = (buildResult.startposRuns || []).filter(r => safeNum(r.end) >= 100);
    const practiceCompletionRate = buildResult.totalStartposAttempts > 0
        ? runsTo100.reduce((s, r) => s + safeNum(r.count), 0) / buildResult.totalStartposAttempts
        : 0;
    const verifiedRouteCount = pathResult.filteredPaths.length;
    const endgameRouteCount = pathResult.filteredPaths.filter(p =>
        (p.runs || []).some(r => safeNum(r.end) >= 90)
    ).length;

    const normalizedRouteReliability = clamp(routeConfidencePct / 100, 0, 1);
    const attemptResult = calculateRealisticAttempts({
        ...buildResult,
        routeReliability: normalizedRouteReliability,
        coverage: coverageResult.practice,
        verifiedRouteCount,
        endgameRouteCount,
        practiceCompletionRate
    }, percentiles, difficultyMultiplier, {
        proofScore,
        skillScore: skillScoreResult.score,
        endgameConsistency,
        nervesControlScore,
        plateauFactor: plateauInfo.factor || 1,
        spikeDensity: spikeDensity.density || 0,
        wallClusters: deathClusters.length,
        volatilityLevel,
        completionProbability
    }, durationMetadata.enabled ? durationMetadata.durationSeconds : null);

    const estimatedAttempts = Math.max(50, Math.round(attemptResult.estimate * (plateauInfo.plateau ? Math.min(1.15, plateauInfo.factor || 1) : 1)));
    const attemptEstimateConfidence = attemptResult.confidence || "moderate";

    const hotspots = detectHotspots(buildResult, durationMetadata.enabled ? durationMetadata.durationSeconds : null);

    // BUG FIX v8.3: Demon readiness is now ABSOLUTE — uses fixed Medium Demon (2.0) baseline
    // Selected difficulty only affects: main readiness, coach, forecast, highlighting
    // Compute absolute readiness using ONLY raw data metrics — completely independent
    // of any difficulty selection, duration adjustments, or other calibrated values.
    // Uses same weight distribution as main readiness for consistency.
    const absoluteReadiness = Math.min(100, Math.max(0,
        (buildResult.bestFrom0 * 0.28) +           // Proven progression depth
        (proofScore * 0.29) +                       // Route proof: slightly higher for absolute
        (endgameConsistency * 0.23) +               // Endgame exposure
        (weightedDeepRunEvidence * 0.22) +          // Repeated ending access: INCREASED
        (nervesControlScore * 0.05) +               // Nerves
        (skillScoreResult.score * 0.02) +           // Raw mechanical estimate: REDUCED
        (parseFloat(percentiles.consistencyIndex) * 0.01)  // Generic consistency: REDUCED
    ));

    const ABSOLUTE_DEMON_BASELINE = 2.0; // Medium Demon = neutral reference
    const demonReadiness = {};
    const demonThresholds = {
        easy: 1.5, medium: 2.0, hard: 3.0, insane: 4.5, extreme: 7.0
    };
    const demonReadinessCapNoCompletion = (buildResult.completions || 0) > 0
        ? 100
        : Math.min(99, 62 + (proofScore * 0.62) + Math.max(0, bestFrom0ForScaling - 52) * 0.58);

    for (const [key, threshold] of Object.entries(demonThresholds)) {
        // FIXED: Use absolute baseline (2.0 = Medium Demon) instead of selected difficulty
        // This ensures demon cards never change when difficulty selection changes
        const relativeScale = ABSOLUTE_DEMON_BASELINE / threshold;
        const isEasierThanBaseline = relativeScale > 1;
        const easierBoost = isEasierThanBaseline
            ? (1 + Math.min(0.30, (relativeScale - 1) * 0.25) * (proofScore / 100))
            : 1;
        const harderPenalty = !isEasierThanBaseline ? Math.pow(relativeScale, 0.70) : 1;
        const readinessUncapped = absoluteReadiness * easierBoost * harderPenalty;
        const readiness = (buildResult.completions || 0) > 0 ? readinessUncapped : Math.min(readinessUncapped, demonReadinessCapNoCompletion);
        const requiredBest = key === 'easy' ? 65 :
            key === 'medium' ? 70 :
            key === 'hard' ? 75 :
            key === 'insane' ? 80 : 88;
        demonReadiness[key] = {
            readiness: Number(safeToFixed(readiness, 1)),
            ready: readiness >= 60 && buildResult.bestFrom0 >= requiredBest,
            scores: {
                mechanical: Number(safeToFixed(skillScoreResult.score * 0.8, 1)),
                consistency: Number(percentiles.consistencyIndex),
                endurance: Number(safeToFixed(buildResult.bestFrom0 * 0.9, 1)),
                nerves: Number(safeToFixed(nervesControlScore, 1)),
                proof: Number(safeToFixed(proofScore, 1))
            }
        };
    }
    
    // Coach suggestions
    const coachSuggestions = {
        nextAction: '',
        biggestGap: '',
        bestRoute: '',
        strongAreas: '',
        todayFocus: ''
    };
    
    if (pathResult.filteredPaths.length > 0) {
        const bestRoute = pathResult.filteredPaths[0];
        coachSuggestions.bestRoute = bestRoute.route.join(' → ');
    }
    
    // Find biggest gap
    if (coverageResult.gaps.length > 0) {
        const biggestGap = coverageResult.gaps.reduce((max, g) => 
            (g.end - g.start) > (max.end - max.start) ? g : max, coverageResult.gaps[0]);
        coachSuggestions.biggestGap = `${biggestGap.start}% - ${biggestGap.end}%`;
    }
    
    const strongChunks = passRateChunks
        .filter(c => c.hasData && c.samples >= 5 && c.passRate >= 80)
        .sort((a, b) => b.passRate - a.passRate);

    const mergedStrong = [];
    const sortedStrong = strongChunks.slice().sort((a, b) => a.start - b.start);
    for (const c of sortedStrong) {
        const last = mergedStrong[mergedStrong.length - 1];
        if (!last) mergedStrong.push({ start: c.start, end: c.end, avg: c.passRate, n: 1 });
        else if (c.start <= last.end) {
            last.avg = (last.avg * last.n + c.passRate) / (last.n + 1);
            last.n += 1;
            last.end = Math.max(last.end, c.end);
        } else mergedStrong.push({ start: c.start, end: c.end, avg: c.passRate, n: 1 });
    }
    const strongAreas = mergedStrong
        .sort((a, b) => b.avg - a.avg)
        .slice(0, 3)
        .map(r => `${r.start}% - ${r.end}%`);
    coachSuggestions.strongAreas = strongAreas.length > 0 ? strongAreas.join(', ') : 'None identified';
    
    // Next action based on best from0
    if (buildResult.bestFrom0 < 30) {
        coachSuggestions.nextAction = 'Focus on learning the early game (0-30%). Build muscle memory.';
        coachSuggestions.todayFocus = 'Grind 0-30% until consistent. Track death locations.';
    } else if (buildResult.bestFrom0 < 60) {
        coachSuggestions.nextAction = `Practice ${buildResult.bestFrom0}-80% with startpos. Bridge the mid-game gap.`;
        coachSuggestions.todayFocus = `50% from-0 attempts, 50% ${buildResult.bestFrom0}-80% startpos practice.`;
    } else if (buildResult.bestFrom0 < 90) {
        coachSuggestions.nextAction = `Endgame practice: ${buildResult.bestFrom0}-100%. You're close!`;
        coachSuggestions.todayFocus = `30% from-0, 70% ${buildResult.bestFrom0}-100% startpos grind.`;
    } else {
        coachSuggestions.nextAction = 'Final push! Focus on nerves and consistency at 90-100%.';
        coachSuggestions.todayFocus = 'Full attempts with mental preparation. You can do this!';
    }
    
    // Nerve chart data
    const nerveChart = [];
    for (let i = 0; i <= 100; i += 2) {
        const block = Math.floor(i / 10);
        const chunk = passRateChunks[block];
        const passRate = chunk ? chunk.passRate : 50;
        const deathsNear = Object.entries(buildResult.from0Freq)
            .filter(([p]) => Math.abs(parseInt(p) - i) <= 3)
            .reduce((s, [, c]) => s + c, 0);
        const nerveScore = Math.min(100, Math.max(0,
            (100 - passRate) * 0.6 + 
            (deathsNear > 0 ? 30 : 0) +
            (i > 85 ? 20 : 0)
        ));
        let riskZone = 'LOW';
        if (nerveScore > 70) riskZone = 'CRITICAL';
        else if (nerveScore > 50) riskZone = 'HIGH';
        else if (nerveScore > 30) riskZone = 'MEDIUM';
        
        nerveChart.push({
            percent: i,
            nerveScore: Number(safeToFixed(nerveScore, 1)),
            riskZone,
            passRate: Number(safeToFixed(passRate, 1))
        });
    }
    
    const from0TotalForPressure = Object.values(buildResult.from0Freq).reduce((a, b) => a + b, 0);
    const openingDeaths = Object.entries(buildResult.from0Freq)
        .filter(([p]) => parseInt(p) <= 5)
        .reduce((s, [, c]) => s + c, 0);
    const openingPressure = {
        isolated: openingDeaths > (from0TotalForPressure * 0.3),
        percentage: from0TotalForPressure > 0 ? Number(safeToFixed((openingDeaths / from0TotalForPressure) * 100, 1)) : 0
    };

    const stressIndex = nerveChart.length > 0
        ? nerveChart.filter(p => p.riskZone === 'HIGH' || p.riskZone === 'CRITICAL').length / nerveChart.length
        : 0;

    const largestGap = (coverageResult.gaps || []).reduce((m, g) => Math.max(m, (g.end - g.start)), 0);
    const gapPenalty = largestGap >= 20 ? 12 : largestGap >= 10 ? 6 : 0;

    // GRADE CALIBRATION v8.3-PRO: Normalized weights (sum = 1.0)
    // Previous weights summed to 1.24 causing grade inflation.
    // Coverage, route count, and endgame exposure are now capped to prevent dominance.
    const GRADE_WEIGHTS = {
        skill: 0.16,
        consistency: 0.16,
        bestFrom0: 0.22,
        endgame: 0.24,
        route: 0.12,
        coverage: 0.10
    };
    // Endgame cap: cannot contribute more than 28 points even with 100% consistency
    const cappedEndgame = Math.min(endgameConsistency, 85);
    // Route cap: cannot contribute more than 14 points
    const cappedRoute = Math.min(routeConfidencePct, 70);
    // Coverage cap: cannot contribute more than 10 points
    const cappedCoverage = Math.min(coverageResult.practice, 80);

    const gradeScoreRaw = (
        (skillScoreResult.score * GRADE_WEIGHTS.skill) +
        (parseFloat(percentiles.consistencyIndex) * GRADE_WEIGHTS.consistency) +
        (buildResult.bestFrom0 * GRADE_WEIGHTS.bestFrom0) +
        (cappedEndgame * GRADE_WEIGHTS.endgame) +
        (cappedRoute * GRADE_WEIGHTS.route) +
        (cappedCoverage * GRADE_WEIGHTS.coverage)
    ) - (gapPenalty * 0.5);
    const gradeScore = adjustGradeForDuration(
        Math.min(100, Math.max(0, gradeScoreRaw)),
        durationMetadata,
        buildResult.bestFrom0
    );
    
    const result = {
        hasData: attemptStats.totalAttempts > 0 || buildResult.bestFrom0 > 0,
        // Raw input data for debugging and complete export
        _rawInput: inputText.substring(0, 50000), // Cap at 50KB to prevent memory issues
        _difficultyMultiplier: difficultyMultiplier,
        _difficultyLabel: options.difficultyLabel || '',
        _lengthCategory: options.officialLengthCategory || '',
        _customDuration: options.duration || '',
        _customDurationMode: options.durationMode || '',
        totalAttempts: attemptStats.totalAttempts,
        bestFrom0: buildResult.bestFrom0,
        routes: pathResult.filteredPaths,
        totalRoutes: pathResult.totalPathCount || pathResult.totalCompletionRoutes,
        estimatedAttempts,
        attemptEstimateConfidence,
        attemptEstimateBreakdown: attemptResult.breakdown || {},
        skillScore: Number(safeToFixed(skillScoreResult.score, 1)),
        consistency: Number(safeToFixed(parseFloat(percentiles.consistencyIndex), 1)),
        readiness: Number(safeToFixed(readinessScore, 1)),
        coverage: Number(safeToFixed(coverageResult.practice, 1)),
        routeSegments: pathResult.filteredPaths.length > 0 ? pathResult.filteredPaths[0].segments : 0,
        deathDistribution,
        from0Freq: buildResult.from0Freq,
        actualRuns: buildResult.actualRuns,
        from0Runs: buildResult.from0Runs,
        startposRuns: buildResult.startposRuns,
        completionRuns: buildResult.completionRuns,
        bestRunsAll: buildResult.allRuns,
        sourceSeparation: {
            from0Runs: buildResult.from0Runs,
            startposRuns: buildResult.startposRuns,
            completionRuns: buildResult.completionRuns,
            allRuns: buildResult.allRuns,
            sourceCounts: buildResult.sourceCounts
        },
        sourceFlags: {
            from0: "single_percent_entries",
            startpos: "hyphenated_ranges",
            completion: "explicit_completion_markers_only"
        },
        routeReliability,
        percentiles,
        segmentData: passRateChunks.map(c => ({
            start: c.start,
            end: c.end,
            passRate: c.passRate,
            deaths: c.deaths
        })),
        passRateByChunks: passRateChunks,
        startposAttempts: attemptStats.startposAttempts,
        completions: buildResult.completions || 0,
        from0Deaths: attemptStats.from0Deaths,
        from0Attempts: attemptStats.totalFrom0Attempts,
        mode: attemptStats.completions > 0 ? 'completion_verified' : 
              buildResult.bestFrom0 >= 90 ? 'endgame' :
              buildResult.bestFrom0 >= 50 ? 'midgame' : 'early',
        coverageGaps: coverageResult.gaps,
        skillTier,
        consistencyTier,
        nervesTier: getTier(nervesControlScore),
        readinessBreakdown: {
            skill: Number(safeToFixed(skillScoreResult.score, 1)),
            consistency: Number(safeToFixed(parseFloat(percentiles.consistencyIndex), 1)),
            ending: Number(safeToFixed(buildResult.bestFrom0 * 0.8, 1)),
            nerves: Number(safeToFixed(nervesControlScore, 1))
        },
        overallGrade: {
            tier: getTier(gradeScore),
            score: Number(safeToFixed(gradeScore, 1)),
            breakdown: {
                skillComponent: Number(safeToFixed(skillScoreResult.score, 1)),
                consistencyComponent: Number(safeToFixed(parseFloat(percentiles.consistencyIndex), 1)),
                readinessComponent: Number(safeToFixed(readinessScore, 1)),
                endgameComponent: Number(safeToFixed(endgameConsistency, 1)),
                routeComponent: Number(safeToFixed(routeConfidencePct, 1)),
                coverageComponent: Number(safeToFixed(coverageResult.practice, 1))
            }
        },
        completionProbability: Number(safeToFixed(completionProbability, 1)),
        progressVelocity,
        demonReadiness,
        confidenceReport,
        confidenceLevel: confidenceReport.confidenceLevel,
        provisionalWeights: confidenceReport.provisionalWeights,
        datasetSafeguards: {
            minAttemptsForConfidence: 100,
            confidenceLevel: confidenceReport.confidenceLevel,
            sourceAvailability: confidenceReport.sourceAvailability
        },
        spikeDensity,
        plateau: plateauInfo,
        phaseConsistency,
        durationMetadata,
        durationMetrics: {
            enabled: durationMetadata.enabled,
            enduranceRating,
            deathDensity: durationMetadata.enabled ? calculateDeathDensity(attemptStats.from0Deaths, durationMetadata.durationSeconds, options.difficultyLabel, durationMetadata.durationConfidence) : null,
            consistencyPerMinute: durationMetadata.enabled ? calculateConsistencyPerMinute(percentiles.consistencyIndex, durationMetadata.durationSeconds, durationMetadata.durationConfidence) : null,
            timeNormalizedStress: durationMetadata.enabled ? calculateTimeNormalizedStress(deathDistribution, durationMetadata.durationSeconds, durationMetadata.durationConfidence) : null,
            routeEfficiency: durationMetadata.enabled ? calculateRouteEfficiency(buildResult.startposRuns, coverageResult.practice, durationMetadata.durationSeconds, durationMetadata.durationConfidence) : null,
            practiceDensity: durationMetadata.enabled ? calculatePracticeDensity(attemptStats.startposAttempts, durationMetadata.durationSeconds, durationMetadata.durationConfidence) : null,
            enduranceExposure: durationMetadata.enabled ? calculateEnduranceExposure(buildResult.bestFrom0, durationMetadata.durationSeconds, attemptStats.totalFrom0Attempts, durationMetadata.durationConfidence) : null,
            adjustmentCaps: { readiness: 8, completionProbability: 10, grade: 5, attempts: 0.25 }
        },
        coachSuggestions,
        nerveChart,
        deathClusters,
        hotspots,
        openingPressure,
        stableRuns: buildResult.actualRunsSorted.slice(0, 20).map(r => ({
            ...r,
            stabilityScore: Number(safeToFixed(r.length * Math.log(r.count + 1), 1))
        })),
        longestRuns: buildResult.actualRunsByLength.slice(0, 20),
        bestRuns: buildResult.actualRunsSorted.slice(0, 20),
        volatility: volatilityLevel,
        confidenceInterval: `±${Math.round(estimatedAttempts * 0.3)}`,
        nerveChokeType: Object.entries(buildResult.from0Freq).some(([p, c]) => parseInt(p) > 85 && c > 5) ? 'NERVE' : 'SKILL'
    };
    
    return result;
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        analyzeInput, parseMetricsLine, buildRuns, analyzePaths,
        calculateRealisticAttempts, validateInput,
        calculateCoverage, calculateDeathDistribution, calculateFrom0Percentiles,
        calculateSkillScore, round1, safeNum, getColorTier,
        calculatePassRateByChunks, pathCoversFullLevel,
        parseRunsSegment, parseFrom0Segment, parseCompletionSegment,
        calculateSpikeDensity, calculateWallClusters, calculatePhaseConsistency,
        detectPlateau, getConfidenceLevel, getWeight, getEffectiveWeight,
        parseDuration, parseDurationInput, formatDuration, detectDurationMode, DURATION_MODE,
        getDurationFactor, calculateDurationAwareAttempts,
        getDefaultDurationForCategory, getDurationCategory, applyDurationConfidence, getDurationMetadata,
        getExpectedDeathDensity, getDeathDensityInterpretation,
        calculateDeathDensity, calculatePracticeDensity, calculateEnduranceRating,
        adjustReadinessForDuration, adjustCompletionProbabilityForDuration, adjustGradeForDuration,
        detectHotspots, safeToFixed,
        // R2, R6, R9, R10 additions
        countViableRoutes, detectDeathClusters,
        calculateReadiness, calculateRouteProof, calculateEndurance,
        getTierFromScore, calculateDurationReadinessImpact
    };
}
