let xlsxPromise = null;

export async function loadXlsx() {
    if (!xlsxPromise) {
        xlsxPromise = import("@e965/xlsx").then((mod) => mod.default || mod);
    }

    return xlsxPromise;
}
