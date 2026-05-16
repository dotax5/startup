const API_KEY = "openrouterApi";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = [
    { id: "openai/gpt-oss-120b:free", name: "gpt-oss-120b" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super" },
    { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 (Air)" }
];

let state = {
    chats: [],
    currentChatId: null,
    settings: {
        theme: localStorage.getItem("theme") || "dark",
        model: localStorage.getItem("model") || "openai/gpt-oss-120b:free"
    }
};

let isLoading = false;
let currentAbortController = null;
let thinkingTimer = null;
let thinkingStartTime = null;

function init() {
    loadState();
    applyTheme();
    renderModelSelect();
    setupEventListeners();
    loadChats();

    if (state.chats.length === 0) {
        createNewChat();
    } else {
        switchToChat(state.chats[0].id);
    }
}

function loadState() {
    const saved = localStorage.getItem("aiChatState");
    if (saved) {
        const parsed = JSON.parse(saved);
        state.chats = parsed.chats || [];
        state.currentChatId = parsed.currentChatId;
        if (parsed.settings) {
            state.settings = { ...state.settings, ...parsed.settings };
        }
    }
}

function saveState() {
    localStorage.setItem("aiChatState", JSON.stringify({
        chats: state.chats,
        currentChatId: state.currentChatId,
        settings: state.settings
    }));
}

function applyTheme() {
    document.documentElement.setAttribute("data-theme", state.settings.theme);
}

function renderModelSelect() {
    const select = document.getElementById("modelSelect");
    select.innerHTML = '<option value="">Select Model</option>';
    MODELS.forEach(model => {
        const option = document.createElement("option");
        option.value = model.id;
        option.textContent = model.name;
        if (model.id === state.settings.model) option.selected = true;
        select.appendChild(option);
    });
}

function setupEventListeners() {
    document.getElementById("newChatBtn").addEventListener("click", createNewChat);
    document.getElementById("sendBtn").addEventListener("click", sendMessage);
    document.getElementById("deleteChatBtn").addEventListener("click", deleteCurrentChat);
    document.getElementById("themeToggle").addEventListener("click", toggleTheme);


    document.getElementById("modelSelect").addEventListener("change", (e) => {
        state.settings.model = e.target.value;
        localStorage.setItem("model", e.target.value);
        updateModelBadge();
    });

    document.getElementById("userInput").addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    document.getElementById("userInput").addEventListener("input", autoResize);
}

function autoResize() {
    const textarea = document.getElementById("userInput");
    textarea.style.height = "auto";
    textarea.style.height = Math.min(textarea.scrollHeight, 150) + "px";
}

function toggleTheme() {
    state.settings.theme = state.settings.theme === "light" ? "dark" : "light";
    localStorage.setItem("theme", state.settings.theme);
    applyTheme();
    document.getElementById("themeToggle").textContent = state.settings.theme === "light" ? "🌙" : "☀️";
}

function createNewChat() {
    const chat = {
        id: Date.now().toString(),
        title: "New Chat",
        messages: [],
        createdAt: Date.now()
    };
    state.chats.unshift(chat);
    state.currentChatId = chat.id;
    saveState();
    renderChatList();
    renderMessages();
    updateChatTitle();
}

function loadChats() {
    renderChatList();
    renderMessages();
    updateModelBadge();
}

function renderChatList() {
    const list = document.getElementById("chatList");
    list.innerHTML = "";
    state.chats.forEach(chat => {
        const item = document.createElement("div");
        item.className = `chat-item ${chat.id === state.currentChatId ? "active" : ""}`;
        item.textContent = chat.title;
        item.addEventListener("click", () => switchToChat(chat.id));
        list.appendChild(item);
    });
}

function switchToChat(chatId) {
    state.currentChatId = chatId;
    saveState();
    renderChatList();
    renderMessages();
    updateChatTitle();
    document.getElementById("sidebar").classList.remove("open");
}

function deleteCurrentChat() {
    const chat = getCurrentChat();
    if (!chat) return;

    if (confirm("Delete this chat?")) {
        state.chats = state.chats.filter(c => c.id !== chat.id);

        if (state.chats.length === 0) {
            createNewChat();
        } else {
            switchToChat(state.chats[0].id);
        }

        saveState();
        renderChatList();
    }
}

function getCurrentChat() {
    return state.chats.find(c => c.id === state.currentChatId);
}

async function sendMessage() {
    const input = document.getElementById("userInput");
    const sendBtn = document.getElementById("sendBtn");
    const message = input.value.trim();

    if (isLoading) return;
    if (!message) return;
    if (!state.settings.model) {
        alert("Please select a model");
        return;
    }

    const chat = getCurrentChat();
    if (!chat) return;

    isLoading = true;
    sendBtn.disabled = true;
    input.disabled = true;

    if (chat.messages.length === 0) {
        chat.title = message.slice(0, 30) + (message.length > 30 ? "..." : "");
        updateChatTitle();
    }

    chat.messages.push({ role: "user", content: message.trim(), timestamp: Date.now() });
    input.value = "";
    autoResize();
    renderMessages();

    const loadingMsg = { role: "ai", content: "", loading: true };
    chat.messages.push(loadingMsg);
    renderMessages();

    thinkingStartTime = Date.now();
    thinkingTimer = setInterval(() => {
        const seconds = Math.floor((Date.now() - thinkingStartTime) / 1000);
        const timerEl = document.getElementById("thinkingTimer");
        if (timerEl) timerEl.textContent = `Думаю: ${seconds}с`;
    }, 1000);

    try {
        const history = chat.messages.filter(m => !m.loading && (m.role === "user" || m.role === "ai"));
        currentAbortController = new AbortController();
        const response = await callAPI(message, history.slice(0, -1), currentAbortController.signal);
        currentAbortController = null;
        if (thinkingTimer) {
            clearInterval(thinkingTimer);
            thinkingTimer = null;
        }
        loadingMsg.content = response;
        loadingMsg.loading = false;
        loadingMsg.responseTime = Date.now() - thinkingStartTime;
        loadingMsg.responseTimestamp = Date.now();
    } catch (error) {
        if (error.name === "AbortError") {
            if (thinkingTimer) {
                clearInterval(thinkingTimer);
                thinkingTimer = null;
            }
            chat.messages = chat.messages.filter(m => !m.loading);
            saveState();
            renderMessages();
            isLoading = false;
            input.disabled = false;
            sendBtn.disabled = false;
            return;
        }
        showError(error.message);
    }

    if (thinkingTimer) {
        clearInterval(thinkingTimer);
        thinkingTimer = null;
    }

    chat.messages = chat.messages.filter(m => !m.loading);
    saveState();
    renderMessages();

    isLoading = false;
    input.disabled = false;
    sendBtn.disabled = false;
}

function showError(message) {
    const toast = document.getElementById("errorToast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 5000);
}

async function callAPI(userMessage, history, signal = null) {
    const messages = [
        { role: "system", content: "You are a helpful assistant." },
        ...history.map(m => ({
            role: m.role === "ai" ? "assistant" : "user",
            content: m.content
        })),
        { role: "user", content: userMessage }
    ];

    const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${API_KEY}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            model: state.settings.model,
            messages: messages
        }),
        signal: signal
    });

    const text = await response.text();
    let data;
    try {
        data = JSON.parse(text);
    } catch {
        throw new Error("Invalid JSON response: " + text.slice(0, 200));
    }

    if (!response.ok) {
        throw new Error(data.error?.message || `Error ${response.status}: ${text.slice(0, 100)}`);
    }

    if (!data.choices || !data.choices[0]) {
        throw new Error("No response from AI");
    }

    return data.choices[0].message.content;
}

