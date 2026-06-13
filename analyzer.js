/**
 * GEOMETRY DASH COGNITIVE ANALYZER v7.0
 * Fixed: Path overlap tolerance, heatmap colors, 100% handling, decimal rounding
 * ============================================================
 */

const RANGE_PATTERN = /(?:^|\s)(\d{1,3})\s*%?\s*-\s*(\d{1,3})\s*%?\s*x\s*(\d+)(?=[\s,]|$)/gi;
const SINGLE_PATTERN = /(?:^|\s)(\d{1,3})\s*%?\s*x\s*(\d+)(?=[\s,]|$)/gi;
const BEAT_PATTERN = /(?:beat|beats|beaten|completed|cleared?|clear|won)\s*x\s*(\d+)/gi;
const LABEL_SEGMENT_PATTERN = /((?:from\s*0|from0)|(?:runs?)|(?:startpos(?:\s+runs)?))\s*:/gi;
const SECTION_LABELS = ["from 0:", "from0:", "runs:", "run:", "startpos:", "startpos runs:"];

const MIN_SEGMENT_SAMPLES = 1;
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

// ============================================================================
// PARSING
// ============================================================================

function parseRunsSegment(blob) {
    const entries = [];
    const cleaned = blob.toLowerCase().replace(/[^0-9xto\-\s%]/g, "").replace(/\s*to\s*/g, "-");
    let match;
    RANGE_PATTERN.lastIndex = 0;
    while ((match = RANGE_PATTERN.exec(cleaned)) !== null) {
        const start = parseInt(match[1], 10);
        const end = parseInt(match[2], 10);
        const count = parseInt(match[3], 10);
        if (start > 100 || end > 100) continue;
        if (end < start) continue;
        if (start === 0 && end === 100) {
            entries.push({ type: "completion", start, end, count, length: 100 });
        } else {
            entries.push({ type: "run", start, end, count, length: end - start });
        }
    }
    return entries;
}

function parseFrom0Segment(blob) {
    const entries = [];
    const cleaned = blob.toLowerCase().replace(/[^0-9xto\-\s%]/g, "").replace(/\s*to\s*/g, "-");
    let match;
    SINGLE_PATTERN.lastIndex = 0;
    while ((match = SINGLE_PATTERN.exec(cleaned)) !== null) {
        const percent = parseInt(match[1], 10);
        const count = parseInt(match[2], 10);
        if (percent > 100) continue;
        if (percent === 100) {
            entries.push({ type: "completion", start: 0, end: 100, count, length: 100 });
            continue;
        }
        entries.push({ type: "from0", percent, count });
    }
    return entries;
}

function validateInput(text) {
    return text && text.trim().length > 0;
}

function parseMetricsLine(line) {
    const entries = [];
    const normalized = (line || "").trim();
    const lower = normalized.toLowerCase();
    
    const lm = lower.match(LABEL_SEGMENT_PATTERN);
    if (lm && lm.length > 0) {
        const label = lm[0].toLowerCase();
        const labelIdx = lower.indexOf(label);
        const payload = labelIdx >= 0 ? normalized.slice(labelIdx + lm[0].length).trim() : normalized;
        if (label.includes("from 0") || label.includes("from0")) {
            entries.push(...parseFrom0Segment(payload));
        } else {
            entries.push(...parseRunsSegment(payload));
        }
    } else {
        const runEntries = parseRunsSegment(normalized);
        if (runEntries.length > 0) {
            entries.push(...runEntries);
        } else {
            entries.push(...parseFrom0Segment(normalized));
        }
    }
    
    return entries;
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
        if (e.type === "from0") from0Deaths += e.count;
        else if (e.type === "completion") completions += e.count;
        else startpos += e.count;
    }
    return { totalAttempts: total, from0Deaths, startposAttempts: startpos, completions, totalFrom0Attempts: from0Deaths + completions };
}

// ============================================================================
// RUN BUILDING
// ============================================================================

