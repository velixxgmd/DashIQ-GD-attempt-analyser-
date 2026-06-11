/**
 * GEOMETRY DASH COGNITIVE ANALYZER & ENGINE v6.1
 * Realistic GD mechanics: Exponential difficulty scaling,
 * consistency-based prediction, choke pattern detection
 * ============================================================
 */

const RANGE_PATTERN = /(?:^|\s)(\d{1,3})\s*%?\s*-\s*(\d{1,3})\s*%?\s*x\s*(\d+)(?=[\s,]|$)/gi;
const SINGLE_PATTERN = /(?:^|\s)(\d{1,3})\s*%?\s*x\s*(\d+)(?=[\s,]|$)/gi;
const BEAT_PATTERN = /(?:beat|beats|beaten|completed|cleared?|clear|won)\s*x\s*(\d+)/gi;
const LABEL_SEGMENT_PATTERN = /((?:from\s*0|from0)|(?:runs?)|(?:startpos(?:\s+runs)?))\s*:/gi;
const SECTION_LABELS = ["from 0:", "from0:", "runs:", "run:", "startpos:", "startpos runs:"];
const RQI_LENGTH_WEIGHT = 0.6;
const RQI_START_WEIGHT = 0.4;
const READINESS_SKILL_WEIGHT = 0.30;
const READINESS_CONSISTENCY_WEIGHT = 0.25;
const READINESS_ENDING_WEIGHT = 0.20;
const READINESS_NERVES_WEIGHT = 0.15;
const READINESS_PROOF_WEIGHT = 0.10;
const NERVE_DECAY_RATE = 16.5;
const MAX_PATHWAYS = 5000;
const MAX_BFS_ITERATIONS = 100000;
const BFS_TIMEOUT_MS = 2000;
const MIN_SEGMENT_SAMPLES = 5;
const OPENING_END_PERCENT = 5;
const OPENING_FOLLOW_END_PERCENT = 15;
const ISOLATED_OPENING_WEIGHT = 0.28;
const EARLY_WALL_WEIGHT = 0.65;
const LATE_WALL_WEIGHT = 1.18;
const DIFFICULTY_MATRIX = {
    "auto": 0.2, "easy": 0.4, "normal": 0.6, "hard": 0.8,
    "harder": 1.0, "insane": 1.2, "easy demon": 1.5,
    "medium demon": 2.0, "hard demon": 3.0,
    "insane demon": 4.5, "extreme demon": 7.0
};

// V7 Constants
const DEMON_THRESHOLDS_V7 = {
    easy:    { mechanical: 60, consistency: 50, endurance: 40, nerves: 50, proof: 20 },
    medium:  { mechanical: 70, consistency: 65, endurance: 55, nerves: 60, proof: 30 },
    hard:    { mechanical: 80, consistency: 75, endurance: 70, nerves: 70, proof: 45 },
    insane:  { mechanical: 88, consistency: 85, endurance: 80, nerves: 80, proof: 60 },
    extreme: { mechanical: 95, consistency: 92, endurance: 90, nerves: 90, proof: 70 },
};

// V7 Functions
function calculateDeathSeverity(percent) {
    return Math.pow(safeNum(percent) / 100, 2);
}

function calculateWallScore(segmentDeaths, totalDeaths) {
    return totalDeaths ? (segmentDeaths / totalDeaths) * 100 : 0;
}

function countDeathsInRange(from0Freq, start, end) {
    let deaths = 0;
    for (const [k, c] of Object.entries(from0Freq || {})) {
        const p = parseInt(k, 10);
        if (p >= start && p < end) deaths += c;
    }
    return deaths;
}

function analyzeOpeningPressure(from0Freq) {
    const total = Object.values(from0Freq || {}).reduce((a, b) => a + b, 0);
    if (!total) {
        return { active: false, isolated: false, deaths: 0, followDeaths: 0, percentage: 0, label: "none" };
    }

    const deaths = countDeathsInRange(from0Freq, 0, OPENING_END_PERCENT);
    const followDeaths = countDeathsInRange(from0Freq, OPENING_END_PERCENT, OPENING_FOLLOW_END_PERCENT);
    const percentage = (deaths / total) * 100;
    const active = deaths >= MIN_SEGMENT_SAMPLES && percentage >= 8;
    const isolated = active && followDeaths < deaths * 0.75;
    const label = isolated ? "opening-input" : active ? "opening-wall" : "none";

    return {
        active,
        isolated,
        deaths,
        followDeaths,
        percentage,
        label,
    };
}

function getWallPriority(start, deaths, severityScore, openingPressure) {
    let priority = safeNum(severityScore) * safeNum(deaths);
    if (start < OPENING_END_PERCENT && openingPressure?.isolated) {
        priority *= ISOLATED_OPENING_WEIGHT;
    } else if (start < OPENING_FOLLOW_END_PERCENT) {
        priority *= EARLY_WALL_WEIGHT;
    } else if (start >= 70) {
        priority *= LATE_WALL_WEIGHT;
    }
    return priority;
}

function calculateWeightedDeathDistribution(from0Freq) {
    const total = Object.values(from0Freq || {}).reduce((a, b) => a + b, 0);
    if (!total) return [];
    const out = [];
    const openingPressure = analyzeOpeningPressure(from0Freq);

    for (let i = 0; i < 20; i++) {
        const start = i * 5;
        const end = (i + 1) * 5;
        let deaths = 0;
        let weightedSeverity = 0;

        for (const [k, c] of Object.entries(from0Freq)) {
            const p = parseInt(k, 10);
            if (p >= start && p < end) {
                deaths += c;
                weightedSeverity += c * calculateDeathSeverity(p);
            }
        }

        if (deaths > 0) {
            const severityScore = weightedSeverity / deaths;
            const pct = (deaths / total) * 100;
            let riskLevel = "low";
            if (severityScore > 0.5) riskLevel = "critical";
            else if (severityScore > 0.25) riskLevel = "high";
            else if (severityScore > 0.1) riskLevel = "medium";

            out.push({
                segment: start + "-" + end,
                start,
                end,
                deaths,
                percentage: pct.toFixed(1),
                severityScore: severityScore.toFixed(3),
                riskLevel,
                wallScore: calculateWallScore(deaths, total).toFixed(1),
                wallPriority: getWallPriority(start, deaths, severityScore, openingPressure).toFixed(3),
                zoneType: start < OPENING_END_PERCENT && openingPressure.isolated ? "opening-input" : start < OPENING_FOLLOW_END_PERCENT ? "early" : start >= 70 ? "late" : "main",
            });
        }
    }

    return out.sort((a, b) => parseFloat(b.wallPriority) - parseFloat(a.wallPriority));
}

function calculateEndgameProof(actualRuns) {
    let proof = 0;
    for (const run of actualRuns || []) {
        if (run && run.end === 100) proof += (run.length || 0) * (run.count || 0);
    }
    return proof;
}

function calculateCompletionProbability(bestFrom0, consistencyIndex, readiness, endgameProof) {
    let score = 0;
    score += (safeNum(bestFrom0) / 100) * 35;
    score += (safeNum(consistencyIndex) / 100) * 25;
    score += (safeNum(readiness) / 100) * 25;
    score += Math.min(100, safeNum(endgameProof)) * 0.15;
    return Math.min(99, Math.round(score));
}

function calculateProgressVelocity(percentiles, currentBest, previousBest = 0, totalAttempts = 0) {
    const progression = safeNum(currentBest) - safeNum(previousBest);
    const lateDeaths = Object.entries(percentiles?.from0Freq || {})
        .filter(([k]) => parseInt(k, 10) >= 80)
        .reduce((sum, [, v]) => sum + v, 0);

    const consistency = safeNum(percentiles?.consistencyIndex);
    const attemptsPerPercent = totalAttempts > 0 ? totalAttempts / Math.max(1, safeNum(currentBest)) : 0;

    let velocity = 0;
    if (progression > 10) velocity += 35;
    else if (progression > 5) velocity += 25;
    else if (progression > 0) velocity += 15;
    else if (progression < 0) velocity -= 20;

    if (consistency > 80) velocity += 30;
    else if (consistency > 60) velocity += 20;
    else if (consistency > 40) velocity += 10;
    else velocity += 5;

    const lateDeathRate = totalAttempts > 0 ? (lateDeaths / totalAttempts) * 100 : 0;
    if (lateDeathRate < 5) velocity += 20;
    else if (lateDeathRate < 15) velocity += 15;
    else if (lateDeathRate < 30) velocity += 10;
    else velocity += 5;

    if (attemptsPerPercent < 5) velocity += 15;
    else if (attemptsPerPercent < 10) velocity += 10;
    else if (attemptsPerPercent < 20) velocity += 5;

    return {
        score: velocity,
        label: velocity >= 80 ? "📈 Rising Fast" : velocity >= 60 ? "📈 Improving" : velocity >= 40 ? "➡ Stable" : velocity >= 20 ? "📉 Stalled" : "📉 Declining",
        class: velocity >= 80 ? "rising-fast" : velocity >= 60 ? "improving" : velocity >= 40 ? "stable" : velocity >= 20 ? "stalled" : "declining",
        breakdown: {
            progression,
            lateDeathRate: lateDeathRate.toFixed(1),
            consistency: consistency.toFixed(1),
            attemptsPerPercent: attemptsPerPercent.toFixed(1),
        },
    };
}

