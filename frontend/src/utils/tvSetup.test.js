import { describe, expect, it } from "vitest";
import { formatTvCode, onlyDigits } from "./tvSetup.js";

describe("TV setup code formatting", () => {
    it("keeps the eight digits and adds the visual separator", () => {
        expect(formatTvCode("9725-2558")).toBe("9725-2558");
        expect(formatTvCode("97252558")).toBe("9725-2558");
    });

    it("sanitizes pasted values and limits them to eight digits", () => {
        expect(formatTvCode(" 97ab25 2558 extra")).toBe("9725-2558");
        expect(onlyDigits("9875-3269", 8)).toBe("98753269");
    });
});
