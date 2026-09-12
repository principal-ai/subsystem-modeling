import { describe, expect, test } from "bun:test";
import {
	getOpencodeV2Status,
	OPENCODE_V2_INSTALL_COMMAND,
	OPENCODE_V2_NPM_PACKAGE,
} from "./opencode-v2";

describe("opencode-v2", () => {
	test("status shape and install command", () => {
		const status = getOpencodeV2Status();
		expect(status.installCommand).toBe(OPENCODE_V2_INSTALL_COMMAND);
		expect(status.installCommand).toContain(OPENCODE_V2_NPM_PACKAGE);
		expect(typeof status.installed).toBe("boolean");
		expect(status.conventionalBin).toContain("opencode2");
		if (status.installed) {
			expect(status.bin).toBeTruthy();
		} else {
			expect(status.bin).toBeNull();
		}
	});
});
