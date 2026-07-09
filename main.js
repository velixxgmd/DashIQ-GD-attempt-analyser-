/**
 * DASHIQ — MAIN JAVASCRIPT v8.3-PRO
 * UI Interactions, DOM Manipulation, Aesthetic Effects
 * Fully synchronized with analyzer.js v8.3-PRO / Engine v8.3-PRO
 * ============================================================
 */

let analysisResults = null;
const DEBUG_MODE = false;

// Round to 1 decimal place for display
function round1(n) {
    const num = Number(n);
    if (!isFinite(num)) return '0.0';
    const rounded = Math.round(num * 10) / 10;
    return safeToFixed(rounded, 1);
}

// Safe number formatting - handles strings from analyzer.js .toFixed() results
function safeToFixed(value, digits) {
    const num = Number(value);
    return isFinite(num) ? num.toFixed(digits) : '0.0';
}


// ============================================================================
// INITIALIZATION
// ============================================================================

if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
}

function initializeLandingPosition() {
    if (window.location.hash && window.location.hash !== '#overview') {
        history.replaceState(null, '', window.location.pathname + window.location.search);
    }

    window.scrollTo({ top: 0, left: 0, behavior: 'auto' });

    window.addEventListener('load', function () {
        window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
    }, { once: true });
}

// Low Detail Mode Detection
function detectAndEnableLDM() {
    const isVeryWeakGPU = navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 2;
    const isVeryLowMemory = navigator.deviceMemory && navigator.deviceMemory <= 2;
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isOldMobile = /Android [1-4]|iPhone OS [1-9]_/.test(navigator.userAgent);
    const isMobile = isMobileDevice();

    if (isVeryWeakGPU || isVeryLowMemory || prefersReduced || isOldMobile) {
        document.body.classList.add('ldm-enabled');
        if (DEBUG_MODE) console.log('Low Detail Mode enabled — very weak device detected');
    }

    // On ANY mobile device: disable all decorative background effects but keep graphs
    if (isMobile) {
        document.body.classList.add('mobile-mode');
        if (DEBUG_MODE) console.log('Mobile mode enabled — decorative effects disabled');
    }
}

// Mobile Button Responsiveness Fix
function isMobileDevice() {
    return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
        (window.innerWidth <= 768) ||
        ('ontouchstart' in window && navigator.maxTouchPoints > 1);
}

// Low Detail Mode Detection
function initializeMobileButtonFix() {
    // Fix ALL interactive elements: buttons, clickable cards, nav items
    const interactiveElements = document.querySelectorAll('button, .clickable-card, .nav-item, .chip');

    interactiveElements.forEach(el => {
        // Remove any existing listeners to prevent duplicates
        el.style.pointerEvents = 'auto';
        el.style.touchAction = 'manipulation';
        el.style.webkitTapHighlightColor = 'transparent';
        el.style.userSelect = 'none';
        el.style.webkitUserSelect = 'none';

        // Use pointer events for unified mouse/touch handling
        el.addEventListener('pointerdown', function(e) {
            this.style.transform = 'scale(0.97)';
            this.style.transition = 'transform 0.1s ease';
        });

        el.addEventListener('pointerup', function(e) {
            this.style.transform = '';
            this.style.transition = 'transform 0.2s ease';
        });

        el.addEventListener('pointercancel', function(e) {
            this.style.transform = '';
        });

        // Prevent 300ms delay on touch devices
        el.addEventListener('touchstart', function(e) {
            // Don't prevent default on textarea
            if (this.tagName !== 'TEXTAREA' && this.tagName !== 'INPUT') {
                // Allow scroll but enable fast tap
            }
        }, { passive: true });
    });

    // Fix textarea input for mobile
    const textarea = document.getElementById('input-textarea');
    if (textarea) {
        textarea.style.pointerEvents = 'auto';
        textarea.style.touchAction = 'auto';
        textarea.addEventListener('touchstart', function (e) {
            e.stopPropagation();
        }, { passive: true });
    }

    // Fix clickable cards specifically
    document.querySelectorAll('.clickable-card').forEach(card => {
        card.addEventListener('click', function(e) {
            // Prevent ghost clicks
            e.preventDefault();
            const cardType = this.getAttribute('data-card');
            if (cardType) {
                openDetailPage(cardType);
            }
        });
    });
}

function handleButtonTap(e, button) {
    // Deprecated: use pointer events instead
    button.focus();
}

document.addEventListener('DOMContentLoaded', function () {
    initializeLandingPosition();

    // Detect mobile/weak GPU and enable Low Detail Mode
    detectAndEnableLDM();

    initializeParticles();
    initializeSparkles();
    initializeDustMotes();
    initializeGeometricShapes();
    initializeConstellations();
    initializeDifficultyChips();
    initializeDurationControls();
    initializeAnalyzeButton();
    initializeNavigation();
    initializeTextarea();
    initializeDemoButtons();
    initializeClickableCards();
    initializeCardAnimations();
    initializeScrollReveal();
    initializeTiltEffect();
    initializeMagneticButtons();
    initializeParallax();
    initializeKeyboardShortcuts();
    initializeClearButton();
    initializeTierBadges();
    initializeMobileButtonFix();
    initializeExportButton();

    setLoading(false);
});

function initializeDurationControls() {
    const lengthSelect = document.getElementById('length-category-select');
    const useCustom = document.getElementById('use-custom-length');
    const durationInput = document.getElementById('duration-input');
    const modeToggle = document.getElementById('duration-mode-toggle');
    const confidenceBadge = document.getElementById('duration-confidence-badge');

    if (!lengthSelect || !useCustom || !durationInput) return;

    let durationMode = typeof DURATION_MODE !== 'undefined' ? DURATION_MODE.NORMAL : 'normal';

    const updateModeUI = () => {
        if (!modeToggle) return;
        const isHour = durationMode === (typeof DURATION_MODE !== 'undefined' ? DURATION_MODE.HOUR : 'hour');
        modeToggle.textContent = isHour ? 'HH:MM:SS' : 'MM:SS';
        durationInput.placeholder = isHour ? 'HH:MM:SS (e.g. 01:15:30)' : 'MM:SS (e.g. 03:20)';
    };

    const sync = () => {
        const customEnabled = useCustom.checked;
        durationInput.disabled = !customEnabled;
        if (modeToggle) modeToggle.disabled = !customEnabled;

        if (!customEnabled) durationInput.value = '';

        if (customEnabled && durationInput.value.trim() && typeof detectDurationMode === 'function') {
            const detected = detectDurationMode(durationInput.value.trim());
            if (detected === DURATION_MODE.HOUR || detected === DURATION_MODE.NORMAL) {
                durationMode = detected;
            }
        }
        updateModeUI();

        if (confidenceBadge) {
            const hasCustom = customEnabled && durationInput.value.trim().length > 0;
            const hasCategory = !hasCustom && lengthSelect.value;
            let confidence = hasCustom ? 'High' : hasCategory ? 'Medium' : 'Low';
            if (hasCustom && typeof parseDurationInput === 'function') {
                const parsed = parseDurationInput(durationInput.value.trim(), durationMode);
                if (!parsed.valid) confidence = 'Invalid';
            }
            confidenceBadge.textContent = `Confidence: ${confidence}`;
            confidenceBadge.className = `duration-confidence-badge ${confidence.toLowerCase()}`;
        }
    };

    useCustom.addEventListener('change', sync);
    durationInput.addEventListener('input', sync);
    lengthSelect.addEventListener('change', sync);

    if (modeToggle) {
        modeToggle.addEventListener('click', () => {
            if (!useCustom.checked) return;
            durationMode = durationMode === DURATION_MODE.HOUR ? DURATION_MODE.NORMAL : DURATION_MODE.HOUR;
            updateModeUI();
            sync();
        });
    }

    durationInput.dataset.durationMode = durationMode;
    Object.defineProperty(durationInput, 'durationMode', {
        get() { return durationMode; },
        configurable: true
    });

    sync();
}

// ============================================================================
// AESTHETIC EFFECTS — ENHANCED PARTICLES
// ============================================================================

function initializeParticles() {
    const container = document.getElementById('particles');
    if (!container) return;

    const isLDM = document.body.classList.contains('ldm-enabled');
    const isMobile = document.body.classList.contains('mobile-mode');
    const count = (isLDM || isMobile) ? 0 : 105;

    for (let i = 0; i < count; i++) {
        const p = document.createElement('div');
        p.className = 'particle';
        p.style.left = Math.random() * 100 + '%';
        p.style.animationDuration = (12 + Math.random() * 28) + 's';
        p.style.animationDelay = (Math.random() * 24) + 's';
        p.style.opacity = (0.25 + Math.random() * 0.55).toString();
        if (Math.random() > 0.55) p.classList.add('drift-mode');
        const size = 1 + Math.random() * 3.5;
        p.style.width = size + 'px';
        p.style.height = size + 'px';
        container.appendChild(p);
    }
}

function initializeSparkles() {
    const container = document.getElementById('sparkle-container');
    if (!container) return;

    const isLDM = document.body.classList.contains('ldm-enabled');
    const isMobile = document.body.classList.contains('mobile-mode');
    const count = (isLDM || isMobile) ? 0 : 26;

    for (let i = 0; i < count; i++) {
        const s = document.createElement('div');
        s.className = 'sparkle';
        s.style.left = Math.random() * 100 + '%';
        s.style.top = Math.random() * 100 + '%';
        s.style.animationDuration = (2.5 + Math.random() * 4.5) + 's';
        s.style.animationDelay = (Math.random() * 6) + 's';
        const size = 2 + Math.random() * 4;
        s.style.width = size + 'px';
        s.style.height = size + 'px';
        container.appendChild(s);
    }
}

function initializeDustMotes() {
    const container = document.getElementById('dust-container');
    if (!container) return;

    const isLDM = document.body.classList.contains('ldm-enabled');
    const isMobile = document.body.classList.contains('mobile-mode');
    const count = (isLDM || isMobile) ? 0 : 34;

    for (let i = 0; i < count; i++) {
        const d = document.createElement('div');
        d.className = 'dust-mote';
        d.style.left = Math.random() * 100 + '%';
        d.style.animationDuration = (22 + Math.random() * 32) + 's';
        d.style.animationDelay = (Math.random() * 24) + 's';
        d.style.opacity = (0.08 + Math.random() * 0.32).toString();
        container.appendChild(d);
    }
}

function initializeGeometricShapes() {
    const container = document.getElementById('geometric-shapes');
    if (!container) return;

    const isLDM = document.body.classList.contains('ldm-enabled');
    const isMobile = document.body.classList.contains('mobile-mode');
    const shapes = ['triangle', 'square', 'circle', 'hex', 'pentagon', 'star', 'diamond', 'octagon'];
    const count = (isLDM || isMobile) ? 0 : 12;

    for (let i = 0; i < count; i++) {
        const shape = document.createElement('div');
        shape.className = `geo-shape ${shapes[Math.floor(Math.random() * shapes.length)]}`;
        shape.style.left = Math.random() * 100 + '%';
        shape.style.top = Math.random() * 100 + '%';
        shape.style.animationDuration = (16 + Math.random() * 22) + 's';
        shape.style.animationDelay = (Math.random() * 12) + 's';
        shape.style.transform = `scale(${0.4 + Math.random() * 0.8})`;
        container.appendChild(shape);
    }
}

function initializeConstellations() {
    const container = document.getElementById('constellations');
    if (!container) return;

    const isLDM = document.body.classList.contains('ldm-enabled');
    const isMobile = document.body.classList.contains('mobile-mode');
    if (isLDM || isMobile) return;

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 1000 1000');
    svg.setAttribute('class', 'constellation-svg');
    svg.style.position = 'absolute';
    svg.style.inset = '0';
    svg.style.width = '100%';
    svg.style.height = '100%';
    svg.style.pointerEvents = 'none';

    // Generate truly random stars across entire viewport - NOT fixed grid
    const stars = [];
    const starCount = 24 + Math.floor(Math.random() * 10);

    for (let i = 0; i < starCount; i++) {
        stars.push({
            x: Math.random() * 1000,
            y: Math.random() * 1000,
            brightness: 0.25 + Math.random() * 0.75,
            size: 1.2 + Math.random() * 3,
            twinkleDuration: 2 + Math.random() * 3.5,
            twinkleDelay: Math.random() * 5,
            color: ['rgba(97, 216, 255, ', 'rgba(255, 79, 216, ', 'rgba(139, 92, 246, ', 'rgba(16, 185, 129, ', 'rgba(45, 107, 255, '][Math.floor(Math.random() * 5)]
        });
    }

    // Draw constellation lines with randomized opacity and thickness for organic look
    stars.forEach((star, idx) => {
        const distances = stars.map((s, i) => ({
            idx: i,
            dist: Math.hypot(s.x - star.x, s.y - star.y)
        })).sort((a, b) => a.dist - b.dist).slice(1, Math.floor(4 + Math.random() * 3)); // Connect to 4-6 nearest neighbors for richer constellations

        distances.forEach((neighbor, nidx) => {
            const otherStar = stars[neighbor.idx];
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', star.x);
            line.setAttribute('y1', star.y);
            line.setAttribute('x2', otherStar.x);
            line.setAttribute('y2', otherStar.y);

            // Variable opacity per line for organic feel + random colors
            const baseOpacity = 0.1 + Math.random() * 0.25;
            const lineColor = star.color + baseOpacity + ')';
            line.setAttribute('stroke', lineColor);
            line.setAttribute('stroke-width', 0.35 + Math.random() * 0.55);
            line.setAttribute('class', 'constellation-line');
            line.style.animationDelay = `${Math.random() * 4}s`;
            svg.appendChild(line);
        });
    });

    // Draw star dots with individual animation
    stars.forEach((star, idx) => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', star.x);
        dot.setAttribute('cy', star.y);
        dot.setAttribute('r', star.size);
        dot.setAttribute('fill', star.color + star.brightness + ')');
        dot.setAttribute('class', 'constellation-dot');
        dot.style.setProperty('--twinkle-duration', `${star.twinkleDuration}s`);
        dot.style.animationDelay = `${star.twinkleDelay}s`;
        svg.appendChild(dot);
    });

    // EASTER EGG: Rare random shapes (2% spawn chance - more frequent than before)
    if (Math.random() < 0.02) {
        const shapes = ['◆', '★', '✦', '❖', '✧', '☆', '✪', '⬢'];
        for (let i = 0; i < Math.floor(2 + Math.random() * 3); i++) {
            const shape = shapes[Math.floor(Math.random() * shapes.length)];
            const x = Math.random() * 1000;
            const y = Math.random() * 1000;
            const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
            text.setAttribute('x', x);
            text.setAttribute('y', y);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('dominant-baseline', 'middle');
            text.setAttribute('font-size', (20 + Math.floor(Math.random() * 15)).toString());
            text.setAttribute('fill', `rgba(${Math.random() > 0.5 ? '255, 79, 216' : '139, 92, 246'}, ${0.4 + Math.random() * 0.6})`);
            text.setAttribute('class', 'constellation-easter-egg');
            text.textContent = shape;
            svg.appendChild(text);
        }
    }

    container.appendChild(svg);
}

function initializeScrollReveal() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });

    document.querySelectorAll('.reveal-on-scroll').forEach(el => observer.observe(el));
}

function initializeTiltEffect() {
    const cards = document.querySelectorAll('[data-tilt]');

    cards.forEach(card => {
        card.addEventListener('mousemove', (e) => {
            const rect = card.getBoundingClientRect();
            const x = e.clientX - rect.left;
            const y = e.clientY - rect.top;
            const centerX = rect.width / 2;
            const centerY = rect.height / 2;
            const rotateX = (y - centerY) / centerY * -8;
            const rotateY = (x - centerX) / centerX * 8;

            card.style.transform = `perspective(1000px) rotateX(${rotateX}deg) rotateY(${rotateY}deg) translateZ(10px) scale(1.02)`;
        });

        card.addEventListener('mouseleave', () => {
            card.style.transform = 'perspective(1000px) rotateX(0) rotateY(0) translateZ(0) scale(1)';
            card.style.transition = 'transform 0.5s ease';
            setTimeout(() => { card.style.transition = ''; }, 500);
        });
    });
}

function initializeMagneticButtons() {
    const buttons = document.querySelectorAll('.magnetic-btn');

    buttons.forEach(btn => {
        btn.addEventListener('mousemove', (e) => {
            const rect = btn.getBoundingClientRect();
            const x = e.clientX - rect.left - rect.width / 2;
            const y = e.clientY - rect.top - rect.height / 2;
            btn.style.transform = `translate(${x * 0.2}px, ${y * 0.2}px)`;
        });

        btn.addEventListener('mouseleave', () => {
            btn.style.transform = 'translate(0, 0)';
            btn.style.transition = 'transform 0.3s ease';
            setTimeout(() => { btn.style.transition = ''; }, 300);
        });
    });
}

function initializeParallax() {
    // Disabled: parallax caused background to move distractingly with cursor
    // Kept for reference but not active
}

function initializeKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const textarea = document.getElementById('input-textarea');
            if (document.activeElement === textarea || textarea.value.trim()) {
                performAnalysis();
            }
        }

        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'x') {
            e.preventDefault();
            exportAnalysisResults();
        }

        if (e.key === 'Escape') {
            const visibleDetail = document.querySelector('.detail-page:not(.hidden)');
            if (visibleDetail) closeDetailPage();
        }
    });
}


function initializeExportButton() {
    const exportBtn = document.getElementById('export-data-btn');
    if (exportBtn) {
        exportBtn.addEventListener('click', exportAnalysisResults);
    }
}
function initializeTierBadges() {
    // Apply tier classes dynamically
    const tierMap = {
        'S': 'tier-s', 'A': 'tier-a', 'B': 'tier-b',
        'C': 'tier-c', 'D': 'tier-d', 'F': 'tier-f'
    };

    const observer = new MutationObserver(() => {
        document.querySelectorAll('.tier-badge').forEach(el => {
            const text = el.textContent.trim();
            const tierClass = tierMap[text];
            if (tierClass) {
                el.className = `tier-value tier-badge ${tierClass}`;
            }
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });
}

// ============================================================================
// TOAST NOTIFICATIONS
// ============================================================================

function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '✓',
        error: '✕',
        info: 'ℹ',
        warning: '⚠'
    };

    toast.innerHTML = `<span style="font-size:16px;">${icons[type] || 'ℹ'}</span> ${message}`;
    container.appendChild(toast);

    requestAnimationFrame(() => toast.classList.add('show'));

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400);
    }, duration);
}

// ============================================================================
// LOADING OVERLAY
// ============================================================================

function setLoading(isLoading) {
    const overlay = document.getElementById('loading-overlay');
    if (!overlay) return;

    if (isLoading) {
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';
    } else {
        overlay.classList.remove('active');
        document.body.style.overflow = '';
    }
}

// ============================================================================
// NAVIGATION
// ============================================================================

function initializeNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('section[id]');

    navItems.forEach(item => {
        item.addEventListener('click', function (e) {
            e.preventDefault();
            const targetId = this.getAttribute('href').slice(1);
            smoothScrollTo(targetId);

            navItems.forEach(nav => nav.classList.remove('active'));
            this.classList.add('active');
        });
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const id = entry.target.id;
                navItems.forEach(nav => {
                    nav.classList.toggle('active', nav.getAttribute('href') === `#${id}`);
                });
            }
        });
    }, { threshold: 0.3 });

    sections.forEach(section => observer.observe(section));
}

function smoothScrollTo(targetId) {
    const element = document.getElementById(targetId);
    if (!element) return;

    const navHeight = 80;
    const elementPosition = element.getBoundingClientRect().top + window.pageYOffset;
    const offsetPosition = elementPosition - navHeight;

    window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
    });
}

function scrollToAnalyzer() {
    smoothScrollTo('analyzer');
}

// ============================================================================
// DIFFICULTY SELECTION
// ============================================================================

function initializeDifficultyChips() {
    const chips = document.querySelectorAll('.chip');
    const select = document.getElementById('difficulty-select');

    chips.forEach(chip => {
        chip.addEventListener('click', function () {
            chips.forEach(c => c.classList.remove('active'));
            this.classList.add('active');
            select.value = this.getAttribute('data-difficulty');
        });
    });

    select.addEventListener('change', function () {
        chips.forEach(c => c.classList.toggle('active', c.getAttribute('data-difficulty') === this.value));
    });
}

// ============================================================================
// TEXTAREA HANDLING
// ============================================================================

function initializeTextarea() {
    const textarea = document.getElementById('input-textarea');

    textarea.addEventListener('input', function (e) {
        const lines = this.value.split('\n');
        const lastLine = lines[lines.length - 1].trim().toLowerCase();

        if (lastLine === 'end') {
            this.value = lines.slice(0, -1).join('\n');
            performAnalysis();
        }

        if (lastLine === 'export') {
            this.value = lines.slice(0, -1).join('\n');
            exportAnalysisResults();
        }
    });

    textarea.addEventListener('keydown', function (e) {
        if (e.key === 'Tab') {
            e.preventDefault();
            const start = this.selectionStart;
            const end = this.selectionEnd;
            this.value = this.value.substring(0, start) + '    ' + this.value.substring(end);
            this.selectionStart = this.selectionEnd = start + 4;
        }
    });
}

function initializeClearButton() {
    const clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            const textarea = document.getElementById('input-textarea');
            textarea.value = '';
            textarea.focus();
            showToast('Input cleared', 'info');
        });
    }
}

// ============================================================================
// DEMO BUTTONS
// ============================================================================

function initializeDemoButtons() {
    const demoBtns = ['nav-demo-btn', 'hero-demo-btn', 'paste-demo-btn'];
    demoBtns.forEach(id => {
        const btn = document.getElementById(id);
        if (btn) btn.addEventListener('click', loadDemoData);
    });
}

function loadDemoData() {
    const sampleData = `Runs: 10% - 11% x31 10% - 12% x32 10% - 13% x2 10% - 14% x18 10% - 15% x13 10% - 16% x13 10% - 17% x26 10% - 18% x6 10% - 19% x33 10% - 20% x7 10% - 21% x10 10% - 23% x3 10% - 24% x4 10% - 25% x1 10% - 26% x5 10% - 27% x1 10% - 30% x4 10% - 31% x5 10% - 35% x1 10% - 37% x1 10% - 41% x2 10% - 43% x1 10% - 46% x1 10% - 48% x1 10% - 51% x1 10% - 52% x1 10% - 62% x1 22% - 23% x51 22% - 24% x88 22% - 25% x44 22% - 26% x69 22% - 27% x34 22% - 28% x15 22% - 30% x44 22% - 31% x18 22% - 32% x6 22% - 35% x2 22% - 40% x2 22% - 41% x11 22% - 42% x6 22% - 43% x4 22% - 44% x2 22% - 46% x2 22% - 47% x2 22% - 48% x1 22% - 50% x1 22% - 51% x1 22% - 52% x4 22% - 53% x2 22% - 60% x1 22% - 61% x2 22% - 64% x1 22% - 69% x2 22% - 73% x1 22% - 75% x1 23% - 23% x2 23% - 24% x5 23% - 25% x1 23% - 27% x1 24% - 24% x1 24% - 27% x1 25% - 25% x5 25% - 26% x2 25% - 28% x1 25% - 51% x1 26% - 27% x1 26% - 28% x1 26% - 29% x1 26% - 30% x2 28% - 29% x1 28% - 30% x8 28% - 31% x1 28% - 35% x1 28% - 40% x1 29% - 30% x14 29% - 31% x13 29% - 32% x2 29% - 33% x1 31% - 31% x2 31% - 32% x2 31% - 43% x1 34% - 43% x1 39% - 39% x10 39% - 40% x203 39% - 41% x138 39% - 42% x30 39% - 43% x44 39% - 44% x13 39% - 45% x4 39% - 46% x29 39% - 47% x25 39% - 48% x39 39% - 49% x5 39% - 50% x13 39% - 51% x10 39% - 52% x12 39% - 53% x11 39% - 54% x6 39% - 55% x2 39% - 56% x2 39% - 58% x6 39% - 59% x4 39% - 60% x6 39% - 61% x8 39% - 62% x3 39% - 64% x9 39% - 66% x1 39% - 67% x1 39% - 69% x6 39% - 70% x1 39% - 73% x2 39% - 75% x1 39% - 80% x1 39% - 81% x1 39% - 82% x2 39% - 88% x1 44% - 44% x222 44% - 45% x8 44% - 46% x43 44% - 47% x26 44% - 48% x55 44% - 49% x8 44% - 50% x8 44% - 51% x7 44% - 52% x8 44% - 53% x3 44% - 54% x1 44% - 55% x7 44% - 58% x2 44% - 61% x1 44% - 63% x1 44% - 64% x1 44% - 66% x1 44% - 70% x1 49% - 50% x143 49% - 51% x50 49% - 52% x35 49% - 53% x20 49% - 54% x5 49% - 55% x11 49% - 56% x10 49% - 57% x1 49% - 58% x7 49% - 59% x2 49% - 60% x1 49% - 61% x7 49% - 63% x1 49% - 64% x7 49% - 65% x1 49% - 66% x2 49% - 67% x1 49% - 71% x1 49% - 72% x1 49% - 73% x1 53% - 54% x169 53% - 55% x39 53% - 56% x24 53% - 57% x3 53% - 58% x15 53% - 59% x11 53% - 60% x14 53% - 61% x25 53% - 63% x1 53% - 64% x18 53% - 65% x1 53% - 66% x4 53% - 67% x5 53% - 70% x2 53% - 71% x2 53% - 72% x1 53% - 73% x1 53% - 74% x2 53% - 75% x2 53% - 76% x2 53% - 77% x2 53% - 80% x2 53% - 93% x1 54% - 54% x9 54% - 55% x2 54% - 56% x2 56% - 56% x11 56% - 57% x3 56% - 60% x1 57% - 57% x24 57% - 58% x33 57% - 59% x11 57% - 60% x2 57% - 61% x5 57% - 62% x2 57% - 65% x1 57% - 73% x1 57% - 74% x1 58% - 58% x57 58% - 59% x50 58% - 60% x40 58% - 61% x38 58% - 62% x1 58% - 63% x1 58% - 65% x2 58% - 66% x1 58% - 68% x4 58% - 70% x2 58% - 71% x3 60% - 60% x6 60% - 61% x9 60% - 62% x1 60% - 64% x1 61% - 61% x42 61% - 62% x64 61% - 63% x15 61% - 64% x80 61% - 65% x31 61% - 66% x33 61% - 67% x39 61% - 68% x8 61% - 69% x12 61% - 70% x29 61% - 71% x7 61% - 72% x1 61% - 73% x8 61% - 74% x1 61% - 75% x14 61% - 76% x7 61% - 77% x5 61% - 79% x4 61% - 80% x7 61% - 83% x1 61% - 84% x1 61% - 85% x4 61% - 86% x2 61% - 87% x1 61% - 100% x2 62% - 63% x3 62% - 65% x3 63% - 65% x1 65% - 65% x3 65% - 70% x1 65% - 71% x1 67% - 67% x18 67% - 69% x1 67% - 75% x1 69% - 70% x3 69% - 71% x1 70% - 70% x43 70% - 71% x108 70% - 72% x8 70% - 73% x42 70% - 74% x14 70% - 75% x39 70% - 76% x20 70% - 77% x11 70% - 79% x16 70% - 80% x20 70% - 83% x3 70% - 85% x1 70% - 86% x4 70% - 87% x2 70% - 92% x2 70% - 93% x5 70% - 100% x2 71% - 72% x8 71% - 73% x5 71% - 74% x3 71% - 75% x1 71% - 79% x1 72% - 72% x11 72% - 73% x6 72% - 74% x4 72% - 75% x10 72% - 76% x6 72% - 77% x1 72% - 78% x2 72% - 80% x1 72% - 86% x1 73% - 74% x1 74% - 74% x4 74% - 75% x3 75% - 75% x68 75% - 76% x10 75% - 77% x11 75% - 78% x10 75% - 79% x10 75% - 80% x11 75% - 82% x1 75% - 83% x1 75% - 84% x3 75% - 85% x1 75% - 87% x1 75% - 100% x1 77% - 77% x2 77% - 79% x2 78% - 78% x3 78% - 80% x1 78% - 81% x1 79% - 79% x5 79% - 80% x11 79% - 82% x1 80% - 80% x54 80% - 81% x4 80% - 82% x4 80% - 83% x5 80% - 84% x8 80% - 85% x5 80% - 86% x4 80% - 87% x9 80% - 89% x1 80% - 92% x1 80% - 93% x3 80% - 94% x4 80% - 100% x4 83% - 84% x64 83% - 85% x35 83% - 86% x30 83% - 87% x19 83% - 88% x4 83% - 89% x2 83% - 91% x3 83% - 92% x4 83% - 93% x8 83% - 94% x8 83% - 100% x5 88% - 88% x1 88% - 89% x2 88% - 94% x1 92% - 92% x8 92% - 93% x4 92% - 94% x4 93% - 93% x4 93% - 94% x11 93% - 96% x3 93% - 97% x1 93% - 100% x2 94% - 94% x2 94% - 96% x1
From 0: 0% x91 1% x54 2% x57 3% x35 4% x61 5% x3 6% x39 7% x8 8% x5 9% x10 11% x16 12% x34 14% x22 15% x13 16% x16 17% x26 18% x14 19% x32 20% x3 21% x22 23% x3 24% x3 26% x17 27% x6 28% x1 30% x5 31% x3 35% x1 40% x5 41% x10 42% x2 43% x2 44% x1 47% x5 48% x3 49% x2 50% x1 51% x2 52% x2 53% x5 61% x4 62% x4 64% x3 65% x3 69% x2 71% x1 76% x1 80% x1
Runs: 0% - 0% x11 0% - 1% x3 0% - 2% x5 0% - 3% x4 0% - 4% x2 0% - 6% x2 2% - 2% x3 2% - 3% x1 3% - 3% x7 3% - 5% x1 3% - 7% x1 3% - 15% x1 4% - 5% x1 4% - 6% x1 5% - 6% x17 5% - 17% x1 5% - 19% x1 7% - 12% x1 12% - 12% x4 12% - 14% x1 14% - 14% x1 14% - 15% x1 15% - 15% x8 15% - 17% x1 15% - 18% x1 16% - 16% x2 16% - 17% x11 16% - 20% x1 17% - 17% x11 17% - 18% x1 17% - 20% x1 18% - 19% x6 18% - 20% x1 18% - 28% x1 19% - 20% x2 19% - 23% x1 20% - 20% x1 20% - 23% x2 20% - 24% x1 21% - 23% x1 21% - 25% x1 22% - 23% x3 22% - 24% x3 22% - 25% x2 23% - 24% x2 23% - 25% x1 24% - 25% x2 24% - 26% x3 25% - 25% x10 25% - 26% x6 25% - 27% x3 26% - 27% x17 26% - 28% x8 26% - 29% x2 26% - 30% x1 27% - 28% x6 28% - 28% x2 28% - 29% x3 28% - 30% x6 29% - 29% x1 29% - 30% x18 29% - 31% x3 29% - 32% x2 30% - 30% x1 30% - 31% x4 30% - 32% x3 31% - 31% x13 31% - 32% x8 31% - 41% x1 32% - 32% x17 32% - 33% x1 32% - 41% x2 38% - 40% x1 39% - 39% x3 39% - 40% x11 39% - 41% x12 39% - 43% x1 40% - 40% x19 40% - 41% x13 41% - 43% x1 42% - 44% x1 43% - 43% x1 43% - 46% x2 45% - 45% x1 45% - 46% x1 46% - 46% x1 46% - 47% x1 46% - 48% x1 46% - 49% x1 48% - 48% x19 48% - 49% x8 48% - 50% x3 49% - 49% x1 49% - 50% x2 50% - 50% x16 50% - 51% x5 51% - 51% x4 51% - 52% x3 51% - 53% x1 52% - 52% x3 52% - 53% x3 52% - 54% x2 54% - 54% x7 54% - 55% x3 54% - 56% x2 55% - 55% x16 55% - 56% x7 56% - 56% x15 56% - 57% x1 56% - 60% x1 57% - 57% x3 57% - 58% x3 57% - 61% x1 58% - 58% x4 58% - 59% x4 58% - 60% x1 58% - 61% x7 59% - 60% x4 60% - 61% x3 60% - 62% x1 61% - 61% x2 61% - 64% x2 62% - 62% x1 62% - 64% x2 63% - 63% x4 63% - 64% x5 63% - 65% x2 64% - 64% x15 64% - 65% x3 64% - 68% x1 66% - 66% x1 66% - 68% x1 68% - 68% x1 68% - 69% x2 69% - 69% x1 69% - 70% x4 70% - 70% x1 70% - 71% x2 71% - 71% x3 71% - 72% x1 71% - 74% x1 73% - 73% x4 73% - 74% x1 73% - 75% x1 74% - 74% x3 74% - 75% x12 75% - 75% x2 75% - 76% x1 75% - 77% x1 76% - 76% x1 76% - 79% x1 77% - 77% x2 77% - 78% x1 77% - 79% x1 78% - 78% x4 78% - 80% x1 79% - 80% x1 79% - 81% x1 80% - 80% x5`;

    const textarea = document.getElementById('input-textarea');
    textarea.value = sampleData;

    showToast('Demo data loaded! Click Analyze or press Ctrl+Enter', 'success');
    smoothScrollTo('analyzer');
}

// ============================================================================
// ANALYZE BUTTON
// ============================================================================

function initializeAnalyzeButton() {
    const button = document.getElementById('analyze-button');
    button.addEventListener('click', performAnalysis);
}

// ============================================================================
// ANALYSIS EXECUTION
// ============================================================================

