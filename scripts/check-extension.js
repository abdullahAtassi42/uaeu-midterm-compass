const fs = require("node:fs"); const path = require("node:path");
const root = path.resolve(__dirname,".."); const manifest=JSON.parse(fs.readFileSync(path.join(root,"manifest.json"),"utf8"));
const required=[manifest.background.service_worker,manifest.action.default_popup,manifest.options_page,...manifest.content_scripts.flatMap(c=>[...c.js,...c.css])];
for(const file of required){ if(!fs.existsSync(path.join(root,file))) throw new Error(`Missing manifest resource: ${file}`); }
for(const dir of ["lib","content","popup","schedule","options"]){ for(const file of fs.readdirSync(path.join(root,dir)).filter(f=>f.endsWith(".js"))){ new Function(fs.readFileSync(path.join(root,dir,file),"utf8")); }}
new Function(fs.readFileSync(path.join(root,"background.js"),"utf8")); console.log(`extension check passed (${required.length} manifest resources)`);
