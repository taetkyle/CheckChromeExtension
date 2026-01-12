console.log("Gemini Co-Pilot: Loaded (Buffer UI)");

// ---------------------------------------------------------
// 1. STYLES
// ---------------------------------------------------------
const style = document.createElement("style");
style.textContent = `
  ::highlight(state-ready) {
    text-decoration: underline wavy #fbbc04;
    text-decoration-thickness: 2px;
    cursor: pointer;
    background-color: rgba(251, 188, 4, 0.1);
  }

  #copilot-tooltip {
    position: fixed;
    z-index: 10000;
    background: white;
    color: #202124;
    padding: 0;
    border-radius: 12px;
    box-shadow: 0 8px 24px rgba(0,0,0,0.2);
    font-family: 'Google Sans', Roboto, sans-serif;
    font-size: 13px;
    display: none;
    opacity: 0; /* Hidden by default for fade-in */
    max-width: 400px; 
    min-width: 300px;
    border: 1px solid #e0e0e0;
    pointer-events: auto; /* Allow mouse interaction inside */
    overflow: hidden;
    transition: opacity 0.2s ease; /* Smooth Fade */
  }

  .tooltip-header { padding: 12px 16px; background: #f8f9fa; border-bottom: 1px solid #eee; display: flex; justify-content: space-between; align-items: center; }
  .tooltip-title { font-weight: 600; font-size: 13px; color: #444; }
  .tooltip-body { padding: 16px; }

  /* Score Bar */
  .score-bg { background: #e0e0e0; height: 6px; border-radius: 3px; overflow: hidden; margin-top: 8px; }
  .score-fill { height: 100%; transition: width 0.5s ease; border-radius: 3px; }
  
  .missing-container { margin-top: 10px; display: flex; flex-wrap: wrap; gap: 4px; }
  .missing-tag { background: #fce8e6; color: #c5221f; padding: 2px 8px; border-radius: 12px; font-size: 11px; font-weight: 500; }

  .suggestion-box { background: #f1f3f4; color: #333; padding: 10px; border-radius: 6px; font-family: 'Consolas', monospace; font-size: 11px; line-height: 1.4; max-height: 250px; overflow-y: auto; border-left: 4px solid #1a73e8; white-space: pre-wrap; }

  .tooltip-footer { padding: 8px 16px; background: #fff; border-top: 1px solid #eee; color: #666; font-size: 11px; display: flex; align-items: center; }
  .key-badge { background: #fff; border: 1px solid #dadce0; border-radius: 4px; padding: 1px 5px; font-size: 10px; font-weight: 700; margin-right: 6px; box-shadow: 0 1px 1px rgba(0,0,0,0.1); }
`;
document.head.appendChild(style);

const tooltip = document.createElement("div");
tooltip.id = "copilot-tooltip";
document.body.appendChild(tooltip);

// ---------------------------------------------------------
// 2. LOGIC VARIABLES
// ---------------------------------------------------------
let typingTimer;
let activeRange = null; 
let currentState = 0;   
// 0=Idle, 1=Ready, 2=Loading, 3=Scored, 4=Suggestion
let analysisResult = null;

// Hover Management
let isHoveringHighlight = false; 
let hideTimer = null;
const BUFFER_DELAY = 300; // 300ms grace period

// ---------------------------------------------------------
// 3. EVENT LISTENERS
// ---------------------------------------------------------

// A. TYPING
document.addEventListener('input', (e) => {
    const inputBox = document.querySelector('div[contenteditable="true"]');
    if (inputBox && inputBox.contains(e.target)) {
        resetSystem(); 
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            if(inputBox.innerText.length > 5) activateReadyState(inputBox);
        }, 1500);
    }
});

// B. HOVER (BUFFERED & ROBUST)
document.addEventListener('mousemove', (e) => {
    if (currentState === 0 || !activeRange) {
        if (tooltip.style.display === "block") hideTooltip();
        return;
    }

    // 1. Check if mouse is over the Text Highlight
    let isOverText = false;
    let targetRect = null;
    for (const rect of activeRange.getClientRects()) {
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            isOverText = true;
            targetRect = rect; 
            break;
        }
    }

    // 2. Check if mouse is inside the Tooltip itself
    const isOverTooltip = tooltip.contains(e.target);

    // 3. DECISION LOGIC
    if (isOverText || isOverTooltip) {
        // WE ARE "SAFE" (Inside buffer zone)
        
        // Cancel any pending close command immediately
        if (hideTimer) {
            clearTimeout(hideTimer);
            hideTimer = null;
        }

        // If we weren't already showing it, show it now
        if (!isHoveringHighlight && isOverText) {
            isHoveringHighlight = true;
            positionTooltip(targetRect);
            showTooltip();
        }
    } 
    else {
        // WE ARE "OUTSIDE" (Left the safe zone)
        
        // Only start the close timer if we are currently showing AND timer isn't already running
        if (isHoveringHighlight && !hideTimer) {
            hideTimer = setTimeout(() => {
                hideTooltip();
                isHoveringHighlight = false;
                hideTimer = null;
            }, BUFFER_DELAY);
        }
    }
});

