console.log("Gemini Prompt Analyzer: Loaded");

// ---------------------------------------------------------
// 1. CSS STYLES
// ---------------------------------------------------------
const style = document.createElement("style");
style.textContent = `
  /* Highlight the WHOLE prompt */
  ::highlight(search-highlight) {
    text-decoration: underline wavy green;
    text-decoration-thickness: 1px;
    text-underline-offset: 3px;
    background-color: rgba(0, 255, 0, 0.05); /* Slight green tint */
    color: inherit;
    cursor: pointer;
  }

  /* Complex Metric Tooltip */
  #gemini-extension-tooltip {
    position: fixed;
    z-index: 10000;
    background: #fff;
    color: #333;
    padding: 12px;
    border-radius: 8px;
    border: 1px solid #e0e0e0;
    font-family: 'Segoe UI', sans-serif;
    font-size: 13px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    display: none;
    min-width: 200px;
    pointer-events: none; /* Let mouse pass through */
  }

  /* Metric Rows */
  .metric-row { display: flex; justify-content: space-between; margin-bottom: 4px; }
  .metric-label { color: #666; }
  .metric-val { font-weight: bold; color: #1a73e8; }
  
  /* Divider Line */
  .divider { height: 1px; background: #eee; margin: 8px 0; }

  /* Hint Text at bottom */
  .hint-text { font-size: 11px; color: #888; display: flex; align-items: center; }
  .key-tag { background: #eee; border: 1px solid #ccc; border-radius: 3px; padding: 0 4px; font-size: 9px; margin-right: 5px; font-weight: bold; }

  /* Preview Mode Styling */
  .preview-box { font-style: italic; color: #555; background: #f9f9f9; padding: 8px; border-left: 3px solid #1a73e8; margin-bottom: 8px; }
`;
document.head.appendChild(style);

// Create the Tooltip Container
const tooltip = document.createElement("div");
tooltip.id = "gemini-extension-tooltip";
document.body.appendChild(tooltip);

// ---------------------------------------------------------
// 2. STATE MANAGEMENT
// ---------------------------------------------------------
let typingTimer;
const DONE_TYPING_INTERVAL = 1500; 
let activeRange = null; // Stores the WHOLE prompt range
let tabState = 0; // 0 = Info View, 1 = Preview Mode

// The text we will swap in
const REPLACEMENT_TEXT = "This information will be changed.";

// ---------------------------------------------------------
// 3. EVENT LISTENERS
// ---------------------------------------------------------

// A. TYPING (Debounce)
document.addEventListener('input', (e) => {
    const inputBox = document.querySelector('div[contenteditable="true"]');
    if (inputBox && inputBox.contains(e.target)) {
        clearTimeout(typingTimer);
        tooltip.style.display = "none";
        tabState = 0; // Reset state on typing
        
        typingTimer = setTimeout(() => {
            analyzePrompt(inputBox);
        }, DONE_TYPING_INTERVAL);
    }
});

// B. MOUSE MOVE (Hover)
document.addEventListener('mousemove', (e) => {
    if (!activeRange) {
        tooltip.style.display = "none";
        return;
    }

    let isHovering = false;
    const rects = activeRange.getClientRects();
    
    // Check if mouse is over ANY part of the highlighted paragraph
    for (const rect of rects) {
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            
            // Only update position if we are NOT in preview mode (keeps it stable)
            updateTooltipContent(); 
            // Position tooltip near the mouse, but slightly offset
            tooltip.style.left = `${e.clientX + 15}px`;
            tooltip.style.top = `${e.clientY + 15}px`;
            tooltip.style.display = "block";
            isHovering = true;
            break;
        }
    }

    if (!isHovering) {
        tooltip.style.display = "none";
        tabState = 0; // Reset to initial state if mouse leaves
    }
});

// C. KEYBOARD (Tab Handler)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && activeRange && tooltip.style.display === 'block') {
        e.preventDefault();
        e.stopPropagation();

        if (tabState === 0) {
            // STATE 0 -> 1: Show Preview
            tabState = 1;
            updateTooltipContent();
        } else if (tabState === 1) {
            // STATE 1 -> ACTION: Replace Text
            applyReplacement();
        }
    }
});

// ---------------------------------------------------------
// 4. CORE LOGIC
// ---------------------------------------------------------

function analyzePrompt(rootElement) {
    if (!CSS.highlights) return;
    
    const text = rootElement.innerText.toLowerCase();
    
    // 1. Count Apples
    const count = (text.match(/apple/g) || []).length;

    // 2. Logic: If less than 3, Clear Highlights and Exit
    if (count < 3) {
        CSS.highlights.clear();
        activeRange = null;
        return;
    }

    // 3. If 3+, Highlight EVERYTHING
    activeRange = new Range();
    activeRange.selectNodeContents(rootElement); // Select all text inside
    
    const highlight = new Highlight(activeRange);
    CSS.highlights.set("search-highlight", highlight);
}

function updateTooltipContent() {
    if (tabState === 0) {
        // VIEW 1: METRICS
        tooltip.innerHTML = `
            <div class="metric-row"><span class="metric-label">Accuracy:</span> <span class="metric-val">Low</span></div>
            <div class="metric-row"><span class="metric-label">Precision:</span> <span class="metric-val">Weak</span></div>
            <div class="metric-row"><span class="metric-label">Detail:</span> <span class="metric-val">Vague</span></div>
            <div class="divider"></div>
            <div class="hint-text"><span class="key-tag">TAB</span> Preview Fix</div>
        `;
    } else {
        // VIEW 2: PREVIEW
        tooltip.innerHTML = `
            <div style="font-weight:bold; margin-bottom:5px;">Preview Change:</div>
            <div class="preview-box">"${REPLACEMENT_TEXT}"</div>
            <div class="divider"></div>
            <div class="hint-text"><span class="key-tag">TAB</span> Apply Change</div>
        `;
    }
}

function applyReplacement() {
    const inputBox = document.querySelector('div[contenteditable="true"]');
    if(inputBox) inputBox.focus();

    // Select the whole range
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(activeRange);

    // Replace
    document.execCommand('insertText', false, REPLACEMENT_TEXT);

    // Cleanup
    selection.removeAllRanges();
    CSS.highlights.clear();
    tooltip.style.display = "none";
    activeRange = null;
    tabState = 0;
}