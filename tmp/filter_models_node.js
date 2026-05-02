
const fs = require('fs');
const path = require('path');

const filePath = 'H:/globocity-planner-ec57c907-main/tmp/aiml_models_utf8.json';
const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
const models = data.data;

console.log("=== STT Models ===");
const sttModels = models.filter(m => m.type === 'stt' || m.id.toLowerCase().includes('whisper'));
console.log(JSON.stringify(sttModels, null, 2));

console.log("\n=== TTS Models ===");
const ttsModels = models.filter(m => m.type === 'tts');
console.log(JSON.stringify(ttsModels, null, 2));

console.log("\n=== Chat Models (Filtered) ===");
const chatModels = models.filter(m => m.type === 'chat-completion' && (m.id.includes('gpt-4o') || m.id.includes('claude-3-5')));
console.log(JSON.stringify(chatModels, null, 2));