function calculateDemonReadiness(skillScore, consistencyIndex, bestFrom0, nervesTier, endgameProof, completions) {
    const mechanical = Math.min(100, safeNum(skillScore) * 0.9 + (safeNum(completions) > 0 ? 10 : 0));
    const consistency = Math.min(100, safeNum(consistencyIndex));
    const endurance = Math.min(100, safeNum(bestFrom0));
    const nerves = nervesTier === "S" ? 95 : nervesTier === "A" ? 85 : nervesTier === "B" ? 75 : nervesTier === "C" ? 60 : nervesTier === "D" ? 40 : 20;
    const proof = Math.min(100, safeNum(endgameProof) / 10);

    const demons = ["easy", "medium", "hard", "insane", "extreme"];
    const out = {};
    for (const demon of demons) {
        const t = DEMON_THRESHOLDS_V7[demon];
        const readiness = Math.min(100, Math.round(
            (Math.min(1, mechanical / t.mechanical) * 25) +
            (Math.min(1, consistency / t.consistency) * 25) +
            (Math.min(1, endurance / t.endurance) * 20) +
            (Math.min(1, nerves / t.nerves) * 15) +
            (Math.min(1, proof / t.proof) * 15)
        ));
        out[demon] = { readiness, scores: { mechanical, consistency, endurance, nerves, proof }, ready: readiness >= 80 };
    }
    return out;
}

function augmentResult(result, opts = {}) {
    if (!result || typeof result !== "object") return result;

    const from0Freq = result.from0Freq || {};
    const actualRuns = result.bestRunsAll || result.bestRuns || [];
    const weightedDeathDist = calculateWeightedDeathDistribution(from0Freq);
    const openingPressure = analyzeOpeningPressure(from0Freq);
    const endgameProof = calculateEndgameProof(actualRuns);
    const completionProbability = calculateCompletionProbability(
        result.bestFrom0,
        safeNum(result.percentiles?.consistencyIndex),
        result.readiness,
        endgameProof
    );
    const progressVelocity = calculateProgressVelocity(
        result.percentiles || { consistencyIndex: safeNum(result.percentiles?.consistencyIndex), from0Freq },
        result.bestFrom0,
        opts.previousBest || 0,
        safeNum(result.totalAttempts)
    );
    const demonReadiness = calculateDemonReadiness(
        safeNum(result.skillScore || result.radarData?.raw?.skill || result.percentiles?.best || 0),
        safeNum(result.percentiles?.consistencyIndex),
        safeNum(result.bestFrom0),
        result.nervesTier,
        endgameProof,
        safeNum(result.completions)
    );

    result.weightedDeathDist = weightedDeathDist;
    result.endgameProof = endgameProof;
    result.completionProbability = completionProbability;
    result.progressVelocity = progressVelocity;
    result.demonReadiness = demonReadiness;
    result.openingPressure = {
        active: openingPressure.active,
        isolated: openingPressure.isolated,
        deaths: openingPressure.deaths,
        followDeaths: openingPressure.followDeaths,
        percentage: openingPressure.percentage.toFixed(1),
        label: openingPressure.label,
    };
    result.wallAnalysis = weightedDeathDist.length
        ? (weightedDeathDist[0].zoneType === "opening-input"
            ? "OPENING INPUT: " + weightedDeathDist[0].segment + " | Treat as spawn timing, not the main wall"
            : "MAIN WALL: " + weightedDeathDist[0].segment + " | Wall Score: " + weightedDeathDist[0].wallScore + "% | Severity: " + weightedDeathDist[0].severityScore)
        : "MAIN WALL: --";
    result.forecastBreakdown = result.forecastBreakdown || {};
    result.forecastBreakdown.endgameProof = endgameProof;
    result.forecastBreakdown.completionProbability = completionProbability;
    result.forecastBreakdown.progressVelocity = progressVelocity.label;
    return result;
}

// ============================================================================
// HELPERS
// ============================================================================

function formatNumber(num) { return num.toLocaleString(); }

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function safeNum(val, fallback) {
    fallback = fallback !== undefined ? fallback : 0;
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

function stripSectionLabels(text) {
    text = text.trim();
    for (let i = 0; i < SECTION_LABELS.length; i++) {
        const label = SECTION_LABELS[i];
        if (text.toLowerCase().startsWith(label)) {
            text = text.slice(label.length).trim();
        }
    }
    return text;
}

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
            entries.push({ type: "completion", start: start, end: end, count: count, length: 100 });
        } else {
            entries.push({ type: "run", start: start, end: end, count: count, length: end - start });
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
            entries.push({ type: "completion", start: 0, end: 100, count: count, length: 100 });
            continue;
        }
        entries.push({ type: "from0", percent: percent, count: count });
    }
    return entries;
}

function validateInput(text) {
    const warnings = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const rm = line.match(/(\d+)\s*%?\s*-\s*(\d+)\s*%?\s*x\s*(\d+)/i);
        if (rm) {
            const s = parseInt(rm[1], 10);
            const e = parseInt(rm[2], 10);
            if (e < s) warnings.push("Invalid run: " + line + " (end < start)");
            if (s > 100 || e > 100) warnings.push("Invalid range: " + line + " (must be <= 100%)");
        }
        const sm = line.match(/(\d+)\s*%?\s*x\s*(\d+)/i);
        if (sm && !rm && parseInt(sm[1], 10) > 100) {
            warnings.push("Invalid %: " + line + " (must be <= 100%)");
        }
    }
    return warnings;
}

function parseMetricsLine(line) {
    const entries = [];
    let beats = 0;
    let match;
    BEAT_PATTERN.lastIndex = 0;
    while ((match = BEAT_PATTERN.exec(line)) !== null) {
        beats += parseInt(match[1], 10);
    }

    const normalized = (line || "").trim();
    const lower = normalized.toLowerCase();
    const lineWithoutBeats = normalized.replace(BEAT_PATTERN, " ").trim();

    const lm = lower.match(LABEL_SEGMENT_PATTERN);
    if (lm && lm.length > 0) {
        const label = lm[0].toLowerCase();
        const labelIdx = lower.indexOf(label);
        const payload = labelIdx >= 0 ? normalized.slice(labelIdx + lm[0].length).trim() : lineWithoutBeats;
        if (label.includes("from 0") || label.includes("from0")) {
            entries.push.apply(entries, parseFrom0Segment(payload));
        } else {
            entries.push.apply(entries, parseRunsSegment(payload));
        }
    } else {
        const runEntries = parseRunsSegment(lineWithoutBeats);
        if (runEntries.length > 0) {
            entries.push.apply(entries, runEntries);
        } else {
            entries.push.apply(entries, parseFrom0Segment(lineWithoutBeats));
        }
    }

    const completionEntries = [];
    const nonCompletionEntries = [];
    let explicitCompletionCount = 0;
    for (let i = 0; i < entries.length; i++) {
        const e = entries[i];
        if (e && e.type === "completion" && e.start === 0 && e.end === 100) {
            explicitCompletionCount += safeNum(e.count);
            completionEntries.push(e);
        } else {
            nonCompletionEntries.push(e);
        }
    }

    const mergedCompletionCount = Math.max(safeNum(beats), safeNum(explicitCompletionCount));
    if (mergedCompletionCount > 0) {
        nonCompletionEntries.push({ type: "completion", start: 0, end: 100, count: mergedCompletionCount, length: 100 });
    }

    return { entries: nonCompletionEntries, beats: mergedCompletionCount };
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
    return {
        totalAttempts: total,
        from0Deaths: from0Deaths,
        startposAttempts: startpos,
        completions: completions,
        totalFrom0Attempts: from0Deaths + completions
    };
}