// C. KEYBOARD
document.addEventListener('keydown', (e) => {
    // Only capture Tab if tooltip is visible (opacity check deals with fade out)
    if (e.key === 'Tab' && activeRange && tooltip.style.opacity === '1') {
        e.preventDefault();
        e.stopPropagation();

        if (currentState === 1) {
            currentState = 2;
            updateUI("loading");
            chrome.runtime.sendMessage(
                { action: "analyzeText", text: activeRange.toString() },
                (response) => {
                    if (response && response.success) {
                        analysisResult = response.data;
                        currentState = 3;
                        updateUI("scored");
                        repositionIfVisible(); 
                    } else {
                        alert("Error: " + (response.error || "Unknown"));
                        resetSystem();
                    }
                }
            );
        } else if (currentState === 3) {
            currentState = 4;
            updateUI("suggestion");
            repositionIfVisible();
        } else if (currentState === 4) {
            applyReplacement();
        }
    }
});

// ---------------------------------------------------------
// 4. POSITIONING & ANIMATION
// ---------------------------------------------------------

function showTooltip() {
    tooltip.style.display = "block";
    // Small delay to allow 'display: block' to render before opacity transition
    setTimeout(() => {
        tooltip.style.opacity = "1";
    }, 10);
}

function hideTooltip() {
    tooltip.style.opacity = "0";
    // Wait for fade out transition (200ms) before removing from DOM flow
    setTimeout(() => {
        // Only hide if we haven't come back in the meantime
        if (!hideTimer && !isHoveringHighlight) {
            tooltip.style.display = "none";
        }
    }, 200);
}

function repositionIfVisible() {
    if(tooltip.style.opacity === '1' && activeRange) {
        const rects = activeRange.getClientRects();
        if(rects.length > 0) {
            positionTooltip(rects[0]);
        }
    }
}

function positionTooltip(targetRect) {
    const tooltipRect = tooltip.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const gap = 8;

    // Use dimensions even if hidden (getBoundingClientRect works if display block)
    // We force display block briefly if needed, but here we assume it's just called on entry
    
    let top = targetRect.bottom + gap;
    let left = targetRect.left;

    if (left + tooltipRect.width > viewportWidth - 20) {
        left = targetRect.right - tooltipRect.width;
    }
    left = Math.max(10, left); 

    if (top + tooltipRect.height > viewportHeight - 20) {
        top = targetRect.top - tooltipRect.height - gap;
    }
    top = Math.max(10, top);

    tooltip.style.left = `${left}px`;
    tooltip.style.top = `${top}px`;
}

// ---------------------------------------------------------
// 5. UI RENDERER
// ---------------------------------------------------------
function updateUI(mode) {
    let header = "", body = "", footer = "";

    if (mode === "loading") {
        header = `<span style="color:#1a73e8">✨ Analyzing...</span>`;
        body = `Getting insights from Gemini...`;
    } else if (mode === "scored") {
        const score = analysisResult.score || 0;
        const color = score > 75 ? '#137333' : (score > 40 ? '#f9ab00' : '#c5221f');
        const missingHtml = analysisResult.missing?.length 
            ? analysisResult.missing.map(m => `<span class="missing-tag">${m}</span>`).join('') 
            : '<span style="color:#137333; font-weight:bold;">Perfect structure!</span>';

        header = `<span>Prompt Score: <span style="color:${color}">${score}/100</span></span>`;
        body = `<div class="score-bg"><div class="score-fill" style="width:${score}%; background:${color};"></div></div>
                <div style="margin-top:12px; font-size:11px; color:#555; font-weight:bold;">MISSING ELEMENTS:</div>
                <div class="missing-container">${missingHtml}</div>`;
        footer = `<span class="key-badge">TAB</span> to view suggestion`;
    } else if (mode === "suggestion") {
        header = `<span>Suggested Upgrade</span>`;
        body = `<div class="suggestion-box">${analysisResult.refined}</div>`;
        footer = `<span class="key-badge">TAB</span> to replace text`;
    }

    tooltip.innerHTML = `
        <div class="tooltip-header"><div class="tooltip-title">${header}</div></div>
        <div class="tooltip-body">${body}</div>
        ${footer ? `<div class="tooltip-footer">${footer}</div>` : ''}
    `;
}

// ---------------------------------------------------------
// 6. HELPERS
// ---------------------------------------------------------
function resetSystem() {
    currentState = 0;
    activeRange = null;
    analysisResult = null;
    isHoveringHighlight = false;
    clearTimeout(hideTimer);
    tooltip.style.opacity = "0";
    setTimeout(() => { tooltip.style.display = "none"; }, 200);
    if (CSS.highlights) CSS.highlights.clear();
}

function activateReadyState(rootElement) {
    if (!CSS.highlights) return;
    activeRange = new Range();
    activeRange.selectNodeContents(rootElement);
    const highlight = new Highlight(activeRange);
    CSS.highlights.set("state-ready", highlight);
    currentState = 1;
    
    tooltip.innerHTML = `
        <div class="tooltip-header"><div class="tooltip-title" style="color:#e37400">Analyze Prompt</div></div>
        <div class="tooltip-body" style="font-size:12px;">Check for missing context & weak phrasing.</div>
        <div class="tooltip-footer"><span class="key-badge">TAB</span> to start</div>
    `;
}

function applyReplacement() {
    const inputBox = document.querySelector('div[contenteditable="true"]');
    if(inputBox) inputBox.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(activeRange);
    document.execCommand('insertText', false, analysisResult.refined);
    resetSystem();
}