function performAnalysis() {
    const textarea = document.getElementById('input-textarea');
    const difficultySelect = document.getElementById('difficulty-select');
    const inputText = textarea.value.trim();

    if (!inputText) {
        showToast('Please paste your Geometry Dash data first', 'warning');
        textarea.focus();
        return;
    }

    const difficultyMultiplier = parseFloat(difficultySelect.value);
    const difficultyLabel = (difficultySelect.options[difficultySelect.selectedIndex]?.textContent || '').trim().toLowerCase();

    const options = { difficultyLabel };
    const lengthSelect = document.getElementById('length-category-select');
    const useCustom = document.getElementById('use-custom-length');
    const durationInput = document.getElementById('duration-input');
    if (lengthSelect && lengthSelect.value) {
        options.officialLengthCategory = lengthSelect.value;
    }
    if (useCustom && durationInput && useCustom.checked && durationInput.value.trim()) {
        options.duration = durationInput.value.trim();
        if (durationInput.durationMode) {
            options.durationMode = durationInput.durationMode;
        }
    }

    setLoading(true);

    setTimeout(() => {
        try {
            if (DEBUG_MODE) console.log('Starting analysis with input length:', inputText.length);

            const results = analyzeInput(inputText, difficultyMultiplier, options);

            if (DEBUG_MODE) console.log('Analysis results:', results);

            if (!results.hasData) {
                showToast('No valid data found. Check your input format.', 'warning');
                setLoading(false);
                return;
            }

            analysisResults = results;

            displayResults(results);

            document.getElementById('dashboard').classList.remove('hidden');
            document.getElementById('results').classList.remove('hidden');
            document.getElementById('coach').classList.remove('hidden');

            smoothScrollTo('dashboard');

            updateHeroStats(results);

            setTimeout(() => animateNumbers(), 300);
            setTimeout(() => initializeTiltEffect(), 500);

            showToast('Analysis complete! Scroll to view your dashboard.', 'success');

        } catch (error) {
            if (DEBUG_MODE) console.error('Analysis error:', error);
            showToast('Analysis error: ' + error.message, 'error');
        } finally {
            setLoading(false);
        }
    }, 600);
}

// ============================================================================
// RESULTS DISPLAY
// ============================================================================

function displayResults(results) {
    // Session Snapshot
    document.getElementById('total-attempts').textContent = (results.totalAttempts || 0).toLocaleString();
    document.getElementById('best-from-0').textContent = round1(results.bestFrom0) + '%';
    document.getElementById('coverage').textContent = round1(results.coverage) + '%';
    document.getElementById('mode-status').textContent = formatMode(results.mode || 'standard');

    // Readiness Panel
    document.getElementById('readiness-score').textContent = round1(results.readiness) + '%';
    document.getElementById('skill-tier').textContent = results.skillTier || 'N/A';
    document.getElementById('consistency-tier').textContent = results.consistencyTier || 'N/A';
    document.getElementById('nerves-tier').textContent = results.nervesTier || 'N/A';

    // Most Stable Runs
    populateMostStableRuns(results);

    // Most Dangerous Segment
    populateMostDangerousSegment(results);

    // Practice Heatmap
    renderHeatmap(results.segmentData || []);

    // Route Path + Summary
    renderRoutePath(results);
    renderRouteSummary(results);
    document.getElementById('route-reliability').textContent = results.routeReliability || '--';
    document.getElementById('route-segments').textContent = (results.routeSegments || 0).toLocaleString();

    // Choke Points
    populateChokePointsPreview(results);

    // BUG FIX v8.3: Canvas rendering with ResizeObserver + IntersectionObserver for mobile
    // Render immediately, then set up observers for re-render on resize/visibility
    renderNerveVisualization(results.nerveChart || [], results.passRateByChunks || []);
    renderSkillProgressionCurve(results);

    // Set up canvas observers for mobile robustness
    setupCanvasObservers(results);

    // Coach Suggestions
    const openingNote = results.openingPressure && results.openingPressure.isolated
        ? ` Opening 0-5% is an input spike (${round1(results.openingPressure.percentage)}%), so warm it up separately.`
        : '';
    document.getElementById('next-focus').textContent = results.coachSuggestions?.nextAction || 'Keep playing';
    document.getElementById('bridge-gaps').textContent = (results.coachSuggestions?.biggestGap || 'None') + openingNote;
    document.getElementById('strong-points').textContent = results.coachSuggestions?.strongAreas || 'None';

    // Forecast Panel
    document.getElementById('est-attempts').textContent = (results.estimatedAttempts || 0).toLocaleString();
    document.getElementById('confidence-interval').textContent = results.confidenceInterval || '±0';
    document.getElementById('volatility').textContent = results.volatility || 'Stable';

    // Top Runs
    renderTopRuns(results.bestRuns || [], results.longestRuns || []);

    // Data availability flags
    const hasFrom0 = (results.from0Deaths || 0) > 0 || (results.sourceSeparation?.sourceCounts?.from0 || 0) > 0;
    const hasStartpos = results.startposAttempts > 0;

    // Coach Section - handle all data scenarios
    if (!hasFrom0 && hasStartpos) {
        // Only startpos data
        document.getElementById('next-action').textContent = 'Start doing full from-0 attempts to establish your baseline progress.';
        document.getElementById('biggest-gap').textContent = 'No from-0 data. Startpos runs alone cannot prove completion paths.';
        document.getElementById('best-route').textContent = 'Do 50+ attempts from 0% to find your current best and weak spots.';
        document.getElementById('strong-areas').textContent = 'You have startpos practice data. Combine with from-0 runs for full analysis.';
        document.getElementById('today-focus').textContent = 'Today: 20-30 full from-0 attempts. Track your deaths and best progress.';
    } else if (hasFrom0 && !hasStartpos && results.bestFrom0 < 100) {
        // Only from-0 data, not completed
        document.getElementById('next-action').textContent = `Practice ${round1(results.bestFrom0)}-100% with startpos to build endgame consistency.`;
        document.getElementById('biggest-gap').textContent = `No startpos coverage past ${round1(results.bestFrom0)}%. Need endgame practice.`;
        document.getElementById('best-route').textContent = `Best from-0: ${round1(results.bestFrom0)}%. Practice the final ${round1(100 - results.bestFrom0)}% in isolation.`;
        document.getElementById('strong-areas').textContent = `You can consistently reach ${round1(results.bestFrom0)}%. Build from there.`;
        document.getElementById('today-focus').textContent = `Today: 50% from-0 attempts, 50% ${round1(results.bestFrom0)}-100% startpos practice.`;
    } else {
        // Normal case (both data types or completed)
        document.getElementById('next-action').textContent = results.coachSuggestions?.nextAction || 'Keep playing';
        document.getElementById('biggest-gap').textContent = (results.coachSuggestions?.biggestGap || 'None') + openingNote;
        document.getElementById('best-route').textContent = results.coachSuggestions?.bestRoute || 'None';
        document.getElementById('strong-areas').textContent = results.coachSuggestions?.strongAreas || 'None';
        document.getElementById('today-focus').textContent = results.coachSuggestions?.todayFocus || 'None';
    }

    // Death Distribution
    renderDeathDistribution(results.deathDistribution || []);

    // Progress Trend
    populateProgressTrendPreview(results);

    // === Phase 3: New Cards ===
    // Overall Grade
    if (results.overallGrade) {
        document.getElementById('overall-grade-tier').textContent = results.overallGrade.tier || 'N/A';
        document.getElementById('overall-grade-score').textContent = round1(results.overallGrade?.score);
        document.getElementById('overall-grade-label').textContent = results.overallGrade.tier || 'N/A';
    }
    const confidenceEl = document.getElementById('confidence-level');
    if (confidenceEl) {
        const confidence = results.confidenceLevel || results.confidenceReport?.confidenceLevel || 'LOW';
        confidenceEl.textContent = confidence;
        confidenceEl.className = `preview-value tier-badge ${confidence === 'HIGH' ? 'tier-a' : confidence === 'MEDIUM' ? 'tier-b' : 'tier-c'}`;
    }

    const hasDuration = results.durationMetadata?.enabled;
    const enduranceEl = document.getElementById('endurance-rating');
    if (enduranceEl) {
        const v = results.durationMetrics?.enduranceRating;
        enduranceEl.textContent = v === null || v === undefined ? '--' : `${round1(v)}%`;
    }
    const deathDensityRawEl = document.getElementById('death-density-raw');
    if (deathDensityRawEl) {
        const v = results.durationMetrics?.deathDensity?.rawDeathsPerMinute;
        deathDensityRawEl.textContent = v === null || v === undefined ? '--' : safeToFixed(v, 2);
    }
    const deathDensityScoreEl = document.getElementById('death-density-score');
    if (deathDensityScoreEl) {
        const v = results.durationMetrics?.deathDensity?.normalizedScore;
        deathDensityScoreEl.textContent = v === null || v === undefined ? '--' : safeToFixed(v, 3);
    }
    const practiceDensityEl = document.getElementById('practice-density');
    if (practiceDensityEl) {
        const v = results.durationMetrics?.practiceDensity;
        practiceDensityEl.textContent = v === null || v === undefined ? '--' : safeToFixed(v, 2);
    }
    const durationCategoryEl = document.getElementById('duration-category');
    if (durationCategoryEl) {
        durationCategoryEl.textContent = hasDuration ? (results.durationMetadata?.durationCategory || 'unknown') : '--';
        durationCategoryEl.className = `stat-value tier-badge ${hasDuration ? '' : 'muted'}`;
    }
    const durationConfidenceEl = document.getElementById('duration-confidence');
    if (durationConfidenceEl) {
        durationConfidenceEl.textContent = hasDuration ? (results.durationMetadata?.durationConfidence || 'low') : '--';
    }

    // Pass Rate Chunks
    if (results.passRateByChunks) {
        renderPassRateChunks(results.passRateByChunks);
    }

    // Nerve Chart
    if (results.nerveChart) {
        renderNerveChartPreview(results.nerveChart);
    }

    // === V7 Metrics ===
    // Completion Probability
    if (results.completionProbability !== undefined) {
        document.getElementById('completion-probability').textContent = round1(results.completionProbability) + '%';
        document.getElementById('completion-probability-label').textContent =
            results.completionProbability >= 75 ? 'High' :
                results.completionProbability >= 50 ? 'Medium' : 'Low';
    }

    // Progress Velocity
    if (results.progressVelocity) {
        document.getElementById('progress-velocity-label').textContent = results.progressVelocity.label || 'N/A';
        document.getElementById('progress-velocity-score').textContent = round1(results.progressVelocity?.score);
    }

    // Demon Readiness
    if (results.demonReadiness) {
        renderDemonReadiness(results.demonReadiness);
    }
}

