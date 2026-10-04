const fs = require('fs');
const html = fs.readFileSync('public/index.html', 'utf8');
const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];

const { JSDOM } = require('jsdom');
const dom = new JSDOM(html, { runScripts: "dangerously" });
const window = dom.window;
window.addEventListener('error', (e) => { console.log('RUNTIME ERROR:', e.error || e.message); });
