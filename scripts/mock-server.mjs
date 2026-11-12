// A tiny fake of the Mistral and Telegram APIs for trying the app offline:
//   npm run mock
//   MISTRAL_API_BASE=http://localhost:8787/v1 TELEGRAM_API_BASE=http://localhost:8787 \
//   TELEGRAM_BOT_TOKEN=x TELEGRAM_CHAT_ID=1 MISTRAL_API_KEY=x npm run dev
// GET http://localhost:8787/sent shows the Telegram messages that "would have been sent".
import { createServer } from "node:http";

const sent = [];

function classify(text) {
  const t = text.toLowerCase();
  const service = /chatbot/.test(t) ? "chatbot" : /automat|n8n|follow-up/.test(t) ? "automation" : /mobile app/.test(t) ? "mobile app" : /website/.test(t) ? "website" : /mvp|web app|saas/.test(t) ? "web app" : "other";
  if (/ignore previous|ignore all earlier/.test(t)) return { type: "irrelevant", score: 5, service: "other", reason: "Post tries to give the AI instructions; treated as noise." };
  if (/\[hiring\]|need a developer|looking for someone|need someone/.test(t)) return { type: "client_lead", score: 85, service, reason: "Poster wants to hire for work Smartvyn does." };
  if (/how do i|help|anyone built/.test(t)) return { type: "question_to_answer", score: 68, service, reason: "Business owner asking a how-to question in Smartvyn's field." };
  return { type: "irrelevant", score: 10, service: "other", reason: "Not related to Smartvyn's services." };
}

createServer((req, res) => {
  let body = "";
  req.on("data", (c) => (body += c));
  req.on("end", () => {
    const send = (code, obj) => { res.writeHead(code, { "content-type": "application/json" }); res.end(JSON.stringify(obj)); };
    if (req.method === "GET" && req.url === "/sent") return send(200, sent);
    if (req.method === "POST" && req.url === "/v1/chat/completions") {
      const payload = JSON.parse(body);
      const user = payload.messages.find((m) => m.role === "user")?.content ?? "";
      const content = payload.response_format
        ? JSON.stringify(classify(user))
        : "Mock draft: happy to help. Could you tell me a bit more about the volume of leads you get, and which tools you already use? That decides the simplest setup.";
      return send(200, { choices: [{ message: { content } }] });
    }
    if (req.method === "POST" && /^\/bot[^/]+\/sendMessage$/.test(req.url)) {
      sent.push(JSON.parse(body));
      return send(200, { ok: true });
    }
    send(404, { error: "not found" });
  });
}).listen(8787, () => console.log("Mock Mistral + Telegram on http://localhost:8787"));
