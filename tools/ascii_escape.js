// Replace every non-ASCII char with a JS unicode escape (keeps the JSX pure ASCII for ExtendScript)
const fs=require('fs');const f=process.argv[2];const BS=String.fromCharCode(92);
let s=fs.readFileSync(f,'utf8');
s=s.replace(/[^\x00-\x7F]/g,c=>BS+'u'+c.charCodeAt(0).toString(16).toUpperCase().padStart(4,'0'));
fs.writeFileSync(f,s);
