import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";

mock.module("../rpc", () => ({ electrobun: { rpc: { request: {} } } }));
const { ConstructRepositorySearch } = await import("./ConstructRepositorySearch");

test("renders an accessible registry search without starting any RPC request", () => {
	const html = renderToStaticMarkup(
		<ThemeProvider theme={slateNeonTheme}>
			<ConstructRepositorySearch onSelect={() => { throw new Error("Must not select"); }} />
		</ThemeProvider>,
	);
	expect(html).toContain('type="search"');
	expect(html).toContain('aria-label="Search Alexandria registry"');
	expect(html).toContain('placeholder="Search Alexandria registry…');
	expect(html).not.toContain("No registered repositories match.");
});
