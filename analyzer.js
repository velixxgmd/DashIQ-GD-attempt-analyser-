/**
 * GEOMETRY DASH COGNITIVE ANALYZER & ENGINE v5.3
 * All bugs fixed: start===end leak, radar data, attempt counting
 * ============================================================
 */

const RANGE_PATTERN = /(\d+)\s*%?\s*-\s*(\d+)\s*%?\s*x\s*(\d+)/gi;
const SINGLE_PATTERN = /(\d+)\s*%?\s*x\s*(\d+)/gi;
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
const MIN_SEGMENT_SAMPLES = 5;

const DIFFICULTY_MATRIX = {
    "auto": 0.2, "easy": 0.4, "normal": 0.6, "hard": 0.8,
    "harder": 1.0, "insane": 1.2, "easy demon": 1.5,
    "medium demon": 2.0, "hard demon": 3.0,
    "insane demon": 4.5, "extreme demon": 7.0
};

// ============================================================================
// HELPERS
// ============================================================================

function formatNumber(num) { return num.toLocaleString(); }

function clamp(val, min, max) { return Math.max(min, Math.min(max, val)); }

function safeNum(val, fallback = 0) {
    const n = Number(val);
    return isNaN(n) ? fallback : n;
}

function stripSectionLabels(text) {
    text = text.trim();
    for (const label of SECTION_LABELS) {
        if (text.toLowerCase().startsWith(label)) text = text.slice(label.length).trim();
    }
    return text;
}

// ============================================================================
// PARSING (FIXED: start===end no longer leaks into from0)
// ============================================================================

function parseRunsSegment(blob) {
    const entries = [];
    const cleaned = blob.toLowerCase().replace(/[^0-9xto\-\s%]/g, "").replace(/\s*to\s*/g, "-");
    let match;
    RANGE_PATTERN.lastIndex = 0;
    while ((match = RANGE_PATTERN.exec(cleaned)) !== null) {
        const [_, start, end, count] = match.map(Number);
        if (start > 100 || end > 100) continue;

        // FIXED: start === end is now a zero-length run, NOT skipped
        // Skipping it caused parseFrom0Segment to pick it up as a fake death
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
        const [_, percent, count] = match.map(Number);
        if (percent > 100) continue;
        if (percent === 100) {
            entries.push({ type: "completion", start: 0, end: 100, count, length: 100 });
        } else {
            entries.push({ type: "from0", percent, count });
        }
    }
    return entries;
}

function validateInput(text) {
    const warnings = [];
    text.split('\n').filter(l => l.trim()).forEach(line => {
        const c = line.trim();
        const rm = c.match(/(\d+)\s*%?\s*-\s*(\d+)\s*%?\s*x\s*(\d+)/i);
        if (rm) {
            const [s, e] = [parseInt(rm[1]), parseInt(rm[2])];
            if (e < s) warnings.push(`Invalid run: ${c} (end < start)`);
            if (s > 100 || e > 100) warnings.push(`Invalid range: ${c} (must be ≤ 100%)`);
        }
        const sm = c.match(/(\d+)\s*%?\s*x\s*(\d+)/i);
        if (sm && !rm && parseInt(sm[1]) > 100) warnings.push(`Invalid %: ${c} (must be ≤ 100%)`);
    });
    return warnings;
}

function parseMetricsLine(line) {
    const entries = []; let beats = 0;
    let match; BEAT_PATTERN.lastIndex = 0;
    while ((match = BEAT_PATTERN.exec(line)) !== null) beats += parseInt(match[1]);

    const lm = line.match(LABEL_SEGMENT_PATTERN);
    if (lm) {
        const lt = line.slice(lm[0].length).trim();
        if (line.toLowerCase().includes("from 0") || line.toLowerCase().includes("from0")) {
            entries.push(...parseFrom0Segment(lt));
        } else {
            entries.push(...parseRunsSegment(lt));
        }
    } else {
        // Unlabeled line: parse ranges first, then singles that aren't covered
        const runEntries = parseRunsSegment(line);
        entries.push(...runEntries);

        parseFrom0Segment(line).forEach(entry => {
            const isCovered = entries.some(e => 
                (e.type === "run" || e.type === "completion") && 
                e.start <= entry.percent && 
                e.end >= entry.percent
            );
            if (!isCovered) entries.push(entry);
        });
    }
    return { entries, beats };
}

