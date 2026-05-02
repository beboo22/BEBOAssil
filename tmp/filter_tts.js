
import fs from 'fs';
try {
    let data = fs.readFileSync('aiml_models_utf8.json', 'utf8');
    if (data.charCodeAt(0) === 0xFEFF) {
        data = data.slice(1);
    }
    const obj = JSON.parse(data);
    const tts = obj.data.filter(m => m.type === 'tts');
    console.log("TOTAL TTS:", tts.length);
    const arabic = tts.filter(m => m.id.toLowerCase().includes('ar') || (m.info?.name && m.info.name.toLowerCase().includes('arabic')));
    console.log("ARABIC TTS:", arabic.map(m => m.id));
    const eleven = tts.filter(m => m.id.toLowerCase().includes('eleven'));
    console.log("ELEVENLABS TTS:", eleven.map(m => m.id));
    const openai = tts.filter(m => m.id.toLowerCase().includes('openai'));
    console.log("OPENAI TTS:", openai.map(m => m.id));
} catch (e) {
    console.log(e.message);
}
