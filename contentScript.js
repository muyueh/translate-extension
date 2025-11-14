const TRANSLATION_MARKER = 'gptTranslationAppended';
const TRANSLATION_MARKER_ATTR = 'data-' + TRANSLATION_MARKER.replace(/([A-Z])/g, '-$1').toLowerCase();
const DEFAULT_PROMPT = '請幫我把下列內容翻譯成台灣慣用的繁體中文';

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['apiKey', 'model', 'userPrompt'], (result) => {
      resolve({
        apiKey: result.apiKey || '',
        model: result.model || 'gpt-5',
        userPrompt: result.userPrompt || DEFAULT_PROMPT
      });
    });
  });
}

function proxyOpenAIRequest(payload) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage({ type: 'gptTranslateChunk', payload }, (response) => {
      const lastError = chrome.runtime.lastError;
      if (lastError) {
        reject(new Error(lastError.message));
        return;
      }
      resolve(response);
    });
  });
}

function ensureStyleInjected() {
  if (document.getElementById('gpt-translation-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'gpt-translation-style';
  style.textContent = `
    .gpt-translation-block {
      margin-top: 0.3em;
      padding: 0.3em 0.5em;
      border-left: 3px solid #4f46e5;
      background-color: rgba(79, 70, 229, 0.08);
      font-style: italic;
    }
  `;
  document.head.appendChild(style);
}

function clearPreviousTranslations() {
  document.querySelectorAll('.gpt-translation-block').forEach((node) => node.remove());
  document.querySelectorAll(`[${TRANSLATION_MARKER_ATTR}]`).forEach((node) => {
    delete node.dataset[TRANSLATION_MARKER];
  });
}

function collectTextBlocks() {
  const selector = 'p, h1, h2, h3, h4, h5, h6, li, blockquote';
  const elements = Array.from(document.querySelectorAll(selector));
  const targets = [];

  for (const element of elements) {
    if (element.classList.contains('gpt-translation-block')) {
      continue;
    }

    const text = element.innerText.trim();
    if (!text) {
      continue;
    }

    targets.push({ element, text });
  }

  return targets;
}

function chunkBlocks(blocks, chunkSize = 6000) {
  const chunks = [];
  let current = [];
  let currentLength = 0;

  blocks.forEach((block) => {
    const length = block.text.length;
    if (currentLength + length > chunkSize && current.length) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(block);
    currentLength += length;
  });

  if (current.length) {
    chunks.push(current);
  }

  return chunks;
}

async function translateChunk({ apiKey, model, userPrompt }, blocks) {
  const promptBody = blocks
    .map((block, index) => `[${index}] ${block.text}`)
    .join('\n');

  const messages = [
    {
      role: 'system',
      content: `${userPrompt} 請使用 JSON 物件的格式輸出，key 為對應的數字索引，value 為翻譯結果，僅提供翻譯文字。`
    },
    {
      role: 'user',
      content: `以下為需要翻譯的段落：\n${promptBody}`
    }
  ];

  const response = await proxyOpenAIRequest({
    apiKey,
    model,
    messages
  });

  if (!response) {
    throw new Error('無法與背景服務進行通訊。');
  }

  if (response.error) {
    throw new Error(response.error);
  }

  const data = response.data;
  const content = data?.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('無法從 OpenAI 取得翻譯結果');
  }

  let translations;
  try {
    const jsonStart = content.indexOf('{');
    const jsonEnd = content.lastIndexOf('}');
    if (jsonStart === -1 || jsonEnd === -1) {
      throw new Error('missing json');
    }
    const jsonString = content.slice(jsonStart, jsonEnd + 1);
    translations = JSON.parse(jsonString);
  } catch (error) {
    console.error('解析翻譯結果失敗：', error, content);
    throw new Error('解析翻譯結果失敗，請稍後再試。');
  }

  return blocks.map((block, index) => ({
    element: block.element,
    translation: translations?.[index] || translations?.[`${index}`]
  }));
}

async function translatePage() {
  const settings = await getSettings();
  if (!settings.apiKey) {
    alert('尚未設定 OpenAI API Key，請於擴充功能選項頁進行設定。');
    return;
  }

  ensureStyleInjected();
  clearPreviousTranslations();

  const blocks = collectTextBlocks();
  if (!blocks.length) {
    alert('找不到可供翻譯的文字區塊。');
    return;
  }

  const chunks = chunkBlocks(blocks);

  for (const chunk of chunks) {
    try {
      const translations = await translateChunk(settings, chunk);
      translations.forEach(({ element, translation }) => {
        if (!translation) {
          return;
        }
        element.dataset[TRANSLATION_MARKER] = 'true';
        const translationNode = document.createElement(element.tagName);
        translationNode.classList.add('gpt-translation-block');
        translationNode.textContent = translation.replace(/\\n/g, '\n');
        element.insertAdjacentElement('afterend', translationNode);
      });
    } catch (error) {
      console.error(error);
      alert(error.message || '翻譯時發生錯誤，請查看主控台以取得更多資訊。');
      break;
    }
  }
}

translatePage();
