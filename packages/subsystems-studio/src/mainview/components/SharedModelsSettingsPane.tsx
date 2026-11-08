import { useEffect, useState, type CSSProperties, type FormEvent } from "react";
import { useTheme } from "@principal-ade/industry-theme";
import { remoteModelSourceUrl, type RemoteModelSource } from "../../shared/remote-models";
import { electrobun } from "../rpc";

export function SharedModelsSettingsPane() {
	const { theme } = useTheme();
	const [sources, setSources] = useState<RemoteModelSource[]>([]);
	const [bucket, setBucket] = useState("");
	const [region, setRegion] = useState("");
	const [prefix, setPrefix] = useState("");
	const [profile, setProfile] = useState("");
	const [provider, setProvider] = useState<"s3" | "r2">("s3");
	const [accountId, setAccountId] = useState("");
	const [jurisdiction, setJurisdiction] = useState<"" | "eu">("");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let alive = true;
		void electrobun.rpc!.request.listRemoteModelSources({}).then((result) => {
			if (!alive) return;
			if (result.ok && result.sources) setSources(result.sources);
			else setError(result.error ?? "Could not load configured sources");
		}).catch(() => { if (alive) setError("Could not load configured sources"); });
		return () => { alive = false; };
	}, []);

	const control: CSSProperties = {
		background: theme.colors.background, color: theme.colors.text,
		border: `1px solid ${theme.colors.border}`, borderRadius: 4, padding: "6px 10px",
		font: "inherit",
	};

	const configure = async (event: FormEvent) => {
		event.preventDefault();
		setBusy(true);
		setError(null);
		try {
			const result = await electrobun.rpc!.request.configureRemoteModelSource({
				input: provider === "r2"
					? { provider, bucket, prefix, accountId: accountId.trim(), ...(jurisdiction ? { jurisdiction } : {}) }
					: { bucket, prefix, ...(region.trim() ? { region: region.trim() } : {}), ...(profile.trim() ? { profile: profile.trim() } : {}) },
			});
			if (!result.ok || !result.source) throw new Error(result.error ?? "Could not configure source");
			setSources((old) => [result.source!, ...old.filter((source) => source.id !== result.source!.id)]);
			setBucket("");
		} catch (err) {
			setError(err instanceof Error ? err.message : "Could not configure source");
		} finally {
			setBusy(false);
		}
	};

	return (
		<div style={{ display: "flex", flexDirection: "column", gap: 16, color: theme.colors.text, fontFamily: theme.fonts.body }}>
			<p style={{ margin: 0, color: theme.colors.textSecondary }}>
				Configure read-only subsystem model sources. The Shared Subsystems tab appears once a source is configured.
			</p>
			<p style={{ margin: 0, color: theme.colors.textSecondary }}>
				{provider === "r2"
					? "R2 uses R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY from Studio’s host environment, not AWS credentials. Use an R2 Object Read token scoped to the bucket."
					: "S3 uses this computer’s AWS credentials or the selected AWS profile."}
			</p>
			<form onSubmit={(event) => void configure(event)} style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
				<label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					Provider
					<select aria-label="Storage provider" value={provider} disabled={busy}
						onChange={(event) => setProvider(event.target.value as "s3" | "r2")} style={control}>
						<option value="s3">Amazon S3</option>
						<option value="r2">Cloudflare R2</option>
					</select>
				</label>
				{([
					["Bucket", bucket, setBucket, true],
					["Prefix (optional)", prefix, setPrefix, false],
					...(provider === "r2" ? [
						["Cloudflare account ID", accountId, setAccountId, true] as const,
					] : [
						["Region (optional)", region, setRegion, false] as const,
						["AWS profile (optional)", profile, setProfile, false] as const,
					]),
				] as const).map(([label, value, setValue, required]) => (
					<label key={label} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
						{label}
						<input aria-label={label} value={value} required={required} disabled={busy}
							onChange={(event) => setValue(event.target.value)} style={control} />
					</label>
				))}
				{provider === "r2" && <label style={{ display: "flex", flexDirection: "column", gap: 4 }}>
					Jurisdiction
					<select aria-label="R2 jurisdiction" value={jurisdiction} disabled={busy}
						onChange={(event) => setJurisdiction(event.target.value as "" | "eu")} style={control}>
						<option value="">Default</option>
						<option value="eu">European Union</option>
					</select>
				</label>}
				<button type="submit" disabled={busy} style={{ ...control, alignSelf: "end", cursor: "pointer" }}>
					{busy ? "Checking access…" : "Add bucket"}
				</button>
			</form>
			{error && <p role="alert" style={{ margin: 0, color: theme.colors.error ?? "#e5534b" }}>{error}</p>}
			<div>
				<strong>Configured sources</strong>
				{sources.length ? <ul style={{ margin: "8px 0 0", paddingLeft: 20, color: theme.colors.textSecondary }}>
					{sources.map((source) => <li key={source.id}>{source.name ?? remoteModelSourceUrl(source)}{source.provider !== "r2" && source.profile ? ` (${source.profile})` : ""}</li>)}
				</ul> : <p style={{ margin: "8px 0 0", color: theme.colors.textSecondary }}>No sources configured.</p>}
			</div>
		</div>
	);
}
