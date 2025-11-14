const OPENAI_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.id) {
    return;
  }

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files: ['contentScript.js']
    });
  } catch (error) {
    console.error('Failed to inject translation script:', error);
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type !== 'gptTranslateChunk') {
    return false;
  }

  const { apiKey, model, messages } = message.payload || {};

  (async () => {
    try {
      if (!apiKey) {
        throw new Error('缺少 OpenAI API 金鑰，請於擴充功能選項頁設定。');
      }

      const response = await fetch(OPENAI_COMPLETIONS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.2
        })
      });

      if (!response.ok) {
        throw new Error(`OpenAI API 回傳錯誤：${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      sendResponse({ data });
    } catch (error) {
      console.error('Proxy OpenAI request failed:', error);
      sendResponse({ error: error.message || '翻譯服務發生未知錯誤。' });
    }
  })();

  return true;
});
