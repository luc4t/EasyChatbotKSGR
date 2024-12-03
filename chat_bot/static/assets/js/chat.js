function getPageNumberArrayAsString(pages) {
    var a = [];
    for(var i = 0; i < pages.length; i++) {
        a.push(parseInt(pages[i]) + 1);
    }
    return a.join(", ");
}

class ChatManager {
    #submitBtn = null;
    #clearBtn = null;
    #chatTextBox = null; 
    #chatBubblesContainer = null;
    #chatMessages = [];
    #restorePromptOnFailure = true;
    constructor(
        submitBtn = null,
        clearBtn = null,
        chatTextBox = null,
        chatBubblesContainer = null,
        restorePromptOnFailure = true
    ) {
        this.#submitBtn = this.#getHtmlElement(submitBtn, "chatSubmitBtn");
        this.#clearBtn = this.#getHtmlElement(clearBtn, "chatClearBtn");
        this.#chatTextBox = this.#getHtmlElement(chatTextBox, "chatTextBox");
        this.#chatBubblesContainer = this.#getHtmlElement(chatBubblesContainer, "chatBubblesContainer");

        this.#chatTextBox.addEventListener("keydown", this.#onChatTextBoxKeyDown.bind(this));
        this.#submitBtn.addEventListener("click", this.submitMessage.bind(this));
        this.#clearBtn.addEventListener("click", this.clearChat.bind(this));

        this.setRestorePromptOnFailure(restorePromptOnFailure);

        this.#chatTextBox.placeholder = "Wonach möchten Sie suchen?";
        this.#submitBtn.textContent = "SUCHEN";
        
        this.#chatTextBox.addEventListener('focus', () => {
            this.#chatTextBox.style.borderColor = '#A50D07';
        });
        
        this.#chatTextBox.addEventListener('blur', () => {
            this.#chatTextBox.style.borderColor = '#C60219';
        });
    }

    #onChatTextBoxKeyDown(event) {
        // check if the key is enter and not shift+enter (to allow multiline messages)
        if(event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            this.#submitBtn.click();
        }
    }

    #getHtmlElement(element, defaultValue = "") {
        if(element === undefined || element === null || element === "") {
            element = String(defaultValue);
        }
        if(typeof element === "string") {
            if(element.trim() != "") {
                element = document.getElementById(element);
            }
            else {
                element = null;
            }
        }
        if(!(element instanceof HTMLElement)) {
            throw new Error("element must be an HTMLElement or string with the id of the element");
        }
        return element;
    }

    getRestorePromptOnFailure() {
        return this.#restorePromptOnFailure;
    }
    setRestorePromptOnFailure(value) {
        this.#restorePromptOnFailure = Boolean(value);
        return this;
    }

    #removeUiWaitingChatMessage(messageElement) {
        // remove the waiting messages
        while(
            this.#chatBubblesContainer.lastChild !== null &&
            this.#chatBubblesContainer.lastChild.classList.contains("waiting")
        ) {
            this.#chatBubblesContainer.removeChild(this.#chatBubblesContainer.lastChild);
        }
    }
    #addUiWaitingChatMessage() {
        var messageElement = document.createElement("div");
        messageElement.classList.add("chatMessage");
        messageElement.classList.add("assistant");
        messageElement.classList.add("waiting");
        messageElement.innerHTML = '<div class="dot-pulse"></div>';
        this.#chatBubblesContainer.appendChild(messageElement);
        return;
    }

    #addUiChatMessage(message, role, pushToHistory, addtionalClasses = []) {
        if(pushToHistory && role !== "error") {
            this.#chatMessages.push({
                "role": role,
                "content": message
            });
        }
        this.#removeUiWaitingChatMessage();

        var messageElement = document.createElement("div");
        messageElement.classList.add("chatMessage");
        messageElement.classList.add(role);
        for (var i = 0; i < addtionalClasses.length; i++) {
            messageElement.classList.add(addtionalClasses[i]);
        }
        
        if (role === "assistant") {
            var zmd = document.createElement("zero-md");
            zmd.addEventListener('zero-md-rendered', function() {
                console.log("configuring markdown links");
                var nodes = zmd.shadowRoot.querySelectorAll('a[href]');
                nodes.forEach(function(node) {
                    var href = new URL(node.href);
                    if (href.host === "easy-chat-bot") {
                        if(href.pathname.startsWith("/citation/")) {
                            const citationIndex = parseInt(href.pathname.substring(10));
                            const citation = choice.message.context.citations[citationIndex];
                            node.href="#";
                            node.title = citation.title;
                            if(citation.pages.length > 0) {
                                if(citation.pages.length == 1) {
                                    node.title += " (page " + getPageNumberArrayAsString(citation.pages) + ")";
                                }
                                else {
                                    node.title += " (pages " + getPageNumberArrayAsString(citation.pages) + ")";
                                }
                            }
                            if(citation.url.endsWith(".pdf")) {
                                node.addEventListener("click", function(event) {
                                    event.preventDefault();
                                    console.log("PDF Citation", citation);
                                    window.pdfRenderer.renderPDF(citation);
                                });
                                node.style.color = "#C60219";
                            }
                        }
                    }
                    else if(href.host !== currentUrl.host) {
                        // external link
                        node.target = "_blank";
                        return;
                    }
                });
            });
            zmd.innerHTML ='<template data-append><style> .markdown-body { background-color:transparent; } </style></template>';
            var md = document.createElement("script"); 
            md.type = "text/markdown";
            md.innerHTML = message;
            zmd.appendChild(md);
            messageElement.appendChild(zmd);
        } else {
            messageElement.innerText = message;
        }

        this.#chatBubblesContainer.appendChild(messageElement);
        this.#chatBubblesContainer.scrollTop = this.#chatBubblesContainer.scrollHeight;
        return;
    }

    #addUiUserChatMessage(message) {
        this.#addUiChatMessage(message, "user", true);
        this.#addUiWaitingChatMessage();
        return;
    }
    
    #addUiErrorChatMessage(message) {
        this.#addUiChatMessage(message, "error", false);
        return;
    }

    #popLastChatMessage() {
        this.#removeUiWaitingChatMessage();
        this.#chatMessages.pop();
        this.#chatBubblesContainer.removeChild(this.#chatBubblesContainer.lastChild);
        return;
    }

    async clearChat() {
        this.#chatMessages = [];
        this.#chatBubblesContainer.innerHTML = "";
        try {
            window.pdfRenderer.clearCache();
        }
        catch(e) {
            console.error("Error while clearing cache", e);
        }
        return;
    }

    async submitMessage() {
        var message = this.#chatTextBox.value;
        if(typeof message !== "string") {
            return;
        }
        message = message.trim();
        if(message === "") {
            return;
        }
        // from here on, we have a valid message
        this.#addUiUserChatMessage(message);
        this.#chatTextBox.value = "";

        try {
            var response = await fetch("/api/chat", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    "messages": this.#chatMessages
                })
            });
            if(response.status != 200) {
                console.log("Received unexpected status", response.status);
            }
            var data = await response.json();
            // check if the response is valid
            if(data === undefined || data === null || "error" in data) {
                console.log("JSON Data", data);
                throw new Error("Received invalid response");
            }
            if(!("choices" in data)) {
                console.log("JSON Data", data);
                throw new Error("Response does not contain choices");
            }
            if(data.choices.length > 1) {
                console.log("JSON Data contains multiple choices", data);
            }
            const selectedChoice = 0;
            try {
                await this.#processChoice(data.choices[selectedChoice]);
            }
            catch(e) {
                console.error("Error while processing choice", e);
            }
        }
        catch(e) {
            if(this.#restorePromptOnFailure) {
                this.#popLastChatMessage();
                this.#chatTextBox.value = message;
            }
            this.#addUiErrorChatMessage("Error while sending message");
            console.error("Error while sending message", e);
            return;
        }
        return;
    }

    async #processChoice(choice) {
        this.#removeUiWaitingChatMessage();
        this.#chatMessages.push({
            "role": "assistant",
            "content": choice.message.content
        });

        var msg = choice.message.content + "\n\n";
        for(var i = 0; i < choice.message.context.citations.length; i++) {
            msg += "[doc" + (i + 1) + "]: " + "https://easy-chat-bot/citation/" + i + "\n";
        }
        
        var messageElement = document.createElement("div");
        messageElement.classList.add("chatMessage");
        messageElement.classList.add("assistant");
        // adding markdown
        var zmd = document.createElement("zero-md");
        zmd.addEventListener('zero-md-rendered', function() {
            console.log("configuring markdown links");
            var nodes = zmd.shadowRoot.querySelectorAll('a[href]');
            nodes.forEach(function(node) {
                var href = new URL(node.href);
                if (href.host === "easy-chat-bot") {
                    if(href.pathname.startsWith("/citation/")) {
                        const citationIndex = parseInt(href.pathname.substring(10));
                        const citation = choice.message.context.citations[citationIndex];
                        node.href="#";
                        node.title = citation.title;
                        if(citation.pages.length > 0) {
                            if(citation.pages.length == 1) {
                                node.title += " (page " + getPageNumberArrayAsString(citation.pages) + ")";
                            }
                            else {
                                node.title += " (pages " + getPageNumberArrayAsString(citation.pages) + ")";
                            }
                        }
                        if(citation.url.endsWith(".pdf")) {
                            node.addEventListener("click", function(event) {
                                event.preventDefault();
                                console.log("PDF Citation", citation);
                                window.pdfRenderer.renderPDF(citation);
                            });
                            node.style.color = "#C60219";
                        }
                    }
                }
                else if(href.host !== currentUrl.host) {
                    // external link
                    node.target = "_blank";
                    return;
                }
            });
        });
        zmd.innerHTML ='<template data-append><style> .markdown-body { background-color:transparent; } </style></template>';
        var md = document.createElement("script"); 
        md.type = "text/markdown";
        md.innerHTML = msg;
        zmd.appendChild(md);
        messageElement.appendChild(zmd);

        this.#chatBubblesContainer.appendChild(messageElement);
        this.#chatBubblesContainer.scrollTop = this.#chatBubblesContainer.scrollHeight;
    }
}

window.chatbot = new ChatManager();

const modeToggle = document.getElementById('modeToggle');
modeToggle.addEventListener('click', () => {
  document.body.classList.toggle('dark-mode');
  modeToggle.textContent = document.body.classList.contains('dark-mode') ? '☀' : '☾';
});