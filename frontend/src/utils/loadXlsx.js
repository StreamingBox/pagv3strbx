let xlsxPromise = null;

export async function loadXlsx() {
    if (!xlsxPromise) {
        xlsxPromise = import("xlsx");
    }

    return xlsxPromise;
}
