
import fs from 'fs';
try {
    let data = fs.readFileSync('aiml_models_utf8.json', 'utf8');
    if (data.charCodeAt(0) === 0xFEFF) {
        data = data.slice(1);
    }
    const obj = JSON.parse(data);
    const stt = obj.data.filter(m => m.type === 'stt' || m.id.toLowerCase().includes('whisper'));
    console.log("STT MODELS:", stt.map(m => m.id));
    const chat = obj.data.filter(m => m.id.includes('gpt-4o') || m.id.includes('claude-3-5'));
    console.log("CHAT MODELS:", chat.map(m => m.id));
} catch (e) {
    console.log(e.message);
}
