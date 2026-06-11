# Geometry Dash Cognitive Analyzer - Website

A modern, dark-themed web application for analyzing Geometry Dash progress data. This website ports the Python CLI analyzer to a fully functional web interface with glassmorphism design and real-time visualizations.

## Recent Updates (June 11, 2026)

### Core Algorithmic & Analysis Upgrades (Cognitive Engine v6.1 / v7.0)
1. **✅ Safe Regex Pattern Boundary Constraints**: Upgraded `RANGE_PATTERN` and `SINGLE_PATTERN` with lookarounds (`(?:^|\s)` and `(?=[\s,]|$)`) to enforce strict word/whitespace boundaries, eliminating corrupted segment parses when integers are adjacent.

2. **✅ Hard Crash & Infinite Loop Protection**: Implemented strict safety limits on the routing pathfinder (`MAX_BFS_ITERATIONS = 100000` and `BFS_TIMEOUT_MS = 2000`) to guarantee the browser window never freezes or hangs on massive, deeply complex data loops.

3. **✅ Custom Demon Evaluation Thresholds**: Introduced `DEMON_THRESHOLDS_V7` to provide specialized performance metrics uniquely scaled across different Demon tiers (Easy to Extreme), introducing analytical grading for Mechanical Skill, Consistency, Endurance, Nerves, and Proof.

4. **✅ Quadratic Death Severity Scaling**: Implemented non-linear, exponential risk curves (`Math.pow(percent / 100, 2)`) for death weights, mimicking the heightened psychological pressure and raw difficulty scale of deep late-game runs.

5. **✅ Analytical Choke Pattern Tracking**: Integrated multi-layered configuration variables (`EARLY_WALL_WEIGHT`, `LATE_WALL_WEIGHT`, `ISOLATED_OPENING_WEIGHT`) to accurately flag structural level blockades and bottlenecks.

6. **✅ Defensive Numeric Formatting**: Added robust string/float sanitization fallback layers (`safeToFixed()`) to keep the UI dashboard clean and prevent breakdown crashes if the engine pushes incomplete metrics.

### Performance, Mobile & Layout Optimizations
1. **✅ Unified Pointer Event Engine**: Replaced old touch utilities with unified Pointer Event listeners (`pointerdown`, `pointerup`, `pointercancel`) to completely strip away mobile touch-tap delays while adding immediate, scaling element transformations.

2. **✅ Propagation Isolation on Inputs**: Isolated pointer event bubbling on input textareas, meaning user interactions like swipe-scrolling inside text boundaries no longer misfire or disrupt active touch-scrolling workflows.

3. **✅ Manual Scroll State Enforcement**: Programmed explicit browser history tracking rules (`history.scrollRestoration = 'manual'`) coupled with hash initialization sweeps on page reloads to reliably snap users back to the header view.

4. **✅ Smart Hardware Capability Detection**: Added automated client capabilities checking (`navigator.hardwareConcurrency` and `navigator.deviceMemory`) to automatically spot lower-end mobile devices or weak environments.

5. **✅ Automated Low Detail Mode (LDM) & Mobile Engine**: Designed deep `.ldm-enabled` and `.mobile-mode` CSS wrappers that drop computationally expensive decorations (the new Constellations particle engine, dust motes, background spark waves) on weaker devices or phones while keeping analytics canvas graphs completely active.

### Earlier Bug Fixes
- **Regex Construction Bug Fixed**: Fixed issue in analyzer.js where `new RegExp(BEAT_PATTERN, 'gi')` was incorrectly creating a RegExp from another RegExp object. Changed to use `BEAT_PATTERN.lastIndex = 0` for proper regex state management.

- **Coverage Calculation Overlap Fixed**: Fixed coverage calculation that was inflating percentages by summing overlapping run lengths. Now calculates unique coverage by tracking individual percentage points covered across all runs, preventing values from exceeding 100% incorrectly.

### Status
- ✅ Website structure matches design document specifications
- ✅ Core analysis engine upgraded from v5.3 to **v6.1 / Engine v7.0**
- ✅ Glassmorphism UI with adaptive hardware profiles and mobile performance buffers
- ✅ Zero-delay touch responses deployed
- ✅ Website fully tested and functional in desktop and mobile browsers

## Features

- **Real-time Analysis**: Paste your GD data and get instant insights
- **Glassmorphism Design**: Modern, futuristic UI with neon accents
- **Comprehensive Dashboard**: 
  - Session snapshot with attempt statistics
  - Readiness panel with skill tiers and custom Demon metrics
  - Practice heatmap visualization
  - Route path analysis with crash timeout protection
  - Coach suggestions based on level choke weights
  - Attempt forecasting with quadratic decay tracking
- **Multiple Input Formats**: Supports ranges, singles, beats, and section labels
- **Difficulty Calibration**: Adjust analysis based on level difficulty (Auto up to Extreme Demon thresholds)
- **Responsive & Optimized Design**: Features standard, Low Detail (LDM), and Mobile rendering profiles

