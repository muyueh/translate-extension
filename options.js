const form = document.getElementById('settings-form');
const apiKeyInput = document.getElementById('api-key');
const modelSelect = document.getElementById('model');
const userPromptInput = document.getElementById('user-prompt');
const statusElement = document.getElementById('status');
const DEFAULT_PROMPT = '請幫我把下列內容翻譯成台灣慣用的繁體中文';

function showStatus(message, type = 'success') {
  statusElement.textContent = message;
  statusElement.style.color = type === 'error' ? '#dc2626' : '#047857';
}

function loadSettings() {
  chrome.storage.local.get(['apiKey', 'model', 'userPrompt'], (items) => {
    if (items.apiKey) {
      apiKeyInput.value = items.apiKey;
    }
    if (items.model) {
      modelSelect.value = items.model;
    }
    userPromptInput.value = items.userPrompt || DEFAULT_PROMPT;
  });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    showStatus('請輸入有效的 API Key。', 'error');
    return;
  }

  const model = modelSelect.value;
  const userPrompt = userPromptInput.value.trim() || DEFAULT_PROMPT;

  chrome.storage.local.set({ apiKey, model, userPrompt }, () => {
    if (chrome.runtime.lastError) {
      showStatus('儲存設定時發生錯誤，請稍後再試。', 'error');
      return;
    }
    showStatus('設定已儲存。下次翻譯將使用最新設定。');
  });
});

document.addEventListener('DOMContentLoaded', () => {
  loadSettings();
});