function countRawAttemptsFromText(text) {
    if (!text) return 0;
    const textWithoutBeats = text.replace(BEAT_PATTERN, "");
    const cleaned = textWithoutBeats.replace(/[^0-9x%\-\s]/g, " ");
    let total = 0;
    const matches = cleaned.match(/x\s*(\d+)/gi);
    if (matches) {
        for (let i = 0; i < matches.length; i++) {
            const num = parseInt(matches[i].replace(/x\s*/i, ""), 10);
            if (!isNaN(num)) total += num;
        }
    }
    return total;
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
                continue;
            }
            bestFrom0 = Math.max(bestFrom0, p);
            from0Freq[p] = (from0Freq[p] || 0) + safeNum(e.count);
            actualRuns.push({
                type: "from0_run",
                start: 0,
                end: p,
                length: p,
                count: safeNum(e.count),
                percent: p
            });
            continue;
        }

        if (e.type === "completion") {
            completions += safeNum(e.count);
            actualRuns.push({
                type: "completion",
                start: safeNum(e.start, 0),
                end: safeNum(e.end, 100),
                count: safeNum(e.count),
                length: 100
            });
            continue;
        }

        if (e.type === "run") {
            const start = safeNum(e.start);
            const end = safeNum(e.end);
            if (start < 0 || end < 0 || start > 100 || end > 100) continue;
            if (end < start) continue;
            const length = safeNum(e.length, end - start);
            actualRuns.push({ type: "run", start: start, end: end, count: safeNum(e.count), length: length });
        }
    }

    return {
        bestFrom0: bestFrom0,
        completions: completions,
        actualRuns: actualRuns,
        actualRunsSorted: actualRuns.slice().sort(function(a, b) {
            return (b.length * Math.log(b.count + 1)) - (a.length * Math.log(a.count + 1));
        }),
        actualRunsByLength: actualRuns.slice().sort(function(a, b) {
            return b.length - a.length;
        }),
        from0Freq: from0Freq
    };
}

// ============================================================================
// STABLE / BEST / LONGEST RUNS
// ============================================================================

function getStartposWeight(start) {
    return 1 + (start / 100);
}

function calculateStability(run) {
    return Math.pow(run.length, 1.5) * Math.log(run.count + 1) * getStartposWeight(run.start);
}

function getStableRuns(actualRuns, limit) {
    limit = limit || 10;
    const mapped = actualRuns.map(function(r) {
        return { type: r.type, start: r.start, end: r.end, count: r.count, length: r.length, stabilityScore: calculateStability(r) };
    });
    mapped.sort(function(a, b) {
        return b.stabilityScore - a.stabilityScore;
    });
    return mapped.slice(0, limit);
}

function getBestRuns(actualRuns, limit) {
    limit = limit || 10;
    const mapped = actualRuns.map(function(r) {
        const stability = calculateStability(r);
        const reliability = r.count > 0 ? stability / r.count : 0;
        return { type: r.type, start: r.start, end: r.end, count: r.count, length: r.length, stabilityScore: stability, reliabilityScore: reliability };
    });
    mapped.sort(function(a, b) {
        if (b.stabilityScore !== a.stabilityScore) return b.stabilityScore - a.stabilityScore;
        if (b.length !== a.length) return b.length - a.length;
        return b.count - a.count;
    });
    return mapped.slice(0, limit);
}

function getLongestRuns(actualRuns, limit) {
    limit = limit || 10;
    const sorted = actualRuns.slice().sort(function(a, b) {
        return b.length - a.length;
    });
    return sorted.slice(0, limit);
}

// ============================================================================
// MEMORY-EFFICIENT PERCENTILES
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
    return { p10: p10, p25: p25, p50: p50, p75: p75, p90: p90, best: best, mean: mean, stdDev: stdDev, attempts: totalAttempts, consistencyIndex: consistencyIndex };
}

function calculateSkillScore(percentiles) {
    const best = percentiles.best;
    const p90 = percentiles.p90, p75 = percentiles.p75, p50 = percentiles.p50;
    const consistencyIndex = percentiles.consistencyIndex;
    
    // V8: Peak performance matters. Early deaths are noise.
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
        consistencyBonus: consistencyBonus, 
        volumeBonus: volumeBonus, 
        percentiles: percentiles 
    };
}

// ============================================================================
// MODE DETECTION
// ============================================================================

function detectMode(completions, totalAttempts, bestFrom0, actualRuns, totalFrom0Attempts, percentiles) {
    if (completions === 0) {
        if (bestFrom0 === 0 && actualRuns.length === 0) return "NO_DATA";
        let hasAdvanced = false;
        for (let i = 0; i < actualRuns.length; i++) {
            if (actualRuns[i].start > 20) { hasAdvanced = true; break; }
        }
        let avgStart = 0;
        if (actualRuns.length > 0) {
            let sum = 0;
            for (let i = 0; i < actualRuns.length; i++) sum += actualRuns[i].start;
            avgStart = sum / actualRuns.length;
        }
        if (hasAdvanced && actualRuns.length >= 3 && avgStart > 30) return "ADVANCED_STARTPOS";
        if (actualRuns.length > 0) return "STARTPOS_PRACTICE";
        if (bestFrom0 > 0) return "FROM_0_PRACTICE";
        return "NO_DATA";
    }
    if (completions === 1) return "FIRST_COMPLETION";
    const rate = totalAttempts > 0 ? completions / totalAttempts : 0;
    if (completions >= 10 && rate > 0.05) return "REBEAT_FARMING";
    if (rate < 0.01) return "GRINDING";
    if (completions <= 5) return "MULTIPLE_COMPLETIONS";
    return "REBEAT_FARMING";
}

// ============================================================================
// COVERAGE
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
    return { practice: Math.min(100, total), merged: merged, gaps: gaps };
}

// ============================================================================
// PATHS (ROUTES) — v6.1: SAFE BFS WITH TIMEOUT
// ============================================================================

// ROUTE MATCHING TOLERANCE: Segments can connect if they overlap or are within this %
const ROUTE_OVERLAP_TOLERANCE = 5;

/**
 * Check if two segments can connect (with tolerance)
 * A segment ending at 61 can connect to one starting at 61, 60, 62, etc.
 */
function canConnect(prevEnd, nextStart) {
    // Segments connect if nextStart overlaps with or touches prevEnd.
    // nextStart must be <= prevEnd (no forward gaps allowed).
    // Small backward tolerance allows overlapping segments (e.g., 0-62 connects to 60-100).
    return nextStart <= prevEnd && nextStart >= prevEnd - ROUTE_OVERLAP_TOLERANCE;
}