## File Structure

website/
├── index.html          # Main HTML structure with Constellations overlay
├── styles.css          # All styling, animations, and hardware mode flags
├── analyzer.js         # Core analysis logic (Cognitive Engine v6.1 / v7.0)
├── main.js            # UI interactions, hardware profiling, and Pointer Events
└── README.md           # This file


## How to Use

### Quick Start

1. Open `index.html` in a modern web browser (Chrome, Firefox, Edge, Safari)
2. Scroll down to the "Paste Your Run Data" section
3. Select the level difficulty from the dropdown or quick-select chips
4. Paste your Geometry Dash progress data into the textarea
5. Click "Analyze Runs" or type "END" on a new line
6. View your analysis results in the dashboard below

### Supported Input Formats

The analyzer supports multiple input formats:

- **Single percentages**: `64% x2`, `45% x1`
- **Range percentages**: `39-81% x1`, `20-40% x5`
- **Section labels**: 
  - `From 0: 45% x3, 67% x1`
  - `Runs: 20-40% x5, 50-75% x2`
  - `startpos: 30-60% x3`
- **Verified beats**: `beat x1`, `completed x2`, `won x1`

### Example Input

From 0: 45% x3, 67% x1, 23% x2
Runs: 20-40% x5, 50-75% x2
From 0: 78% x1
Runs: 30-60% x3, 70-90% x1
From 0: 55% x2, 82% x1
Runs: 40-65% x4, 80-95% x2


### Understanding the Results

#### Session Snapshot
- **Total Attempts**: Sum of all attempts entered
- **Best From 0**: Highest percentage reached from the beginning
- **Coverage**: Percentage of the level covered by practice runs
- **Mode**: Analysis mode (Normal Only, Advanced Startpos, etc.)

#### Readiness Panel
- **Overall Readiness**: Composite score (0-100%) of completion likelihood
- **Skill Tier**: Grade based on best from-0 progress
- **Consistency Tier**: Grade based on segment pass rates
- **Nerves Tier**: Grade based on late-game death patterns and exponential severity scaling

#### Practice Heatmap
Visual breakdown of the level into 10% segments, color-coded by risk:
- **Red (High Risk)**: < 30% pass rate
- **Purple (Medium Risk)**: 30-60% pass rate
- **Blue (Low Risk)**: 60-80% pass rate
- **Green (Safe)**: > 80% pass rate

#### Route Path
Shows your most stable practice segments with attempt counts and reliability metrics (safeguarded against infinite loops).

#### Coach Suggestions
Personalized recommendations based on your data:
- What to focus on next (e.g., clearing identified early or late choke walls)
- Biggest performance gaps
- Optimal practice routes
- Areas of strength

#### Forecast Panel
Estimated attempts remaining to complete the level, with confidence intervals.

## Technical Details

### Ported from Python

The core analysis logic has been faithfully ported from the original Python scripts and modernized:
- `gd att counter v2.6 (uploaded).py` - Base implementation
- `gd att counter.py` - Advanced features up to current v7.0 models

### JavaScript Implementation

Key functions ported:
- **Input Parsing**: Regex-based parsing with lookarounds to maximize formatting safety
- **Run Building**: Merging duplicate entries and tracking continuous unique coverage
- **Path Analysis**: BFS algorithm for route optimization with active execution time bounds
- **Consistency Calculations**: Log-weighted pass rate analysis
- **Readiness Scoring**: Tiered analysis scaled specifically to different Demon tiers
- **Forecasting**: Quadratic decay-adjusted attempt estimation

### Browser Compatibility

- Modern browsers with ES6+ support
- No external dependencies
- Works offline once loaded

## Design Specifications

Based on the provided design document:
- **Color Palette**: Midnight black background with neon blue, cyan, pink, and purple accents
- **Typography**: Modern sans-serif with clean tech aesthetic
- **Style**: Glassmorphism with blur effects, transparency, and subtle animations
- **Layout**: Responsive grid system with floating cards, adaptive mobile limits, and layered depth

## Troubleshooting

### Analysis Not Working
- Ensure you're using a modern browser
- Check that all JavaScript files are in the same directory
- Verify your input format matches the supported patterns

### No Results Displayed
- Make sure you entered valid data
- Check that difficulty is selected
- Try clicking "Analyze Runs" again

### Styling Issues
- Clear browser cache
- Ensure all files are in the correct directory structure
- Check for file path issues

## Future Enhancements

Potential improvements for future versions:
- Local storage for saving analysis history
- Export results to PDF/JSON
- Interactive heatmap with drill-down capability
- Mobile app version
- Cloud backend for data persistence
- Social sharing features

## Credits

- Original Python analyzer: Geometry Dash Cognitive Analyzer v2.6 / v7.7-PRO
- Web design: Based on provided glassmorphism dashboard specification
- JavaScript port: Converted from Python with algorithmic fidelity

## License

This is a personal project for Geometry Dash players. Use and modify as needed for your analysis needs.
