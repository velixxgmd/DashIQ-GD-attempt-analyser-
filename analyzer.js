// =============================================
// DASHIQ ANALYZER - GEOMETRY DASH METRICS ENGINE
// v3.1 - Fixed path overlap, heatmap coloring, decimal rounding
// =============================================

// ─── CORE PARSING ───

function parseMetricsLine(line) {
    const line_clean = line.trim().toLowerCase();
    if (!line_clean) return [];
    
    // Remove section labels
    let clean = line_clean;
    for (const label of ['from 0:', 'from0:', 'runs:', 'run:', 'startpos:', 'startpos runs:']) {
        if (clean.startsWith(label)) {
            clean = clean.substring(label.length);
        }
    }
    
    // Sanitize separators
    clean = clean.replace(/[>\-<\s\.]+/g, ' ').trim();
    if (!clean) return [];
    
    // Parse patterns
    const matches = [];
    const regex = /(\d+)\s*%?\s*(?:to|[-–—])?\s*(\d+)?\s*%?\s*x\s*(\d+)/g;
    let match;
    
    while ((match = regex.exec(clean)) !== null) {
        const [, startStr, endStr, countStr] = match;
        const start = parseInt(startStr);
        const end = endStr ? parseInt(endStr) : null;
        const count = parseInt(countStr);
        
        if (isNaN(count) || count <= 0) continue;
        if (start > 100) continue;
        
        if (end !== null) {
            if (end <= start || end > 100) continue;
            matches.push({ type: 'run', start, end, length: end - start, count });
        } else {
            if (start > 100) continue;
            matches.push({ type: 'from0', percent: start, count });
        }
    }
    
    return matches;
}

function validateInput(text) {
    return text && text.trim().length > 0;
}

function countRawAttemptsFromText(text) {
    const lines = text.split('\n');
    let total = 0;
    for (const line of lines) {
        const metrics = parseMetricsLine(line);
        for (const m of metrics) total += m.count;
    }
    return total;
}

// ─── BUILD RUNS ───

function buildRuns(entries) {
    const merged = {};
    
    for (const e of entries) {
        let key;
        if (e.type === 'from0') {
            key = `from0_${e.percent}`;
        } else {
            key = `run_${e.start}_${e.end}`;
        }
        
        if (!merged[key]) {
            merged[key] = { ...e };
        } else {
            merged[key].count += e.count;
        }
    }
    
    const entries_dedup = Object.values(merged);
    let bestFrom0 = 0;
    const actualRuns = [];
    const from0Freq = {};
    let totalStartposAttempts = 0;
    
    for (const e of entries_dedup) {
        if (e.type === 'from0') {
            if (e.percent === 100) {
                bestFrom0 = 100;
            } else if (e.percent > 0) {
                bestFrom0 = Math.max(bestFrom0, e.percent);
                from0Freq[e.percent] = (from0Freq[e.percent] || 0) + e.count;
            }
        } else if (e.start > 0 || e.end < 100) {
            actualRuns.push(e);
            totalStartposAttempts += e.count;
        } else if (e.start === 0 && e.end === 100) {
            bestFrom0 = 100;
        }
    }
    
    return {
        bestFrom0,
        actualRuns,
        from0Freq,
        totalStartposAttempts
    };
}

// ─── PATH ANALYSIS - STRICT OVERLAP ───

