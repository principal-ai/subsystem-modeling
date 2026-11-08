import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";

mock.module("../rpc", () => ({ electrobun: { rpc: { request: {} } } }));
const { ShareSubsystemModelModal } = await import("./ShareSubsystemModelModal");

test("clearly distinguishes public sharing from the local file path", () => {
	const html = renderToStaticMarkup(
		<ThemeProvider theme={slateNeonTheme}>
			<ShareSubsystemModelModal
				graphId="graph-1"
				title="Payments"
				hasGist={false}
				onClose={() => undefined}
			/>
		</ThemeProvider>,
	);

	expect(html).toContain("Public GitHub gist");
	expect(html).toContain("Create public gist");
	expect(html).toContain("Local file path");
	expect(html).toContain("Copy file path");
	expect(html).toContain("It is not a link others can open.");
	expect(html.indexOf("Local file path")).toBeLessThan(html.indexOf("Public GitHub gist"));
});