function analyzePaths(actualRuns, bestFrom0) {
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
            segmentMap.set(key, { type: r.type, start: start, end: end, length: length, count: 0, occurrences: 0 });
        }
        const agg = segmentMap.get(key);
        agg.count += count;
        agg.occurrences += 1;
        if (agg.type !== "completion" && r.type === "completion") agg.type = "completion";
    }

    for (const agg of segmentMap.values()) {
        if (agg.count >= MIN_SEGMENT_SAMPLES) {
            pool.push(agg);
        }
    }

    // Add virtual from-0 segment if bestFrom0 exists
    // This represents the player's proven ability to reach bestFrom0% from 0
    if (bestFrom0 > 0) {
        let hasZeroToBest = false;
        for (const seg of pool) {
            if (seg.start === 0 && seg.end >= bestFrom0) {
                hasZeroToBest = true;
                break;
            }
        }
        if (!hasZeroToBest) {
            pool.push({ type: "virtual", start: 0, end: bestFrom0, length: bestFrom0, count: 1, occurrences: 1 });
        }
    }

    if (pool.length === 0) {
        return {
            filteredPaths: [],
            pathsByLength: {},
            totalPathLengths: 0,
            allPaths: [],
            totalCompletionRoutes: 0,
            totalPathCount: 0
        };
    }

    const segmentWeight = function(r) {
        return safeNum(r.length) * Math.log(safeNum(r.count) + 1);
    };

    const segmentCmp = function(a, b) {
        const wa = segmentWeight(a);
        const wb = segmentWeight(b);
        if (wb !== wa) return wb - wa;
        if (b.end !== a.end) return b.end - a.end;
        if (a.start !== b.start) return a.start - b.start;
        if (a.end !== b.end) return a.end - b.end;
        return (a.start + "_" + a.end).localeCompare(b.start + "_" + b.end);
    };

    // IMPROVED BFS: Prioritize shorter paths by greedy ordering
    const poolSorted = pool.slice().sort(segmentCmp);

    // Sort by end position descending for greedy shortest-path discovery
    const poolByEnd = pool.slice().sort(function(a, b) {
        if (b.end !== a.end) return b.end - a.end;
        if (b.length !== a.length) return b.length - a.length;
        return b.count - a.count;
    });

    const MAX_OPTS_PER_NODE = 40;
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

        // Find segments that can continue from current position
        const opts = [];
        for (let i = 0; i < poolByEnd.length; i++) {
            const r = poolByEnd[i];
            if (r.start <= cp && r.end > cp) {
                // Prevent using the same segment twice in one path
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

    const pathLengthVariance = function(p) {
        if (!p || p.length <= 1) return 0;
        let mean = 0;
        for (let i = 0; i < p.length; i++) mean += safeNum(p[i].length);
        mean = mean / p.length;
        let v = 0;
        for (let i = 0; i < p.length; i++) {
            const d = safeNum(p[i].length) - mean;
            v += d * d;
        }
        return v / p.length;
    };

    const pathKey = function(p) {
        return p.map(function(r) { return r.start + "_" + r.end; }).join("|");
    };

    allPaths.sort(function(a, b) {
        if (a.length !== b.length) return a.length - b.length; // fewer segments
        const sa = pathScore(a);
        const sb = pathScore(b);
        if (sb !== sa) return sb - sa; // higher reliability
        const va = pathLengthVariance(a);
        const vb = pathLengthVariance(b);
        if (va !== vb) return va - vb; // length consistency (lower variance)
        return pathKey(a).localeCompare(pathKey(b)); // deterministic
    });

    // FILTER: Only valid completion routes that START near 0% and END at 100%
    const completionRoutes = [];
    for (let i = 0; i < allPaths.length; i++) {
        const p = allPaths[i];
        if (p.length > 0 && p[0].start <= 2 && p[p.length - 1].end >= 98) {
            completionRoutes.push(p);
        }
    }

    // Deduplicate for UI
    const seen = new Set();
    const uniquePaths = [];
    for (let i = 0; i < completionRoutes.length; i++) {
        const p = completionRoutes[i];
        const s = pathKey(p);
        if (!seen.has(s)) {
            seen.add(s);
            uniquePaths.push(p);
        }
    }

    const formattedPaths = uniquePaths.map(function(p) {
        return {
            segments: p.length,
            totalLength: p.reduce(function(sum, r) { return sum + r.length; }, 0),
            start: 0,
            end: 100,
            route: p.map(function(r) { return r.start + "-" + r.end + "%"; }),
            runs: p
        };
    }).sort(function(a, b) {
        if (a.segments !== b.segments) return a.segments - b.segments;
        const sa = pathScore(a.runs);
        const sb = pathScore(b.runs);
        if (sb !== sa) return sb - sa;
        const va = pathLengthVariance(a.runs);
        const vb = pathLengthVariance(b.runs);
        if (va !== vb) return va - vb;
        return pathKey(a.runs).localeCompare(pathKey(b.runs));
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
        totalPathCount: completionRoutes.length
    };
}

// ============================================================================
// CONSISTENCY
// ============================================================================

function calculateSegmentConsistency(start, end, from0Freq, completions) {
    let reachedStart = 0, reachedEnd = 0;
    const keys = Object.keys(from0Freq);
    for (let i = 0; i < keys.length; i++) {
        const p = parseInt(keys[i], 10);
        const count = from0Freq[keys[i]];
        if (p >= start) reachedStart += count;
        if (p >= end) reachedEnd += count;
    }
    if (end === 100) {
        reachedStart += completions;
        reachedEnd += completions;
    }
    let total = 0;
    const values = Object.values(from0Freq);
    for (let i = 0; i < values.length; i++) total += values[i];
    total += completions;
    if (total < MIN_SEGMENT_SAMPLES) return { passRate: null, sampleWeight: total, reliable: false };
    if (reachedStart === 0) return { passRate: null, sampleWeight: 0, reliable: false };
    if (reachedStart < MIN_SEGMENT_SAMPLES) return { passRate: null, sampleWeight: reachedStart, reliable: false };
    return { passRate: Math.min(100, (reachedEnd / reachedStart) * 100), sampleWeight: reachedStart, reliable: true };
}

function renderSegmentConsistency(actualRuns, from0Freq, completions) {
    const segmentData = [];
    const openingPressure = analyzeOpeningPressure(from0Freq);
    for (let b = 0; b < 10; b++) {
        const start = b * 10, end = (b + 1) * 10;
        const r = calculateSegmentConsistency(start, end, from0Freq, completions);
        let hasCoverage = false;
        for (let i = 0; i < actualRuns.length; i++) {
            const x = actualRuns[i];
            if (x.start <= start && x.end >= end) { hasCoverage = true; break; }
        }
        if (r.passRate !== null) {
            segmentData.push({ start: start, end: end, passRate: r.passRate, sampleWeight: r.sampleWeight, reliable: r.reliable, hasCoverage: hasCoverage });
        } else if (hasCoverage) {
            segmentData.push({ start: start, end: end, passRate: null, sampleWeight: 0, reliable: false, hasCoverage: true, note: "Startpos only" });
        }
    }
    let worst = null;
    if (segmentData.length > 0) {
        const reliable = [];
        for (let i = 0; i < segmentData.length; i++) {
            if (segmentData[i].reliable && segmentData[i].passRate !== null) reliable.push(segmentData[i]);
        }
        if (reliable.length > 0) {
            worst = reliable[0];
            for (let i = 1; i < reliable.length; i++) {
                const candidateRate = reliable[i].passRate + (reliable[i].start === 0 && openingPressure.isolated ? 18 : 0);
                const worstRate = worst.passRate + (worst.start === 0 && openingPressure.isolated ? 18 : 0);
                if (candidateRate < worstRate) worst = reliable[i];
            }
        } else {
            const withRate = [];
            for (let i = 0; i < segmentData.length; i++) {
                if (segmentData[i].passRate !== null) withRate.push(segmentData[i]);
            }
            if (withRate.length > 0) {
                worst = withRate[0];
                for (let i = 1; i < withRate.length; i++) {
                    const candidateRate = withRate[i].passRate + (withRate[i].start === 0 && openingPressure.isolated ? 18 : 0);
                    const worstRate = worst.passRate + (worst.start === 0 && openingPressure.isolated ? 18 : 0);
                    if (candidateRate < worstRate) worst = withRate[i];
                }
            } else {
                worst = segmentData[0];
            }
        }
    }
    return { segmentData: segmentData, worst: worst };
}

// ============================================================================
// DEATH DISTRIBUTION
// ============================================================================

function calculateDeathDistribution(from0Freq) {
    const total = Object.values(from0Freq).reduce(function(a, b) { return a + b; }, 0);
    if (total === 0) return [];
    const uniform = 100 / 20;
    const dist = [];
    const openingPressure = analyzeOpeningPressure(from0Freq);
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
            let risk;
            if (pct > uniform * 2.5) risk = "critical";
            else if (pct > uniform * 1.5) risk = "high";
            else if (pct > uniform) risk = "medium";
            else risk = "low";
            const priority = getWallPriority(start, deaths, calculateDeathSeverity((start + end) / 2), openingPressure);
            dist.push({
                segment: start + "-" + end,
                start: start,
                end: end,
                deaths: deaths,
                percentage: pct.toFixed(1),
                riskLevel: risk,
                wallPriority: priority.toFixed(3),
                zoneType: start < OPENING_END_PERCENT && openingPressure.isolated ? "opening-input" : start < OPENING_FOLLOW_END_PERCENT ? "early" : start >= 70 ? "late" : "main"
            });
        }
    }
    return dist.sort(function(a, b) { return parseFloat(b.wallPriority) - parseFloat(a.wallPriority); });
}

// ============================================================================
// READINESS
// ============================================================================

function getTier(v) {
    if (v >= 95) return "S";
    if (v >= 85) return "A+";
    if (v >= 75) return "A";
    if (v >= 65) return "B+";
    if (v >= 55) return "B";
    if (v >= 40) return "C";
    if (v >= 25) return "D";
    return "F";
}

function calculateRouteProofScore(actualRuns) {
    let endgameUnits = 0;
    let longestToEnd = 0;
    let bestLateStart = 100;
    let midToEnd = 0;

    for (let i = 0; i < (actualRuns || []).length; i++) {
        const r = actualRuns[i];
        if (!r || r.end < 100) continue;
        const length = Math.max(0, safeNum(r.length || (r.end - r.start)));
        const count = Math.max(1, safeNum(r.count || 1));
        const start = safeNum(r.start);

        longestToEnd = Math.max(longestToEnd, length);
        bestLateStart = Math.min(bestLateStart, start);

        if (start >= 70) endgameUnits += length * count * 1.15;
        else if (start >= 45) {
            midToEnd += count;
            endgameUnits += length * count * 1.35;
        } else {
            midToEnd += count;
            endgameUnits += length * count * 1.6;
        }
    }

    const volumeScore = Math.min(45, endgameUnits / 8);
    const lengthScore = Math.min(35, longestToEnd * 0.7);
    const startScore = bestLateStart < 100 ? Math.min(20, (100 - bestLateStart) * 0.28) : 0;
    const midBonus = Math.min(10, midToEnd * 2);
    return clamp(volumeScore + lengthScore + startScore + midBonus, 0, 100);
}

