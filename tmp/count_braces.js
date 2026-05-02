const fs = require('fs');
const content = fs.readFileSync('src/pages/BookingsPage.tsx', 'utf8');
let counts = { '{': 0, '}': 0, '(': 0, ')': 0 };
for (let char of content) {
  if (counts.hasOwnProperty(char)) counts[char]++;
}
console.log(JSON.stringify(counts));
