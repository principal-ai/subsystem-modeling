import type { SubsystemModelDocument } from "@principal-ai/subsystems-core";

interface ModelSourceInput {
	bucket: string;
	prefix?: string;
	name?: string;
}

/** Omitted provider means S3, including existing saved source configurations. */
export interface S3ModelSourceInput extends ModelSourceInput {
	provider?: "s3";
	region?: string;
	profile?: string;
}

/** R2 credentials stay in the host environment, never in this contract. */
export interface R2ModelSourceInput extends ModelSourceInput {
	provider: "r2";
	accountId: string;
	jurisdiction?: "eu";
}

export type RemoteModelSourceInput = S3ModelSourceInput | R2ModelSourceInput;

interface StoredSourceMetadata {
	id: string;
	prefix: string;
	createdAt: string;
	updatedAt: string;
}

export type RemoteModelSource = RemoteModelSourceInput & StoredSourceMetadata;

/** Display identity only, not a download URL. R2 identities include the account. */
export function remoteModelSourceUrl(source: RemoteModelSource, key = source.prefix): string {
	if (source.provider === "r2") {
		return `r2://${source.accountId}${source.jurisdiction ? `.${source.jurisdiction}` : ""}/${source.bucket}/${key}`;
	}
	return `s3://${source.bucket}/${key}`;
}

export interface RemoteModelPreview {
	key: string;
	title: string;
	description?: string;
	componentCount: number;
	trailCount: number;
	etag?: string;
	lastModified?: number;
}

export interface RemoteModelPage {
	models: RemoteModelPreview[];
	cursor?: string;
	skipped: number;
}

export interface RemoteModel {
	source: RemoteModelSource;
	key: string;
	etag?: string;
	document: SubsystemModelDocument;
}