function buildRuns(entries) {
    let bestFrom0 = 0, completions = 0;
    const from0Freq = {};
    const actualRuns = [];
    
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (!e || !e.type) continue;
        
        if (e.type === "from0") {
            const p = safeNum(e.percent, -1);
            if (p < 0 || p > 100) continue;
            if (p === 100) {
                completions += safeNum(e.count);
                actualRuns.push({ type: "completion", start: 0, end: 100, count: safeNum(e.count), length: 100 });
                bestFrom0 = 100;
                continue;
            }
            if (p > 0) {
                bestFrom0 = Math.max(bestFrom0, p);
                from0Freq[p] = (from0Freq[p] || 0) + safeNum(e.count);
            }
            actualRuns.push({
                type: "from0_run", start: 0, end: p, length: p,
                count: safeNum(e.count), percent: p
            });
            continue;
        }
        
        if (e.type === "completion") {
            completions += safeNum(e.count);
            actualRuns.push({
                type: "completion", start: safeNum(e.start, 0), end: safeNum(e.end, 100),
                count: safeNum(e.count), length: 100
            });
            if (e.start === 0 && e.end === 100) bestFrom0 = 100;
            continue;
        }
        
        if (e.type === "run") {
            const start = safeNum(e.start);
            const end = safeNum(e.end);
            if (start < 0 || end < 0 || start > 100 || end > 100) continue;
            if (end < start) continue;
            const length = safeNum(e.length, end - start);
            actualRuns.push({ type: "run", start, end, count: safeNum(e.count), length });
        }
    }
    
    return {
        bestFrom0, completions, actualRuns,
        actualRunsSorted: actualRuns.slice().sort(function(a, b) {
            return (b.length * Math.log(b.count + 1)) - (a.length * Math.log(a.count + 1));
        }),
        actualRunsByLength: actualRuns.slice().sort(function(a, b) {
            return b.length - a.length;
        }),
        from0Freq
    };
}

// ============================================================================
// PATHS — STRICT OVERLAP BFS v3.0
// ============================================================================

