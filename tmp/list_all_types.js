
import fs from 'fs';
try {
    let data = fs.readFileSync('aiml_models_utf8.json', 'utf8');
    if (data.charCodeAt(0) === 0xFEFF) {
        data = data.slice(1);
    }
    const obj = JSON.parse(data);
    const types = [...new Set(obj.data.map(m => m.type))];
    console.log("ALL TYPES:", types);
    
    for (const type of types) {
        const models = obj.data.filter(m => m.type === type);
        console.log(`\n=== TYPE: ${type} (${models.length}) ===`);
        console.log(models.slice(0, 5).map(m => m.id));
    }
} catch (e) {
    console.log(e.message);
}