function computeAttemptTotals(entries) {
    let total = 0, from0Deaths = 0, startpos = 0, completions = 0;
    entries.forEach(e => {
        total += e.count;
        if (e.type === "from0") from0Deaths += e.count;
        else if (e.type === "completion") completions += e.count;
        else startpos += e.count;
    });
    return { totalAttempts: total, from0Deaths, startposAttempts: startpos, completions, totalFrom0Attempts: from0Deaths + completions };
}

// Raw attempt count for frontend "Attempt Density" (should match totalAttempts)
function countRawAttemptsFromText(text) {
    if (!text) return 0;
    const textWithoutBeats = text.replace(BEAT_PATTERN, "");
    const cleaned = textWithoutBeats.replace(/[^0-9x%\-\s]/g, " ");
    let total = 0;
    const matches = cleaned.match(/x\s*(\d+)/gi);
    if (matches) {
        matches.forEach(match => {
            const num = parseInt(match.replace(/x\s*/i, ""));
            if (!isNaN(num)) total += num;
        });
    }
    return total;
}

// ============================================================================
// RUN BUILDING
// ============================================================================

function buildRuns(entries) {
    const merged = new Map();
    entries.forEach(e => {
        let k = e.type === "from0" ? `f0_${e.percent}` : e.type === "run" ? `r_${e.start}_${e.end}` : `c_${e.start}_${e.end}`;
        merged.has(k) ? merged.get(k).count += e.count : merged.set(k, { ...e });
    });
    const vals = Array.from(merged.values());
    let bestFrom0 = 0, completions = 0, from0Freq = {};
    const actualRuns = [];
    vals.forEach(e => {
        if (e.type === "from0") {
            if (e.percent < 100) { 
                bestFrom0 = Math.max(bestFrom0, e.percent); 
                // Include 0% deaths in frequency map (removed > 0 check)
                from0Freq[e.percent] = (from0Freq[e.percent] || 0) + e.count; 
            }
        } else if (e.type === "completion") { 
            completions += e.count; 
            actualRuns.push(e); 
        } else if (e.type === "run") actualRuns.push(e);
    });
    const mActual = new Map();
    actualRuns.forEach(r => { const k = `${r.start}_${r.end}`; mActual.has(k) ? mActual.get(k).count += r.count : mActual.set(k, { ...r }); });
    const final = Array.from(mActual.values());
    return {
        bestFrom0, completions, actualRuns: final,
        actualRunsSorted: [...final].sort((a, b) => b.length * Math.log(b.count + 1) - a.length * Math.log(a.count + 1)),
        actualRunsByLength: [...final].sort((a, b) => b.length - a.length),
        from0Freq
    };
}

// ============================================================================
// STABLE / BEST / LONGEST RUNS
// ============================================================================

function calculateStability(run) {
    return run.length * Math.log(run.count + 1);
}

function getStableRuns(actualRuns, limit = 10) {
    return actualRuns.map(r => ({ ...r, stabilityScore: calculateStability(r) }))
        .sort((a, b) => b.stabilityScore - a.stabilityScore).slice(0, limit);
}

function getBestRuns(actualRuns, limit = 10) {
    return actualRuns.map(r => {
        const stability = calculateStability(r);
        const reliability = r.count > 0 ? stability / r.count : 0;
        return { ...r, stabilityScore: stability, reliabilityScore: reliability };
    }).sort((a, b) => {
        if (b.stabilityScore !== a.stabilityScore) return b.stabilityScore - a.stabilityScore;
        if (b.length !== a.length) return b.length - a.length;
        return b.count - a.count;
    }).slice(0, limit);
}

function getLongestRuns(actualRuns, limit = 10) {
    return [...actualRuns].sort((a, b) => b.length - a.length).slice(0, limit);
}