function calculateGDProgressScore(bestFrom0, routeProofScore, coverage, completions) {
    const best = safeNum(bestFrom0);
    const bestScore = best >= 95 ? 96 : best >= 90 ? 90 : best >= 80 ? 78 : best >= 70 ? 68 : best >= 60 ? 58 : best * 0.9;
    const proofLift = Math.min(18, safeNum(routeProofScore) * 0.18);
    const coverageLift = Math.min(8, safeNum(coverage) * 0.08);
    const clearLift = safeNum(completions) > 0 ? 10 : 0;
    return clamp(bestScore + proofLift + coverageLift + clearLift, 0, 100);
}

function calculateReadiness(buildResult, attemptStats, explicitBeats, skillScoreResult) {
    const bestFrom0 = buildResult.bestFrom0;
    const actualRuns = buildResult.actualRuns;
    const from0Freq = buildResult.from0Freq;
    const completions = buildResult.completions;
    const totalAttempts = attemptStats.totalAttempts;
    const routeProofScore = calculateRouteProofScore(actualRuns);
    const skillScore = (safeNum(skillScoreResult.score) / 100) * READINESS_SKILL_WEIGHT;
    const consistencyResult = renderSegmentConsistency(actualRuns, from0Freq, completions);
    const segmentData = consistencyResult.segmentData;

    let consistencyScore = 0, segCount = 0;
    for (let i = 0; i < segmentData.length; i++) {
        const s = segmentData[i];
        if (s.reliable && s.passRate !== null) {
            consistencyScore += s.passRate / 100;
            segCount++;
        }
    }
    if (segCount > 0) {
        consistencyScore = (consistencyScore / segCount) * READINESS_CONSISTENCY_WEIGHT;
    } else {
        consistencyScore = (bestFrom0 / 100) * 0.5 * READINESS_CONSISTENCY_WEIGHT;
    }

    let endingScore = 0;
    const endingSeg = segmentData.find(function(s) { return s.start === 90; });
    if (endingSeg && endingSeg.reliable && endingSeg.passRate !== null) {
        endingScore = (endingSeg.passRate / 100) * READINESS_ENDING_WEIGHT;
    } else if (bestFrom0 >= 80) {
        endingScore = ((Math.min(100, bestFrom0) - 80) / 20) * READINESS_ENDING_WEIGHT;
    }
    endingScore = Math.max(endingScore, (routeProofScore / 100) * READINESS_ENDING_WEIGHT);

    let nervesScore = 0;
    let lateDeaths = 0;
    const keys = Object.keys(from0Freq);
    for (let i = 0; i < keys.length; i++) {
        if (parseInt(keys[i], 10) >= 80) lateDeaths += from0Freq[keys[i]];
    }
    const lateSegs = [];
    for (let i = 0; i < segmentData.length; i++) {
        if (segmentData[i].start >= 70) lateSegs.push(segmentData[i]);
    }
    let latePass = 0, lateCount = 0;
    for (let i = 0; i < lateSegs.length; i++) {
        if (lateSegs[i].reliable && lateSegs[i].passRate !== null) {
            latePass += lateSegs[i].passRate;
            lateCount++;
        }
    }
    const lateDeathRate = totalAttempts > 0 ? lateDeaths / totalAttempts : 0;
    const pressureScore = clamp(100 - lateDeathRate * 650, 0, 100);
    if (lateCount > 0) {
        nervesScore = (Math.max(latePass / lateCount, pressureScore, routeProofScore * 0.85) / 100) * READINESS_NERVES_WEIGHT;
    } else if (lateDeaths === 0 && bestFrom0 >= 80) {
        nervesScore = READINESS_NERVES_WEIGHT;
    } else {
        nervesScore = (Math.max(pressureScore, routeProofScore * 0.85, Math.exp(-lateDeaths / NERVE_DECAY_RATE) * 100) / 100) * READINESS_NERVES_WEIGHT;
    }

    let proofScore = 0;
    if (explicitBeats > 0 && totalAttempts > 0) {
        const rate = explicitBeats / totalAttempts;
        proofScore = Math.min(1, explicitBeats / 5) * Math.min(1, rate * 50) * READINESS_PROOF_WEIGHT;
    }
    proofScore = Math.max(proofScore, (routeProofScore / 100) * READINESS_PROOF_WEIGHT);

    let readiness = skillScore + consistencyScore + endingScore + nervesScore + proofScore;
    readiness = clamp(readiness, 0, 1);
    const skillTier = getTier(safeNum(skillScoreResult.score));

    let avgCons = 0;
    if (segCount > 0) {
        let sum = 0;
        for (let i = 0; i < segmentData.length; i++) {
            if (segmentData[i].reliable && segmentData[i].passRate !== null) sum += segmentData[i].passRate;
        }
        avgCons = sum / segCount;
    } else if (bestFrom0 > 50) {
        avgCons = bestFrom0 * 0.6;
    }
    const consistencyTier = getTier(avgCons);

    let nervesVal = 0;
    if (lateCount > 0) {
        nervesVal = Math.max(latePass / lateCount, pressureScore, routeProofScore * 0.85);
    } else if (lateDeaths === 0) {
        nervesVal = 100;
    } else {
        nervesVal = Math.max(pressureScore, routeProofScore * 0.85, Math.max(0, 100 - lateDeaths * 3));
    }
    const nervesTier = getTier(nervesVal);

    return {
        readiness: readiness * 100,
        skillTier: skillTier,
        consistencyTier: consistencyTier,
        nervesTier: nervesTier,
        breakdown: {
            skill: (skillScore / READINESS_SKILL_WEIGHT * 100).toFixed(1),
            consistency: segCount > 0 ? avgCons.toFixed(1) : "N/A",
            ending: (endingScore / READINESS_ENDING_WEIGHT * 100).toFixed(1),
            nerves: (nervesScore / READINESS_NERVES_WEIGHT * 100).toFixed(1),
            proof: (proofScore / READINESS_PROOF_WEIGHT * 100).toFixed(1),
            routeProof: routeProofScore.toFixed(1)
        }
    };
}

// ============================================================================
// REALISTIC ATTEMPT PREDICTION
// ============================================================================

function calculateRealisticAttempts(buildResult, percentiles, difficultyMultiplier) {
    const bestFrom0 = buildResult.bestFrom0;
    const from0Freq = buildResult.from0Freq;
    const remaining = 100 - bestFrom0;
    if (remaining <= 0) return 0;

    const baseExponent = Math.pow(2, bestFrom0 / 25);
    let difficulty = baseExponent * 0.8;

    if (bestFrom0 >= 95) difficulty = Math.max(difficulty, 12);
    else if (bestFrom0 >= 80) difficulty = Math.max(difficulty, 8);
    else if (bestFrom0 >= 60) difficulty = Math.max(difficulty, 4);
    else if (bestFrom0 >= 40) difficulty = Math.max(difficulty, 2);

    const deathFrequency = {};
    const keys = Object.keys(from0Freq);
    for (let i = 0; i < keys.length; i++) {
        const p = keys[i];
        const count = from0Freq[p];
        deathFrequency[p] = (deathFrequency[p] || 0) + count;
    }

    const sortedDeaths = Object.values(deathFrequency).sort(function(a, b) { return b - a; });
    const wallDeathPercent = sortedDeaths[0] || 0;
    let totalDeaths = 0;
    for (let i = 0; i < sortedDeaths.length; i++) totalDeaths += sortedDeaths[i];
    if (totalDeaths === 0) totalDeaths = 1;
    const wallConcentration = wallDeathPercent / totalDeaths;

    let chokeMultiplier = 1.0;
    if (wallConcentration > 0.4) chokeMultiplier = 2.2;
    else if (wallConcentration > 0.25) chokeMultiplier = 1.8;
    else if (wallConcentration > 0.15) chokeMultiplier = 1.4;
    else if (wallConcentration < 0.08) chokeMultiplier = 0.85;

    const consistency = Math.max(0.05, percentiles.consistencyIndex / 100);
    const consistencyPower = consistency > 0.8 ? 1.2 : consistency > 0.6 ? 1.4 : consistency > 0.4 ? 1.6 : 1.8;

    const baseAttempts = remaining * 20;
    const scaledByDifficulty = baseAttempts * difficulty;
    const scaledByConsistency = scaledByDifficulty / Math.pow(consistency, consistencyPower);
    const finalEstimate = scaledByConsistency * chokeMultiplier * difficultyMultiplier;

    return Math.max(10, Math.round(finalEstimate));
}