function analyzePaths(actualRuns, bestFrom0) {
    const pool = [...actualRuns];
    
    if (bestFrom0 > 0) {
        const hasRoute = pool.some(r => r.start === 0 && r.end === bestFrom0);
        if (!hasRoute) {
            pool.push({ start: 0, end: bestFrom0, length: bestFrom0, count: 1, isVirtual: true });
        }
    }
    
    if (pool.length === 0) {
        return { paths: [], pathsByLength: {}, totalPaths: 0 };
    }
    
    const queue = [[0, []]];
    const uniquePaths = [];
    const MAX_PATHWAYS = 5000;
    
    while (queue.length > 0 && uniquePaths.length < MAX_PATHWAYS) {
        const [currentPct, currentPath] = queue.shift();
        
        if (currentPct >= 100) {
            uniquePaths.push(currentPath);
            continue;
        }
        
        // Strict overlap: r.start <= currentPct && r.end > currentPct
        const validOptions = pool.filter(r => r.start <= currentPct && r.end > currentPct);
        validOptions.sort((a, b) => b.end - a.end);
        
        const currentSigs = new Set(currentPath.map(r => `${r.start}-${r.end}`));
        
        for (let i = 0; i < Math.min(validOptions.length, 12); i++) {
            const run = validOptions[i];
            const sig = `${run.start}-${run.end}`;
            
            if (!currentSigs.has(sig)) {
                queue.push([run.end, [...currentPath, run]]);
            }
        }
    }
    
    uniquePaths.sort((a, b) => a.length - b.length);
    
    const seenSigs = new Set();
    const filteredPaths = [];
    
    for (const path of uniquePaths) {
        const sig = path.map(r => `${r.start}-${r.end}`).join('|');
        if (!seenSigs.has(sig)) {
            seenSigs.add(sig);
            filteredPaths.push(path);
        }
    }
    
    const pathsByLength = {};
    for (const path of filteredPaths) {
        const len = path.length;
        if (!pathsByLength[len]) pathsByLength[len] = [];
        pathsByLength[len].push(path);
    }
    
    return { paths: filteredPaths, pathsByLength, totalPaths: filteredPaths.length };
}

// ─── METRICS ───

function calculateFrom0Percentiles(from0Freq) {
    const allDeaths = Object.values(from0Freq).reduce((a, b) => a + b, 0);
    if (allDeaths === 0) return { p50: 0, max: 0, mean: 0 };
    
    const deaths = [];
    for (const [pct, count] of Object.entries(from0Freq)) {
        for (let i = 0; i < count; i++) {
            deaths.push(parseInt(pct));
        }
    }
    deaths.sort((a, b) => a - b);
    
    const sum = deaths.reduce((a, b) => a + b, 0);
    return {
        p50: deaths[Math.floor(deaths.length / 2)],
        max: Math.max(...deaths),
        mean: sum / deaths.length
    };
}

function calculateSkillScore(percentiles) {
    if (!percentiles || percentiles.max === 0) return 50;
    return Math.round((percentiles.mean + percentiles.p50) / 2);
}

function calculateCoverage(actualRuns) {
    if (actualRuns.length === 0) return 0;
    const covered = new Set();
    for (let i = 0; i < 100; i++) {
        for (const run of actualRuns) {
            if (run.start <= i && i < run.end) {
                covered.add(i);
                break;
            }
        }
    }
    return Math.round((covered.size / 100) * 100);
}

// ─── DEATH DISTRIBUTION ───

function calculateDeathDistribution(from0Freq) {
    const result = [];
    let maxDeaths = 0;
    
    for (let b = 0; b < 10; b++) {
        const start = b * 10, end = (b + 1) * 10;
        let deaths = 0;
        
        for (const [pct, count] of Object.entries(from0Freq)) {
            const p = parseInt(pct);
            if (p >= start && p < end) deaths += count;
        }
        
        maxDeaths = Math.max(maxDeaths, deaths);
        result.push({
            block: b,
            range: `${String(start).padStart(2, '0')}%-${String(end).padStart(2, '0')}%`,
            deaths,
            maxDeaths: 0  // Will be set below
        });
    }
    
    // Normalize
    for (const segment of result) {
        segment.maxDeaths = maxDeaths;
    }
    
    return result;
}

function getColorTier(deaths, maxDeaths) {
    if (deaths === 0) return 'safe';
    const ratio = deaths / maxDeaths;
    if (ratio >= 0.7) return 'high';
    if (ratio >= 0.35) return 'medium';
    return 'low';
}

// ─── ATTEMPT ESTIMATION ───

