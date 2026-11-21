"use strict";
// Development-only: annotate the real source in memory; never emit runtime JS.
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const install = 'npm --prefix tools/dev-types ci --include=dev --ignore-scripts --no-audit --no-fund';
const manifest = require('./dev-types/package.json');
let ts;
try {
    ts = require('./dev-types/node_modules/typescript');
    if (ts.version !== manifest.devDependencies.typescript) throw Error('version mismatch');
} catch (_) {
    console.error('Required development checker: TypeScript ' + manifest.devDependencies.typescript + '. Run: ' + install);
    process.exit(2);
}
const args = process.argv.slice(2);
if (args.length && (args.length !== 2 || args[0] !== '--source')) {
    console.error('Usage: node tools/check-interfaces.cjs [--source path/to/audio-environment.js]');
    process.exit(2);
}
const sourcePath = path.resolve(args[1] || path.join(root, 'src/js/PBZForewarn/audio-environment.js'));
const contractPath = path.join(__dirname, 'dev-types/audio-environment.d.ts');
try {
    const source = fs.readFileSync(sourcePath, 'utf8');
    const parsed = ts.createSourceFile(sourcePath, source, ts.ScriptTarget.ES2020, true, ts.ScriptKind.JS);
    const entry = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name.text === 'createAudioEnvironmentProbe');
    if (!entry || entry.parameters.map(p => p.name.getText(parsed)).join(',') !== 'UE,adapter')
        throw Error('Expected real createAudioEnvironmentProbe(UE, adapter) boundary; review the contract.');
    let relative = path.relative(path.dirname(sourcePath), contractPath).replace(/\\/g, '/').replace(/\.d\.ts$/, '');
    if (!path.isAbsolute(relative) && !relative.startsWith('.')) relative = './' + relative;
    const annotation = '/** @param {import(' + JSON.stringify(relative) + ').ProbeUE} UE ' +
        '@param {import(' + JSON.stringify(relative) + ').ProbeAdapter} adapter */ ';
    const offset = entry.getStart(parsed);
    const annotated = source.slice(0, offset) + annotation + source.slice(offset);
    const options = { allowJs: true, checkJs: true, noEmit: true, types: [],
        target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.CommonJS };
    const host = ts.createCompilerHost(options);
    const original = host.getSourceFile.bind(host);
    host.getSourceFile = (file, languageVersion, onError, shouldCreateNewSourceFile) =>
        path.resolve(file) === sourcePath ? ts.createSourceFile(file, annotated, languageVersion, true, ts.ScriptKind.JS) :
            original(file, languageVersion, onError, shouldCreateNewSourceFile);
    const program = ts.createProgram([sourcePath, contractPath], options, host);
    const diagnostics = ts.getPreEmitDiagnostics(program);
    for (const diagnostic of diagnostics) {
        let location = '';
        if (diagnostic.file && diagnostic.start !== undefined) {
            const isSource = path.resolve(diagnostic.file.fileName) === sourcePath;
            const start = isSource && diagnostic.start >= offset ? Math.max(offset, diagnostic.start - annotation.length) : diagnostic.start;
            const pos = (isSource ? parsed : diagnostic.file).getLineAndCharacterOfPosition(start);
            location = diagnostic.file.fileName + '(' + (pos.line + 1) + ',' + (pos.character + 1) + '): ';
        }
        console.error(location + 'TS' + diagnostic.code + ': ' + ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n'));
    }
    if (diagnostics.length) process.exitCode = 1;
    else console.log('PASS audio-environment real-source interface slice (TypeScript ' + ts.version + ')');
} catch (error) {
    console.error('Interface check failed: ' + error.message);
    process.exitCode = 2;
}