// ============================================================================
// MEMORY-EFFICIENT PERCENTILES
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
    sortedPercents.forEach(p => { cumulative += from0Freq[p]; cumMap.set(p, cumulative); });
    cumulative += completions;

    const getPercentile = (p) => {
        const target = Math.ceil((p / 100) * totalAttempts);
        if (target > totalAttempts - completions) return 100;
        for (const [percent, cum] of cumMap) { if (cum >= target) return percent; }
        return sortedPercents[sortedPercents.length - 1] || 0;
    };

    const p10 = getPercentile(10);
    const p25 = getPercentile(25);
    const p50 = getPercentile(50);
    const p75 = getPercentile(75);
    const p90 = getPercentile(90);
    const best = completions > 0 ? 100 : (sortedPercents.length > 0 ? sortedPercents[sortedPercents.length - 1] : 0);

    let mean = 0, m2 = 0, n = 0;
    sortedPercents.forEach(p => {
        const count = from0Freq[p];
        for (let i = 0; i < count; i++) { n++; const delta = p - mean; mean += delta / n; m2 += delta * (p - mean); }
    });
    for (let i = 0; i < completions; i++) { n++; const delta = 100 - mean; mean += delta / n; m2 += delta * (100 - mean); }
    const variance = n > 1 ? m2 / n : 0;
    const stdDev = Math.sqrt(variance);
    const consistencyIndex = best > 0 ? Math.max(0, 100 - (stdDev / best) * 100) : 0;

    return { p10, p25, p50, p75, p90, best, mean, stdDev, attempts: totalAttempts, consistencyIndex };
}

function calculateSkillScore(percentiles) {
    const { p10, p25, p50, p75, p90, best, consistencyIndex } = percentiles;
    const baseSkill = (p90 * 0.30) + (p75 * 0.30) + (p50 * 0.25) + (best * 0.10) + (p25 * 0.05);
    const consistencyBonus = (consistencyIndex / 100) * 15;
    const volumeBonus = Math.min(10, percentiles.attempts / 50);
    const rawScore = baseSkill + consistencyBonus + volumeBonus;
    return { score: Math.min(100, rawScore), baseSkill, consistencyBonus, volumeBonus, percentiles };
}

// ============================================================================
// MODE
// ============================================================================

