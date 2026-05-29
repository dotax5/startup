const API_KEY = "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";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const MODELS = [
    { id: "openai/gpt-oss-120b:free", name: "gpt-oss-120b" },
    { id: "nvidia/nemotron-3-super-120b-a12b:free", name: "Nemotron 3 Super" },
    { id: "z-ai/glm-4.5-air:free", name: "GLM 4.5 (Air)" },
    { id: "poolside/laguna-m.1:free", name: "Laguna M.1 (долгая)"}
];

let state = {
    chats: [],
    currentChat: null,
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
    applyTheme();
    renderModelSelect();
    setupEventListeners();
    loadChats();
}




async function api(path, options = {}) {
    const res = await fetch(path, {
        headers: { 'Content-Type': 'application/json' },
        ...options
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    if (res.status === 204) return null;
    return res.json();
}





async function loadChats() {
    try {
        state.chats = await api('/api/chats');
        renderChatList();
        if (state.chats.length === 0) {
            await createNewChat();
        } else {
            await switchToChat(state.chats[0]._id);
        }
    } catch (err) {
        showError('Failed to load chats: ' + err.message);
    }
}

async function switchToChat(chatId) {
    if (isLoading) return;
    try {
        state.currentChat = await api(`/api/chats/${chatId}`);
        renderChatList();
        renderMessages();
        updateChatTitle();
        document.getElementById("sidebar").classList.remove("open");
    } catch (err) {
        showError('Failed to load chat: ' + err.message);
    }
}

async function createNewChat() {
    if (isLoading) return;
    try {
        const chat = await api('/api/chats', { method: 'POST' });
        state.chats.unshift(chat);
        state.currentChat = chat;
        renderChatList();
        renderMessages();
        updateChatTitle();
    } catch (err) {
        showError('Failed to create chat: ' + err.message);
    }
}

async function deleteCurrentChat() {
    if (!state.currentChat) return;
    if (isLoading) return;
    if (!confirm("Delete this chat?")) return;
    try {
        await api(`/api/chats/${state.currentChat._id}`, { method: 'DELETE' });
        state.chats = state.chats.filter(c => c._id !== state.currentChat._id);
        state.currentChat = null;
        if (state.chats.length === 0) {
            await createNewChat();
        } else {
            await switchToChat(state.chats[0]._id);
        }
    } catch (err) {
        showError('Failed to delete chat: ' + err.message);
    }
}

async function updateChatTitleOnServer(title) {
    if (!state.currentChat) return;
    const updated = await api(`/api/chats/${state.currentChat._id}`, {
        method: 'PATCH',
        body: JSON.stringify({ title })
    });
    state.currentChat.title = title;
    const meta = state.chats.find(c => c._id === state.currentChat._id);
    if (meta) meta.title = title;
    updateChatTitle();
    renderChatList();
}

async function addMessage(role, content, extra = {}) {
    if (!state.currentChat) return;
    state.currentChat = await api(`/api/chats/${state.currentChat._id}/messages`, {
        method: 'POST',
        body: JSON.stringify({ role, content, timestamp: Date.now(), ...extra })
    });
}

async function deleteMessagesFrom(idx) {
    if (!state.currentChat) return;
    state.currentChat = await api(`/api/chats/${state.currentChat._id}/messages/${idx}`, {
        method: 'DELETE'
    });
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

function updateChatTitle() {
    document.getElementById("chatTitle").textContent = state.currentChat ? state.currentChat.title : "New Chat";
}

function updateModelBadge() {
    const model = MODELS.find(m => m.id === state.settings.model);
    document.getElementById("modelBadge").textContent = model ? model.name : "";
}




async function sendMessage() {
    const input = document.getElementById("userInput");
    const sendBtn = document.getElementById("sendBtn");
    const message = input.value.trim();

    if (isLoading) return;
    if (!message) return;
    if (!state.settings.model) { alert("Please select a model"); return; }
    if (!state.currentChat) return;

    isLoading = true;
    sendBtn.disabled = true;
    input.disabled = true;

    const chatId = state.currentChat._id;
    const isFirst = state.currentChat.messages.length === 0;

    if (isFirst) {
        const title = message.slice(0, 30) + (message.length > 30 ? "..." : "");
        try { await updateChatTitleOnServer(title); } catch (e) { showError('Title update failed: ' + e.message); }
    }

    try {
        await addMessage('user', message);
    } catch (err) {
        showError('Failed to save message: ' + err.message);
        isLoading = false; input.disabled = false; sendBtn.disabled = false;
        return;
    }

    input.value = "";
    autoResize();
    renderMessages();

    const loadingMsg = { role: "ai", content: "", loading: true };
    state.currentChat.messages.push(loadingMsg);
    renderMessages();

    thinkingStartTime = Date.now();
    thinkingTimer = setInterval(() => {
        const seconds = Math.floor((Date.now() - thinkingStartTime) / 1000);
        const timerEl = document.getElementById("thinkingTimer");
        if (timerEl) timerEl.textContent = `Думаю: ${seconds}с`;
    }, 1000);

    try {
        const history = state.currentChat.messages.filter(
            m => !m.loading && (m.role === "user" || m.role === "ai")
        );
        currentAbortController = new AbortController();
        const response = await callAPI(message, history.slice(0, -1), currentAbortController.signal);
        currentAbortController = null;

        if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }

        await addMessage('ai', response, {
            responseTime: Date.now() - thinkingStartTime,
            responseTimestamp: Date.now()
        });
    } catch (error) {
        if (error.name === "AbortError") {
            if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }
            try { await deleteMessagesFrom(state.currentChat.messages.length - 2); } catch { }
            isLoading = false; input.disabled = false; sendBtn.disabled = false;
            renderMessages();
            return;
        }
        showError(error.message);
    }

    if (thinkingTimer) { clearInterval(thinkingTimer); thinkingTimer = null; }

    state.currentChat.messages = state.currentChat.messages.filter(m => !m.loading);
    renderMessages();

    isLoading = false;
    input.disabled = false;
    sendBtn.disabled = false;
}

async function deleteMessage(index) {
    if (!state.currentChat) return;
    if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
    if (isLoading) {
        isLoading = false;
        document.getElementById("userInput").disabled = false;
        document.getElementById("sendBtn").disabled = false;
    }
    try {
        await deleteMessagesFrom(index);
        renderMessages();
    } catch (err) {
        showError('Failed to delete message: ' + err.message);
    }
}

async function regenerateResponse(index) {
    const chat = state.currentChat;
    if (!chat || index === 0) return;

    const userMsgIndex = index - 1;
    if (userMsgIndex < 0 || chat.messages[userMsgIndex].role !== "user") return;

    if (currentAbortController) { currentAbortController.abort(); currentAbortController = null; }
    if (isLoading) {
        isLoading = false;
        document.getElementById("userInput").disabled = false;
        document.getElementById("sendBtn").disabled = false;
    }

    const userMessage = chat.messages[userMsgIndex].content;

    try {
        await deleteMessagesFrom(userMsgIndex + 1);
    } catch (err) {
        showError('Failed to prepare for regeneration: ' + err.message);
        return;
    }

    const loadingMsg = { role: "ai", content: "", loading: true };
    state.currentChat.messages.push(loadingMsg);
    renderMessages();

    const input = document.getElementById("userInput");
    const sendBtn = document.getElementById("sendBtn");
    input.disabled = true;
    sendBtn.disabled = true;
    isLoading = true;

    currentAbortController = new AbortController();
    const regenThinkingStart = Date.now();
    const regenTimer = setInterval(() => {
        const seconds = Math.floor((Date.now() - regenThinkingStart) / 1000);
        const timerEl = document.getElementById("thinkingTimer");
        if (timerEl) timerEl.textContent = `Думаю: ${seconds}с`;
    }, 1000);

    const history = (chat.messages || []).filter(
        m => !m.loading && (m.role === "user" || m.role === "ai")
    );

    try {
        const response = await callAPI(userMessage, history, currentAbortController.signal);
        clearInterval(regenTimer);
        currentAbortController = null;

        await addMessage('ai', response, {
            responseTime: Date.now() - regenThinkingStart,
            responseTimestamp: Date.now()
        });

        isLoading = false;
        input.disabled = false;
        sendBtn.disabled = false;
        renderMessages();
    } catch (error) {
        if (error.name === "AbortError") return;
        clearInterval(regenTimer);
        showError(error.message);
        state.currentChat.messages = state.currentChat.messages.filter(m => !m.loading);
        currentAbortController = null;
        isLoading = false;
        input.disabled = false;
        sendBtn.disabled = false;
        renderMessages();
    }
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


function renderChatList() {
    const list = document.getElementById("chatList");
    list.innerHTML = "";
    state.chats.forEach(chat => {
        const item = document.createElement("div");
        item.className = `chat-item ${chat._id === state.currentChat?._id ? "active" : ""}`;
        item.textContent = chat.title;
        item.addEventListener("click", () => switchToChat(chat._id));
        list.appendChild(item);
    });
}

function renderMessages() {
    const container = document.getElementById("messages");
    container.innerHTML = "";

    const chat = state.currentChat;
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
                const ts = (msg.role === "ai" && msg.responseTimestamp) ? msg.responseTimestamp : msg.timestamp;
                timeDiv.textContent = formatTime(ts);
                div.appendChild(timeDiv);
            }

            if (msg.role === "ai" && msg.responseTime) {
                const rtDiv = document.createElement("div");
                rtDiv.className = "response-time";
                rtDiv.textContent = `Сгенерировано за ${Math.round(msg.responseTime / 1000)} сек`;
                div.appendChild(rtDiv);
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

function showError(message) {
    const toast = document.getElementById("errorToast");
    toast.textContent = message;
    toast.classList.add("show");
    setTimeout(() => toast.classList.remove("show"), 5000);
}

init();
