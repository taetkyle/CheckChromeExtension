console.log("Gemini Co-Pilot: Loaded (Message Mode)");

// ---------------------------------------------------------
// 1. STYLES (Same as before)
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
    padding: 12px 16px;
    border-radius: 12px;
    box-shadow: 0 4px 15px rgba(0,0,0,0.15);
    font-family: 'Google Sans', Roboto, sans-serif;
    font-size: 14px;
    display: none;
    max-width: 320px;
    border: 1px solid #e0e0e0;
    pointer-events: none;
    transition: all 0.2s ease;
  }
  .key-badge { background: #f1f3f4; border: 1px solid #dadce0; border-radius: 4px; padding: 2px 6px; font-size: 10px; font-weight: 700; color: #5f6368; margin-right: 8px; }
  .status-ready { color: #e37400; font-weight: 600; }
  .status-loading { color: #1a73e8; font-style: italic; }
  .status-result { color: #137333; font-weight: 600; }
  .preview-text { display: block; margin-top: 8px; padding: 8px; background: #f8f9fa; border-left: 3px solid #137333; font-style: italic; color: #444; font-size: 13px; line-height: 1.4; }
`;
document.head.appendChild(style);

const tooltip = document.createElement("div");
tooltip.id = "copilot-tooltip";
document.body.appendChild(tooltip);

// ---------------------------------------------------------
// 2. LOGIC
// ---------------------------------------------------------
let typingTimer;
let activeRange = null; 
let currentState = 0;   
let generatedSummary = ""; 

// A. TYPING
document.addEventListener('input', (e) => {
    const inputBox = document.querySelector('div[contenteditable="true"]');
    if (inputBox && inputBox.contains(e.target)) {
        resetSystem(); 
        clearTimeout(typingTimer);
        typingTimer = setTimeout(() => {
            if(inputBox.innerText.length > 15) {
                activateReadyState(inputBox);
            }
        }, 1500);
    }
});

// B. HOVER
document.addEventListener('mousemove', (e) => {
    if (currentState === 0 || !activeRange) {
        tooltip.style.display = "none";
        return;
    }
    let isHovering = false;
    for (const rect of activeRange.getClientRects()) {
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            tooltip.style.left = `${e.clientX + 20}px`;
            tooltip.style.top = `${e.clientY + 20}px`;
            tooltip.style.display = "block";
            isHovering = true;
            break;
        }
    }
    if (!isHovering) tooltip.style.display = "none";
});

// C. KEYBOARD (Tab)
document.addEventListener('keydown', (e) => {
    if (e.key === 'Tab' && activeRange && tooltip.style.display === 'block') {
        e.preventDefault();
        e.stopPropagation();

        if (currentState === 1) {
            // STATE 1 -> 2 (Loading)
            updateTooltipUI("loading");
            currentState = 2;

            const currentText = activeRange.toString();
            
            // SEND MESSAGE TO BACKGROUND SCRIPT
            chrome.runtime.sendMessage(
                { action: "analyzeText", text: currentText },
                (response) => {
                    if (response && response.success) {
                        generatedSummary = response.data;
                        currentState = 3;
                        updateTooltipUI("review");
                    } else {
                        generatedSummary = "Error: " + (response.error || "Unknown");
                        updateTooltipUI("review"); // Show error in review box
                    }
                }
            );

        } else if (currentState === 3) {
            applyReplacement();
        }
    }
});

function resetSystem() {
    currentState = 0;
    activeRange = null;
    generatedSummary = "";
    tooltip.style.display = "none";
    if (CSS.highlights) CSS.highlights.clear();
}

function activateReadyState(rootElement) {
    if (!CSS.highlights) return;
    activeRange = new Range();
    activeRange.selectNodeContents(rootElement);
    const highlight = new Highlight(activeRange);
    CSS.highlights.set("state-ready", highlight);
    currentState = 1;
    updateTooltipUI("ready");
}

function updateTooltipUI(mode) {
    if (mode === "ready") {
        tooltip.innerHTML = `<div class="status-ready">Analyze Prompt</div><div style="font-size:12px; color:#666; margin-top:4px;"><span class="key-badge">TAB</span> to refine</div>`;
    } else if (mode === "loading") {
        tooltip.innerHTML = `<div class="status-loading">✨ Gemini is thinking...</div>`;
    } else if (mode === "review") {
        tooltip.innerHTML = `<div class="status-result">Analysis Complete</div><span class="preview-text">${generatedSummary}</span><div style="font-size:12px; color:#666; margin-top:8px;"><span class="key-badge">TAB</span> to replace</div>`;
    }
}

function applyReplacement() {
    const inputBox = document.querySelector('div[contenteditable="true"]');
    if(inputBox) inputBox.focus();
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(activeRange);
    document.execCommand('insertText', false, generatedSummary);
    resetSystem();
}