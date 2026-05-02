
import fs from 'fs';
try {
    let data = fs.readFileSync('aiml_models_utf8.json', 'utf8');
    if (data.charCodeAt(0) === 0xFEFF) {
        data = data.slice(1);
    }
    const obj = JSON.parse(data);
    const stt = obj.data.filter(m => m.type === 'stt' || m.id.toLowerCase().includes('transcribe'));
    for (const m of stt) {
        console.log(`ID: ${m.id}, Endpoints: ${JSON.stringify(m.endpoints)}`);
    }
} catch (e) {
    console.log(e.message);
}
