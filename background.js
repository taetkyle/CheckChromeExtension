importScripts('config.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeText") {
    handleAnalysis(request.text, sendResponse);
    return true; 
  }
});

async function handleAnalysis(originalText, sendResponse) {
  try {
    const API_KEY = CONFIG.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("API Key missing.");

    // 1. Auto-select Model
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const listResp = await fetch(listUrl);
    const listData = await listResp.json();
    
    // Prefer 'flash' for speed, fallback to 'pro'
    let selectedModel = listData.models?.find(m => m.name.includes('flash') && m.supportedGenerationMethods.includes('generateContent')) 
                        || listData.models?.find(m => m.name.includes('pro'))
                        || listData.models?.[0];

    if (!selectedModel) throw new Error("No compatible models found.");
    const modelName = selectedModel.name.replace("models/", "");

    // 2. The Analysis Prompt
    const API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
    
    const systemPrompt = `
    Role: Senior Prompt Engineer.
    Task: Analyze the user's input and upgrade it to the CO-STAR framework (Context, Objective, Style, Tone, Audience, Response).
    
    User Input: "${originalText}"

    Output:
    Return strictly a JSON object with this structure:
    {
      "score": <0-100 integer based on clarity/completeness>,
      "missing": ["List", "of", "missing", "components"],
      "refined": "<The FULL rewritten prompt using CO-STAR headers>"
    }
    `;

    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt }] }] })
    });

    const data = await response.json();
    
    if (data.candidates?.[0]?.content?.parts?.[0]?.text) {
        // Robust JSON cleaning (Gemini sometimes adds ```json blocks)
        let rawText = data.candidates[0].content.parts[0].text;
        rawText = rawText.replace(/```json/g, "").replace(/```/g, "").trim();
        
        try {
            const jsonResult = JSON.parse(rawText);
            sendResponse({ success: true, data: jsonResult });
        } catch (e) {
            console.error("JSON Parse Error:", rawText);
            sendResponse({ success: false, error: "AI returned invalid format." });
        }
    } else {
        sendResponse({ success: false, error: "Blocked by safety filters." });
    }

  } catch (error) {
    sendResponse({ success: false, error: error.message });
  }
}