import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";

mock.module("../rpc", () => ({ electrobun: { rpc: { request: {} } } }));
const { ShareSubsystemModelModal } = await import("./ShareSubsystemModelModal");

test("labels the local path and public gist actions clearly", () => {
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

	expect(html).toContain("Share Subsystem Model");
	expect(html).toContain("Create public gist");
	expect(html).toContain("Copy File Path");
	expect(html).toContain("Copy local file path");
	expect(html).not.toContain("Loading…");
	expect(html).not.toContain("It is not a link others can open.");
	expect(html).not.toContain("Create a public gist and copy its link so others can view this model.");
	expect(html.indexOf("Copy File Path")).toBeLessThan(html.indexOf("Create public gist"));
});
