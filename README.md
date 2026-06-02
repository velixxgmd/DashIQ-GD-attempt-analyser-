# Geometry Dash Cognitive Analyzer - Website

A modern, dark-themed web application for analyzing Geometry Dash progress data. This website ports the Python CLI analyzer to a fully functional web interface with glassmorphism design and real-time visualizations.

## Recent Updates (June 2, 2026)

### Critical Bug Fixes Applied
1. **✅ Critical Syntax Error Fixed**: Fixed JavaScript syntax error where const declarations were inside a return object (lines 909-914). Moved all variable declarations outside the return statement to prevent script crashes.

2. **✅ Coverage Calculation Mathematically Fixed**: Replaced discrete point counting with continuous measurement using run merging. Previous approach counted integer points (e.g., 22-75% counted 54 points instead of the mathematically correct 53%). New implementation merges overlapping runs and calculates exact continuous coverage as sum of (end - start) lengths, clamped to 100%.

3. **✅ Unused Variable Removed**: Removed unused `completionRuns` variable that was causing linting warnings.

4. **✅ Nerves Score Inverted Logic Fixed**: Fixed calculation that was backwards - now properly rewards fewer late deaths instead of punishing them. The tier calculation now correctly interprets nervesScore (0 = best, READINESS_NERVES_WEIGHT = worst).

5. **✅ Readiness Proof Score Granularity**: Changed proof score from binary (full weight for any beats vs 0 for none) to granular scaling based on beat count: `(explicitBeats / 5) * READINESS_PROOF_WEIGHT`, capped at READINESS_PROOF_WEIGHT.

6. **✅ Virtual From-0 Run Count Fixed**: Changed virtual from-0 run count from 1 to 0 to prevent artificial inflation of path analysis with fake attempts.

7. **✅ Input Validation Added**: Added call to `validateInput()` function in `analyzeInput()` to catch invalid ranges and percentages before analysis.

8. **✅ Debug Console Logs Gated**: Added `DEBUG_MODE` flag and gated all `console.log` statements behind it for production readiness. Set to `false` by default.

9. **✅ Regex Global Flag State Consistency**: Fixed another regex construction bug in `parseLine()` function by using `BEAT_PATTERN.lastIndex = 0` instead of `new RegExp(BEAT_PATTERN)`.

10. **✅ Forecast Volatility Division by Zero**: Improved handling when `baseEstimate` is 0 - now returns "Unknown" instead of "Low" volatility, since 0 attempts with 0 variance is undefined, not low volatility.

### Earlier Bug Fixes
- **Regex Construction Bug Fixed**: Fixed issue in analyzer.js where `new RegExp(BEAT_PATTERN, 'gi')` was incorrectly creating a RegExp from another RegExp object. Changed to use `BEAT_PATTERN.lastIndex = 0` for proper regex state management.

- **Coverage Calculation Overlap Fixed**: Fixed coverage calculation that was inflating percentages by summing overlapping run lengths. Now calculates unique coverage by tracking individual percentage points covered across all runs, preventing values from exceeding 100% incorrectly.

### Status
- ✅ Website structure matches design document specifications
- ✅ Core analysis logic ported from Python v2.6 and v7.7-PRO
- ✅ Glassmorphism UI with dark theme and neon accents implemented
- ✅ All critical bugs fixed
- ✅ Website tested and functional in browser

## Features

- **Real-time Analysis**: Paste your GD data and get instant insights
- **Glassmorphism Design**: Modern, futuristic UI with neon accents
- **Comprehensive Dashboard**: 
  - Session snapshot with attempt statistics
  - Readiness panel with skill tiers
  - Practice heatmap visualization
  - Route path analysis
  - Coach suggestions
  - Attempt forecasting
- **Multiple Input Formats**: Supports ranges, singles, beats, and section labels
- **Difficulty Calibration**: Adjust analysis based on level difficulty
- **Responsive Design**: Works on desktop and mobile devices

## File Structure

```
website/
├── index.html          # Main HTML structure
├── styles.css          # All styling and animations
├── analyzer.js         # Core analysis logic (ported from Python)
├── main.js            # UI interactions and DOM manipulation
└── README.md          # This file
```

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

```
From 0: 45% x3, 67% x1, 23% x2
Runs: 20-40% x5, 50-75% x2
From 0: 78% x1
Runs: 30-60% x3, 70-90% x1
From 0: 55% x2, 82% x1
Runs: 40-65% x4, 80-95% x2
```

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
- **Nerves Tier**: Grade based on late-game death patterns

#### Practice Heatmap
Visual breakdown of the level into 10% segments, color-coded by risk:
- **Red (High Risk)**: < 30% pass rate
- **Purple (Medium Risk)**: 30-60% pass rate
- **Blue (Low Risk)**: 60-80% pass rate
- **Green (Safe)**: > 80% pass rate

#### Route Path
Shows your most stable practice segments with attempt counts and reliability metrics.

#### Coach Suggestions
Personalized recommendations based on your data:
- What to focus on next
- Biggest performance gaps
- Optimal practice routes
- Areas of strength

#### Forecast Panel
Estimated attempts remaining to complete the level, with confidence intervals.

## Technical Details

### Ported from Python

The core analysis logic has been faithfully ported from the original Python scripts:
- `gd att counter v2.6 (uploaded).py` - Base implementation
- `gd att counter.py` - Advanced features from v7.7-PRO

### JavaScript Implementation

Key functions ported:
- **Input Parsing**: Regex-based parsing with multiple format support
- **Run Building**: Merging duplicate entries and categorizing runs
- **Path Analysis**: BFS algorithm for route optimization
- **Consistency Calculations**: Log-weighted pass rate analysis
- **Readiness Scoring**: Multi-factor readiness assessment
- **Forecasting**: Difficulty-adjusted attempt estimation

### Browser Compatibility

- Modern browsers with ES6+ support
- No external dependencies
- Works offline once loaded

## Design Specifications

Based on the provided design document:
- **Color Palette**: Midnight black background with neon blue, cyan, pink, and purple accents
- **Typography**: Modern sans-serif with clean tech aesthetic
- **Style**: Glassmorphism with blur effects, transparency, and subtle animations
- **Layout**: Responsive grid system with floating cards and layered depth

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