// ============================================================================
// PASS RATE ANALYSIS
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
            chunk: start + "-" + end + "%",
            start: start,
            end: end,
            passRate: Math.max(0, passRate),
            deaths: deathsInChunk,
            color: color
        });
    }
    return chunks;
}

// ============================================================================
// OVERALL GRADING
// ============================================================================

function calculateOverallGrade(skillScore, consistencyIndex, readiness, bestFrom0, completions, routeProofScore, coverage) {
    const progressScore = calculateGDProgressScore(bestFrom0, routeProofScore, coverage, completions);
    const gradeScore = (progressScore * 0.35) + (readiness * 0.25) + (consistencyIndex * 0.20) + (skillScore * 0.15) + (safeNum(routeProofScore) * 0.05);
    let tier = 'F';
    if (gradeScore >= 85) tier = 'S';
    else if (gradeScore >= 75) tier = 'A';
    else if (gradeScore >= 65) tier = 'B';
    else if (gradeScore >= 50) tier = 'C';
    else if (gradeScore >= 35) tier = 'D';

    return {
        tier: tier,
        score: gradeScore.toFixed(1),
        breakdown: {
            skillComponent: (skillScore * 0.15).toFixed(1),
            consistencyComponent: (consistencyIndex * 0.2).toFixed(1),
            readinessComponent: (readiness * 0.25).toFixed(1),
            proofComponent: safeNum(routeProofScore).toFixed(1),
            progressComponent: (progressScore * 0.35).toFixed(1)
        }
    };
}

// ============================================================================
// NERVE CHART
// ============================================================================

function calculateNerveChart(from0Freq, percentiles, bestFrom0) {
    const chartPoints = [];
    const maxDeathsAtAnyPercent = Math.max(...Object.values(from0Freq || {}), 1);
    for (let pct = 0; pct <= 100; pct += 5) {
        const deathsAtPercent = from0Freq[pct] || 0;
        const deathDensity = (deathsAtPercent / maxDeathsAtAnyPercent) * 50;
        const consistencyFactor = percentiles.consistencyIndex < 50 ? 15 : 0;
        const nerveScore = Math.min(100, deathDensity + consistencyFactor);
        let riskZone;
        if (nerveScore > 70) riskZone = 'CRITICAL';
        else if (nerveScore > 50) riskZone = 'HIGH';
        else if (nerveScore > 30) riskZone = 'MEDIUM';
        else riskZone = 'LOW';
        chartPoints.push({
            percent: pct,
            nerveScore: nerveScore.toFixed(1),
            riskZone: riskZone,
            deaths: deathsAtPercent
        });
    }
    return chartPoints;
}

// ============================================================================
// SEGMENT RELIABILITY
// ============================================================================

function calculateSegmentReliability(actualRuns, from0Freq, completions) {
    const reliabilityMap = {};
    for (let i = 0; i < actualRuns.length; i++) {
        const run = actualRuns[i];
        const segment = run.start + "-" + run.end;
        let deathsInSegment = 0;
        const keys = Object.keys(from0Freq);
        for (let j = 0; j < keys.length; j++) {
            const p = parseInt(keys[j], 10);
            const count = from0Freq[keys[j]];
            if (p > run.start && p <= run.end) deathsInSegment += count;
        }
        const reliability = run.count > 0 ? ((run.count - deathsInSegment) / run.count * 100) : 0;
        let tier;
        if (reliability >= 80) tier = 'HIGH';
        else if (reliability >= 60) tier = 'MEDIUM';
        else tier = 'LOW';
        reliabilityMap[segment] = {
            segment: segment,
            start: run.start,
            end: run.end,
            attempts: run.count,
            successfulAttempts: Math.max(0, run.count - deathsInSegment),
            reliability: Math.max(0, reliability).toFixed(1),
            tier: tier
        };
    }
    const values = Object.values(reliabilityMap);
    values.sort(function(a, b) { return parseFloat(b.reliability) - parseFloat(a.reliability); });
    return values;
}

// ============================================================================
// FORECAST
// ============================================================================

function calculateForecast(buildResult, readinessResult, attemptStats, percentiles, difficultyMultiplier) {
    const bestFrom0 = buildResult.bestFrom0;
    const readiness = safeNum(readinessResult.readiness);
    const remaining = 100 - bestFrom0;
    if (remaining <= 0) {
        return { estimatedAttempts: 0, confidenceInterval: "0 - 0", volatility: "N/A", note: "Go for the completion!" };
    }

    const adjDiff = difficultyMultiplier * (1 - readiness / 100);
    let model1 = remaining * adjDiff * 15;
    if (bestFrom0 >= 90) {
        model1 = Math.pow(1.5, remaining) * adjDiff * 5;
    }
    let model2 = Infinity;
    if (attemptStats.totalAttempts > 50 && attemptStats.completions > 0) {
        const rate = attemptStats.completions / attemptStats.totalAttempts;
        model2 = 1 / rate;
    }
    const model3 = remaining * (100 / Math.max(1, percentiles.consistencyIndex)) * difficultyMultiplier * 8;

    let final;
    if (model2 !== Infinity && attemptStats.totalAttempts > 200) {
        const w = Math.min(0.6, attemptStats.totalAttempts / 3000);
        final = model1 * (1 - w) + model2 * w;
    } else if (percentiles.attempts > 20) {
        final = model1 * 0.5 + model3 * 0.5;
    } else {
        final = model1;
    }
    final = safeNum(final, model1);
    const variance = final * 0.5;
    const lb = Math.max(0, final - variance);
    const ub = final + variance;
    let vol;
    if (final === 0) vol = "Unknown";
    else if (variance / final > 0.5) vol = "High";
    else if (variance / final > 0.3) vol = "Medium";
    else vol = "Low";

    return {
        estimatedAttempts: Math.round(final),
        confidenceInterval: Math.round(lb) + " - " + Math.round(ub),
        volatility: vol,
        note: remaining <= 5 ? "Very close! Focus on your choke point." : "Rough estimate — trust skill/consistency metrics more."
    };
}

// ============================================================================
// COACH SUGGESTIONS
// ============================================================================