function formatMode(mode) {
    return mode.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

function renderDemonReadiness(demonReadiness) {
    const container = document.getElementById('demon-readiness-container');
    const demons = [
        { key: 'easy', name: 'Easy Demon' },
        { key: 'medium', name: 'Medium Demon' },
        { key: 'hard', name: 'Hard Demon' },
        { key: 'insane', name: 'Insane Demon' },
        { key: 'extreme', name: 'Extreme Demon' }
    ];

    let html = '<div class="demon-readiness-grid">';
    demons.forEach(demon => {
        const data = demonReadiness[demon.key];
        if (data) {
            const readyClass = data.ready ? 'demon-ready' : 'demon-not-ready';
            html += `
                <div class="demon-card ${readyClass}">
                    <div class="demon-name">${demon.name}</div>
                    <div class="demon-readiness-score">${round1(data.readiness)}%</div>
                    <div class="demon-status">${data.ready ? 'Ready' : 'Not Ready'}</div>
                    <div class="demon-stats">
                        <div class="stat">Mech: ${round1(data?.scores?.mechanical)}%</div>
                        <div class="stat">Cons: ${round1(data.scores.consistency)}%</div>
                        <div class="stat">Endur: ${round1(data.scores.endurance)}%</div>
                        <div class="stat">Nerves: ${round1(data.scores.nerves)}%</div>
                        <div class="stat">Proof: ${round1(data.scores.proof)}%</div>
                    </div>
                </div>
            `;
        }
    });
    html += '</div>';
    container.innerHTML = html;
}

function populateMostStableRuns(results) {
    if (!results.stableRuns || results.stableRuns.length === 0) {
        document.getElementById('top-stable-run').textContent = '--';
        document.getElementById('stability-score').textContent = '--';
        return;
    }

    const topRun = results.stableRuns[0];
    document.getElementById('top-stable-run').textContent = `${topRun.start}% - ${topRun.end}%`;

    const stabilityScore = topRun?.stabilityScore ? round1(topRun.stabilityScore) : '--';
    document.getElementById('stability-score').textContent = stabilityScore;
}

function getHotspotDisplay(results) {
    if (results.hotspots && results.hotspots.weakestSection) {
        return results.hotspots.weakestSection;
    }
    if (results.deathDistribution && results.deathDistribution.length > 0) {
        return results.deathDistribution[0];
    }
    return null;
}

function populateMostDangerousSegment(results) {
    if (!results.deathDistribution || results.deathDistribution.length === 0) {
        document.getElementById('danger-zone').textContent = '--';
        document.getElementById('danger-death-count').textContent = '--';
        return;
    }

    const hotspot = getHotspotDisplay(results);
    if (hotspot) {
        const label = hotspot.range || hotspot.segment || `${hotspot.start}-${hotspot.end}%`;
        document.getElementById('danger-zone').textContent = label;
        document.getElementById('danger-death-count').textContent = hotspot.deaths;
        return;
    }

    document.getElementById('danger-zone').textContent = '--';
    document.getElementById('danger-death-count').textContent = '--';
}

function populateChokePointsPreview(results) {
    if (!results.bestRuns || results.bestRuns.length === 0) {
        document.getElementById('primary-choke').textContent = '--';
        document.getElementById('choke-rate').textContent = '--';
        return;
    }

    const endPoints = {};
    results.bestRuns.forEach(run => {
        endPoints[run.end] = (endPoints[run.end] || 0) + run.count;
    });

    const sortedEnds = Object.entries(endPoints).sort((a, b) => b[1] - a[1]);
    const [primaryEnd, count] = sortedEnds[0];

    const chokeLabel = results.nerveChokeType === 'NERVE' ? '🧠 Nerve Choke' : '🔴 Skill Wall';
    document.getElementById('primary-choke').textContent = `${primaryEnd}% (${chokeLabel})`;
    const rate = round1((count / results.totalAttempts) * 100);
    document.getElementById('choke-rate').textContent = `${rate}%`;
}

function populateProgressTrendPreview(results) {
    const bestProgress = results.bestFrom0 || 0;
    const totalAttempts = results.totalAttempts || 1;
    const efficiency = round1(bestProgress / totalAttempts * 100);

    let trend = 'STABLE';
    let trendClass = 'stable';
    if (efficiency > 1.5) { trend = 'IMPROVING'; trendClass = 'improving'; }
    else if (efficiency < 0.5) { trend = 'DECLINING'; trendClass = 'declining'; }

    const trendEl = document.getElementById('progress-trend-value');
    trendEl.textContent = trend;
    trendEl.className = `preview-value trend-badge ${trendClass}`;
    document.getElementById('improvement-rate').textContent = `${efficiency}%`;
}

// ============================================================================
// ROUTE SUMMARY (NEW)
// ============================================================================

function renderRouteSummary(results) {
    const minRunsEl = document.getElementById('route-min-runs');
    const totalWaysEl = document.getElementById('route-total-ways');
    const bestFrom0 = results.bestFrom0 || 0;
    const completions = results.completions || 0;

    // DEBUG: Log what we're working with
    if (DEBUG_MODE) {
        console.log('renderRouteSummary:', {
            bestFrom0,
            completions,
            routesLength: results.routes?.length,
            totalRoutes: results.totalRoutes,
            bestRunsAllLength: results.bestRunsAll?.length,
            actualRunsLength: results.actualRuns?.length,
            from0RunsLength: results.from0Runs?.length,
            startposRunsLength: results.startposRuns?.length
        });
    }

    // FORCE: If NO verified completions AND no routes found, show recommendation
    if (completions === 0 && (!results.routes || results.routes.length === 0)) {
        totalWaysEl.innerHTML = '0';

        if (bestFrom0 > 0 && bestFrom0 < 100) {
            // Standard case: reached X%, need 2 segments to 100%
            const recommendedSegments = 2;

            let from0Count = 0;
            let connectCount = 0;

            const from0Runs = results.from0Runs || [];
            from0Runs.forEach(r => {
                if (r && r.source === 'from0' && r.percent === bestFrom0) from0Count += (r.count || 0);
            });
            const startposRuns = results.startposRuns || [];
            startposRuns.forEach(r => {
                if (r && r.source === 'startpos' && r.start >= bestFrom0 - 5 && r.start <= bestFrom0 + 5 && r.end >= 100) connectCount += (r.count || 0);
            });

            const from0Text = from0Count > 0 ? `${from0Count}x` : '?';
            const connectText = connectCount > 0 ? `${connectCount}x` : '0x';

            const recommendedRoute = `0-${round1(bestFrom0)}% (${from0Text}) + ${round1(bestFrom0)}-100% (${connectText})`;
            minRunsEl.innerHTML = `<span style="font-size: 14px; font-weight: 600;">${recommendedSegments}</span><br/><span style="font-size: 11px; color: var(--muted-gray);">${recommendedRoute}</span>`;
        } else if (bestFrom0 === 100) {
            minRunsEl.innerHTML = `<span style="font-size: 14px; font-weight: 600;">✅</span><br/><span style="font-size: 11px; color: var(--muted-gray);">Already beaten!</span>`;
        } else {
            minRunsEl.innerHTML = `<span style="font-size: 14px; font-weight: 600;">--</span><br/><span style="font-size: 11px; color: var(--muted-gray);">Start grinding</span>`;
        }
        return;
    }

    // Only show analyzer routes if user HAS verified completions
    if (!results.routes || results.routes.length === 0) {
        minRunsEl.innerHTML = `<span style="font-size: 14px; font-weight: 600;">✅</span><br/><span style="font-size: 11px; color: var(--muted-gray);">Complete!</span>`;
        totalWaysEl.innerHTML = completions.toString();
        return;
    }

    // Find all minimum-segment routes, sorted by reliability score (highest first)
    const minSegments = Math.min(...results.routes.map(r => r.segments));
    const shortestRoutes = results.routes
        .filter(r => r.segments === minSegments)
        .sort((a, b) => {
            const scoreA = (a.runs || []).reduce((s, seg) => s + (seg.count || 0), 0);
            const scoreB = (b.runs || []).reduce((s, seg) => s + (seg.count || 0), 0);
            return scoreB - scoreA;
        });

    // Build HTML showing all shortest combinations, best first
    let routeListHTML = shortestRoutes.map((route, idx) => {
        const routeText = route.route ? route.route.join(' \u2192 ') : route.start + '% \u2192 ' + route.end + '%';
        const totalCount = (route.runs || []).reduce((s, seg) => s + (seg.count || 0), 0);
        const badge = idx === 0 ? ' <span style="color:var(--cyan-glow);font-size:9px;">\u2605 BEST</span>' : '';
        return '<div style="font-size:11px;color:var(--muted-gray);margin-bottom:2px;">' + routeText + badge + (totalCount > 0 ? ' <span style="color:#8B95A8">(' + totalCount + 'x)</span>' : '') + '</div>';
    }).join('');

    minRunsEl.innerHTML = '<span style="font-size: 14px; font-weight: 600;">' + minSegments + '</span><br/>' + routeListHTML;

    // Use totalRoutes from analyzer (which counts all paths), fallback to unique routes
    const totalWays = results.totalRoutes || results.routes.length;
    totalWaysEl.textContent = totalWays.toLocaleString();
}

// ============================================================================
// NERVE CHART VISUALIZATION (Canvas-based v8.3-PRO)
// ============================================================================

function renderNerveVisualization(nerveChart, passRateChunks) {
    const canvas = document.getElementById('nerve-visualization');
    if (!canvas) return false;

    const parent = canvas.parentElement;
    const existingWarning = parent ? parent.querySelector('.ldm-warning') : null;
    
    if (existingWarning) existingWarning.remove();
    canvas.style.display = '';

    // BUG FIX v8.3: Robust canvas sizing with fallback for hidden containers / mobile
    let containerWidth = (parent ? parent.clientWidth : 0) || 0;
    let containerHeight = (parent ? parent.clientHeight : 0) || 0;

    // Fallback: if container has 0 size (hidden tab, not yet laid out), use viewport or default
    if (containerWidth === 0) {
        containerWidth = Math.min(Math.max(window.innerWidth - 40, 280), 600);
    }
    if (containerHeight === 0) {
        containerHeight = Math.max(160, Math.round(containerWidth * 0.37));
    }
    containerHeight = Math.min(containerHeight, 240);

    // Handle device pixel ratio for crisp rendering on mobile
    const dpr = window.devicePixelRatio || 1;
    if (containerWidth <= 0 || containerHeight <= 0) return false;
    canvas.width = Math.max(1, Math.round(containerWidth * dpr));
    canvas.height = Math.max(1, Math.round(containerHeight * dpr));
    canvas.style.width = containerWidth + 'px';
    canvas.style.height = containerHeight + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // Scale all drawing by DPR
    const width = containerWidth;
    const height = containerHeight;
    const isMobile = document.body.classList.contains('mobile-mode');
    const padding = isMobile ? 28 : 40;
    const plotWidth = width - padding * 2;
    const plotHeight = height - padding * 2;

    // LDM AUDIT v8.3: Charts MUST render in all modes — LDM only affects decorative effects
    const isLDM = document.body.classList.contains('ldm-enabled');
    // Note: isLDM flag available for future use (e.g., reducing animation complexity)
    // Charts, metrics, exports, and analysis logic are NEVER disabled in LDM.

    // Clear canvas
    ctx.fillStyle = 'rgba(3, 4, 7, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(97, 216, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const x = padding + (plotWidth / 10) * i;
        const y = padding + (plotHeight / 10) * i;
        ctx.beginPath();
        ctx.moveTo(x, padding);
        ctx.lineTo(x, height - padding);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = 'rgba(97, 216, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(padding, padding);
    ctx.stroke();

    // Draw axis labels
    const fontSize = isMobile ? 9 : 11;
    ctx.fillStyle = 'rgba(139, 149, 168, 0.8)';
    ctx.font = fontSize + 'px monospace';
    ctx.textAlign = 'center';
    // X-axis: show every 10% or every 20% on mobile
    const xStep = isMobile ? 20 : 10;
    for (let i = 0; i <= 100; i += xStep) {
        const x = padding + (plotWidth / 100) * i;
        ctx.fillText(i + '%', x, height - padding + 13);
    }
    // Y-axis: 0/50/100
    ctx.textAlign = 'right';
    for (let i = 0; i <= 100; i += 50) {
        const y = height - padding - (plotHeight / 100) * i;
        ctx.fillText(i, padding - 4, y + 3);
    }

    // Draw nerve curve (stress line)
    if (nerveChart && nerveChart.length > 0) {
        ctx.strokeStyle = '#FF4FD8';
        ctx.lineWidth = 2;
        ctx.beginPath();

        nerveChart.forEach((point, idx) => {
            const x = padding + (plotWidth / 100) * point.percent;
            const y = height - padding - (plotHeight / 100) * Math.min(100, parseFloat(point.nerveScore));

            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();

        // Draw stress points with color coding
        nerveChart.forEach((point, idx) => {
            const x = padding + (plotWidth / 100) * point.percent;
            const y = height - padding - (plotHeight / 100) * Math.min(100, parseFloat(point.nerveScore));
            const stress = parseFloat(point.nerveScore);

            // Color based on risk level
            if (stress > 70) ctx.fillStyle = '#FF4FD8'; // Critical
            else if (stress > 50) ctx.fillStyle = '#8B5CF6'; // High
            else if (stress > 30) ctx.fillStyle = '#F59E0B'; // Moderate
            else ctx.fillStyle = '#10B981'; // Safe

            ctx.beginPath();
            ctx.arc(x, y, 3, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    // Draw pass rate curve (green)
    if (passRateChunks && passRateChunks.length > 0) {
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.beginPath();

        passRateChunks.forEach((chunk, idx) => {
            const x = padding + (plotWidth / 100) * ((chunk.start + chunk.end) / 2);
            const y = height - padding - (plotHeight / 100) * chunk.passRate;

            if (idx === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.stroke();
    }

    // Chart title and legend
    ctx.fillStyle = 'rgba(139, 149, 168, 0.9)';
    ctx.font = 'bold ' + (isMobile ? 9 : 11) + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Stress %', padding + 2, padding - 4);
    ctx.textAlign = 'center';
    ctx.fillText('Level (0-100%)', width / 2, height - 2);

    // Legend
    const legendY = padding - 6;
    const legendX = width - padding - (isMobile ? 130 : 180);
    ctx.font = (isMobile ? 8 : 10) + 'px monospace';
    ctx.textAlign = 'left';
    // Stress line
    ctx.strokeStyle = '#FF4FD8';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(legendX, legendY); ctx.lineTo(legendX + 18, legendY); ctx.stroke();
    ctx.fillStyle = '#FF4FD8';
    ctx.fillText('Stress', legendX + 22, legendY + 3);
    // Pass rate line
    if (passRateChunks && passRateChunks.length > 0) {
        ctx.strokeStyle = '#10B981';
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(legendX + (isMobile ? 60 : 80), legendY); ctx.lineTo(legendX + (isMobile ? 78 : 98), legendY); ctx.stroke();
        ctx.fillStyle = '#10B981';
        ctx.fillText('Pass%', legendX + (isMobile ? 82 : 102), legendY + 3);
    }
    return true;
}

// ============================================================================
// SKILL PROGRESSION CURVE (Canvas-based v8.3-PRO)
// ============================================================================

function renderSkillProgressionCurve(results) {
    const canvas = document.getElementById('skill-curve-canvas');
    if (!canvas) return false;

    const parent = canvas.parentElement;
    const existingWarning = parent ? parent.querySelector('.ldm-warning') : null;
    
    if (existingWarning) existingWarning.remove();
    canvas.style.display = '';

    // BUG FIX v8.3: Robust canvas sizing with fallback for hidden containers / mobile
    let containerWidth2 = (parent ? parent.clientWidth : 0) || 0;
    let containerHeight2 = (parent ? parent.clientHeight : 0) || 0;

    // Fallback: if container has 0 size (hidden tab, not yet laid out), use viewport or default
    if (containerWidth2 === 0) {
        containerWidth2 = Math.min(Math.max(window.innerWidth - 40, 280), 600);
    }
    if (containerHeight2 === 0) {
        containerHeight2 = Math.max(160, Math.round(containerWidth2 * 0.37));
    }

    // Extra safety: ensure minimum dimensions for mobile browsers
    containerWidth2 = Math.max(containerWidth2, 280);
    containerHeight2 = Math.max(containerHeight2, 140);
    containerHeight2 = Math.min(containerHeight2, 240);

    // Handle device pixel ratio for crisp rendering on mobile
    const dpr2 = window.devicePixelRatio || 1;
    if (containerWidth2 <= 0 || containerHeight2 <= 0) return false;
    canvas.width = Math.max(1, Math.round(containerWidth2 * dpr2));
    canvas.height = Math.max(1, Math.round(containerHeight2 * dpr2));
    canvas.style.width = containerWidth2 + 'px';
    canvas.style.height = containerHeight2 + 'px';

    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    ctx.setTransform(dpr2, 0, 0, dpr2, 0, 0); // Scale all drawing by DPR
    const width = containerWidth2;
    const height = containerHeight2;
    const isMobile2 = document.body.classList.contains('mobile-mode');
    const padding = isMobile2 ? 30 : 40;
    const plotWidth = Math.max(width - padding * 2, 100);
    const plotHeight = Math.max(height - padding * 2, 60);

    // LDM AUDIT v8.3: Charts MUST render in all modes — LDM only affects decorative effects
    const isLDM = document.body.classList.contains('ldm-enabled');
    // Note: isLDM flag available for future use (e.g., reducing animation complexity)
    // Charts, metrics, exports, and analysis logic are NEVER disabled in LDM.

    // Clear canvas
    ctx.fillStyle = 'rgba(3, 4, 7, 0.5)';
    ctx.fillRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = 'rgba(97, 216, 255, 0.1)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        const y = padding + (plotHeight / 10) * i;
        ctx.beginPath();
        ctx.moveTo(padding, y);
        ctx.lineTo(width - padding, y);
        ctx.stroke();
    }

    // Draw axes
    ctx.strokeStyle = 'rgba(97, 216, 255, 0.3)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(width - padding, height - padding);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(padding, height - padding);
    ctx.lineTo(padding, padding);
    ctx.stroke();

    // Current best from-0
    const currentBest = results.bestFrom0 || 0;

    // Projected progression (estimated over 100 runs)
    // Formula: each run attempts next 1%, so estimate based on difficulty
    const difficulty = Math.pow(2, currentBest / 25) * 0.8;
    const consistency = results.percentiles.consistencyIndex / 100;
    const estimatedProgressPerRun = Math.max(0.2, (1 - currentBest / 100) * consistency / difficulty);
    const projectedAfter100 = Math.min(100, currentBest + estimatedProgressPerRun * 100);

    // Draw current level line
    const currentX = padding;
    const currentY = height - padding - (plotHeight / 100) * currentBest;
    ctx.strokeStyle = '#2D6BFF';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.moveTo(currentX, currentY);
    ctx.lineTo(width - padding, currentY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw projected curve (exponential decay from 100%)
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 3;
    ctx.beginPath();

    for (let runs = 0; runs <= 100; runs++) {
        const progress = Math.min(100, currentBest + estimatedProgressPerRun * runs);
        const x = padding + (plotWidth / 100) * runs;
        const y = height - padding - (plotHeight / 100) * progress;

        if (runs === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // Draw plateau detection zone
    if (projectedAfter100 - currentBest < 2) {
        ctx.fillStyle = 'rgba(255, 79, 216, 0.1)';
        ctx.fillRect(padding, height - padding - (plotHeight / 100) * currentBest - 30, plotWidth, 60);

        ctx.fillStyle = '#FF4FD8';
        ctx.font = '10px monospace';
        ctx.fillText('⚠ PLATEAU ZONE', width / 2, height - padding - (plotHeight / 100) * currentBest - 15);
    }

    // Mark current and projected points
    // Current
    ctx.fillStyle = '#2D6BFF';
    ctx.beginPath();
    ctx.arc(currentX, currentY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Projected
    const projectedX = padding + (plotWidth / 100) * Math.min(100, 100);
    const projectedY = height - padding - (plotHeight / 100) * projectedAfter100;
    ctx.fillStyle = '#10B981';
    ctx.beginPath();
    ctx.arc(projectedX, projectedY, 5, 0, Math.PI * 2);
    ctx.fill();

    // Draw axis labels
    const sFontSize = isMobile2 ? 9 : 11;
    ctx.fillStyle = 'rgba(139, 149, 168, 0.8)';
    ctx.font = sFontSize + 'px monospace';
    ctx.textAlign = 'right';
    // Y-axis: 0/50/100%
    for (let i = 0; i <= 100; i += 50) {
        const y = height - padding - (plotHeight / 100) * i;
        ctx.fillText(i + '%', padding - 4, y + 3);
    }
    // X-axis ticks
    ctx.textAlign = 'center';
    const xTickStep = isMobile2 ? 50 : 20;
    for (let i = 0; i <= 100; i += xTickStep) {
        const x = padding + (plotWidth / 100) * i;
        ctx.fillText(i, x, height - padding + 13);
    }

    // Legend
    ctx.font = 'bold ' + (isMobile2 ? 9 : 11) + 'px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('Progress %', padding + 2, padding - 4);
    ctx.textAlign = 'center';
    ctx.fillText('Next Attempts', width / 2, height - 2);
    // Legend items
    const lgY = padding - 5;
    const lgX = width - padding - (isMobile2 ? 120 : 160);
    ctx.font = (isMobile2 ? 8 : 10) + 'px monospace';
    ctx.textAlign = 'left';
    ctx.setLineDash([5, 5]);
    ctx.strokeStyle = '#2D6BFF';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lgX, lgY); ctx.lineTo(lgX + 18, lgY); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = '#2D6BFF';
    ctx.fillText('Current', lgX + 22, lgY + 3);
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(lgX + (isMobile2 ? 62 : 80), lgY); ctx.lineTo(lgX + (isMobile2 ? 80 : 98), lgY); ctx.stroke();
    ctx.fillStyle = '#10B981';
    ctx.fillText('Projected', lgX + (isMobile2 ? 84 : 102), lgY + 3);

    // Update stats
    document.getElementById('current-skill-percent').textContent = `${currentBest}%`;
    document.getElementById('projected-skill-percent').textContent = `${round1(projectedAfter100)}%`;
    document.getElementById('plateau-risk-indicator').textContent = projectedAfter100 - currentBest < 2 ? '🔴 HIGH' : projectedAfter100 - currentBest < 5 ? '🟡 MEDIUM' : '🟢 LOW';

    // Estimate time to beat (based on average attempts per run)
    const runsNeeded = Math.ceil((100 - currentBest) / estimatedProgressPerRun);
    const estimatedTime = Math.ceil(runsNeeded / 5); // Assume 5 runs per session
    document.getElementById('time-to-beat').textContent = `${estimatedTime} sessions`;
    return true;
}

function renderDeathDistribution(deathData) {
    const container = document.getElementById('death-distribution');
    container.innerHTML = '';

    if (!deathData || deathData.length === 0) {
        container.innerHTML = '<div class="empty-state">No death data available</div>';
        return;
    }

    const displayData = deathData.slice(0, 8);

    displayData.forEach((item, index) => {
        const barContainer = document.createElement('div');
        barContainer.className = 'death-bar-container';

        const barWidth = Math.min(100, round1(item.percentage) * 5);

        const riskClass = item.riskLevel === 'High' ? 'death-high' :
            item.riskLevel === 'Medium' ? 'death-medium' :
            item.riskLevel === 'Low' ? 'death-low' : 'death-low';

        barContainer.innerHTML = `
            <div class="death-info">
                <span class="death-segment">${item.start}-${item.end}%</span>
                <span class="death-count">${item.deaths} deaths</span>
                <span class="death-percent">${round1(item.percentage)}%</span>
            </div>
            <div class="death-bar-wrapper">
                <div class="death-bar ${riskClass}" style="width: ${barWidth}%;" 
                     data-segment="${item.start}-${item.end}" data-risk="${item.riskLevel}"></div>
            </div>
        `;

        const bar = barContainer.querySelector('.death-bar');
        bar.addEventListener('click', function () {
            handleDeathBarClick(this, item);
        });

        container.appendChild(barContainer);
    });
}

function handleDeathBarClick(element, data) {
    element.classList.add('glow-effect');

    const coachSection = document.getElementById('coach');
    if (coachSection) {
        const focusElement = document.getElementById('next-focus');
        if (focusElement) {
            focusElement.textContent = `Focus on ${data.start}-${data.end}% death cluster`;
            focusElement.classList.add('highlight-update');
            setTimeout(() => focusElement.classList.remove('highlight-update'), 2000);
        }
    }

    showToast(`Focus set: ${data.start}-${data.end}%`, 'info');

    setTimeout(() => {
        element.classList.remove('glow-effect');
    }, 1000);
}

// ============================================================================
// HEATMAP RENDERING — Dual Layer: Death Density + Practice Coverage
// ============================================================================

function renderHeatmap(segmentData) {
    const container = document.getElementById('heatmap');
    container.innerHTML = '';

    const from0Freq = analysisResults?.from0Freq || {};
    const startposRuns = analysisResults?.startposRuns || [];

    // Calculate max deaths in any 10% block for normalization
    let maxBlockDeaths = 0;
    for (let b = 0; b < 10; b++) {
        const start = b * 10, end = (b + 1) * 10;
        let blockDeaths = 0;
        for (const [p, c] of Object.entries(from0Freq)) {
            const percent = parseInt(p, 10);
            if (percent >= start && percent < end) blockDeaths += c;
        }
        maxBlockDeaths = Math.max(maxBlockDeaths, blockDeaths);
    }

    for (let b = 0; b < 10; b++) {
        const start = b * 10;
        const end = (b + 1) * 10;

        // Death density for this block
        let blockDeaths = 0;
        for (const [p, c] of Object.entries(from0Freq)) {
            const percent = parseInt(p, 10);
            if (percent >= start && percent < end) blockDeaths += c;
        }

        // Practice coverage for this block
        const coveringRuns = startposRuns.filter(r => r.start <= start && r.end >= end);
        const totalCoverage = coveringRuns.reduce((sum, r) => sum + (r.count || 0), 0);

        const segmentEl = document.createElement('div');
        segmentEl.className = 'heatmap-segment';
        segmentEl.setAttribute('data-label', `${start}-${end}`);

        let colorTier;
        if (analysisResults?.deathDistribution?.length > 0) {
            const matchingSegment = analysisResults.deathDistribution.find(d => d.start === start);
            colorTier = matchingSegment ? matchingSegment.colorTier : 'safe';
        } else {
            const ratio = maxBlockDeaths > 0 ? blockDeaths / maxBlockDeaths : 0;
            colorTier = typeof getColorTier !== 'undefined' ? getColorTier(ratio) : 
                              (ratio >= 0.7 ? 'high' : ratio >= 0.3 ? 'medium' : ratio > 0 ? 'low' : 'safe');
        }
        segmentEl.classList.add(colorTier);

        // Overlay: practice coverage indicator (cyan border)
        if (totalCoverage > 0) {
            const practiceIntensity = Math.min(1, totalCoverage / 50);
            segmentEl.style.boxShadow = `inset 0 0 20px rgba(97, 216, 255, ${0.2 + practiceIntensity * 0.4})`;
            segmentEl.style.borderLeft = `3px solid rgba(97, 216, 255, ${0.5 + practiceIntensity * 0.5})`;
        }

        // Tooltip with death, practice, and pass rate info
        const deathText = blockDeaths > 0 ? `Deaths: ${blockDeaths}` : 'Deaths: 0';
        const practiceText = totalCoverage > 0 ? `Practice: ${totalCoverage}` : 'Practice: 0';
        const passRate = segmentData.find(s => s.start === start && s.end === end);
        const passText = passRate && passRate.passRate !== null ? ` | Pass: ${round1(passRate.passRate)}%` : '';
        segmentEl.title = `Segment ${start}%-${end}%: ${deathText} | ${practiceText}${passText}`;

        container.appendChild(segmentEl);
    }
}

// ============================================================================
// ROUTE PATH RENDERING
// ============================================================================

function renderRoutePath(results) {
    const container = document.getElementById('route-path');
    container.innerHTML = '';

    const bestFrom0 = results?.bestFrom0 || 0;
    const startposRuns = results?.startposRuns || [];
    const connectingRuns = startposRuns.filter(r => r.start <= bestFrom0 && r.end >= 100);

    // Show actual completion ROUTES
    if (results && results.routes && results.routes.length > 0) {
        const bestRoute = results.routes[0];
        if (!bestRoute) return;

        const routeEl = document.createElement('div');
        routeEl.className = 'route-preview-container';

        const header = document.createElement('div');
        header.className = 'route-preview-header';
        header.innerHTML = `<span style="font-size: 12px; color: var(--muted-gray);">RECOMMENDED PATH (${bestRoute.segments} segments)</span>`;
        routeEl.appendChild(header);

        if (bestRoute.runs && bestRoute.runs.length > 0) {
            bestRoute.runs.forEach((segment, idx) => {
                const segmentEl = document.createElement('div');
                segmentEl.className = 'route-segment animated';
                segmentEl.style.animationDelay = `${idx * 0.12}s`;

                const percentWidth = Math.min(100, (segment.length / 100) * 100);
                const reliability = segment.length > 30 ? 'high' : segment.length > 15 ? 'medium' : 'low';
                const isVirtual = segment.type === 'virtual';
                const segmentStyle = isVirtual ? 'opacity: 0.7; border-left: 3px solid var(--cyan-glow);' : '';

                segmentEl.innerHTML = `
                    <div class="segment-label">
                        <span class="segment-range">${segment.start}% → ${segment.end}%</span>
                        <span class="segment-length">(${segment.length}%)</span>
                        ${isVirtual ? '<span style="font-size: 10px; color: var(--cyan-glow);">from-0 proven</span>' : `<span class="segment-count">${segment.count}x</span>`}
                    </div>
                    <div class="segment-bar ${reliability}" style="width: ${percentWidth}%; ${segmentStyle}"></div>
                `;
                routeEl.appendChild(segmentEl);

                // Show overlap/touch indicator
                if (idx < bestRoute.runs.length - 1) {
                    const nextSeg = bestRoute.runs[idx + 1];
                    const overlap = segment.end - nextSeg.start;
                    if (overlap > 0) {
                        const indicator = document.createElement('div');
                        indicator.style.cssText = 'text-align: center; color: var(--cyan-glow); font-size: 10px; margin: 2px 0;';
                        indicator.textContent = `↳ overlap ${overlap}%`;
                        routeEl.appendChild(indicator);
                    } else if (nextSeg.start === segment.end) {
                        const indicator = document.createElement('div');
                        indicator.style.cssText = 'text-align: center; color: var(--emerald); font-size: 10px; margin: 2px 0;';
                        indicator.textContent = `→ touches at ${segment.end}%`;
                        routeEl.appendChild(indicator);
                    }
                }
            });
        }
        container.appendChild(routeEl);
        return;
    }

    // Suggested path when no routes but has connecting data
    if (bestFrom0 > 0 && connectingRuns.length > 0) {
        const bestConnect = connectingRuns.sort((a, b) => (b.count || 0) - (a.count || 0))[0];
        container.innerHTML = `
            <div class="route-preview-container">
                <div class="route-preview-header">
                    <span style="font-size: 12px; color: var(--muted-gray);">SUGGESTED PATH</span>
                </div>
                <div class="route-segment animated">
                    <div class="segment-label">
                        <span class="segment-range">0% → ${round1(bestFrom0)}%</span>
                        <span class="segment-length">(${round1(bestFrom0)}%)</span>
                        <span style="font-size: 10px; color: var(--cyan-glow);">from-0 proven</span>
                    </div>
                    <div class="segment-bar high" style="width: ${round1(bestFrom0)}%; opacity: 0.7; border-left: 3px solid var(--cyan-glow);"></div>
                </div>
                <div style="text-align: center; color: var(--muted-gray); font-size: 11px; margin: 4px 0;">▼ ${bestConnect.start < bestFrom0 ? 'overlaps at ' + round1(bestConnect.start) + '%' : 'touches at ' + round1(bestFrom0) + '%'}</div>
                <div class="route-segment animated" style="animation-delay: 0.12s">
                    <div class="segment-label">
                        <span class="segment-range">${bestConnect.start}% → 100%</span>
                        <span class="segment-length">(${bestConnect.length}%)</span>
                    </div>
                    <div class="segment-bar high" style="width: ${bestConnect.length}%"></div>
                    <span class="segment-count">${bestConnect.count}x</span>
                </div>
            </div>
        `;
        return;
    }

    // Only startpos data - explain need for from-0
    if (bestFrom0 === 0 && startposRuns.length > 0) {
        container.innerHTML = '<div class="empty-state">Do full from-0 attempts to unlock route analysis.<br><small>Startpos-only data cannot prove level completion paths.</small></div>';
        return;
    }

    // Only from-0 data - explain need for endgame practice
    if (bestFrom0 > 0 && startposRuns.length === 0) {
        container.innerHTML = `<div class="empty-state">Best from-0: ${round1(bestFrom0)}%<br><small>Practice ${round1(bestFrom0)}-100% with startpos to see completion routes.</small></div>`;
        return;
    }

    container.innerHTML = '<div class="empty-state">Grind to unlock routes</div>';
}

// ============================================================================
// TOP RUNS RENDERING
// ============================================================================

function renderTopRuns(stabilityRuns, lengthRuns) {
    const stabilityContainer = document.getElementById('top-runs-stability');
    stabilityContainer.innerHTML = '';

    if (!stabilityRuns || stabilityRuns.length === 0) {
        stabilityContainer.innerHTML = '<div class="empty-state">No runs data</div>';
    } else {
        stabilityRuns.slice(0, 8).forEach((run, i) => {
            const runEl = document.createElement('div');
            runEl.className = 'run-item';
            runEl.style.animationDelay = `${i * 0.05}s`;
            runEl.innerHTML = `
                <span>${run.start}% - ${run.end}%</span>
                <strong>x${run.count}</strong>
            `;
            stabilityContainer.appendChild(runEl);
        });
    }

    const lengthContainer = document.getElementById('top-runs-length');
    lengthContainer.innerHTML = '';

    if (!lengthRuns || lengthRuns.length === 0) {
        lengthContainer.innerHTML = '<div class="empty-state">No runs data</div>';
    } else {
        lengthRuns.slice(0, 8).forEach((run, i) => {
            const runEl = document.createElement('div');
            runEl.className = 'run-item';
            runEl.style.animationDelay = `${i * 0.05}s`;
            runEl.innerHTML = `
                <span>${run.start}% - ${run.end}%</span>
                <strong>x${run.count}</strong>
            `;
            lengthContainer.appendChild(runEl);
        });
    }

    const distContainer = document.getElementById('from0-distribution');
    distContainer.innerHTML = '<div class="empty-state">View death distribution above</div>';
}

// ============================================================================
// HERO STATS UPDATE
// ============================================================================

function updateHeroStats(results) {
    const statCards = document.querySelectorAll('.hero-stats .stat-card');
    if (!statCards.length) return;

    const values = [
        results.totalAttempts,
        round1(results.bestFrom0) + '%',
        round1(results.readiness) + '%',
        results.routeReliability
    ];

    statCards.forEach((card, index) => {
        const valueEl = card.querySelector('.stat-value');
        if (valueEl && values[index] !== undefined) {
            valueEl.textContent = values[index];
            valueEl.setAttribute('data-animate', '1');
        }
    });

    document.getElementById('hero-best-run').textContent = round1(results.bestFrom0) + '%';
    document.getElementById('hero-readiness').textContent = round1(results.readiness) + '%';
    document.getElementById('hero-progression').textContent = round1(results.coverage) + '%';
    document.getElementById('hero-nerves').textContent = results.nervesTier;

    const deathDist = results.deathDistribution;
    const lateDeaths = deathDist.filter(d => d.start >= 80).reduce((s, d) => s + d.deaths, 0);
    document.getElementById('hero-late-deaths').textContent = lateDeaths || 0;

    const gaps = results.coverageGaps || [];
    document.getElementById('hero-practice-gaps').textContent = gaps.length;

    const hotspot = analysisResults.hotspots && analysisResults.hotspots.weakestSection;
    const worst = hotspot || (deathDist.length > 0 ? deathDist[0] : null);
    document.getElementById('hero-weakest').textContent = worst ? (worst.range || worst.segment || `${worst.start}-${worst.end}`) : '--';
    document.getElementById('hero-confidence').textContent = round1(results.readiness) + '%';
}

// ============================================================================
// CLICKABLE CARDS & DETAIL PAGES
// ============================================================================

function initializeClickableCards() {
    // Cards are now handled in initializeMobileButtonFix for unified touch/mouse support
    // This function is kept for backward compatibility but does nothing extra
    // to avoid duplicate handlers
}

function initializeCardAnimations() {
    const cards = document.querySelectorAll('.dashboard-card, .results-card, .coach-card');
    cards.forEach((card, index) => {
        card.style.setProperty('--card-index', index);
    });
}

function openDetailPage(cardType) {
    document.getElementById('dashboard').classList.add('hidden');
    document.getElementById('results').classList.add('hidden');
    document.getElementById('coach').classList.add('hidden');

    document.querySelectorAll('.detail-page').forEach(page => {
        page.classList.add('hidden');
        page.classList.remove('slide-out');
    });

    const detailPageMap = {
        'session-stats': 'detail-session-stats',
        'readiness': 'detail-readiness',
        'most-stable': 'detail-most-stable',
        'dangerous-segment': 'detail-dangerous-segment',
        'practice-map': 'detail-practice-map',
        'routes': 'detail-routes',
        'choke-points': 'detail-choke-points',
        'death-distribution': 'detail-death-heatmap',
        'death-distribution-detail': 'detail-death-heatmap',
        'progress-trend': 'detail-progress-trend',
        'best-runs': 'detail-best-runs',
        'longest-runs': 'detail-longest-runs',
        'overall-grade': 'detail-overall-grade',
        'pass-rate-chunks': 'detail-pass-rate-chunks',
        'nerve-chart': 'detail-nerve-chart'
    };

    const targetPage = detailPageMap[cardType];
    if (targetPage) {
        const pageElement = document.getElementById(targetPage);
        if (pageElement) {
            pageElement.classList.remove('hidden');
            populateDetailPage(cardType);
            pageElement.scrollTop = 0;
        }
    }
}

function closeDetailPage() {
    const detailPages = document.querySelectorAll('.detail-page');

    detailPages.forEach(page => {
        if (!page.classList.contains('hidden')) {
            page.classList.add('slide-out');
        }
    });

    setTimeout(() => {
        detailPages.forEach(page => {
            page.classList.add('hidden');
            page.classList.remove('slide-out');
        });

        if (analysisResults) {
            document.getElementById('dashboard').classList.remove('hidden');
            document.getElementById('results').classList.remove('hidden');
            document.getElementById('coach').classList.remove('hidden');
            smoothScrollTo('dashboard');
        } else {
            document.getElementById('dashboard').classList.add('hidden');
            document.getElementById('results').classList.add('hidden');
            document.getElementById('coach').classList.add('hidden');
            smoothScrollTo('analyzer');
        }
    }, 400);
}

function populateDetailPage(cardType) {
    if (!analysisResults) return;

    switch (cardType) {
        case 'best-runs': showBestRuns(); break;
        case 'longest-runs': showLongestRuns(); break;
        case 'most-stable': showStableRuns(); break;
        case 'routes': showRoutes(); break;
        case 'death-distribution':
        case 'death-distribution-detail': showDeathHeatmap(); break;
        case 'dangerous-segment': populateDangerousSegment(); break;
        case 'choke-points': populateChokePoints(); break;
        case 'progress-trend': populateProgressTrend(); break;
        case 'session-stats': populateSessionStats(); break;
        case 'readiness': populateReadiness(); break;
        case 'practice-map': populatePracticeMap(); break;
        case 'overall-grade': showOverallGrade(); break;
        case 'pass-rate-chunks': showPassRateChunksDetail(); break;
        case 'nerve-chart': showNerveChartDetail(); break;
    }
}

// ============================================================================
// DETAIL PAGE POPULATION
// ============================================================================

function showBestRuns() {
    const count = parseInt(document.getElementById('best-runs-count').value) || 10;
    const container = document.getElementById('best-runs-detail-list');

    if (!analysisResults || !analysisResults.bestRuns) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const runs = analysisResults.bestRuns.slice(0, count);
    container.innerHTML = runs.map((run, index) => `
        <div class="detail-item" style="animation-delay: ${index * 0.05}s">
            <span>${index + 1}. ${run.start}% - ${run.end}%</span>
            <span class="animated-number">${run.count}x</span>
        </div>
    `).join('');

    animateNumbers();
}

function showLongestRuns() {
    const count = parseInt(document.getElementById('longest-runs-count').value) || 10;
    const container = document.getElementById('longest-runs-detail-list');

    if (!analysisResults || !analysisResults.longestRuns) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const runs = analysisResults.longestRuns.slice(0, count);
    container.innerHTML = runs.map((run, index) => `
        <div class="detail-item" style="animation-delay: ${index * 0.05}s">
            <span>${index + 1}. ${run.start}% - ${run.end}%</span>
            <span class="animated-number">${run.count}x</span>
        </div>
    `).join('');

    animateNumbers();
}

function showStableRuns() {
    const count = parseInt(document.getElementById('stable-runs-count').value) || 10;
    const container = document.getElementById('stable-runs-detail-list');

    if (!analysisResults || !analysisResults.stableRuns) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const runs = analysisResults.stableRuns.slice(0, count);
    container.innerHTML = runs.map((run, index) => {
        const stabilityScore = run?.stabilityScore ? round1(run.stabilityScore) : '--';
        return `
        <div class="detail-item" style="animation-delay: ${index * 0.05}s">
            <span>${index + 1}. ${run.start}% - ${run.end}%</span>
            <span>
                <span class="animated-number">${run.count}</span>x 
                (Score: <span class="animated-number">${stabilityScore}</span>)
            </span>
        </div>
    `}).join('');

    animateNumbers();
}

// ============================================================================
// ROUTE EXPLORER — ENHANCED WITH RELIABILITY
// ============================================================================

function showRoutes() {
    const count = parseInt(document.getElementById('routes-count').value) || 10;
    const container = document.getElementById('routes-detail-list');
    const summaryBanner = document.getElementById('route-summary-banner');

    if (!analysisResults || !analysisResults.routes || analysisResults.routes.length === 0) {
        const bestFrom0 = analysisResults?.bestFrom0 || 0;
        const message = bestFrom0 > 0
            ? `<div class="empty-state">No completion routes found yet.<br/><small>You've reached ${round1(bestFrom0)}% — keep grinding! Once you complete the level, routes will appear here.</small></div>`
            : `<div class="empty-state">No data available</div>`;
        container.innerHTML = message;
        if (summaryBanner) summaryBanner.style.display = 'none';
        return;
    }

    if (summaryBanner) summaryBanner.style.display = 'flex';

    // Update summary banner
    const minSegments = Math.min(...analysisResults.routes.map(r => r.segments));
    const totalWays = analysisResults.routes.length;

    const detailMinRuns = document.getElementById('detail-min-runs');
    const detailTotalWays = document.getElementById('detail-total-ways');
    const detailBestReliability = document.getElementById('detail-best-reliability');

    if (detailMinRuns) detailMinRuns.textContent = minSegments + ' run' + (minSegments !== 1 ? 's' : '');
    if (detailTotalWays) detailTotalWays.textContent = totalWays.toLocaleString();

    // Best reliability = shortest route with highest segment count total
    const sortedRoutes = analysisResults.routes.slice().sort((a, b) => {
        if (a.segments !== b.segments) return a.segments - b.segments;
        const scoreA = (a.runs || []).reduce((s, seg) => s + (seg.count || 0), 0);
        const scoreB = (b.runs || []).reduce((s, seg) => s + (seg.count || 0), 0);
        return scoreB - scoreA;
    });
    const bestRoute = sortedRoutes[0];
    if (detailBestReliability && bestRoute) {
        const reliability = getReliabilityLabel(bestRoute.segments);
        detailBestReliability.textContent = reliability.label;
        detailBestReliability.className = 'summary-value ' + reliability.class;
    }

    const routes = sortedRoutes.slice(0, count);

    container.innerHTML = routes.map((route, index) => {
        const reliability = getReliabilityLabel(route.segments);
        const pathText = route.route ? route.route.join(' → ') : `${route.start}% → ${route.end}%`;
        const reliabilityPercent = Math.max(10, 100 - (route.segments - 1) * 20);

        return `
        <div class="route-detail-item" style="animation-delay: ${index * 0.08}s" onclick="highlightRoute(${index})">
            <div>
                <div class="route-path-text">${pathText}</div>
                <div class="route-segments-text">${route.segments} segments · ${route.start}% → ${route.end}%</div>
            </div>
            <div class="route-reliability">
                <div class="route-reliability-bar">
                    <div class="route-reliability-fill ${reliability.class}" style="width: ${reliabilityPercent}%"></div>
                </div>
                <span class="route-reliability-label ${reliability.class}">${reliability.label}</span>
            </div>
        </div>
    `}).join('');

    animateNumbers();
}

function getReliabilityLabel(segments) {
    if (segments <= 2) return { label: 'High', class: 'high' };
    if (segments <= 4) return { label: 'Medium', class: 'medium' };
    return { label: 'Lower', class: 'low' };
}

function highlightRoute(index) {
    if (!analysisResults || !analysisResults.routes) return;
    const route = analysisResults.routes[index];
    if (!route) return;

    showToast(`Route ${index + 1}: ${route.route ? route.route.join(' → ') : route.start + '% → ' + route.end + '%'}`, 'info');
}

function showDeathHeatmap() {
    const count = parseInt(document.getElementById('death-locations-count').value) || 20;
    const container = document.getElementById('death-heatmap-detail-list');

    if (!analysisResults || !analysisResults.from0Freq) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const deaths = Object.entries(analysisResults.from0Freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, count);

    container.innerHTML = deaths.map(([percent, count], index) => {
        const range = `${Math.max(0, percent - 2)}% - ${Math.min(100, parseInt(percent) + 2)}%`;
        return `
        <div class="detail-item" style="animation-delay: ${index * 0.03}s">
            <span>${index + 1}. ${range}</span>
            <span class="animated-number">${count}</span> deaths
        </div>
    `}).join('');

    animateNumbers();
}

function populateDangerousSegment() {
    const container = document.getElementById('dangerous-segment-detail');

    if (!analysisResults || !analysisResults.from0Freq) {
        container.innerHTML = '<div class="empty-state">No death data available</div>';
        return;
    }

    const hotspot = analysisResults.hotspots && analysisResults.hotspots.weakestSection;
    if (!hotspot) {
        container.innerHTML = '<div class="empty-state">No death data available</div>';
        return;
    }

    const range = hotspot.range || `${hotspot.start}-${hotspot.end}%`;
    const deathCount = hotspot.deaths || 0;
    const failureRate = hotspot.failureRate !== undefined ? `${round1(hotspot.failureRate * 100)}% fail rate` : '';
    const relDiff = hotspot.relativeDifficulty !== undefined ? `${round1(hotspot.relativeDifficulty)}x avg difficulty` : '';
    const spawnNote = analysisResults.hotspots.spawnBiasWarning
        ? '<div class="detail-item" style="animation-delay: 0.2s"><span>Note</span><span>0-10% has high raw deaths but lower true difficulty (spawn bias)</span></div>'
        : '';

    container.innerHTML = `
        <div class="detail-item" style="animation-delay: 0.05s">
            <span><strong>Most Dangerous Segment</strong></span>
            <span style="color: #FF6B9D; font-weight: 600;">${range}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.1s">
            <span>Death Count</span>
            <span class="animated-number" style="color: #FF6B9D; font-weight: 700;">${deathCount}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.15s">
            <span>Failure Density</span>
            <span style="color: #FF4FD8; font-weight: 700;">${failureRate}${failureRate && relDiff ? ' · ' : ''}${relDiff}</span>
        </div>
        ${spawnNote}
    `;

    animateNumbers();
}

function populateChokePoints() {
    const container = document.getElementById('choke-points-detail');

    if (!analysisResults || !analysisResults.bestRuns) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const chokePoints = {};
    analysisResults.bestRuns.forEach(run => {
        const endPercent = run.end;
        chokePoints[endPercent] = (chokePoints[endPercent] || 0) + run.count;
    });

    const sortedChokes = Object.entries(chokePoints).sort((a, b) => b[1] - a[1]).slice(0, 10);

    if (sortedChokes.length === 0) {
        container.innerHTML = '<div class="empty-state">No choke points identified</div>';
        return;
    }

    container.innerHTML = sortedChokes.map(([percent, count], index) => {
        const rate = round1((count / analysisResults.totalAttempts) * 100);
        return `
        <div class="detail-item" style="animation-delay: ${index * 0.05}s">
            <span>${index + 1}. Near ${percent}%</span>
            <span>
                <span class="animated-number">${count}</span> attempts 
                (<span class="animated-number">${rate}</span>%)
            </span>
        </div>
    `}).join('');

    animateNumbers();
}

function populateProgressTrend() {
    const container = document.getElementById('progress-trend-detail');

    if (!analysisResults) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const bestProgress = analysisResults.bestFrom0 || 0;
    const totalAttempts = analysisResults.totalAttempts || 1;
    const efficiency = round1(bestProgress / totalAttempts * 100);

    let trend = 'STABLE';
    let trendColor = '#61D8FF';
    if (efficiency > 1.5) { trend = 'IMPROVING'; trendColor = '#2D6BFF'; }
    else if (efficiency < 0.5) { trend = 'DECLINING'; trendColor = '#FF4FD8'; }

    container.innerHTML = `
        <div class="detail-item" style="animation-delay: 0.05s">
            <span>Best Progress</span>
            <span class="animated-number">${bestProgress}%</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.1s">
            <span>Total Attempts</span>
            <span class="animated-number">${totalAttempts.toLocaleString()}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.15s">
            <span>Efficiency Score</span>
            <span class="animated-number">${efficiency}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.2s">
            <span>Current Trend</span>
            <span class="pulse-element" style="color: ${trendColor}; font-weight: 700;">${trend} <span class="kpi-pulse"></span></span>
        </div>
    `;

    animateNumbers();
}

function populateSessionStats() {
    const container = document.getElementById('session-stats-detail');

    if (!analysisResults) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    container.innerHTML = `
        <div class="detail-item" style="animation-delay: 0.05s">
            <span>Total Attempts</span>
            <span class="animated-number">${analysisResults.totalAttempts.toLocaleString()}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.1s">
            <span>Best From 0</span>
            <span class="animated-number">${round1(analysisResults.bestFrom0)}%</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.15s">
            <span>Startpos Attempts</span>
            <span class="animated-number">${analysisResults.startposAttempts.toLocaleString()}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.2s">
            <span>Completions</span>
            <span class="animated-number">${analysisResults.completions}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.25s">
            <span>From 0 Deaths</span>
            <span class="animated-number">${analysisResults.from0Deaths.toLocaleString()}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.3s">
            <span>Total From 0 Attempts</span>
            <span class="animated-number">${analysisResults.from0Attempts.toLocaleString()}</span>
        </div>
    `;

    animateNumbers();
}

function populateReadiness() {
    const container = document.getElementById('readiness-detail');

    if (!analysisResults) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const readinessScore = analysisResults.readiness || 0;
    const skillTier = analysisResults.skillTier || 'N/A';
    const consistencyTier = analysisResults.consistencyTier || 'N/A';
    const nervesTier = analysisResults.nervesTier || 'N/A';
    const breakdown = analysisResults.readinessBreakdown || {};

    container.innerHTML = `
        <div class="detail-item" style="animation-delay: 0.05s">
            <span>Overall Readiness</span>
            <span class="animated-number" style="font-size: 18px; font-weight: 800;">${readinessScore}%</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.1s">
            <span>Skill Tier</span>
            <span class="pulse-element" style="font-weight: 700;">${skillTier} <span class="kpi-pulse"></span></span>
        </div>
        <div class="detail-item" style="animation-delay: 0.15s">
            <span>Consistency Tier</span>
            <span class="pulse-element" style="font-weight: 700;">${consistencyTier} <span class="kpi-pulse"></span></span>
        </div>
        <div class="detail-item" style="animation-delay: 0.2s">
            <span>Nerves Tier</span>
            <span class="pulse-element" style="font-weight: 700;">${nervesTier} <span class="kpi-pulse"></span></span>
        </div>
        ${breakdown.skill ? `
        <div class="detail-item" style="animation-delay: 0.25s">
            <span>Skill Breakdown</span>
            <span class="animated-number">${breakdown.skill}%</span>
        </div>
        ` : ''}
        ${breakdown.consistency ? `
        <div class="detail-item" style="animation-delay: 0.3s">
            <span>Consistency Breakdown</span>
            <span class="animated-number">${breakdown.consistency}%</span>
        </div>
        ` : ''}
        ${breakdown.ending ? `
        <div class="detail-item" style="animation-delay: 0.35s">
            <span>Ending Breakdown</span>
            <span class="animated-number">${breakdown.ending}%</span>
        </div>
        ` : ''}
        ${breakdown.nerves ? `
        <div class="detail-item" style="animation-delay: 0.4s">
            <span>Nerves Breakdown</span>
            <span class="animated-number">${breakdown.nerves}%</span>
        </div>
        ` : ''}
    `;

    animateNumbers();
}

function populatePracticeMap() {
    const container = document.getElementById('practice-map-detail');

    if (!analysisResults) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    container.innerHTML = '<div class="heatmap-container" id="detail-heatmap" style="height: 80px; margin-bottom: 20px;"></div>';

    const detailHeatmap = document.getElementById('detail-heatmap');
    if (detailHeatmap && analysisResults.from0Freq) {
        // Calculate max deaths for normalization
        const from0Freq = analysisResults.from0Freq || {};
        let maxBlockDeaths = 0;
        for (let b = 0; b < 10; b++) {
            const start = b * 10, end = (b + 1) * 10;
            let blockDeaths = 0;
            for (const [p, c] of Object.entries(from0Freq)) {
                const percent = parseInt(p, 10);
                if (percent >= start && percent < end) blockDeaths += c;
            }
            maxBlockDeaths = Math.max(maxBlockDeaths, blockDeaths);
        }

        for (let b = 0; b < 10; b++) {
            const start = b * 10;
            const end = (b + 1) * 10;
            const segment = analysisResults.segmentData.find(s => s.start === start && s.end === end);

            const segmentEl = document.createElement('div');
            segmentEl.className = 'heatmap-segment';
            segmentEl.setAttribute('data-label', `${start}-${end}`);

            // Calculate death density for this block
            let blockDeaths = 0;
            for (const [p, c] of Object.entries(from0Freq)) {
                const percent = parseInt(p, 10);
                if (percent >= start && percent < end) blockDeaths += c;
            }

            // Use getColorTier from analyzer.js for consistent color assignment based on death density
            const ratio = maxBlockDeaths > 0 ? blockDeaths / maxBlockDeaths : 0;
            const colorTier = typeof getColorTier !== 'undefined' ? getColorTier(ratio) : 
                              (ratio >= 0.7 ? 'high' : ratio >= 0.3 ? 'medium' : ratio > 0 ? 'low' : 'safe');
            segmentEl.classList.add(colorTier);

            const passRate = segment && segment.passRate !== null ? round1(segment.passRate) : null;
            const deathText = blockDeaths > 0 ? `${blockDeaths} deaths` : '0 deaths';
            const passText = passRate !== null ? ` | Pass: ${passRate}%` : '';
            segmentEl.title = `${start}%-${end}%: ${deathText}${passText}`;

            detailHeatmap.appendChild(segmentEl);
        }

        const legend = document.createElement('div');
        legend.className = 'heatmap-legend';
        legend.innerHTML = `
            <div class="legend-item"><div class="legend-color high"></div><span>High Risk</span></div>
            <div class="legend-item"><div class="legend-color medium"></div><span>Medium Risk</span></div>
            <div class="legend-item"><div class="legend-color low"></div><span>Low Risk</span></div>
            <div class="legend-item"><div class="legend-color safe"></div><span>Safe</span></div>
        `;
        container.appendChild(legend);
    } else {
        container.innerHTML = '<div class="empty-state">No heatmap data available</div>';
    }
}

// ============================================================================
// ANIMATED NUMBERS
// ============================================================================

function animateNumbers() {
    const animatedNumbers = document.querySelectorAll('.animated-number');

    animatedNumbers.forEach(el => {
        const text = el.textContent.trim();
        const targetValue = parseFloat(text.replace(/[^0-9.]/g, ''));
        if (isNaN(targetValue)) return;

        const suffix = text.replace(/[0-9.]/g, '');
        const duration = 1200;
        const startTime = performance.now();
        const startValue = 0;

        const animate = (currentTime) => {
            const elapsed = currentTime - startTime;
            const progress = Math.min(elapsed / duration, 1);
            const easeProgress = 1 - Math.pow(1 - progress, 4);
            const currentValue = startValue + (targetValue - startValue) * easeProgress;

            if (targetValue % 1 === 0 || (text.includes('%') && !text.includes('.'))) {
                el.textContent = Math.round(currentValue) + suffix;
            } else {
                el.textContent = safeToFixed(currentValue, 1) + suffix;
            }

            if (progress < 1) {
                requestAnimationFrame(animate);
            } else {
                el.textContent = text;
            }
        };

        requestAnimationFrame(animate);
    });
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function animateValue(element, start, end, duration) {
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const value = Math.floor(easeProgress * (end - start) + start);
        element.textContent = value.toLocaleString();

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        showToast('Copied to clipboard!', 'success');
    }).catch(() => {
        showToast('Failed to copy', 'error');
    });
}
// ============================================================================
// EXPORT SYSTEM v8.3-PRO
// ============================================================================

function exportAnalysisResults() {
    if (!analysisResults) {
        showToast('No analysis data to export. Run an analysis first.', 'warning');
        return;
    }

    const r = analysisResults;
    const lines = [];
    const D = (v) => v !== null && v !== undefined ? v : 'N/A';
    const P = (v) => v !== null && v !== undefined && !isNaN(v) ? round1(v) : 'N/A';

    lines.push('========================================');
    lines.push('       DASHIQ ANALYSIS EXPORT');
    lines.push('           v8.3-PRO');
    lines.push('========================================');
    lines.push('Generated: ' + new Date().toLocaleString());
    lines.push('');

    // ---- OVERALL GRADE ----
    lines.push('OVERALL GRADE');
    lines.push('-------------');
    lines.push(`Grade Tier: ${D(r.overallGrade?.tier)}`);
    lines.push(`Grade Score: ${P(r.overallGrade?.score)}/100`);
    if (r.overallGrade?.breakdown) {
        const b = r.overallGrade.breakdown;
        lines.push(`  - Skill (w=16%): raw=${P(b.skillComponent)} pts → ${P((b.skillComponent||0)*0.16)}`);
        lines.push(`  - Consistency (w=16%): raw=${P(b.consistencyComponent)} pts → ${P((b.consistencyComponent||0)*0.16)}`);
        lines.push(`  - Best From 0 (w=22%): ${P(b.bestFrom0 || r.bestFrom0)}% → ${P(((b.bestFrom0 || r.bestFrom0)||0)*0.22)}`);
        lines.push(`  - Endgame (w=24%, cap=85): raw=${P(b.endgameComponent)} → capped=${P(Math.min(b.endgameComponent||0,85))} → ${P(Math.min(b.endgameComponent||0,85)*0.24)}`);
        lines.push(`  - Route (w=12%, cap=70): raw=${P(b.routeComponent)} → capped=${P(Math.min(b.routeComponent||0,70))} → ${P(Math.min(b.routeComponent||0,70)*0.12)}`);
        lines.push(`  - Coverage (w=10%, cap=80): raw=${P(b.coverageComponent)} → capped=${P(Math.min(b.coverageComponent||0,80))} → ${P(Math.min(b.coverageComponent||0,80)*0.10)}`);
        lines.push(`  [Weights sum to 1.0, caps prevent any single metric from dominating]`);
    }
    lines.push(`Confidence Level: ${D(r.confidenceLevel)}`);
    lines.push('');

    // ---- READINESS & PROBABILITY ----
    lines.push('READINESS & PROBABILITY');
    lines.push('-----------------------');
    lines.push(`Readiness Score: ${P(r.readiness)}%`);
    lines.push(`Completion Probability: ${P(r.completionProbability)}%`);
    lines.push(`Attempt Estimate: ${(r.estimatedAttempts || 0).toLocaleString()}`);
    lines.push(`Confidence Interval: ${D(r.confidenceInterval)}`);
    lines.push(`Estimate Confidence: ${D(r.attemptEstimateConfidence)}`);
    if (r.attemptEstimateBreakdown && typeof r.attemptEstimateBreakdown === 'object' && !r.attemptEstimateBreakdown.fallback) {
        const eb = r.attemptEstimateBreakdown;
        lines.push(`  - Base Estimate: ${D(eb.baseEstimate)}`);
        lines.push(`  - Evidence Multiplier: ${D(eb.evidenceMultiplier)}`);
        lines.push(`  - Skill Modifier: ${P(eb.skillModifier)}`);
        lines.push(`  - Difficulty Modifier: ${P(eb.difficultyModifier)}`);
        lines.push(`  - Route Modifier: ${P(eb.routeModifier)}`);
        lines.push(`  - Duration Multiplier: ${P(eb.durationMultiplier)}`);
    }
    lines.push(`Progress Velocity: ${D(r.progressVelocity?.label)} (${P(r.progressVelocity?.score)})`);
    lines.push(`Volatility: ${D(r.volatility)}`);
    lines.push('');

    // ---- SKILL METRICS ----
    lines.push('SKILL METRICS');
    lines.push('-------------');
    lines.push(`Skill Score: ${P(r.skillScore)}%`);
    lines.push(`Consistency Index: ${P(r.consistency)}%`);
    lines.push(`Skill Tier: ${D(r.skillTier)}`);
    lines.push(`Consistency Tier: ${D(r.consistencyTier)}`);
    lines.push(`Nerves Tier: ${D(r.nervesTier)}`);
    if (r.readinessBreakdown) {
        const rb = r.readinessBreakdown;
        lines.push(`Readiness Breakdown:`);
        lines.push(`  - Skill: ${P(rb.skill)}%`);
        lines.push(`  - Consistency: ${P(rb.consistency)}%`);
        lines.push(`  - Ending: ${P(rb.ending)}%`);
        lines.push(`  - Nerves: ${P(rb.nerves)}%`);
    }
    lines.push('');

    // ---- CONSISTENCY METRICS ----
    lines.push('CONSISTENCY METRICS');
    lines.push('-------------------');
    if (r.phaseConsistency) {
        lines.push(`Phase Consistency Average: ${P(r.phaseConsistency.average)}%`);
        lines.push(`Phase Stability: ${P(r.phaseConsistency.stability)}%`);
    }
    if (r.plateau) {
        lines.push(`Plateau Detected: ${r.plateau.plateau ? 'YES' : 'NO'}`);
        lines.push(`Attempts Since Best: ${(r.plateau.attemptsSinceBest || 0).toLocaleString()}`);
        lines.push(`Plateau Factor: ${P(r.plateau.factor)}`);
    }
    if (r.spikeDensity) {
        lines.push(`Spike Density: ${P(r.spikeDensity.density)}`);
        lines.push(`Spike Count: ${r.spikeDensity.count || 0}`);
    }
    lines.push('');

    // ---- NERVES METRICS ----
    lines.push('NERVES METRICS');
    lines.push('--------------');
    lines.push(`Nerves Tier: ${D(r.nervesTier)}`);
    lines.push(`Nerve Choke Type: ${D(r.nerveChokeType)}`);
    if (r.openingPressure) {
        lines.push(`Opening Pressure Spike: ${r.openingPressure.isolated ? 'YES' : 'NO'} (${P(r.openingPressure.percentage)}%)`);
    }
    if (r.nerveChart && r.nerveChart.length > 0) {
        const criticalZones = r.nerveChart.filter(p => p.riskZone === 'CRITICAL');
        const highestRisk = r.nerveChart.reduce((max, p) => parseFloat(p.nerveScore || 0) > parseFloat(max.nerveScore || 0) ? p : max, r.nerveChart[0]);
        lines.push(`Highest Risk Zone: ${highestRisk.percent || 0}% (${P(highestRisk.nerveScore)} stress)`);
        lines.push(`Critical Zones: ${criticalZones.length}`);
    }
    lines.push('');

    // ---- ENDURANCE & DURATION ----
    lines.push('ENDURANCE & DURATION');
    lines.push('--------------------');
    const dur = r.durationMetrics;
    lines.push(`Endurance Rating: ${dur?.enduranceRating !== null && dur?.enduranceRating !== undefined ? P(dur.enduranceRating) + '%' : 'N/A'}`);
    lines.push(`Death Density (raw): ${dur?.deathDensity?.rawDeathsPerMinute !== null && dur?.deathDensity?.rawDeathsPerMinute !== undefined ? safeToFixed(dur.deathDensity.rawDeathsPerMinute, 2) : 'N/A'}`);
    lines.push(`Death Density (normalized): ${dur?.deathDensity?.normalizedScore !== null && dur?.deathDensity?.normalizedScore !== undefined ? safeToFixed(dur.deathDensity.normalizedScore, 3) : 'N/A'}`);
    lines.push(`Practice Density: ${dur?.practiceDensity !== null && dur?.practiceDensity !== undefined ? safeToFixed(dur.practiceDensity, 2) : 'N/A'}`);
    lines.push(`Duration Category: ${D(r.durationMetadata?.durationCategory)}`);
    lines.push(`Duration Confidence: ${D(r.durationMetadata?.durationConfidence)}`);
    if (dur?.adjustmentCaps) {
        lines.push(`Adjustment Caps: readiness=${dur.adjustmentCaps.readiness}, completion=${dur.adjustmentCaps.completionProbability}, grade=${dur.adjustmentCaps.grade}`);
    }
    lines.push('');

    // ---- DEMON READINESS ----
    lines.push('DEMON READINESS');
    lines.push('---------------');
    if (r.demonReadiness) {
        const demons = [
            { key: 'easy', name: 'Easy Demon' },
            { key: 'medium', name: 'Medium Demon' },
            { key: 'hard', name: 'Hard Demon' },
            { key: 'insane', name: 'Insane Demon' },
            { key: 'extreme', name: 'Extreme Demon' }
        ];
        demons.forEach(d => {
            const data = r.demonReadiness[d.key];
            if (data) {
                lines.push(`${d.name}: ${P(data.readiness)}% (${data.ready ? 'READY' : 'NOT READY'})`);
                if (data.scores) {
                    lines.push(`  Mech: ${P(data.scores.mechanical)}% | Cons: ${P(data.scores.consistency)}% | Endur: ${P(data.scores.endurance)}% | Nerves: ${P(data.scores.nerves)}% | Proof: ${P(data.scores.proof)}%`);
                }
            }
        });
    }
    lines.push('');

    // ---- ROUTE ANALYSIS ----
    lines.push('ROUTE ANALYSIS');
    lines.push('--------------');
    lines.push(`Routes Found: ${r.totalRoutes || r.routes?.length || 0}`);
    lines.push(`Route Count: ${r.routes?.length || 0}`);
    lines.push(`Route Segments (best): ${r.routeSegments || 0}`);
    lines.push(`Route Reliability: ${D(r.routeReliability)}`);
    lines.push(`Coverage Gaps: ${(r.coverageGaps || []).length}`);
    if (r.routes && r.routes.length > 0) {
        lines.push(`Best Route: ${r.routes[0].route ? r.routes[0].route.join(' → ') : 'N/A'}`);
    }
    if (r.sourceSeparation?.sourceCounts) {
        const sc = r.sourceSeparation.sourceCounts;
        lines.push(`Source Counts: from0=${sc.from0 || 0}, startpos=${sc.startpos || 0}, completions=${sc.explicit_completion || 0}`);
    }
    lines.push('');

    // ---- COACH INSIGHTS ----
    lines.push('COACH INSIGHTS');
    lines.push('--------------');
    lines.push(`Next Action: ${D(r.coachSuggestions?.nextAction)}`);
    lines.push(`Biggest Problem: ${D(r.coachSuggestions?.biggestGap)}`);
    lines.push(`Best Practice Route: ${D(r.coachSuggestions?.bestRoute)}`);
    lines.push(`Strong Areas: ${D(r.coachSuggestions?.strongAreas)}`);
    lines.push(`Today Focus: ${D(r.coachSuggestions?.todayFocus)}`);
    lines.push('');

    // ---- WEAKEST SECTION ----
    lines.push('WEAKEST SECTION');
    lines.push('---------------');
    if (r.hotspots?.weakestSection) {
        const w = r.hotspots.weakestSection;
        lines.push(`Range: ${w.range || w.segment || `${w.start}-${w.end}%`}`);
        lines.push(`Deaths: ${w.deaths || 0}`);
        lines.push(`Failure Rate: ${P(w.failureRate)}`);
        lines.push(`Relative Difficulty: ${P(w.relativeDifficulty)}x`);
        lines.push(`Hotspot Score: ${P(w.hotspotScore)}`);
    } else if (r.deathDistribution && r.deathDistribution.length > 0) {
        const d = r.deathDistribution[0];
        lines.push(`Range: ${d.segment || `${d.start}-${d.end}%`}`);
        lines.push(`Deaths: ${d.deaths || 0}`);
        lines.push(`Percentage: ${P(d.percentage)}%`);
    } else {
        lines.push('No data available');
    }
    if (r.deathClusters && r.deathClusters.length > 0) {
        lines.push(`Death Clusters: ${r.deathClusters.length}`);
        r.deathClusters.slice(0, 5).forEach((c, i) => {
            lines.push(`  ${i + 1}. ${c.start}%-${c.end}%: ${c.totalDeaths} deaths (${c.points} points)`);
        });
    }
    lines.push('');

    // ---- DEATH DISTRIBUTION ----
    lines.push('DEATH DISTRIBUTION');
    lines.push('------------------');
    if (r.deathDistribution && r.deathDistribution.length > 0) {
        r.deathDistribution.forEach((d, i) => {
            lines.push(`${i + 1}. ${d.segment || `${d.start}-${d.end}%`}: ${d.deaths} deaths (${P(d.percentage)}%) [${d.riskLevel || 'Unknown'} risk]`);
        });
    } else {
        lines.push('No death data available');
    }
    lines.push('');

    // ---- PASS RATE BY SEGMENT ----
    lines.push('SEGMENT PASS RATES');
    lines.push('------------------');
    if (r.passRateByChunks) {
        r.passRateByChunks.forEach(chunk => {
            const extra = chunk.hasData ? ` | ${chunk.successfulPasses || 0} passes / ${chunk.samples || 0} samples` : '';
            lines.push(`${chunk.chunk}: ${P(chunk.passRate)}% pass (${chunk.deaths || 0} deaths) [${chunk.color || 'unknown'}]${extra}`);
        });
    }
    lines.push('');

    // ---- MOST STABLE RUNS ----
    lines.push('MOST STABLE RUNS (Top 10)');
    lines.push('--------------------------');
    if (r.stableRuns && r.stableRuns.length > 0) {
        r.stableRuns.slice(0, 10).forEach((run, i) => {
            lines.push(`${i + 1}. ${run.start}% - ${run.end}% (x${run.count}, score: ${P(run.stabilityScore)})`);
        });
    } else {
        lines.push('No stable runs data');
    }
    lines.push('');

    // ---- LONGEST RUNS ----
    lines.push('LONGEST RUNS (Top 10)');
    lines.push('---------------------');
    if (r.longestRuns && r.longestRuns.length > 0) {
        r.longestRuns.slice(0, 10).forEach((run, i) => {
            lines.push(`${i + 1}. ${run.start}% - ${run.end}% (length: ${(run.end || 0) - (run.start || 0)}%, x${run.count})`);
        });
    } else {
        lines.push('No longest runs data');
    }
    lines.push('');

    // ---- SESSION OVERVIEW ----
    lines.push('SESSION OVERVIEW');
    lines.push('----------------');
    lines.push(`Total Attempts: ${(r.totalAttempts || 0).toLocaleString()}`);
    lines.push(`Best From 0: ${P(r.bestFrom0)}%`);
    lines.push(`Coverage: ${P(r.coverage)}%`);
    lines.push(`Mode: ${formatMode(r.mode || 'standard')}`);
    lines.push(`Completions: ${r.completions || 0}`);
    lines.push(`From 0 Deaths: ${r.from0Deaths || 0}`);
    lines.push(`Startpos Attempts: ${r.startposAttempts || 0}`);
    lines.push(`From 0 Attempts: ${r.from0Attempts || 0}`);
    if (r.datasetSafeguards) {
        lines.push(`Dataset Confidence: ${D(r.datasetSafeguards.confidenceLevel)}`);
    }
    lines.push('');

    // ---- PERCENTILES ----
    lines.push('PERCENTILES');
    lines.push('-----------');
    if (r.percentiles) {
        lines.push(`P10: ${r.percentiles.p10 || 0}%`);
        lines.push(`P25: ${r.percentiles.p25 || 0}%`);
        lines.push(`P50 (Median): ${r.percentiles.p50 || 0}%`);
        lines.push(`P75: ${r.percentiles.p75 || 0}%`);
        lines.push(`P90: ${r.percentiles.p90 || 0}%`);
        lines.push(`Best: ${r.percentiles.best || 0}%`);
        lines.push(`Mean: ${P(r.percentiles.mean)}%`);
        lines.push(`Std Dev: ${P(r.percentiles.stdDev)}`);
        lines.push(`Total Attempts: ${(r.percentiles.attempts || 0).toLocaleString()}`);
    }
    lines.push('');

    // ---- COVERAGE GAPS ----
    lines.push('COVERAGE GAPS');
    lines.push('-------------');
    if (r.coverageGaps && r.coverageGaps.length > 0) {
        r.coverageGaps.forEach((g, i) => {
            lines.push(`${i + 1}. ${g.start}% - ${g.end}% (${(g.end - g.start)}% gap)`);
        });
    } else {
        lines.push('No coverage gaps identified');
    }
    lines.push('');

    // ---- DEATH CLUSTERS ----
    lines.push('DEATH CLUSTERS');
    lines.push('--------------');
    if (r.deathClusters && r.deathClusters.length > 0) {
        r.deathClusters.forEach((c, i) => {
            lines.push(`${i + 1}. ${c.start}%-${c.end}%: ${c.totalDeaths} deaths (${c.points} points)`);
        });
    } else {
        lines.push('No death clusters identified');
    }
    lines.push('');

    // ---- HOTSPOTS ----
    lines.push('HOTSPOTS');
    lines.push('--------');
    if (r.hotspots?.topHotspots && r.hotspots.topHotspots.length > 0) {
        r.hotspots.topHotspots.forEach((h, i) => {
            lines.push(`${i + 1}. ${h.range || h.segment}: score=${P(h.hotspotScore)}, failures=${P(h.failureRate)}, relDiff=${P(h.relativeDifficulty)}x`);
        });
    } else {
        lines.push('No hotspot data available');
    }
    lines.push('');

    // ---- NERVE CHART DATA ----
    lines.push('NERVE CHART (Stress by Level %)');
    lines.push('---------------------------------');
    if (r.nerveChart && r.nerveChart.length > 0) {
        const critical = r.nerveChart.filter(p => p.riskZone === 'CRITICAL');
        const high = r.nerveChart.filter(p => p.riskZone === 'HIGH');
        lines.push(`Total points: ${r.nerveChart.length}`);
        lines.push(`Critical zones: ${critical.length}`);
        lines.push(`High-risk zones: ${high.length}`);
        lines.push('');
        lines.push('Stress points (every 10%):');
        r.nerveChart.filter((_, i) => i % 5 === 0).forEach(p => {
            lines.push(`  ${p.percent}%: stress=${P(p.nerveScore)} (${p.riskZone})`);
        });
    } else {
        lines.push('No nerve chart data available');
    }
    lines.push('');

    // ---- CONFIDENCE REPORT ----
    lines.push('CONFIDENCE REPORT');
    lines.push('-----------------');
    if (r.confidenceReport) {
        lines.push(`Confidence Level: ${D(r.confidenceReport.confidenceLevel)}`);
        lines.push(`Message: ${D(r.confidenceReport.message)}`);
        lines.push(`Provisional Weights: ${(r.confidenceReport.provisionalWeights || []).join(', ')}`);
        if (r.confidenceReport.sourceAvailability) {
            const sa = r.confidenceReport.sourceAvailability;
            lines.push(`Data Sources: from0=${sa.from0}, startpos=${sa.startpos}, explicitCompletion=${sa.explicitCompletion}`);
        }
    }
    lines.push(`Dataset Confidence: ${D(r.datasetSafeguards?.confidenceLevel)}`);
    lines.push(`Provisional Weights: ${(r.provisionalWeights || []).join(', ')}`);
    lines.push('');

    // ---- SETTINGS / CONFIGURATION ----
    lines.push('SETTINGS');
    lines.push('--------');
    lines.push(`Difficulty: ${D(r._difficultyLabel)} (${r._difficultyMultiplier || 'N/A'}x)`);
    lines.push(`Length Category: ${D(r._lengthCategory) || 'Not set'}`);
    lines.push(`Custom Duration: ${D(r._customDuration) || 'Not set'} ${r._customDurationMode ? '(' + r._customDurationMode + ')' : ''}`);
    lines.push(`Analysis Mode: ${r.mode || 'standard'}`);
    lines.push(`Confidence Level: ${D(r.confidenceLevel)}`);
    lines.push('');

    // ---- RAW INPUT DATA (for debugging) ----
    lines.push('RAW INPUT DATA (first 2000 chars)');
    lines.push('-----------------------------------');
    if (r._rawInput) {
        const raw = r._rawInput.substring(0, 2000);
        lines.push(raw);
        if (r._rawInput.length > 2000) {
            lines.push(`... [truncated: ${(r._rawInput.length - 2000).toLocaleString()} more chars]`);
        }
    } else {
        lines.push('No raw input stored');
    }
    lines.push('');

    lines.push('========================================');
    lines.push('Generated by DashIQ v8.3-PRO');
    lines.push('========================================');

    const blob = new Blob([lines.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `dashiq-analysis-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Analysis exported to .txt file!', 'success');
}


// ============================================================================
// ERROR HANDLING
// ============================================================================

window.addEventListener('error', function (e) {
    if (DEBUG_MODE) console.error('Global error:', e.error);
});

window.addEventListener('unhandledrejection', function (e) {
    if (DEBUG_MODE) console.error('Unhandled promise rejection:', e.reason);
});


// ============================================================================
// PHASE 3: NEW CARD RENDERING FUNCTIONS
// ============================================================================

// Pass Rate Chunks Rendering
function renderPassRateChunks(chunks) {
    const container = document.getElementById('pass-rate-chunks-container');
    if (!container) return;
    container.innerHTML = '';

    chunks.slice(0, 10).forEach((chunk, idx) => {
        const item = document.createElement('div');
        item.className = `pass-rate-chunk-item ${chunk.color}`;
        item.style.animationDelay = `${idx * 0.08}s`;
        item.innerHTML = `
            <div class="pass-rate-label">${chunk.chunk}</div>
            <div class="pass-rate-value">${round1(chunk?.passRate)}% pass</div>
        `;
        container.appendChild(item);
    });
}

// Nerve Chart Preview
function renderNerveChartPreview(chartPoints) {
    if (!chartPoints || chartPoints.length === 0) return;
    
    const criticalZones = chartPoints.filter(p => p.riskZone === 'CRITICAL');
    const highestRisk = chartPoints.reduce((max, p) => parseFloat(p.nerveScore || 0) > parseFloat(max.nerveScore || 0) ? p : max, chartPoints[0]);

    const riskEl = document.getElementById('nerve-highest-risk');
    const countEl = document.getElementById('nerve-critical-count');

    if (riskEl) {
        const score = round1(highestRisk?.nerveScore);
        riskEl.textContent = `${highestRisk.percent || 0}% (${score} stress)`;
    }
    if (countEl) countEl.textContent = criticalZones.length;
}

// Detail page population for new cards
function showOverallGrade() {
    const container = document.getElementById('overall-grade-detail');
    if (!analysisResults || !analysisResults.overallGrade) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const grade = analysisResults.overallGrade;
    const breakdown = grade.breakdown || {};
    const tier = (grade.tier || 'N/A').toLowerCase();
    
    // Calculate weighted contributions for display using calibrated weights
    const skillWeight = 0.16, consWeight = 0.16, bestWeight = 0.22;
    const endWeight = 0.24, routeWeight = 0.12, covWeight = 0.10;
    const bestFrom0Val = analysisResults?.bestFrom0 || 0;
    const skillContrib = P((breakdown?.skillComponent || 0) * skillWeight);
    const consContrib = P((breakdown?.consistencyComponent || 0) * consWeight);
    const bestContrib = P(bestFrom0Val * bestWeight);
    const endContrib = P(Math.min(breakdown?.endgameComponent || 0, 85) * endWeight);
    const routeContrib = P(Math.min(breakdown?.routeComponent || 0, 70) * routeWeight);
    const covContrib = P(Math.min(breakdown?.coverageComponent || 0, 80) * covWeight);

    container.innerHTML = `
        <div class="detail-item" style="animation-delay: 0.05s">
            <span>Overall Tier</span>
            <span class="tier-badge tier-${tier}" style="font-size: 18px; padding: 6px 16px;">${grade.tier || 'N/A'}</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.1s">
            <span>Grade Score</span>
            <span class="animated-number" style="font-size: 18px; font-weight: 800;">${round1(grade?.score)}/100</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.15s">
            <span>Skill (w=${Math.round(skillWeight*100)}%)</span>
            <span class="animated-number">${skillContrib}pts</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.2s">
            <span>Consistency (w=${Math.round(consWeight*100)}%)</span>
            <span class="animated-number">${consContrib}pts</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.25s">
            <span>Best From 0 (w=${Math.round(bestWeight*100)}%)</span>
            <span class="animated-number">${bestContrib}pts</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.3s">
            <span>Endgame (w=${Math.round(endWeight*100)}%, cap=85)</span>
            <span class="animated-number">${endContrib}pts</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.35s">
            <span>Route Confidence (w=${Math.round(routeWeight*100)}%, cap=70)</span>
            <span class="animated-number">${routeContrib}pts</span>
        </div>
        <div class="detail-item" style="animation-delay: 0.4s">
            <span>Coverage (w=${Math.round(covWeight*100)}%, cap=80)</span>
            <span class="animated-number">${covContrib}pts</span>
        </div>
    `;
    animateNumbers();
}

function showPassRateChunksDetail() {
    const container = document.getElementById('pass-rate-chunks-detail');
    if (!analysisResults || !analysisResults.passRateByChunks) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const chunks = analysisResults.passRateByChunks || [];
    container.innerHTML = chunks.map((chunk, idx) => {
        const passRate = round1(chunk?.passRate);
        const riskClass = chunk.passRate >= 80 ? 'safe' : chunk.passRate >= 60 ? 'low' : chunk.passRate >= 30 ? 'medium' : 'high';
        return `
            <div class="detail-item nerve-risk-item ${riskClass}" style="animation-delay: ${idx * 0.05}s">
                <span>${chunk.chunk || 'Unknown Segment'}</span>
                <span class="animated-number">${passRate}% pass (${chunk.deaths || 0} deaths)</span>
            </div>
        `;
    }).join('');
    animateNumbers();
}

function showNerveChartDetail() {
    const container = document.getElementById('nerve-chart-detail');
    if (!analysisResults || !analysisResults.nerveChart) {
        container.innerHTML = '<div class="empty-state">No data available</div>';
        return;
    }

    const chart = (analysisResults.nerveChart || []).filter((_, i) => i % 2 === 0);
    container.innerHTML = chart.map((point, idx) => {
        const riskClass = point.riskZone === 'CRITICAL' ? 'critical' : point.riskZone === 'HIGH' ? 'high' : point.riskZone === 'MEDIUM' ? 'medium' : 'low';
        const nerveScore = round1(point?.nerveScore);
        return `
            <div class="nerve-risk-item ${riskClass}" style="animation-delay: ${idx * 0.05}s">
                <span class="nerve-percent">${point.percent}%</span>
                <span class="nerve-score">${nerveScore} • ${point.riskZone || 'UNKNOWN'}</span>
            </div>
        `;
    }).join('');
    animateNumbers();
}



// ============================================================================
// CANVAS OBSERVERS — v8.3 Mobile Robustness
// ResizeObserver + IntersectionObserver for hidden tab / mobile rendering
// ============================================================================

let _canvasResizeObserver = null;
let _canvasIntersectionObserver = null;
let _lastCanvasResults = null;

function setupCanvasObservers(results) {
    _lastCanvasResults = results;

    // Disconnect previous observers to prevent duplicates
    if (_canvasResizeObserver) { _canvasResizeObserver.disconnect(); _canvasResizeObserver = null; }
    if (_canvasIntersectionObserver) { _canvasIntersectionObserver.disconnect(); _canvasIntersectionObserver = null; }

    const nerveCanvas = document.getElementById('nerve-visualization');
    const skillCanvas = document.getElementById('skill-curve-canvas');
    const canvases = [nerveCanvas, skillCanvas].filter(Boolean);

    if (canvases.length === 0) return;

    // BUG FIX v8.3: Retry render with exponential backoff for mobile browsers
    function retryRender(attempts) {
        if (!_lastCanvasResults) return;
        const nerve = document.getElementById('nerve-visualization');
        const skill = document.getElementById('skill-curve-canvas');

        let nerveRendered = false, skillRendered = false;

        if (nerve) {
            const rect = nerve.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && nerve.clientWidth > 0) {
                nerveRendered = renderNerveVisualization(_lastCanvasResults.nerveChart || [], _lastCanvasResults.passRateByChunks || []) === true;
            }
        }
        if (skill) {
            const rect = skill.getBoundingClientRect();
            if (rect.width > 0 && rect.height > 0 && skill.clientWidth > 0) {
                skillRendered = renderSkillProgressionCurve(_lastCanvasResults) === true;
            }
        }

        if ((!nerveRendered || !skillRendered) && attempts < 5) {
            setTimeout(() => retryRender(attempts + 1), Math.pow(2, attempts) * 100);
        }
    }

    // ResizeObserver: re-render when container size changes
    if (typeof ResizeObserver !== 'undefined') {
        _canvasResizeObserver = new ResizeObserver((entries) => {
            let shouldRender = false;
            for (const entry of entries) {
                const rect = entry.contentRect;
                if (rect.width > 0 && rect.height > 0) {
                    shouldRender = true;
                }
            }
            if (shouldRender && _lastCanvasResults) {
                // Debounce: wait for resize to settle
                clearTimeout(window._canvasRenderTimeout);
                window._canvasRenderTimeout = setTimeout(() => {
                    retryRender(0);
                }, 150);
            }
        });
        canvases.forEach(c => _canvasResizeObserver.observe(c.parentElement || c));
    }

    // IntersectionObserver: re-render when canvas becomes visible (tab switch, scroll)
    if (typeof IntersectionObserver !== 'undefined') {
        _canvasIntersectionObserver = new IntersectionObserver((entries) => {
            for (const entry of entries) {
                if (entry.isIntersecting && _lastCanvasResults) {
                    const canvas = entry.target;
                    // Re-render with retry logic for mobile
                    clearTimeout(window._canvasRenderTimeout);
                    window._canvasRenderTimeout = setTimeout(() => {
                        retryRender(0);
                    }, 100);
                }
            }
        }, { threshold: 0.1 });
        canvases.forEach(c => _canvasIntersectionObserver.observe(c));
    }

    // Initial retry render for mobile browsers that need time to layout
    setTimeout(() => retryRender(0), 300);
}

// Window resize handler for orientation changes
window.addEventListener('resize', () => {
    if (_lastCanvasResults) {
        clearTimeout(window._canvasRenderTimeout);
        window._canvasRenderTimeout = setTimeout(() => {
            renderNerveVisualization(_lastCanvasResults.nerveChart || [], _lastCanvasResults.passRateByChunks || []);
            renderSkillProgressionCurve(_lastCanvasResults);
        }, 200);
    }
});

// Visibility change: re-render when tab becomes visible
window.addEventListener('visibilitychange', () => {
    if (!document.hidden && _lastCanvasResults) {
        setTimeout(() => {
            renderNerveVisualization(_lastCanvasResults.nerveChart || [], _lastCanvasResults.passRateByChunks || []);
            renderSkillProgressionCurve(_lastCanvasResults);
        }, 100);
    }
});

// ============================================================================
// ZIP DOWNLOAD FUNCTIONALITY
// ============================================================================

function downloadProjectZip() {
    // Create a simple zip-like structure using data URIs
    const files = {
        'index.html': document.documentElement.outerHTML,
        'analyzer.js': typeof analyzeInput !== 'undefined' ? analyzeInput.toString() : '',
        'main.js': '(main.js content - see browser source)',
        'styles.css': '(styles.css content - see browser source)'
    };

    // Create a simple text-based "zip" manifest
    let manifest = 'DASHIQ PROJECT FILES\n';
    manifest += '===================\n\n';
    manifest += 'This is a single-file web application.\n';
    manifest += 'To use offline: Save this page (Ctrl+S) as "Webpage, Complete"\n';
    manifest += 'or use the browser\'s "Save As" feature.\n\n';
    manifest += 'Files included:\n';
    manifest += '- index.html (main page)\n';
    manifest += '- analyzer.js (analysis engine)\n';
    manifest += '- main.js (UI controller)\n';
    manifest += '- styles.css (styling)\n\n';
    manifest += 'To get individual files, use browser DevTools (F12) > Sources tab.\n';

    const blob = new Blob([manifest], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'dashiq-project-info.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    showToast('Project info downloaded! For full zip, use browser Save As (Ctrl+S)', 'info', 5000);
}

// Add keyboard shortcut for zip download
document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        downloadProjectZip();
    }
});