function renderMessages() {
    const container = document.getElementById("messages");
    container.innerHTML = "";

    const chat = getCurrentChat();
    if (!chat) return;

    chat.messages.forEach((msg, index) => {
        const div = document.createElement("div");
        div.className = `message ${msg.role}`;

        if (msg.loading) {
            div.innerHTML = `<div class="loading"><span></span><span></span><span></span></div><div class="thinking-timer" id="thinkingTimer">Думаю: 0с</div>`;
        } else if (msg.error) {
            div.className += " error-message";
            div.textContent = msg.content;
        } else {
            div.className += " actions";
            div.innerHTML = formatMessage(msg.content);
            div.dataset.index = index;

            if (msg.timestamp) {
                const timeDiv = document.createElement("div");
                timeDiv.className = "message-time";
                timeDiv.textContent = formatTime(msg.timestamp);
                div.appendChild(timeDiv);
            }

            if (msg.role === "ai" && msg.responseTime) {
                const timeDiv = document.createElement("div");
                timeDiv.className = "message-time";
                timeDiv.textContent = formatTime(msg.responseTimestamp);
                div.appendChild(timeDiv);
            }

            if (msg.role === "ai" && msg.responseTime) {
                const timeDiv = document.createElement("div");
                timeDiv.className = "response-time";
                timeDiv.textContent = `Сгенерировано за ${Math.round(msg.responseTime / 1000)} сек`;
                div.appendChild(timeDiv);
            }

            const btns = document.createElement("div");
            btns.className = "message-btns";

            const copyBtn = document.createElement("button");
            copyBtn.className = "msg-btn";
            copyBtn.innerHTML = "📋";
            copyBtn.title = "Copy";
            copyBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                navigator.clipboard.writeText(msg.content);
            });
            btns.appendChild(copyBtn);

            if (msg.role === "user") {
                const deleteBtn = document.createElement("button");
                deleteBtn.className = "msg-btn delete";
                deleteBtn.innerHTML = "🗑️";
                deleteBtn.title = "Delete";
                deleteBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    deleteMessage(index);
                });
                btns.appendChild(deleteBtn);
            }

            if (msg.role === "ai") {
                const regenerateBtn = document.createElement("button");
                regenerateBtn.className = "msg-btn";
                regenerateBtn.innerHTML = "🔄";
                regenerateBtn.title = "Regenerate";
                regenerateBtn.addEventListener("click", (e) => {
                    e.stopPropagation();
                    regenerateResponse(index);
                });
                btns.appendChild(regenerateBtn);
            }

            div.appendChild(btns);
        }

        container.appendChild(div);
    });

    container.scrollTop = container.scrollHeight;
}