function generateCoachSuggestions(buildResult, consistencyResult, readinessResult, coverageResult, percentiles) {
    const bestFrom0 = buildResult.bestFrom0;
    const actualRunsSorted = buildResult.actualRunsSorted;
    const completions = buildResult.completions;
    const worst = consistencyResult.worst;
    const segmentData = consistencyResult.segmentData;
    const skillTier = readinessResult.skillTier;
    const consistencyTier = readinessResult.consistencyTier;
    const nervesTier = readinessResult.nervesTier;
    const gaps = coverageResult.gaps;
    const openingPressure = analyzeOpeningPressure(buildResult.from0Freq);
    const routeProof = safeNum(readinessResult.breakdown?.routeProof);

    const s = {
        nextAction: "",
        biggestGap: "",
        bestRoute: "",
        strongAreas: "",
        todayFocus: "",
        warnings: [],
        actionItems: [],
        mentalGame: "",
        grindSpot: ""
    };

    if (bestFrom0 >= 70) {
        const frontierStart = Math.floor(bestFrom0 / 10) * 10;
        const frontierEnd = Math.min(100, frontierStart + 20);
        s.nextAction = "🎯 ENDGAME: You're at " + bestFrom0 + "%. Focus on " + frontierStart + "-" + frontierEnd + "% startpos practice.";
        s.actionItems.push("Practice the " + frontierStart + "-" + frontierEnd + "% segment using startpos until consistent");
        s.actionItems.push("Keep the ending warm, but spend most attempts from 0");
    } else if (worst && worst.reliable && worst.passRate !== null) {
        const passRate = worst.passRate.toFixed(1);
        if (passRate < 20) {
            s.nextAction = "Critical wall: " + worst.start + "-" + worst.end + "% is blocking runs (" + passRate + "% pass). Drill it from a nearby startpos until it feels automatic.";
            s.actionItems.push("Study " + worst.start + "-" + worst.end + "% patterns and do short buffered runs into it");
        } else if (passRate < 50) {
            s.nextAction = "Bottleneck: " + worst.start + "-" + worst.end + "% is inconsistent (" + passRate + "% pass). Build it with short runs, then test from 0.";
            s.actionItems.push("Do 30-50 quality attempts on " + worst.start + "-" + worst.end + "% with a small buffer before the part");
        } else if (passRate < 70) {
            s.nextAction = "Focus: " + worst.start + "-" + worst.end + "% is shaky (" + passRate + "% pass). Polish it before long from-0 sessions.";
            s.actionItems.push("10-15 slow, careful runs through " + worst.start + "-" + worst.end + "%");
        } else {
            s.nextAction = "Ready pattern: your proven segments are stable enough. Use more from-0 attempts and keep late-game calm.";
            s.actionItems.push("Full from-0 attempts. Stay calm during the run.");
        }
    } else if (bestFrom0 < 25) {
        s.nextAction = "Build foundation: get 0-25% into muscle memory before worrying about full routes.";
        s.actionItems.push("500+ attempts on early game to build reflexes");
    } else if (bestFrom0 < 50) {
        s.nextAction = "Consistency grind: mid-game practice matters most. Get to 50%+ consistently.";
        s.actionItems.push("Focus on NOT dying in the sections you've beaten");
    } else if (bestFrom0 < 80) {
        s.nextAction = "Push to endgame: you can reach mid-game, so build 60-80% until late attempts feel normal.";
        s.actionItems.push("Practice 60-80% in isolation, then run from 0 to test it");
    } else {
        s.nextAction = routeProof >= 70
            ? "Clear-phase grind: you have real endgame proof. Mix from-0 attempts with a few 80-100 refreshers."
            : "Final stretch: you reached endgame. Practice 80-100% until it feels automatic.";
        s.actionItems.push("Keep 80-100% warm, but spend most attempts from 0");
    }

    if (openingPressure.isolated) {
        s.warnings.push("Opening input spike: 0-5% has " + openingPressure.percentage.toFixed(1) + "% of from-0 deaths, but it looks isolated.");
        s.actionItems.push("Warm up the first timing separately, then judge the level by the next real wall");
    }

    if (worst && worst.passRate !== null && worst.passRate < 50) {
        s.biggestGap = "Wall at " + worst.start + "-" + worst.end + "% | " + worst.passRate.toFixed(1) + "% pass from " + worst.sampleWeight + " reaches";
    } else if (gaps.length > 0) {
        let bigGap = gaps[0];
        for (let i = 1; i < gaps.length; i++) {
            if ((gaps[i].end - gaps[i].start) > (bigGap.end - bigGap.start)) bigGap = gaps[i];
        }
        s.biggestGap = "No data on " + bigGap.start + "-" + bigGap.end + "% — you need to practice this range";
    } else if (completions === 0 && bestFrom0 < 80) {
        s.biggestGap = "Haven't reached 80%+ yet — this is your only real blocker";
    } else {
        s.biggestGap = "No clear bottleneck — you're ready to attempt";
    }

    if (actualRunsSorted.length > 0) {
        const b = actualRunsSorted[0];
        const stability = calculateStability(b).toFixed(1);
        s.grindSpot = b.start + "-" + b.end + "% (done " + b.count + "x, stability " + stability + ")";
        s.bestRoute = "Best practice route: " + b.start + "-" + b.end + "% | Most reliable for you. Do 20-30 clean reps daily.";
    } else if (bestFrom0 > 0) {
        s.bestRoute = "Practice 0-" + bestFrom0 + "% → then extend to " + (bestFrom0 + 10) + "%";
    } else {
        s.bestRoute = "Start with full from-0 runs to find your weak spots";
    }

    if (nervesTier === "F") {
        s.mentalGame = "Mental game: final-20 deaths are normal pressure. Practice 80%+ until the ending feels like a routine run.";
        s.actionItems.push("Do 100 separate 80-100% runs (startpos)");
    } else if (nervesTier === "D") {
        s.mentalGame = "You get nervous late-game. Record yourself beating 80%+ to build confidence.";
    } else if (nervesTier === "C" || nervesTier === "B") {
        s.mentalGame = "Nerves are solid. Mental game is your strength — use it.";
    } else {
        s.mentalGame = "Mental game is a strength: your late-game proof says nerves are helping more than hurting.";
    }

    const strong = [];
    for (let i = 0; i < segmentData.length; i++) {
        if (segmentData[i].reliable && segmentData[i].passRate !== null && segmentData[i].passRate >= 80) {
            strong.push(segmentData[i]);
        }
    }
    if (strong.length >= 4) {
        const parts = [];
        for (let i = 0; i < strong.length; i++) parts.push(strong[i].start + "-" + strong[i].end + "%");
        s.strongAreas = "Solid sections: " + parts.join(", ") + " are your strengths";
    } else if (strong.length > 0) {
        const parts = [];
        for (let i = 0; i < strong.length; i++) parts.push(strong[i].start + "-" + strong[i].end + "%");
        s.strongAreas = "You're clean on " + parts.join(", ") + "";
    } else if (bestFrom0 >= 80) {
        s.strongAreas = "You consistently reach 80%+ — that's your foundation";
    } else {
        s.strongAreas = "Build strength on the early game first";
    }

    if (100 - bestFrom0 <= 5) {
        s.todayFocus = "Today: full from-0 attempts only. You're close enough that over-practicing can make you stiff.";
    } else if (completions > 0) {
        s.todayFocus = "Today: stabilize what you've proven. 30-50 runs through your weak section.";
    } else if (bestFrom0 >= 70) {
        s.todayFocus = "Today: 50% from-0 attempts, 50% " + (worst ? worst.start + "-" + worst.end + "%" : "weak section") + " segment work.";
    } else {
        s.todayFocus = "Today: focus on " + (s.grindSpot || "0-" + bestFrom0 + "%") + ". Keep full attempts limited.";
    }

    if (completions > 0 && consistencyTier === "F") s.warnings.push("⚠️ Completed but inconsistent — prove it again");
    if (gaps.length > 3) s.warnings.push("⚠️ Patchy practice (" + gaps.length + " gaps) — fill them");
    if (bestFrom0 > 90 && nervesTier === "F") s.warnings.push("⚠️ Choke pattern detected — practice end-game 2x more");
    if (percentiles.consistencyIndex < 30 && percentiles.attempts > 100) s.warnings.push("⚠️ Wildly inconsistent — slow down and focus");
    if (percentiles.attempts < 50) s.warnings.push("ℹ️ Small sample size — more data needed for accurate advice");

    return s;
}

// ============================================================================
// RADAR CHART DATA
// ============================================================================

