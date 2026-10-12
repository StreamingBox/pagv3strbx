const WEEKDAYS = new Map([
    ["lunes", 0],
    ["martes", 1],
    ["miercoles", 2],
    ["jueves", 3],
    ["viernes", 4],
    ["sabado", 5],
    ["domingo", 6],
]);

const folderNameCollator = new Intl.Collator("es", { sensitivity: "base", numeric: true });

function normalizeFolderName(name) {
    return String(name || "")
        .trim()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLocaleLowerCase("es");
}

export function sortAdvertisingFolders(folders) {
    return [...folders].sort((folderA, folderB) => {
        const nameA = String(folderA?.name || "").trim();
        const nameB = String(folderB?.name || "").trim();
        const weekdayA = WEEKDAYS.get(normalizeFolderName(nameA));
        const weekdayB = WEEKDAYS.get(normalizeFolderName(nameB));

        if (weekdayA !== undefined && weekdayB !== undefined && weekdayA !== weekdayB) {
            return weekdayA - weekdayB;
        }
        if (weekdayA !== undefined && weekdayB === undefined) return -1;
        if (weekdayA === undefined && weekdayB !== undefined) return 1;
        return folderNameCollator.compare(nameA, nameB);
    });
}