function formatTime(timestamp) {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

function formatMessage(content) {
    return marked.parse(content);
}

function deleteMessage(index) {
    const chat = getCurrentChat();
    if (!chat) return;

    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    if (isLoading) {
        isLoading = false;
        const input = document.getElementById("userInput");
        const sendBtn = document.getElementById("sendBtn");
        input.disabled = false;
        sendBtn.disabled = false;
    }

    chat.messages.splice(index);
    saveState();
    renderMessages();
}

function regenerateResponse(index) {
    const chat = getCurrentChat();
    if (!chat || index === 0) return;

    const userMsgIndex = index - 1;
    if (userMsgIndex < 0 || chat.messages[userMsgIndex].role !== "user") return;

    if (currentAbortController) {
        currentAbortController.abort();
        currentAbortController = null;
    }

    if (isLoading) {
        isLoading = false;
        const input = document.getElementById("userInput");
        const sendBtn = document.getElementById("sendBtn");
        input.disabled = false;
        sendBtn.disabled = false;
    }

    const userMessage = chat.messages[userMsgIndex].content;

    const history = chat.messages.slice(0, userMsgIndex).filter(m => !m.loading && (m.role === "user" || m.role === "ai"));

    chat.messages.splice(userMsgIndex + 1);

    const loadingMsg = { role: "ai", content: "", loading: true };
    chat.messages.push(loadingMsg);
    saveState();
    renderMessages();

    const input = document.getElementById("userInput");
    const sendBtn = document.getElementById("sendBtn");
    input.disabled = true;
    sendBtn.disabled = true;
    isLoading = true;

    currentAbortController = new AbortController();
    let regenThinkingStart = Date.now();
    let regenTimer = setInterval(() => {
        const seconds = Math.floor((Date.now() - regenThinkingStart) / 1000);
        const timerEl = document.getElementById("thinkingTimer");
        if (timerEl) timerEl.textContent = `Думаю: ${seconds}с`;
    }, 1000);

    callAPI(userMessage, history, currentAbortController.signal).then(response => {
        clearInterval(regenTimer);
        loadingMsg.content = response;
        loadingMsg.loading = false;
        loadingMsg.responseTime = Date.now() - regenThinkingStart;
        loadingMsg.responseTimestamp = Date.now();
        currentAbortController = null;
        isLoading = false;
        input.disabled = false;
        sendBtn.disabled = false;
        saveState();
        renderMessages();
    }).catch(error => {
        if (error.name === "AbortError") return;
        clearInterval(regenTimer);
        showError(error.message);
        chat.messages = chat.messages.filter(m => !m.loading);
        currentAbortController = null;
        isLoading = false;
        input.disabled = false;
        sendBtn.disabled = false;
        saveState();
        renderMessages();
    });
}

function updateChatTitle() {
    const chat = getCurrentChat();
    document.getElementById("chatTitle").textContent = chat ? chat.title : "New Chat";
}

function updateModelBadge() {
    const model = MODELS.find(m => m.id === state.settings.model);
    document.getElementById("modelBadge").textContent = model ? model.name : "";
}

init();