function detectMode(completions, totalAttempts, bestFrom0, actualRuns, totalFrom0Attempts, percentiles) {
    if (completions === 0) {
        if (bestFrom0 === 0 && actualRuns.length === 0) return "NO_DATA";
        const hasAdvanced = actualRuns.some(r => r.start > 20);
        const avgStart = actualRuns.length > 0 ? actualRuns.reduce((s, r) => s + r.start, 0) / actualRuns.length : 0;
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
    if (!actualRuns || actualRuns.length === 0) return { practice: 0, merged: [], gaps: [{ start: 0, end: 100 }] };
    const intervals = actualRuns.map(r => [r.start, r.end]).sort((a, b) => a[0] - b[0]);
    const merged = [];
    let cur = [...intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
        if (intervals[i][0] <= cur[1]) cur[1] = Math.max(cur[1], intervals[i][1]);
        else { merged.push(cur); cur = [...intervals[i]]; }
    }
    merged.push(cur);
    const total = merged.reduce((s, [a, b]) => s + (b - a), 0);
    const gaps = [];
    if (merged[0][0] > 0) gaps.push({ start: 0, end: merged[0][0] });
    for (let i = 1; i < merged.length; i++) if (merged[i][0] > merged[i-1][1]) gaps.push({ start: merged[i-1][1], end: merged[i][0] });
    if (merged[merged.length-1][1] < 100) gaps.push({ start: merged[merged.length-1][1], end: 100 });
    return { practice: Math.min(100, total), merged, gaps };
}

// ============================================================================
// PATHS
// ============================================================================

function analyzePaths(actualRuns, bestFrom0) {
    let pool = [...actualRuns];
    if (bestFrom0 > 0 && !pool.some(r => r.start === 0 && r.end === bestFrom0)) {
        pool.push({ type: "virtual", start: 0, end: bestFrom0, length: bestFrom0, count: 0 });
    }
    if (pool.length === 0) return { filteredPaths: [], pathsByLength: {}, totalPathLengths: 0, allPaths: [] };

    const queue = [[0, []]], uniquePaths = [];
    while (queue.length > 0 && uniquePaths.length < MAX_PATHWAYS) {
        const [cp, path] = queue.shift();
        if (cp >= 100) { uniquePaths.push(path); continue; }
        const opts = pool.filter(r => r.start <= cp && r.end > cp).sort((a, b) => b.end - a.end);
        const sigs = new Set(path.map(r => `${r.start}_${r.end}`));
        const limit = Math.min(opts.length, 12);
        for (let i = 0; i < limit; i++) {
            const r = opts[i], s = `${r.start}_${r.end}`;
            if (!sigs.has(s)) queue.push([r.end, [...path, r]]);
        }
    }
    uniquePaths.sort((a, b) => a.length - b.length);
    const seen = new Set(), filtered = [];
    uniquePaths.forEach(p => { const s = p.map(r => `${r.start}_${r.end}`).join("|"); if (!seen.has(s)) { seen.add(s); filtered.push(p); } });

    const formattedPaths = filtered.map(p => ({
        segments: p.length,
        totalLength: p.reduce((sum, r) => sum + r.length, 0),
        start: p[0]?.start || 0,
        end: p[p.length-1]?.end || 0,
        route: p.map(r => `${r.start}-${r.end}%`),
        runs: p
    }));

    const byLen = {}; let total = 0;
    filtered.forEach(p => { const l = p.length; total += l; if (!byLen[l]) byLen[l] = []; byLen[l].push(p); });
    return { filteredPaths: formattedPaths, pathsByLength: byLen, totalPathLengths: total, allPaths: filtered };
}

// ============================================================================
// CONSISTENCY
// ============================================================================

function calculateSegmentConsistency(start, end, from0Freq, completions) {
    let reachedStart = 0, reachedEnd = 0;
    Object.entries(from0Freq).forEach(([pct, count]) => {
        const p = parseInt(pct);
        if (p >= start) reachedStart += count;
        if (p >= end) reachedEnd += count;
    });
    reachedStart += completions; reachedEnd += completions;
    const total = Object.values(from0Freq).reduce((a, b) => a + b, 0) + completions;
    if (total < MIN_SEGMENT_SAMPLES) return { passRate: null, sampleWeight: total, reliable: false };
    if (reachedStart === 0) return { passRate: null, sampleWeight: 0, reliable: false };
    return { passRate: Math.min(100, (reachedEnd / reachedStart) * 100), sampleWeight: reachedStart, reliable: true };
}

function renderSegmentConsistency(actualRuns, from0Freq, completions) {
    const segmentData = [];
    for (let b = 0; b < 10; b++) {
        const start = b * 10, end = (b + 1) * 10;
        const r = calculateSegmentConsistency(start, end, from0Freq, completions);
        const hasCoverage = actualRuns.some(x => x.start <= start && x.end >= end);
        if (r.passRate !== null) segmentData.push({ start, end, ...r, hasCoverage });
        else if (hasCoverage) segmentData.push({ start, end, passRate: null, sampleWeight: 0, reliable: false, hasCoverage, note: "Startpos only" });
    }
    let worst = null;
    if (segmentData.length > 0) {
        const reliable = segmentData.filter(s => s.reliable && s.passRate !== null);
        if (reliable.length > 0) worst = reliable.reduce((min, c) => c.passRate < min.passRate ? c : min);
        else worst = segmentData.filter(s => s.passRate !== null).reduce((min, c) => c.passRate < min.passRate ? c : min, segmentData[0]);
    }
    return { segmentData, worst };
}

// ============================================================================
// DEATH DISTRIBUTION
// ============================================================================

function calculateDeathDistribution(from0Freq) {
    const total = Object.values(from0Freq).reduce((a, b) => a + b, 0);
    if (total === 0) return [];
    const uniform = 100 / 20;
    const dist = [];
    for (let i = 0; i < 20; i++) {
        const start = i * 5, end = (i + 1) * 5;
        let deaths = 0;
        Object.entries(from0Freq).forEach(([p, c]) => { if (parseInt(p) >= start && parseInt(p) < end) deaths += c; });
        if (deaths > 0) {
            const pct = (deaths / total) * 100;
            const risk = pct > uniform * 2.5 ? "critical" : pct > uniform * 1.5 ? "high" : pct > uniform ? "medium" : "low";
            dist.push({ segment: `${start}-${end}`, start, end, deaths, percentage: pct.toFixed(1), riskLevel: risk });
        }
    }
    return dist.sort((a, b) => b.deaths - a.deaths);
}

// ============================================================================
// READINESS
// ============================================================================

function getTier(v) {
    if (v >= 90) return "S"; if (v >= 75) return "A"; if (v >= 60) return "B";
    if (v >= 45) return "C"; if (v >= 30) return "D"; return "F";
}

function calculateReadiness(buildResult, attemptStats, explicitBeats, skillScoreResult) {
    const { bestFrom0, actualRuns, from0Freq, completions } = buildResult;
    const { totalAttempts } = attemptStats;

    const skillScore = (safeNum(skillScoreResult.score) / 100) * READINESS_SKILL_WEIGHT;

    const { segmentData } = renderSegmentConsistency(actualRuns, from0Freq, completions);
    let consistencyScore = 0, segCount = 0;
    segmentData.forEach(s => { if (s.reliable && s.passRate !== null) { consistencyScore += s.passRate / 100; segCount++; } });
    if (segCount > 0) consistencyScore = (consistencyScore / segCount) * READINESS_CONSISTENCY_WEIGHT;
    else consistencyScore = (bestFrom0 / 100) * 0.5 * READINESS_CONSISTENCY_WEIGHT;

    let endingScore = 0;
    const endingSeg = segmentData.find(s => s.start === 80);
    if (endingSeg && endingSeg.reliable && endingSeg.passRate !== null) endingScore = (endingSeg.passRate / 100) * READINESS_ENDING_WEIGHT;
    else if (bestFrom0 >= 80) endingScore = ((Math.min(100, bestFrom0) - 80) / 20) * READINESS_ENDING_WEIGHT;

    let nervesScore = 0;
    const lateDeaths = Object.entries(from0Freq).filter(([p]) => parseInt(p) >= 80).reduce((s, [, c]) => s + c, 0);
    const lateSegs = segmentData.filter(s => s.start >= 70);
    let latePass = 0, lateCount = 0;
    lateSegs.forEach(s => { if (s.reliable && s.passRate !== null) { latePass += s.passRate; lateCount++; } });
    if (lateCount > 0) nervesScore = ((latePass / lateCount) / 100) * READINESS_NERVES_WEIGHT;
    else if (lateDeaths === 0 && bestFrom0 >= 80) nervesScore = READINESS_NERVES_WEIGHT;
    else nervesScore = Math.exp(-lateDeaths / NERVE_DECAY_RATE) * READINESS_NERVES_WEIGHT;

    let proofScore = 0;
    if (explicitBeats > 0 && totalAttempts > 0) {
        const rate = explicitBeats / totalAttempts;
        proofScore = Math.min(1, explicitBeats / 5) * Math.min(1, rate * 50) * READINESS_PROOF_WEIGHT;
    }

    let readiness = skillScore + consistencyScore + endingScore + nervesScore + proofScore;
    readiness = clamp(readiness, 0, 1);

    const skillTier = getTier(safeNum(skillScoreResult.score));
    let avgCons = 0;
    if (segCount > 0) avgCons = segmentData.filter(s => s.reliable && s.passRate !== null).reduce((s, x) => s + x.passRate, 0) / segCount;
    else if (bestFrom0 > 50) avgCons = bestFrom0 * 0.6;
    const consistencyTier = getTier(avgCons);

    let nervesVal = 0;
    if (lateCount > 0) nervesVal = latePass / lateCount;
    else if (lateDeaths === 0) nervesVal = 100;
    else nervesVal = Math.max(0, 100 - lateDeaths * 3);
    const nervesTier = getTier(nervesVal);

    return {
        readiness: readiness * 100,
        skillTier,
        consistencyTier,
        nervesTier,
        breakdown: {
            skill: (skillScore / READINESS_SKILL_WEIGHT * 100).toFixed(1),
            consistency: segCount > 0 ? avgCons.toFixed(1) : "N/A",
            ending: (endingScore / READINESS_ENDING_WEIGHT * 100).toFixed(1),
            nerves: (nervesScore / READINESS_NERVES_WEIGHT * 100).toFixed(1),
            proof: (proofScore / READINESS_PROOF_WEIGHT * 100).toFixed(1)
        }
    };
}

// ============================================================================
// FORECAST
// ============================================================================

function calculateForecast(buildResult, readinessResult, attemptStats, percentiles, difficultyMultiplier) {
    const { bestFrom0 } = buildResult;
    const readiness = safeNum(readinessResult.readiness);
    const remaining = 100 - bestFrom0;

    if (remaining <= 0) return { estimatedAttempts: 0, confidenceInterval: "0 - 0", volatility: "N/A", note: "Go for the completion!" };

    const adjDiff = difficultyMultiplier * (1 - readiness / 100);
    const model1 = remaining * adjDiff * 15;

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
    const lb = Math.max(0, final - variance), ub = final + variance;
    const vol = final === 0 ? "Unknown" : (variance / final > 0.5 ? "High" : variance / final > 0.3 ? "Medium" : "Low");

    return {
        estimatedAttempts: Math.round(final),
        confidenceInterval: `${Math.round(lb)} - ${Math.round(ub)}`,
        volatility: vol,
        note: remaining <= 5 ? "Very close! Focus on your choke point." : "Rough estimate — trust skill/consistency metrics more."
    };
}

// ============================================================================
// COACH
// ============================================================================

function generateCoachSuggestions(buildResult, consistencyResult, readinessResult, coverageResult, percentiles) {
    const { bestFrom0, actualRunsSorted, actualRunsByLength, completions } = buildResult;
    const { worst, segmentData } = consistencyResult;
    const { skillTier, consistencyTier, nervesTier } = readinessResult;
    const { gaps } = coverageResult;

    const s = { nextAction: "", biggestGap: "", bestRoute: "", strongAreas: "", todayFocus: "", warnings: [] };

    if (worst && worst.reliable && worst.passRate !== null) {
        s.nextAction = worst.passRate < 30 ? `URGENT: ${worst.start}-${worst.end}% (${worst.passRate.toFixed(1)}% pass)`
            : worst.passRate < 60 ? `Focus: ${worst.start}-${worst.end}% (${worst.passRate.toFixed(1)}% pass)`
            : `Polish: ${worst.start}-${worst.end}%`;
    } else if (gaps.length > 0) {
        const bg = gaps.reduce((m, g) => (g.end - g.start) > (m.end - m.start) ? g : m, gaps[0]);
        s.nextAction = `Fill gap: ${bg.start}-${bg.end}%`;
    } else if (bestFrom0 < 50) s.nextAction = "Build early consistency with from-0 runs";
    else s.nextAction = "Practice late-game transitions";

    if (worst && worst.passRate !== null) s.biggestGap = `${worst.start}-${worst.end}% bottleneck (${worst.passRate.toFixed(1)}% from ${worst.sampleWeight} attempts)`;
    else if (gaps.length > 0) s.biggestGap = `No data: ${gaps.map(g => `${g.start}-${g.end}%`).join(", ")}`;
    else s.biggestGap = "No clear bottleneck";

    if (actualRunsSorted.length > 0) {
        const b = actualRunsSorted[0];
        s.bestRoute = `Grind ${b.start}-${b.end}% (${calculateStability(b).toFixed(1)} stability, ${b.count}x)`;
    } else if (bestFrom0 > 0) s.bestRoute = `Practice 0-${bestFrom0}%`;
    else s.bestRoute = "Start with full from-0 attempts";

    const strong = segmentData.filter(x => x.reliable && x.passRate !== null && x.passRate >= 80);
    if (strong.length > 0) s.strongAreas = `Strong: ${strong.map(x => `${x.start}-${x.end}%`).join(", ")}`;
    else if (bestFrom0 >= 80) s.strongAreas = "Late-game execution";
    else if (bestFrom0 >= 50) s.strongAreas = "Mid-game control";
    else s.strongAreas = "Early foundation";

    if (nervesTier === "F" || nervesTier === "D") s.todayFocus = "Practice choke points (80%+)";
    else if (consistencyTier === "F" || consistencyTier === "D") s.todayFocus = s.nextAction;
    else if (100 - bestFrom0 <= 10) s.todayFocus = "Close! Full from-0 runs, stay calm";
    else s.todayFocus = "Balanced: mix from-0 with segment grinding";

    if (completions > 0 && consistencyTier === "F") s.warnings.push("Completions but low consistency — stabilize");
    if (gaps.length > 2) s.warnings.push(`Patchy coverage (${gaps.length} gaps)`);
    if (bestFrom0 > 90 && nervesTier === "F") s.warnings.push("Choke pattern: you reach the end but crack");
    if (percentiles.consistencyIndex < 30 && percentiles.attempts > 50) s.warnings.push("High variance — your runs are inconsistent");

    return s;
}

// ============================================================================
// RADAR CHART DATA (FIXED: uses skillScoreResult)
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
        raw: { skill, consistency, nerves, coverage, endurance, readiness }
    };
}