function calculateRealisticAttempts(buildResult, bestFrom0, from0Freq, totalStartposAttempts, difficultyMultiplier = 1.0) {
    const from0Total = Object.values(from0Freq).reduce((a, b) => a + b, 0);
    const remaining = 100 - bestFrom0;
    
    if (remaining <= 0) return 0;
    
    // Early game choke
    let earlyDeaths = 0;
    for (const [pct, count] of Object.entries(from0Freq)) {
        if (parseInt(pct) <= 20) earlyDeaths += count;
    }
    
    const earlyChokeRatio = from0Total > 0 ? earlyDeaths / from0Total : 0;
    const progressModifier = Math.max(0.05, 1.0 - (bestFrom0 / 100));
    
    // Wall concentration
    const sortedDeaths = Object.values(from0Freq).sort((a, b) => b - a);
    const wallConcentration = from0Total > 0 ? (sortedDeaths[0] || 0) / from0Total : 0;
    
    let chokeMultiplier = 1.0;
    if (wallConcentration > 0.4) chokeMultiplier = 1.6;
    else if (wallConcentration > 0.25) chokeMultiplier = 1.3;
    else if (wallConcentration > 0.15) chokeMultiplier = 1.1;
    
    // Base estimate
    const baseData = Math.max(from0Total, totalStartposAttempts || 1);
    const baseEstimate = baseData * remaining * 0.1 * difficultyMultiplier;
    
    const finalEstimate = baseEstimate * chokeMultiplier;
    return Math.max(100, Math.round(finalEstimate));
}

// ─── OVERALL GRADE ───

function calculateOverallGrade(skillScore, coverage, bestFrom0) {
    const score = Math.round((skillScore + coverage + bestFrom0) / 3);
    let tier = 'F';
    if (score >= 85) tier = 'S';
    else if (score >= 75) tier = 'A';
    else if (score >= 65) tier = 'B';
    else if (score >= 50) tier = 'C';
    else if (score >= 35) tier = 'D';
    
    return { score, tier };
}

// ─── MAIN ENTRY POINT ───

function analyzeInput(inputText, difficultyMultiplier = 1.0, options = {}) {
    if (!validateInput(inputText)) {
        return { error: 'No valid input' };
    }
    
    const entries = [];
    for (const line of inputText.split('\n')) {
        entries.push(...parseMetricsLine(line));
    }
    
    if (entries.length === 0) {
        return { error: 'No valid runs found' };
    }
    
    const buildResult = buildRuns(entries);
    const { bestFrom0, actualRuns, from0Freq, totalStartposAttempts } = buildResult;
    
    const pathAnalysis = analyzePaths(actualRuns, bestFrom0);
    const totalAttempts = entries.reduce((sum, e) => sum + e.count, 0);
    
    const percentiles = calculateFrom0Percentiles(from0Freq);
    const skillScore = calculateSkillScore(percentiles);
    const coverage = calculateCoverage(actualRuns);
    const deathDist = calculateDeathDistribution(from0Freq);
    
    const estimatedAttempts = calculateRealisticAttempts(
        buildResult, bestFrom0, from0Freq, totalStartposAttempts, difficultyMultiplier
    );
    
    const overallGrade = calculateOverallGrade(skillScore, coverage, bestFrom0);
    
    return {
        bestFrom0,
        totalAttempts,
        actualRuns,
        from0Freq,
        paths: pathAnalysis.paths,
        pathsByLength: pathAnalysis.pathsByLength,
        skillScore: Math.round(skillScore),
        coverage,
        readiness: Math.round((skillScore + bestFrom0) / 2),
        deathDistribution: deathDist,
        estimatedAttempts,
        overallGrade,
        totalStartposAttempts
    };
}

// ─── UTILITY ───

function round1(n) {
    const num = Number(n);
    return isFinite(num) ? Math.round(num * 10) / 10 : 0;
}

function formatMetric(value) {
    if (typeof value !== 'number' || !isFinite(value)) return '--';
    return round1(value).toFixed(1);
}

function safeNum(val, fallback = 0) {
    const n = Number(val);
    return isFinite(n) ? n : fallback;
}