function buildRadarData(skillScoreResult, readinessResult, coverageResult, buildResult) {
    const skill = Math.round(safeNum(skillScoreResult.score));
    const consistency = Math.round(safeNum(skillScoreResult.percentiles.consistencyIndex));
    const nerves = Math.round(safeNum(parseFloat(readinessResult.breakdown.nerves)));
    const coverage = Math.round(safeNum(coverageResult.practice));
    const endurance = safeNum(buildResult.bestFrom0);
    const readiness = Math.round(safeNum(readinessResult.readiness));

    return {
        labels: ["Skill", "Consistency", "Nerves", "Coverage", "Endurance", "Readiness"],
        values: [skill, consistency, nerves, coverage, endurance, readiness],
        raw: { skill: skill, consistency: consistency, nerves: nerves, coverage: coverage, endurance: endurance, readiness: readiness }
    };
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

function analyzeInput(inputText, difficultyMultiplier, options) {
    difficultyMultiplier = difficultyMultiplier || 1.0;
    options = options || {};
    const limit = options.limit || 10;
    const debug = options.debug || false;
    const sessionId = options.sessionId || null;

    const warnings = validateInput(inputText);
    if (warnings.length > 0 && debug) console.warn("Validation:", warnings);

    // Auto-split input by section labels (Runs:, From 0:, from0:, etc.)
    // Handles both one-line and multi-line inputs
    let processedText = inputText.replace(/\r\n/g, '\n');

    // Normalize section labels to ensure consistent splitting
    // Match labels like "Runs:", "From 0:", "from0:", "run:", "startpos:"
    const sectionLabelRegex = /(?:^|\s)(runs?|from\s*0|from0|startpos(?:\s+runs)?)\s*:/gi;

    // If the input contains section labels, split by them
    if (sectionLabelRegex.test(processedText)) {
        sectionLabelRegex.lastIndex = 0; // Reset regex
        let match;
        const sections = [];
        let lastIndex = 0;
        let lastLabel = '';

        while ((match = sectionLabelRegex.exec(processedText)) !== null) {
            if (lastLabel) {
                sections.push({ label: lastLabel, content: processedText.slice(lastIndex, match.index).trim() });
            }
            lastLabel = match[0];
            lastIndex = match.index + match[0].length;
        }

        if (lastLabel) {
            sections.push({ label: lastLabel, content: processedText.slice(lastIndex).trim() });
        }

        // Rebuild as lines with proper labels
        const rebuiltLines = [];
        for (const section of sections) {
            rebuiltLines.push(section.label + ' ' + section.content);
        }
        processedText = rebuiltLines.join('\n');
    }

    const lines = processedText.split('\n');
    const entries = [];
    let explicitBeats = 0;
    for (let i = 0; i < lines.length; i++) {
        const c = lines[i].trim();
        if (!c || c.toLowerCase() === 'end') continue;
        const parsed = parseMetricsLine(c);
        for (let j = 0; j < parsed.entries.length; j++) entries.push(parsed.entries[j]);
        explicitBeats += parsed.beats;
    }

    const attemptStats = computeAttemptTotals(entries);
    const buildResult = buildRuns(entries);
    const rawAttemptCount = countRawAttemptsFromText(inputText);
    const percentiles = calculateFrom0Percentiles(buildResult.from0Freq, buildResult.completions);
    const skillScoreResult = calculateSkillScore(percentiles);
    const coverageResult = calculateCoverage(buildResult.actualRuns);
    const engineMode = detectMode(buildResult.completions, attemptStats.totalAttempts, buildResult.bestFrom0, buildResult.actualRuns, attemptStats.totalFrom0Attempts, percentiles);
    const consistencyResult = renderSegmentConsistency(buildResult.actualRuns, buildResult.from0Freq, buildResult.completions);
    const readinessResult = calculateReadiness(buildResult, attemptStats, explicitBeats, skillScoreResult);
    const forecastResult = calculateForecast(buildResult, readinessResult, attemptStats, percentiles, difficultyMultiplier);
    const coachSuggestions = generateCoachSuggestions(buildResult, consistencyResult, readinessResult, coverageResult, percentiles);
    const deathDistribution = calculateDeathDistribution(buildResult.from0Freq);
    let pathResult = null;
    try {
        pathResult = analyzePaths(buildResult.actualRuns, buildResult.bestFrom0);
    } catch(e) {
        pathResult = { filteredPaths: [], pathsByLength: {}, totalPathLengths: 0, allPaths: [], totalCompletionRoutes: 0, totalPathCount: 0 };
    }

    let routeReliability = "Low";
    if (pathResult.filteredPaths.length > 0) {
        let sum = 0;
        for (let i = 0; i < pathResult.allPaths.length; i++) sum += pathResult.allPaths[i].length;
        const avg = sum / pathResult.allPaths.length;
        if (avg <= 2) routeReliability = "High";
        else if (avg <= 4) routeReliability = "Medium";
    }

    const passRateChunks = calculatePassRateByChunks(buildResult.from0Freq, buildResult.completions);
    const enhancedAttempts = calculateRealisticAttempts(buildResult, percentiles, difficultyMultiplier);
    const routeProofScore = safeNum(readinessResult.breakdown.routeProof);
    const overallGrade = calculateOverallGrade(
        safeNum(skillScoreResult.score),
        percentiles.consistencyIndex,
        safeNum(readinessResult.readiness),
        buildResult.bestFrom0,
        buildResult.completions,
        routeProofScore,
        coverageResult.practice
    );
    const nerveChart = calculateNerveChart(buildResult.from0Freq, percentiles, buildResult.bestFrom0);
    const segmentReliability = calculateSegmentReliability(buildResult.actualRuns, buildResult.from0Freq, buildResult.completions);

    // bestRuns/longestRuns/stableRuns should ONLY be startpos runs (type="run")
    // from0 runs and completions are kept separate
    const startposRuns = [];
    for (let i = 0; i < buildResult.actualRuns.length; i++) {
        if (buildResult.actualRuns[i].type === "run") startposRuns.push(buildResult.actualRuns[i]);
    }
    // Fallback: if no startpos runs, show from0 runs (but not completions)
    const runsToShow = startposRuns.length > 0 ? startposRuns : buildResult.actualRuns.filter(function(r) {
        return r.type !== "completion";
    });

    const bestRuns = getBestRuns(runsToShow, limit);
    const longestRuns = getLongestRuns(runsToShow, limit);
    const stableRuns = getStableRuns(runsToShow, limit);
    const radarData = buildRadarData(skillScoreResult, readinessResult, coverageResult, buildResult);

    const summary = {
        totalAttempts: attemptStats.totalAttempts,
        rawAttemptCount: rawAttemptCount,
        bestFrom0: buildResult.bestFrom0,
        practiceCoverage: coverageResult.practice,
        from0Coverage: buildResult.bestFrom0,
        readiness: readinessResult.readiness,
        completions: buildResult.completions,
        mode: engineMode,
        routeReliability: routeReliability,
        worstSegment: consistencyResult.worst ? consistencyResult.worst.start + "-" + consistencyResult.worst.end + "%" : "None",
        estimatedAttempts: forecastResult.estimatedAttempts,
        deathHotspot: deathDistribution.length > 0 ? deathDistribution[0].segment : "None"
    };

    const dashboardCards = {
        bestRun: bestRuns[0] || null,
        longestRun: longestRuns[0] || null,
        stableRun: stableRuns[0] || null,
        deathHotspot: deathDistribution[0] || null,
        bestRoute: pathResult.filteredPaths[0] || null
    };

    const hasData = attemptStats.totalAttempts > 0 || buildResult.bestFrom0 > 0;

    const result = {
        hasData: hasData,
        totalAttempts: attemptStats.totalAttempts,
        bestFrom0: buildResult.bestFrom0,
        mode: engineMode,
        routeReliability: routeReliability,
        estimatedAttempts: forecastResult.estimatedAttempts,
        summary: summary,
        dashboardCards: dashboardCards,
        radarData: radarData,
        rawAttemptCount: rawAttemptCount,
        from0Attempts: attemptStats.totalFrom0Attempts,
        from0Deaths: attemptStats.from0Deaths,
        startposAttempts: attemptStats.startposAttempts,
        percentiles: {
            p10: percentiles.p10,
            p25: percentiles.p25,
            p50: percentiles.p50,
            p75: percentiles.p75,
            p90: percentiles.p90,
            best: percentiles.best,
            mean: percentiles.mean.toFixed(1),
            stdDev: percentiles.stdDev.toFixed(1),
            consistencyIndex: percentiles.consistencyIndex.toFixed(1),
            attempts: percentiles.attempts
        },
        practiceCoverage: coverageResult.practice,
        coverageGaps: coverageResult.gaps,
        coverageMerged: coverageResult.merged,
        readiness: readinessResult.readiness,
        skillTier: readinessResult.skillTier,
        consistencyTier: readinessResult.consistencyTier,
        nervesTier: readinessResult.nervesTier,
        readinessBreakdown: readinessResult.breakdown,
        segmentData: consistencyResult.segmentData,
        worstSegment: consistencyResult.worst,
        routes: pathResult.filteredPaths,
        totalRoutes: pathResult.totalPathCount || pathResult.totalCompletionRoutes,
        routePaths: pathResult.pathsByLength,
        routeSegments: pathResult.filteredPaths.length > 0 ? pathResult.filteredPaths[0].segments : 0,
        bestRuns: bestRuns,
        bestRunsAll: getBestRuns(runsToShow, 100),
        longestRuns: longestRuns,
        longestRunsAll: getLongestRuns(runsToShow, 100),
        stableRuns: stableRuns,
        stableRunsAll: getStableRuns(runsToShow, 100),
        deathDistribution: deathDistribution,
        from0Freq: buildResult.from0Freq,
        confidenceInterval: forecastResult.confidenceInterval,
        volatility: forecastResult.volatility,
        forecastNote: forecastResult.note,
        coachSuggestions: coachSuggestions,
        passRateByChunks: passRateChunks,
        enhancedAttempts: enhancedAttempts,
        overallGrade: overallGrade,
        nerveChart: nerveChart,
        segmentReliability: segmentReliability,
        validationWarnings: warnings,
        sessionId: sessionId,
        skillScore: skillScoreResult.score,
        analyzedAt: new Date().toISOString()
    };

    // Augment with V7 metrics
    return augmentResult(result, options);
}

// ============================================================================
// EXPORT
// ============================================================================

if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        analyzeInput: analyzeInput,
        parseMetricsLine: parseMetricsLine,
        buildRuns: buildRuns,
        analyzePaths: analyzePaths,
        calculateReadiness: calculateReadiness,
        generateCoachSuggestions: generateCoachSuggestions,
        validateInput: validateInput,
        calculateCoverage: calculateCoverage,
        calculateDeathDistribution: calculateDeathDistribution,
        calculateFrom0Percentiles: calculateFrom0Percentiles,
        calculateSkillScore: calculateSkillScore,
        calculateStability: calculateStability,
        buildRadarData: buildRadarData,
        countRawAttemptsFromText: countRawAttemptsFromText,
        getBestRuns: getBestRuns,
        getLongestRuns: getLongestRuns,
        getStableRuns: getStableRuns,
        DIFFICULTY_MATRIX: DIFFICULTY_MATRIX
    };
}