// ============================================================================
// MAIN ANALYSIS
// ============================================================================

function analyzeInput(inputText, difficultyMultiplier = 1.0, options = {}) {
    const { limit = 10, debug = false, sessionId = null } = options;

    const warnings = validateInput(inputText);
    if (warnings.length > 0 && debug) console.warn("Validation:", warnings);

    // Normalize line endings and split
    const lines = inputText.replace(/\r\n/g, '\n').split('\n');
    const entries = []; let explicitBeats = 0;
    lines.forEach(line => {
        const c = line.trim();
        if (!c || c.toLowerCase() === 'end') return;
        const { entries: le, beats: lb } = parseMetricsLine(c);
        entries.push(...le); explicitBeats += lb;
    });

    const attemptStats = computeAttemptTotals(entries);
    const buildResult = buildRuns(entries);

    // Raw count for frontend verification (should match totalAttempts)
    const rawAttemptCount = countRawAttemptsFromText(inputText);

    // Memory-efficient percentiles
    const percentiles = calculateFrom0Percentiles(buildResult.from0Freq, buildResult.completions);
    const skillScoreResult = calculateSkillScore(percentiles);

    const coverageResult = calculateCoverage(buildResult.actualRuns);
    const engineMode = detectMode(buildResult.completions, attemptStats.totalAttempts, buildResult.bestFrom0, buildResult.actualRuns, attemptStats.totalFrom0Attempts, percentiles);
    const consistencyResult = renderSegmentConsistency(buildResult.actualRuns, buildResult.from0Freq, buildResult.completions);
    const readinessResult = calculateReadiness(buildResult, attemptStats, explicitBeats, skillScoreResult);
    const forecastResult = calculateForecast(buildResult, readinessResult, attemptStats, percentiles, difficultyMultiplier);
    const coachSuggestions = generateCoachSuggestions(buildResult, consistencyResult, readinessResult, coverageResult, percentiles);
    const deathDistribution = calculateDeathDistribution(buildResult.from0Freq);
    const pathResult = analyzePaths(buildResult.actualRuns, buildResult.bestFrom0);

    // Route reliability
    let routeReliability = "Low";
    if (pathResult.filteredPaths.length > 0) {
        const avg = pathResult.allPaths.reduce((s, p) => s + p.length, 0) / pathResult.allPaths.length;
        if (avg <= 2) routeReliability = "High"; else if (avg <= 4) routeReliability = "Medium";
    }

    // Separate practice runs from completions
    const practiceRuns = buildResult.actualRuns.filter(r => r.type !== "completion");
    const runsToShow = practiceRuns.length > 0 ? practiceRuns : buildResult.actualRuns;

    // All page data with configurable limit
    const bestRuns = getBestRuns(runsToShow, limit);
    const longestRuns = getLongestRuns(runsToShow, limit);
    const stableRuns = getStableRuns(runsToShow, limit);

    // Radar chart data (FIXED: passes skillScoreResult)
    const radarData = buildRadarData(skillScoreResult, readinessResult, coverageResult, buildResult);

    // Dashboard summary for animated numbers
    const summary = {
        totalAttempts: attemptStats.totalAttempts,
        rawAttemptCount, // For frontend to verify parsing worked
        bestFrom0: buildResult.bestFrom0,
        practiceCoverage: coverageResult.practice,
        from0Coverage: buildResult.bestFrom0,
        readiness: readinessResult.readiness,
        completions: buildResult.completions,
        mode: engineMode,
        routeReliability,
        worstSegment: consistencyResult.worst ? `${consistencyResult.worst.start}-${consistencyResult.worst.end}%` : "None",
        estimatedAttempts: forecastResult.estimatedAttempts,
        deathHotspot: deathDistribution.length > 0 ? deathDistribution[0].segment : "None"
    };

    // Dashboard cards (clickable)
    const dashboardCards = {
        bestRun: bestRuns[0] || null,
        longestRun: longestRuns[0] || null,
        stableRun: stableRuns[0] || null,
        deathHotspot: deathDistribution[0] || null,
        bestRoute: pathResult.filteredPaths[0] || null
    };

    const hasData = attemptStats.totalAttempts > 0 || buildResult.bestFrom0 > 0;

    return {
        // === Dashboard ===
        hasData,
        summary,
        dashboardCards,
        radarData,

        // === Session Stats ===
        totalAttempts: attemptStats.totalAttempts,
        rawAttemptCount,
        from0Attempts: attemptStats.totalFrom0Attempts,
        from0Deaths: attemptStats.from0Deaths,
        startposAttempts: attemptStats.startposAttempts,
        completions: buildResult.completions,
        bestFrom0: buildResult.bestFrom0,

        // === Percentiles ===
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

        // === Coverage ===
        practiceCoverage: coverageResult.practice.toFixed(1),
        from0Coverage: buildResult.bestFrom0,
        coverageGaps: coverageResult.gaps,
        coverageMerged: coverageResult.merged,

        // === Mode & Readiness ===
        mode: engineMode,
        readiness: readinessResult.readiness.toFixed(1),
        skillTier: readinessResult.skillTier,
        consistencyTier: readinessResult.consistencyTier,
        nervesTier: readinessResult.nervesTier,
        readinessBreakdown: readinessResult.breakdown,

        // === Consistency ===
        segmentData: consistencyResult.segmentData,
        worstSegment: consistencyResult.worst,

        // === Routes ===
        routes: pathResult.filteredPaths,
        routePaths: pathResult.pathsByLength,
        routeSegments: pathResult.filteredPaths.length > 0 ? pathResult.filteredPaths[0].segments : 0,
        routeReliability,

        // === Best Runs ===
        bestRuns,
        bestRunsAll: getBestRuns(runsToShow, 100),

        // === Longest Runs ===
        longestRuns,
        longestRunsAll: getLongestRuns(runsToShow, 100),

        // === Stable Runs ===
        stableRuns,
        stableRunsAll: getStableRuns(runsToShow, 100),

        // === Deaths ===
        deathDistribution,
        from0Freq: buildResult.from0Freq,

        // === Forecast ===
        estimatedAttempts: forecastResult.estimatedAttempts,
        confidenceInterval: forecastResult.confidenceInterval,
        volatility: forecastResult.volatility,
        forecastNote: forecastResult.note,

        // === Coach ===
        coachSuggestions,

        // === Validation ===
        validationWarnings: warnings,

        // === Metadata ===
        sessionId,
        analyzedAt: new Date().toISOString()
    };
}

// Export
if (typeof module !== 'undefined' && module.exports) {
    module.exports = {
        analyzeInput,
        parseMetricsLine,
        buildRuns,
        analyzePaths,
        calculateReadiness,
        generateCoachSuggestions,
        validateInput,
        calculateCoverage,
        calculateDeathDistribution,
        calculateFrom0Percentiles,
        calculateSkillScore,
        calculateStability,
        buildRadarData,
        countRawAttemptsFromText,
        getBestRuns,
        getLongestRuns,
        getStableRuns,
        DIFFICULTY_MATRIX
    };
}