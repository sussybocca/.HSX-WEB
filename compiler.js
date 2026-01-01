// hsx-compiler.js
import fs from "fs";
import path from "path";

// ------------------- Utilities -------------------
function resolveFile(filePath) {
    const abs = path.resolve(filePath);
    if (!fs.existsSync(abs)) throw new Error(`File not found: ${abs}`);
    return abs;
}

function log(msg) { console.log(msg); }

// ------------------- Framework Loaders -------------------
async function buildWithVite() { log("⚡ Building project with Vite..."); }
async function buildWithBabel() { log("🌀 Building project with Babel..."); }
async function buildWithEsbuild() { log("🚀 Building project with ESBuild..."); }

let Strike;
async function loadStrike(version) {
    if (!Strike) {
        log(`📦 Lazy loading Strike framework v${version}...`);
        Strike = { version }; // placeholder for real require/import
    }
    return Strike;
}

// ------------------- HSX Parser -------------------
function parseHSX(filePath) {
    const content = fs.readFileSync(filePath, "utf-8");
    const lines = content.split(/\r?\n/);

    const commands = [];
    for (let line of lines) {
        line = line.trim();
        if (!line || line.startsWith("//")) continue;

        // Existing commands
        let m;
        if (m = line.match(/^hsx exist import (correct|simple|node module|node built-in module) file (.+)$/))
            commands.push({ type: "exist-import", category: m[1], file: m[2] });
        else if (m = line.match(/^hsx file import all to (.+)$/))
            commands.push({ type: "file-import-all", dest: m[1] });
        else if (m = line.match(/^hsx file import\/make\/rename\/(.+)-to-(.+)$/))
            commands.push({ type: "file-rename", from: m[1], to: m[2] });

        // New commands
        else if (m = line.match(/^hsx build target (.+)$/))
            commands.push({ type: "build-target", target: m[1] });
        else if (m = line.match(/^hsx include framework (.+) version (.+)$/))
            commands.push({ type: "include-framework", framework: m[1], version: m[2] });
        else if (m = line.match(/^hsx transform (.+) with (.+)$/))
            commands.push({ type: "transform", file: m[1], plugin: m[2] });
        else if (m = line.match(/^hsx copy (.+) to (.+)$/))
            commands.push({ type: "copy", from: m[1], to: m[2] });
        else if (m = line.match(/^hsx run async (.+)$/))
            commands.push({ type: "run-async", code: m[1] });
        else if (m = line.match(/^hsx define component (\w+) (.+)$/))
            commands.push({ type: "define-component", name: m[1], content: m[2] });
        else if (m = line.match(/^hsx render component (\w+) to (.+)$/))
            commands.push({ type: "render-component", name: m[1], selector: m[2] });
        else if (m = line.match(/^hsx set variable (\w+) = (.+)$/))
            commands.push({ type: "set-variable", name: m[1], value: m[2], reactive: false });
        else if (m = line.match(/^hsx reactive variable (\w+) = (.+)$/))
            commands.push({ type: "set-variable", name: m[1], value: m[2], reactive: true });
        else
            console.warn(`⚠️ Unknown HSX line: ${line}`);
    }

    return commands;
}

// ------------------- HSX Executor -------------------
class ReactiveVar {
    constructor(value) {
        this.value = value;
        this.subscribers = [];
    }
    set(val) {
        this.value = val;
        this.subscribers.forEach(fn => fn(val));
    }
    get() { return this.value; }
    subscribe(fn) { this.subscribers.push(fn); }
}

class HSXComponent {
    constructor(name, content) {
        this.name = name;
        this.content = content;
    }
    render(selector) {
        const el = document.querySelector(selector);
        if (!el) return console.warn("Render target not found:", selector);
        el.innerHTML = this.content;
    }
}

const runtime = {
    variables: {},
    components: {},
    setVariable(name, value, reactive=false) {
        if (reactive) this.variables[name] = new ReactiveVar(value);
        else this.variables[name] = value;
    },
    getVariable(name) {
        const val = this.variables[name];
        return val instanceof ReactiveVar ? val.get() : val;
    },
    defineComponent(name, content) {
        this.components[name] = new HSXComponent(name, content);
    },
    renderComponent(name, selector) {
        const comp = this.components[name];
        if (!comp) return console.warn("Component not found:", name);
        comp.render(selector);
    }
};

async function executeCommand(cmd) {
    switch(cmd.type) {
        case "exist-import":
            log(`📦 Import ${cmd.category} file: ${cmd.file}`);
            resolveFile(cmd.file);
            break;
        case "file-import-all":
            log(`🔗 Import all files to ${cmd.dest}`);
            break;
        case "file-rename":
            log(`✏️ Rename ${cmd.from} -> ${cmd.to}`);
            break;
        case "build-target":
            log(`⚡ Building for ${cmd.target}...`);
            if (cmd.target === "vite") await buildWithVite();
            else if (cmd.target === "babel") await buildWithBabel();
            else if (cmd.target === "esbuild") await buildWithEsbuild();
            break;
        case "include-framework":
            log(`📦 Loading framework ${cmd.framework} v${cmd.version}`);
            if (cmd.framework.toLowerCase() === "strike") await loadStrike(cmd.version);
            break;
        case "transform":
            log(`🌀 Transforming ${cmd.file} with ${cmd.plugin}`);
            break;
        case "copy":
            fs.copyFileSync(resolveFile(cmd.from), path.resolve(cmd.to));
            log(`📄 Copied ${cmd.from} -> ${cmd.to}`);
            break;
        case "run-async":
            log(`⚡ Running async code: ${cmd.code}`);
            await eval(`(async()=>{${cmd.code}})()`);
            break;
        case "define-component":
            log(`🖌 Defining component ${cmd.name}`);
            runtime.defineComponent(cmd.name, cmd.content);
            break;
        case "render-component":
            log(`🎨 Rendering component ${cmd.name} to ${cmd.selector}`);
            runtime.renderComponent(cmd.name, cmd.selector);
            break;
        case "set-variable":
            log(`🔧 Setting ${cmd.reactive ? "reactive " : ""}variable ${cmd.name} = ${cmd.value}`);
            runtime.setVariable(cmd.name, eval(cmd.value), cmd.reactive);
            break;
        default:
            console.warn("⚠️ Unknown command type:", cmd);
    }
}

// ------------------- HSX Build -------------------
export async function buildHSX(filePath) {
    log("🔮 Starting HSX compiler...");
    const commands = parseHSX(filePath);
    for (const cmd of commands) {
        await executeCommand(cmd);
    }
    log("✅ HSX compilation finished!");
}

// ------------------- Entry Point -------------------
if (import.meta.url.endsWith(process.argv[1])) {
    const hsxFile = process.argv[2] || "Mist.hsx";
    buildHSX(hsxFile);
}
