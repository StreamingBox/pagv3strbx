import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LINK_FALLBACK_CODES = new Set(["EXDEV", "EPERM", "EACCES", "ENOTSUP", "EOPNOTSUPP"]);

function listFiles(root) {
    const files = [];
    const visit = (directory, relativeDirectory = "") => {
        const entries = fs.readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
        for (const entry of entries) {
            const relativePath = relativeDirectory ? `${relativeDirectory}/${entry.name}` : entry.name;
            const fullPath = path.join(directory, entry.name);
            if (entry.isSymbolicLink()) throw new Error(`Refusing a symbolic link in the asset tree: ${relativePath}`);
            if (entry.isDirectory()) visit(fullPath, relativePath);
            else if (entry.isFile()) files.push({ relativePath, fullPath });
            else throw new Error(`Unsupported file type in the asset tree: ${relativePath}`);
        }
    };
    visit(root);
    return files;
}

function sameContents(left, right) {
    const leftStat = fs.statSync(left);
    const rightStat = fs.statSync(right);
    return leftStat.size === rightStat.size && fs.readFileSync(left).equals(fs.readFileSync(right));
}

function containsPath(parent, child) {
    const relative = path.relative(parent, child);
    return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(`..${path.sep}`));
}

export function carryForwardReleaseAssets(sourceDirectories, targetDirectory, { hardlink = false, allowConflicts = false } = {}) {
    if (!Array.isArray(sourceDirectories) || sourceDirectories.length === 0) {
        throw new Error("At least one source asset directory is required.");
    }

    const target = fs.realpathSync(targetDirectory);
    const sources = sourceDirectories.map((directory) => fs.realpathSync(directory));
    if (sources.some((source) => containsPath(source, target) || containsPath(target, source))) {
        throw new Error("Source and target asset directories must not contain one another.");
    }

    const sourceFiles = new Map();
    const conflicts = new Set();
    for (const source of sources) {
        for (const file of listFiles(source)) {
            const previous = sourceFiles.get(file.relativePath);
            if (!previous) sourceFiles.set(file.relativePath, file.fullPath);
            else if (!sameContents(previous, file.fullPath)) conflicts.add(file.relativePath);
        }
    }

    const pending = [];
    let identical = 0;
    for (const [relativePath, source] of sourceFiles) {
        const destination = path.join(target, ...relativePath.split("/"));
        if (!fs.existsSync(destination)) {
            pending.push({ relativePath, source, destination });
            continue;
        }
        if (!fs.lstatSync(destination).isFile()) throw new Error(`Target asset is not a regular file: ${relativePath}`);
        if (sameContents(source, destination)) identical += 1;
        else conflicts.add(relativePath);
    }

    if (conflicts.size && !allowConflicts) {
        throw new Error(`Asset paths contain different bytes; refusing to publish: ${[...conflicts].sort().slice(0, 8).join(", ")}`);
    }

    let copied = 0;
    let linked = 0;
    for (const file of pending) {
        fs.mkdirSync(path.dirname(file.destination), { recursive: true });
        if (hardlink) {
            try {
                fs.linkSync(file.source, file.destination);
                linked += 1;
                continue;
            } catch (error) {
                if (!LINK_FALLBACK_CODES.has(error?.code)) throw error;
            }
        }
        fs.copyFileSync(file.source, file.destination, fs.constants.COPYFILE_EXCL);
        copied += 1;
    }

    return { copied, linked, identical, conflicts: [...conflicts].sort() };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const args = process.argv.slice(2);
    const hardlink = args.includes("--hardlink");
    const allowConflicts = args.includes("--allow-conflicts");
    const directories = args.filter((argument) => !argument.startsWith("--"));
    if (directories.length < 2) {
        console.error("Usage: node carry-forward-release-assets.mjs [--hardlink] [--allow-conflicts] /old/assets [/older/assets ...] /new/assets");
        process.exitCode = 2;
    } else {
        try {
            const target = directories.pop();
            const result = carryForwardReleaseAssets(directories, target, { hardlink, allowConflicts });
            console.log(`Asset retention: linked=${result.linked} copied=${result.copied} identical=${result.identical} conflicts=${result.conflicts.length}`);
            if (result.conflicts.length) console.warn(`Kept target versions for conflicting paths: ${result.conflicts.slice(0, 8).join(", ")}`);
        } catch (error) {
            console.error(error instanceof Error ? error.message : String(error));
            process.exitCode = 1;
        }
    }
}
