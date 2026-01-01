// hsx-runtime.js

// ------------------- Reactive Variable System -------------------
class ReactiveVar {
    constructor(value) {
        this.value = value;
        this.subscribers = [];
    }
    set(val) {
        this.value = val;
        this.subscribers.forEach(fn => fn(val));
        this.value = val;
    }
    get() { return this.value; }
    subscribe(fn) { this.subscribers.push(fn); }
}

// ------------------- Component System -------------------
class HSXComponent {
    constructor(name, content) {
        this.name = name;
        this.content = content;
    }
    render(selector, runtime) {
        const target = document.querySelector(selector);
        if (!target) return console.warn("Render target not found:", selector);
        target.innerHTML = this.content;

        // Bind reactive variables
        runtime.bindReactivity(target);
    }
}

// ------------------- HSX Runtime -------------------
export class HSXRuntime {
    constructor() {
        this.variables = {};    // name -> value / ReactiveVar
        this.components = {};   // name -> HSXComponent
    }

    // Set variable
    setVariable(name, value, reactive = false) {
        if (reactive) this.variables[name] = new ReactiveVar(value);
        else this.variables[name] = value;
    }

    getVariable(name) {
        const val = this.variables[name];
        return val instanceof ReactiveVar ? val.get() : val;
    }

    // Component management
    defineComponent(name, content) {
        this.components[name] = new HSXComponent(name, content);
    }

    renderComponent(name, selector) {
        const comp = this.components[name];
        if (!comp) return console.warn("Component not found:", name);
        comp.render(selector, this);
    }

    // Bind reactive variables inside DOM element
    bindReactivity(el) {
        const reactiveVars = Object.entries(this.variables).filter(([_, v]) => v instanceof ReactiveVar);
        reactiveVars.forEach(([name, rv]) => {
            const nodes = Array.from(el.querySelectorAll("*")).filter(n => n.innerHTML.includes(`{{${name}}}`));
            rv.subscribe(v => nodes.forEach(n => n.innerHTML = n.innerHTML.replace(`{{${name}}}`, v)));
        });
    }

    // Load media elements
    loadMedia(type, url, selector) {
        const el = document.createElement(type);
        el.src = url;
        const target = document.querySelector(selector) || document.body;
        target.appendChild(el);
    }

    // Execute single HSX command
    async execute(cmd) {
        try {
            switch(cmd.type) {
                case "set-variable":
                    this.setVariable(cmd.name, eval(cmd.value), cmd.reactive);
                    console.log(`🔧 Set ${cmd.reactive ? "reactive " : ""}variable ${cmd.name}`);
                    break;
                case "define-component":
                    this.defineComponent(cmd.name, cmd.content);
                    console.log(`🖌 Defined component ${cmd.name}`);
                    break;
                case "render-component":
                    this.renderComponent(cmd.name, cmd.selector);
                    console.log(`🎨 Rendered component ${cmd.name} to ${cmd.selector}`);
                    break;
                case "run-async":
                    console.log(`⚡ Running async code: ${cmd.code}`);
                    await eval(`(async()=>{${cmd.code}})()`);
                    break;
                case "media-load":
                    this.loadMedia(cmd.mediaType, cmd.url, cmd.selector);
                    console.log(`🖼 Loaded ${cmd.mediaType} from ${cmd.url}`);
                    break;
                default:
                    console.warn("⚠️ Unknown runtime command:", cmd);
            }
        } catch(e) {
            console.error("❌ Error executing HSX runtime command:", cmd, e);
        }
    }
}

// ------------------- Load HSX file -------------------
export async function loadHSX(url) {
    const res = await fetch(url);
    const text = await res.text();

    // Extract <hsx>...</hsx> content
    const inner = text.match(/<hsx[^>]*>([\s\S]*)<\/hsx>/i)?.[1];
    if (!inner) throw new Error("Invalid HSX file");

    const temp = document.createElement("div");
    temp.innerHTML = inner;

    const runtime = new HSXRuntime();

    // 1️⃣ Load standard <script> modules
    for (const s of temp.querySelectorAll("script")) {
        const newScript = document.createElement("script");
        if (s.src) newScript.src = s.src;
        if (s.type) newScript.type = s.type;
        newScript.textContent = s.textContent;
        document.body.appendChild(newScript);
    }

    // 2️⃣ Parse HSX lines
    const hsxLines = inner.split(/\r?\n/).map(l => l.trim());
    for (const line of hsxLines) {
        if (!line.startsWith("hsx ")) continue;
        let cmd;

        try {
            if (line.includes("run async"))
                cmd = { type: "run-async", code: line.split("run async")[1].trim() };
            else if (line.includes("define component")) {
                const [_, name, content] = line.match(/define component (\w+) (.+)/);
                cmd = { type: "define-component", name, content };
            }
            else if (line.includes("render component")) {
                const [_, name, selector] = line.match(/render component (\w+) to (.+)/);
                cmd = { type: "render-component", name, selector };
            }
            else if (line.includes("set variable")) {
                let reactive = line.startsWith("hsx reactive variable");
                const [_, name, value] = line.match(/variable (\w+) = (.+)/);
                cmd = { type: "set-variable", name, value, reactive };
            }
            else if (line.includes("media load")) {
                const [_, mediaType, url, selector] = line.match(/media load (\w+) from (.+) to (.+)/);
                cmd = { type: "media-load", mediaType, url, selector };
            }

            if (cmd) await runtime.execute(cmd);
        } catch(e) {
            console.warn("⚠️ Failed to parse HSX line:", line, e);
        }
    }

    // 3️⃣ Load any media elements in HTML
    temp.querySelectorAll("img,video,canvas,div").forEach(el => document.body.appendChild(el.cloneNode(true)));

    console.log("✅ HSX runtime fully loaded:", url);
}

// ------------------- Auto-load if linked via <script data-src="..."> -------------------
const current = document.currentScript?.dataset?.src;
if (current) loadHSX(current);
