console.log("Gemini Tab-Action Highlighter: Loaded");

// ---------------------------------------------------------
// 1. SETUP: Styles
// ---------------------------------------------------------
const style = document.createElement("style");
style.textContent = `
  /* Green Wavy Underline */
  ::highlight(search-highlight) {
    text-decoration: underline wavy green;
    text-decoration-thickness: 1px;
    background-color: transparent;
    color: inherit;
    cursor: pointer;
  }

  /* The "Press Tab" Hint */
  #gemini-extension-tooltip {
    position: fixed;
    z-index: 10000;
    background: #333;
    color: white;
    padding: 6px 10px;
    border-radius: 4px;
    font-family: 'Segoe UI', sans-serif;
    font-size: 12px;
    pointer-events: none; /* Let mouse pass through it */
    display: none;
    box-shadow: 0 2px 5px rgba(0,0,0,0.2);
  }

  /* Key visual hint */
  .key-hint {
    background: #555;
    border: 1px solid #777;
    border-radius: 3px;
    padding: 0 4px;
    font-size: 10px;
    margin-right: 5px;
    text-transform: uppercase;
  }
`;
document.head.appendChild(style);

// Create the Tooltip (Visual Only)
const tooltip = document.createElement("div");
tooltip.id = "gemini-extension-tooltip";
tooltip.innerHTML = `<span class="key-hint">Tab</span> Change to <strong>Banana</strong>`;
document.body.appendChild(tooltip);

// ---------------------------------------------------------
// 2. LOGIC: Variables
// ---------------------------------------------------------
let typingTimer;
const DONE_TYPING_INTERVAL = 2000; // 2 seconds
let activeRanges = []; 
let currentHoveredRange = null; // We track exactly what you are hovering

// ---------------------------------------------------------
// 3. EVENT LISTENERS
// ---------------------------------------------------------

// A. TYPING: Debounce logic to update highlights
document.addEventListener('input', (e) => {
    const inputBox = document.querySelector('div[contenteditable="true"]');
    if (inputBox && inputBox.contains(e.target)) {
        clearTimeout(typingTimer);
        // Hide tooltip while typing
        tooltip.style.display = "none";
        
        typingTimer = setTimeout(() => {
            highlightWord(inputBox, "apple");
        }, DONE_TYPING_INTERVAL);
    }
});

// B. MOUSE MOVE: Track if we are hovering over an "apple"
document.addEventListener('mousemove', (e) => {
    // If no apples exist, hide and exit
    if (activeRanges.length === 0) {
        tooltip.style.display = "none";
        currentHoveredRange = null;
        return;
    }

    let isHovering = false;

    for (const range of activeRanges) {
        const rects = range.getClientRects();
        for (const rect of rects) {
            // Check collision
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                
                showTooltip(rect);
                currentHoveredRange = range;
                isHovering = true;
                break;
            }
        }
        if (isHovering) break;
    }

    if (!isHovering) {
        tooltip.style.display = "none";
        currentHoveredRange = null;
    }
});

// C. KEYBOARD: The "Tab" Trigger
document.addEventListener('keydown', (e) => {
    // 1. Check if user pressed TAB
    if (e.key === 'Tab') {
        // 2. Check if they are currently hovering over an "apple"
        if (currentHoveredRange) {
            e.preventDefault(); // Stop the Tab from moving focus elsewhere
            e.stopPropagation(); // Stop other events
            
            replaceRangeWith(currentHoveredRange, "banana");
        }
    }
});

// ---------------------------------------------------------
// 4. CORE FUNCTIONS
// ---------------------------------------------------------

function highlightWord(rootElement, searchWord) {
    if (!CSS.highlights) return;

    activeRanges = [];
    const walker = document.createTreeWalker(rootElement, NodeFilter.SHOW_TEXT, null, false);
    let currentNode = walker.nextNode();

    while (currentNode) {
        const text = currentNode.textContent.toLowerCase();
        let startIndex = 0;
        let index;

        while ((index = text.indexOf(searchWord, startIndex)) > -1) {
            const range = new Range();
            range.setStart(currentNode, index);
            range.setEnd(currentNode, index + searchWord.length);
            activeRanges.push(range);
            startIndex = index + searchWord.length;
        }
        currentNode = walker.nextNode();
    }

    const highlight = new Highlight(...activeRanges);
    CSS.highlights.set("search-highlight", highlight);
}

function showTooltip(rect) {
    // Position slightly above the text this time (cleaner look)
    tooltip.style.left = `${rect.left}px`;
    tooltip.style.top = `${rect.top - 35}px`; 
    tooltip.style.display = "block";
}

function replaceRangeWith(range, newText) {
    const inputBox = document.querySelector('div[contenteditable="true"]');
    if(inputBox) inputBox.focus();

    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);

    // Execute Replacement
    document.execCommand('insertText', false, newText);

    // Cleanup
    selection.removeAllRanges();
    tooltip.style.display = "none";
    currentHoveredRange = null;

    // Refresh highlights to remove green line from "banana"
    setTimeout(() => {
        highlightWord(inputBox, "apple");
    }, 50);
}