function canConnect(prevEnd, nextStart) {
    return nextStart <= prevEnd;  // Strict overlap only
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
    const pool = [];
    const segmentMap = new Map();
    
    for (let i = 0; i < (actualRuns || []).length; i++) {
        const r = actualRuns[i];
        if (!r || r.start === undefined || r.end === undefined) continue;
        const start = safeNum(r.start);
        const end = safeNum(r.end);
        if (start < 0 || end < 0 || start > 100 || end > 100) continue;
        if (end <= start) continue;
        const key = start + "_" + end;
        const length = safeNum(r.length, end - start);
        const count = safeNum(r.count);
        if (!segmentMap.has(key)) {
            segmentMap.set(key, { type: r.type, start, end, length, count: 0, occurrences: 0 });
        }
        const agg = segmentMap.get(key);
        agg.count += count;
        agg.occurrences += 1;
        if (agg.type !== "completion" && r.type === "completion") agg.type = "completion";
    }
    
    for (const agg of segmentMap.values()) {
        if (agg.type === "virtual" || agg.type === "completion" || agg.count >= MIN_SEGMENT_SAMPLES) {
            pool.push(agg);
        }
    }
    
    if (bestFrom0 > 0) {
        let hasZeroToBest = false;
        for (const seg of pool) {
            if (seg.start === 0 && seg.end >= bestFrom0) {
                hasZeroToBest = true;
                break;
            }
        }
        if (!hasZeroToBest) {
            const virtualCount = Math.max(1, Math.floor(bestFrom0 / 5));
            pool.push({ type: "virtual", start: 0, end: bestFrom0, length: bestFrom0, count: virtualCount, occurrences: 1 });
        }
    }
    
    if (pool.length === 0) {
        return {
            filteredPaths: [], pathsByLength: {}, totalPathLengths: 0,
            allPaths: [], totalCompletionRoutes: 0, totalPathCount: 0
        };
    }
    
    const segmentWeight = function(r) {
        return safeNum(r.length) * Math.log(safeNum(r.count) + 1);
    };
    
    const poolByEnd = pool.slice().sort((a, b) => b.end - a.end);
    
    const queue = [{ cp: 0, path: [] }];
    let head = 0;
    const allPaths = [];
    let iterations = 0;
    const startTime = Date.now();
    let bestCompletionSegments = Infinity;
    
    while (head < queue.length && allPaths.length < MAX_PATHWAYS) {
        iterations++;
        if (iterations > MAX_BFS_ITERATIONS || (Date.now() - startTime) > BFS_TIMEOUT_MS) {
            break;
        }
        
        const item = queue[head++];
        const cp = item.cp;
        const path = item.path;
        
        if (cp >= 100) {
            allPaths.push(path);
            if (path.length < bestCompletionSegments) bestCompletionSegments = path.length;
            continue;
        }
        
        if (path.length >= bestCompletionSegments) {
            continue;
        }
        
        const opts = [];
        for (let i = 0; i < poolByEnd.length; i++) {
            const r = poolByEnd[i];
            const canUse = (r.start <= cp) && (r.end > cp);
            
            if (canUse) {
                let alreadyUsed = false;
                for (let j = 0; j < path.length; j++) {
                    if (path[j].start === r.start && path[j].end === r.end) {
                        alreadyUsed = true;
                        break;
                    }
                }
                if (!alreadyUsed) {
                    opts.push(r);
                    if (opts.length >= MAX_OPTS_PER_NODE) break;
                }
            }
        }
        
        for (let i = 0; i < opts.length && allPaths.length < MAX_PATHWAYS; i++) {
            const r = opts[i];
            const newPath = path.slice();
            newPath.push(r);
            queue.push({ cp: Math.max(cp, r.end), path: newPath });
        }
    }
    
    const pathScore = function(p) {
        let score = 0;
        for (let i = 0; i < p.length; i++) score += segmentWeight(p[i]);
        return score;
    };
    
    const scoreRoute = function(path) {
        if (!passRateChunks || passRateChunks.length === 0) {
            let score = 0;
            for (let i = 0; i < path.length; i++) score += segmentWeight(path[i]);
            return score;
        }
        let accumulated = 1.0;
        for (let i = 0; i < path.length; i++) {
            const seg = path[i];
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
    
    const completionRoutes = [];
    for (let i = 0; i < allPaths.length; i++) {
        const p = allPaths[i];
        if (p.length > 0 && pathCoversFullLevel(p)) {
            completionRoutes.push(p);
        }
    }
    
    const seen = new Set();
    const uniquePaths = [];
    for (let i = 0; i < completionRoutes.length; i++) {
        const p = completionRoutes[i];
        const s = p.map(function(r) { return r.start + "_" + r.end; }).join("|");
        if (!seen.has(s)) {
            seen.add(s);
            uniquePaths.push(p);
        }
    }
    
    uniquePaths.sort((a, b) => {
        if (a.length !== b.length) return a.length - b.length;
        const sa = scoreRoute(a);
        const sb = scoreRoute(b);
        if (sb !== sa) return sb - sa;
        return 0;
    });
    
    const formattedPaths = uniquePaths.map(function(p) {
        const routeScore = scoreRoute(p);
        return {
            segments: p.length,
            totalLength: p.reduce(function(sum, r) { return sum + r.length; }, 0),
            start: 0, end: 100,
            route: p.map(function(r) { return r.start + "-" + r.end + "%"; }),
            runs: p,
            score: routeScore
        };
    });
    
    const byLen = {};
    let total = 0;
    for (let i = 0; i < uniquePaths.length; i++) {
        const p = uniquePaths[i];
        const l = p.length;
        total += l;
        if (!byLen[l]) byLen[l] = [];
        byLen[l].push(p);
    }
    
    return {
        filteredPaths: formattedPaths,
        pathsByLength: byLen,
        totalPathLengths: total,
        allPaths: uniquePaths,
        totalCompletionRoutes: completionRoutes.length,
        totalPathCount: completionRoutes.length,
        hasFrom0Data: bestFrom0 > 0,
        bestFrom0: bestFrom0
    };
}

// ============================================================================
// DEATH DISTRIBUTION & HEATMAP
// ============================================================================

function calculateDeathDistribution(from0Freq) {
    const total = Object.values(from0Freq).reduce(function(a, b) { return a + b; }, 0);
    if (total === 0) return [];
    const maxBlockDeaths = Math.max(...Object.values(from0Freq || {}), 1);
    const dist = [];
    
    for (let i = 0; i < 20; i++) {
        const start = i * 5, end = (i + 1) * 5;
        let deaths = 0;
        const keys = Object.keys(from0Freq);
        for (let j = 0; j < keys.length; j++) {
            const p = parseInt(keys[j], 10);
            const c = from0Freq[keys[j]];
            if (p >= start && p < end) deaths += c;
        }
        if (deaths > 0) {
            const pct = (deaths / total) * 100;
            const ratio = deaths / maxBlockDeaths;
            const colorTier = getColorTier(ratio);
            
            dist.push({
                segment: start + "-" + end,
                start, end, deaths,
                percentage: pct.toFixed(1),
                colorTier: colorTier,
                ratio: ratio.toFixed(3)
            });
        }
    }
    return dist.sort(function(a, b) { return parseFloat(b.percentage) - parseFloat(a.percentage); });
}

function getColorTier(ratio) {
    if (ratio >= 0.7) return 'high';
    if (ratio >= 0.35) return 'medium';
    if (ratio > 0) return 'low';
    return 'safe';
}

// ============================================================================
// PERCENTILES & METRICS
// ============================================================================

function calculateFrom0Percentiles(from0Freq, completions) {
    const sortedPercents = Object.keys(from0Freq).map(Number).sort(function(a, b) { return a - b; });
    const totalDeaths = sortedPercents.reduce(function(sum, p) { return sum + (from0Freq[p] || 0); }, 0);
    const totalAttempts = totalDeaths + completions;
    
    if (totalAttempts === 0) {
        return { p10: 0, p25: 0, p50: 0, p75: 0, p90: 0, best: 0, mean: 0, stdDev: 0, attempts: 0, consistencyIndex: 0 };
    }
    
    let cumulative = 0;
    const cumMap = new Map();
    for (let i = 0; i < sortedPercents.length; i++) {
        const p = sortedPercents[i];
        cumulative += from0Freq[p];
        cumMap.set(p, cumulative);
    }
    cumulative += completions;
    
    const getPercentile = function(p) {
        const target = Math.ceil((p / 100) * totalAttempts);
        if (target > totalAttempts - completions) return 100;
        for (let i = 0; i < sortedPercents.length; i++) {
            const percent = sortedPercents[i];
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
    for (let i = 0; i < sortedPercents.length; i++) {
        const p = sortedPercents[i];
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
    
    return { p10, p25, p50, p75, p90, best, mean: mean.toFixed(1), stdDev: stdDev.toFixed(1), attempts: totalAttempts, consistencyIndex: consistencyIndex.toFixed(1) };
}

function calculateSkillScore(percentiles) {
    const best = percentiles.best;
    const p90 = percentiles.p90, p75 = percentiles.p75, p50 = percentiles.p50;
    const consistencyIndex = parseFloat(percentiles.consistencyIndex);
    
    const peakSkill = best * 0.45;
    const consistentSkill = p90 * 0.20;
    const midSkill = p75 * 0.15;
    const floorSkill = Math.max(p50, best * 0.25) * 0.10;
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

function calculateCoverage(actualRuns) {
    if (!actualRuns || actualRuns.length === 0) {
        return { practice: 0, merged: [], gaps: [{ start: 0, end: 100 }] };
    }
    
    const intervals = actualRuns.map(function(r) { return [r.start, r.end]; }).sort(function(a, b) { return a[0] - b[0]; });
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
    for (let i = 0; i < merged.length; i++) {
        total += (merged[i][1] - merged[i][0]);
    }
    
    const gaps = [];
    if (merged[0][0] > 0) gaps.push({ start: 0, end: merged[0][0] });
    for (let i = 1; i < merged.length; i++) {
        if (merged[i][0] > merged[i-1][1]) gaps.push({ start: merged[i-1][1], end: merged[i][0] });
    }
    if (merged[merged.length-1][1] < 100) gaps.push({ start: merged[merged.length-1][1], end: 100 });
    
    return { practice: Math.min(100, total), merged, gaps };
}

// ============================================================================
// ATTEMPT ESTIMATION v3.0
// ============================================================================

function calculateRealisticAttempts(buildResult, percentiles, difficultyMultiplier) {
    const bestFrom0 = buildResult.bestFrom0;
    const from0Freq = buildResult.from0Freq;
    const remaining = 100 - bestFrom0;
    
    if (remaining <= 0) return 0;
    
    const passRateModifier = Math.max(0.05, 1.0 - (bestFrom0 / 100));
    let baseEstimate = remaining * 10 * difficultyMultiplier;
    
    // Exponential scaling near completion
    if (bestFrom0 >= 95) baseEstimate *= 4.0;
    else if (bestFrom0 >= 90) baseEstimate *= 2.5;
    else if (bestFrom0 >= 80) baseEstimate *= 1.8;
    else if (bestFrom0 >= 60) baseEstimate *= 1.3;
    
    // Wall concentration factor
    const totalDeaths = Object.values(from0Freq).reduce((a, b) => a + b, 0);
    const sortedDeaths = Object.values(from0Freq).sort((a, b) => b - a);
    const wallConcentration = totalDeaths > 0 ? (sortedDeaths[0] || 0) / totalDeaths : 0;
    
    let chokeMultiplier = 1.0;
    if (wallConcentration > 0.4) chokeMultiplier = 1.6;
    else if (wallConcentration > 0.25) chokeMultiplier = 1.3;
    else if (wallConcentration > 0.15) chokeMultiplier = 1.1;
    else if (wallConcentration < 0.08) chokeMultiplier = 0.9;
    
    // Consistency factor
    const consistency = Math.max(0.1, parseFloat(percentiles.consistencyIndex) / 100);
    const consistencyFactor = Math.pow(consistency, -0.5);
    
    const finalEstimate = baseEstimate * chokeMultiplier * consistencyFactor;
    return Math.max(50, Math.round(finalEstimate));
}

// ============================================================================
// HELPERS
// ============================================================================

function round1(n) {
    const num = Number(n);
    if (!isFinite(num)) return '0.0';
    const rounded = Math.round(num * 10) / 10;
    return rounded.toFixed(1);
}

function formatNumber(num) { return num.toLocaleString(); }
function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }
function safeNum(val, fallback) {
    fallback = fallback !== undefined ? fallback : 0;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

function analyzeInput(inputText, difficultyMultiplier, options) {
    difficultyMultiplier = difficultyMultiplier || 1.0;
    options = options || {};
    const limit = options.limit || 10;
    
    if (!validateInput(inputText)) {
        return { hasData: false, error: 'No valid input' };
    }
    
    let processedText = inputText.replace(/\r\n/g, '\n');
    const lines = processedText.split('\n');
    const entries = [];
    
    for (let i = 0; i < lines.length; i++) {
        const c = lines[i].trim();
        if (!c || c.toLowerCase() === 'end') continue;
        entries.push(...parseMetricsLine(c));
    }
    
    const attemptStats = computeAttemptTotals(entries);
    const buildResult = buildRuns(entries);
    const rawAttemptCount = countRawAttemptsFromText(inputText);
    const percentiles = calculateFrom0Percentiles(buildResult.from0Freq, buildResult.completions || 0);
    const skillScoreResult = calculateSkillScore(percentiles);
    const coverageResult = calculateCoverage(buildResult.actualRuns);
    const deathDistribution = calculateDeathDistribution(buildResult.from0Freq);
    const passRateChunks = calculatePassRateByChunks(buildResult.from0Freq, buildResult.completions || 0);
    
    let pathResult = null;
    try {
        pathResult = analyzePaths(buildResult.actualRuns, buildResult.bestFrom0, passRateChunks);
    } catch(e) {
        pathResult = { filteredPaths: [], pathsByLength: {}, totalPathLengths: 0, allPaths: [], totalCompletionRoutes: 0, totalPathCount: 0 };
    }
    
    let routeReliability = "Low";
    if (pathResult.filteredPaths.length > 0) {
        const bestScore = pathResult.filteredPaths[0]?.score || 0;
        if (bestScore >= 0.7) routeReliability = "High";
        else if (bestScore >= 0.4) routeReliability = "Medium";
    }
    
    const enhancedAttempts = calculateRealisticAttempts(buildResult, percentiles, difficultyMultiplier);
    
    const result = {
        hasData: attemptStats.totalAttempts > 0 || buildResult.bestFrom0 > 0,
        totalAttempts: attemptStats.totalAttempts,
        bestFrom0: buildResult.bestFrom0,
        routes: pathResult.filteredPaths,
        totalRoutes: pathResult.totalPathCount || pathResult.totalCompletionRoutes,
        estimatedAttempts: enhancedAttempts,
        skillScore: skillScoreResult.score,
        consistency: parseFloat(percentiles.consistencyIndex),
        readiness: Math.round((skillScoreResult.score + buildResult.bestFrom0) / 2),
        coverage: coverageResult.practice,
        deathDistribution,
        from0Freq: buildResult.from0Freq,
        actualRuns: buildResult.actualRuns,
        bestRunsAll: buildResult.actualRuns,
        routeReliability,
        percentiles: percentiles,
        segmentData: [],
        passRateByChunks: passRateChunks,
        startposAttempts: attemptStats.startposAttempts,
        completions: buildResult.completions || 0
    };
    
    return result;
}

// ============================================================================
// PASS RATE BY CHUNKS
// ============================================================================

function calculatePassRateByChunks(from0Freq, completions) {
    const chunks = [];
    for (let chunk = 0; chunk < 10; chunk++) {
        const start = chunk * 10;
        const end = (chunk + 1) * 10;
        let deathsInChunk = 0;
        const keys = Object.keys(from0Freq);
        for (let i = 0; i < keys.length; i++) {
            const percent = parseInt(keys[i], 10);
            const count = from0Freq[keys[i]];
            if (percent >= start && percent < end) deathsInChunk += count;
        }
        let attemptsReachingStart = completions;
        for (let i = 0; i < keys.length; i++) {
            if (parseInt(keys[i], 10) >= start) attemptsReachingStart += from0Freq[keys[i]];
        }
        const passRate = attemptsReachingStart > 0 ? ((attemptsReachingStart - deathsInChunk) / attemptsReachingStart * 100) : 0;
        let color;
        if (passRate >= 80) color = 'safe';
        else if (passRate >= 60) color = 'low';
        else if (passRate >= 30) color = 'medium';
        else color = 'high';
        chunks.push({
            chunk: start + "-" + end + "%", start, end,
            passRate: Math.max(0, passRate), deaths: deathsInChunk, color
        });
    }
    return chunks;
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        analyzeInput, parseMetricsLine, buildRuns, analyzePaths,
        calculateRealisticAttempts, validateInput,
        calculateCoverage, calculateDeathDistribution, calculateFrom0Percentiles,
        calculateSkillScore, round1, safeNum, getColorTier
    };
}
