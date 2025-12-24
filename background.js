importScripts('config.js');

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "analyzeText") {
    handleAnalysis(request.text, sendResponse);
    return true; // Keep channel open for async response
  }
});

async function handleAnalysis(originalText, sendResponse) {
  try {
    const API_KEY = CONFIG.GEMINI_API_KEY;
    if (!API_KEY) throw new Error("API Key is missing in config.js");

    console.log("🔍 Step 1: Checking available models...");

    // 1. Ask Google: "What models does this key have access to?"
    const listUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;
    const listResp = await fetch(listUrl);
    
    if (!listResp.ok) {
      const err = await listResp.json();
      throw new Error(`List Models Failed: ${JSON.stringify(err)}`);
    }

    const listData = await listResp.json();
    console.log("📋 Available Models:", listData.models);

    // 2. Find a model that supports 'generateContent'
    // We prefer 'flash' or 'pro' models if available.
    let selectedModel = listData.models.find(m => 
      m.name.includes('flash') && m.supportedGenerationMethods.includes('generateContent')
    );

    // If no flash, try pro
    if (!selectedModel) {
      selectedModel = listData.models.find(m => 
        m.name.includes('pro') && m.supportedGenerationMethods.includes('generateContent')
      );
    }

    // If neither, just take the first one that works
    if (!selectedModel) {
      selectedModel = listData.models.find(m => 
        m.supportedGenerationMethods.includes('generateContent')
      );
    }

    if (!selectedModel) {
      throw new Error("No compatible models found for your API key.");
    }

    const modelName = selectedModel.name.replace("models/", ""); // Strip the 'models/' prefix if present
    console.log(`✅ Selected Model: ${modelName}`);

    // 3. Generate Content using the auto-selected model
    const generateUrl = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${API_KEY}`;
    
    const prompt = `
    Analyze the following text. 
    1. Extract the main idea.
    2. Rewrite it into a SINGLE, concise sentence suitable for an AI prompt.
    3. Do not add bolding or markdown. Just the text.
    
    Text: "${originalText}"
    `;

    const genResp = await fetch(generateUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        safetySettings: [
          { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
          { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
        ]
      })
    });

    if (!genResp.ok) {
      const err = await genResp.json();
      throw new Error(`Generate Content Failed: ${JSON.stringify(err)}`);
    }

    const genData = await genResp.json();
    
    if (genData.candidates && genData.candidates.length > 0) {
      const resultText = genData.candidates[0].content.parts[0].text;
      sendResponse({ success: true, data: resultText });
    } else {
      sendResponse({ success: false, error: "Blocked by safety filters." });
    }

  } catch (error) {
    console.error("🔥 Error:", error);
    sendResponse({ success: false, error: error.message });
  }
}