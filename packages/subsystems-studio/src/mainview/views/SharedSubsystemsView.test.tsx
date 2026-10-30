import { expect, mock, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { ThemeProvider, slateNeonTheme } from "@principal-ade/industry-theme";
import type { RemoteModel } from "../../shared/remote-models";

mock.module("../rpc", () => ({
	electrobun: { rpc: { request: {} } },
	reloadSubscribers: new Set(),
}));
const { SharedSubsystemsView } = await import("./SharedSubsystemsView");
const { RemoteSubsystemGraph } = await import("./RemoteSubsystemModelView");

test("bucket setup exposes optional AWS configuration, without credential or confirmation fields", () => {
	const html = renderToStaticMarkup(
		<ThemeProvider theme={slateNeonTheme}><SharedSubsystemsView active /></ThemeProvider>,
	);
	expect(html).toContain('aria-label="Bucket"');
	expect(html).toContain('aria-label="Storage provider"');
	expect(html).toContain('value="r2"');
	expect(html).toContain("Cloudflare R2");
	expect(html).toContain('aria-label="Region (optional)"');
	expect(html).toContain('aria-label="Prefix (optional)"');
	expect(html).toContain('aria-label="AWS profile (optional)"');
	expect(html).toContain("Add bucket");
	expect(html).not.toContain('type="password"');
	expect(html).not.toContain("Confirm");
});

test("R2 graph displays its account and jurisdiction instead of an S3 origin", () => {
	const model: RemoteModel = {
		source: {
			provider: "r2", accountId: "0123456789abcdef0123456789abcdef", jurisdiction: "eu",
			id: "r2-test", bucket: "acme-models", prefix: "models/", createdAt: "", updatedAt: "",
		},
		key: "models/storage.json",
		document: { title: "Remote storage", components: [] },
	};
	const html = renderToStaticMarkup(
		<ThemeProvider theme={slateNeonTheme}><RemoteSubsystemGraph model={model} onRefresh={() => {}} /></ThemeProvider>,
	);
	expect(html).toContain("r2://0123456789abcdef0123456789abcdef.eu/acme-models/models/storage.json");
	expect(html).not.toContain("s3://");
	expect(html).toContain("Read-only");
});

test("remote graph renders its origin read-only, without local maintenance controls", () => {
	const model: RemoteModel = {
		source: { id: "s3-test", bucket: "acme-models", prefix: "models/", createdAt: "", updatedAt: "" },
		key: "models/storage.json",
		document: {
			title: "Remote storage",
			components: [{ alias: "reader", name: "readModel", construct: "function", file: "src/read.ts", purl: "pkg:github/acme/store#src/read.ts" }],
		},
	};
	const html = renderToStaticMarkup(
		<ThemeProvider theme={slateNeonTheme}><RemoteSubsystemGraph model={model} onRefresh={() => {}} /></ThemeProvider>,
	);
	expect(html).toContain("Read-only");
	expect(html).toContain("s3://acme-models/models/storage.json");
	expect(html).toContain("Refresh");
	expect(html).not.toContain("Apply fix");
	expect(html).not.toContain("Edit in Excalidraw");
	expect(html).not.toContain("Run Maintain");
});
