import { ApiError } from '@/lib/api';

async function scriptsApiFetch<T>(
  path: string,
  options: RequestInit,
  accessToken: string
): Promise<T> {
  const url = `https://script.googleapis.com/v1/${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      ...options.headers,
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    console.error('Apps Script API error:', { path, method: options.method || 'GET', status: response.status, body });
    throw new ApiError(
      `Apps Script API ${options.method || 'GET'} ${path} failed (${response.status}): ${body.slice(0, 1000)}`,
      response.status
    );
  }

  return response.json();
}

interface ProjectContent {
  files: Array<{ name: string; type: string; source: string }>;
}

interface Version {
  versionNumber: number;
  description: string;
}

interface Deployment {
  deploymentId: string;
  deploymentConfig: {
    versionNumber: number;
  };
  entryPoints?: Array<{
    entryPointType: string;
    url?: string;
  }>;
}

async function updateContent(
  scriptId: string,
  codeSource: string,
  manifestSource: string,
  existingFiles: Array<{ name: string; type: string; id?: string }>,
  accessToken: string
): Promise<void> {
  const existingCode = existingFiles.find(f => f.name === 'Code' && f.type === 'SERVER_JS');
  const existingManifest = existingFiles.find(f => f.name === 'appsscript' && f.type === 'JSON');

  const files: Array<{ name: string; type: string; source: string; id?: string }> = [
    {
      name: 'Code',
      type: 'SERVER_JS',
      source: codeSource,
      ...(existingCode?.id ? { id: existingCode.id } : {}),
    },
    {
      name: 'appsscript',
      type: 'JSON',
      source: manifestSource,
      ...(existingManifest?.id ? { id: existingManifest.id } : {}),
    },
  ];

  const body = { files };
  await scriptsApiFetch<ProjectContent>(
    `projects/${scriptId}/content`,
    {
      method: 'PUT',
      body: JSON.stringify(body),
    },
    accessToken
  );
}

async function createVersion(
  scriptId: string,
  accessToken: string,
  description = 'Deployed from MeetSync extension'
): Promise<Version> {
  return scriptsApiFetch<Version>(
    `projects/${scriptId}/versions`,
    {
      method: 'POST',
      body: JSON.stringify({ description }),
    },
    accessToken
  );
}

async function listDeployments(
  scriptId: string,
  accessToken: string
): Promise<Deployment[]> {
  const result = await scriptsApiFetch<{ deployments: Deployment[] }>(
    `projects/${scriptId}/deployments`,
    { method: 'GET' },
    accessToken
  );
  return result.deployments || [];
}

async function updateDeployment(
  scriptId: string,
  deploymentId: string,
  versionNumber: number,
  accessToken: string
): Promise<void> {
  await scriptsApiFetch<Deployment>(
    `projects/${scriptId}/deployments/${deploymentId}`,
    {
      method: 'PUT',
      body: JSON.stringify({
        deploymentConfig: { versionNumber },
      }),
    },
    accessToken
  );
}

export async function deployBackendUpdate(
  scriptId: string,
  deploymentUrl: string,
  bundledCode: string,
  bundledManifest: string,
  accessToken: string
): Promise<{ versionNumber: number }> {
  if (!scriptId) {
    throw new ApiError('Script project ID is required');
  }

  // Verify connectivity: try to fetch existing project content first
  let existingFiles: Array<{ name: string; type: string }> = [];
  try {
    const existing = await scriptsApiFetch<{ files?: Array<{ name: string; type: string; id?: string }> }>(
      `projects/${scriptId}/content`,
      { method: 'GET' },
      accessToken
    );
    existingFiles = existing.files || [];
  } catch (err) {
    if (err instanceof ApiError) throw err;
    throw new ApiError('Could not access script project. Check that the deployment URL is correct and the Apps Script API is enabled in your Google Cloud project.');
  }

  // 1. Update the script content (code + manifest)
  await updateContent(scriptId, bundledCode, bundledManifest, existingFiles, accessToken);

  // 2. Create a new version
  const version = await createVersion(scriptId, accessToken);

  // 3. Find the matching deployment and update it
  const deployments = await listDeployments(scriptId, accessToken);

  // Extract the deployment ID from the URL path — `/macros/s/{deploymentId}/exec`
  const urlMatch = deploymentUrl.match(/\/macros\/s\/([^/]+)/);
  const deploymentIdFromUrl = urlMatch ? urlMatch[1] : null;

  // First try matching by deploymentId (more robust), then fall back to URL matching
  let target = deploymentIdFromUrl
    ? deployments.find(d => d.deploymentId === deploymentIdFromUrl)
    : undefined;

  if (!target) {
    target = deployments.find(d =>
      d.entryPoints?.some(ep => ep.url === deploymentUrl)
    );
  }

  if (!target) {
    throw new ApiError(
      `Could not find a deployment matching the current URL (found ${deployments.length} deployment(s), none matched).`
    );
  }

  await updateDeployment(scriptId, target.deploymentId, version.versionNumber, accessToken);

  return { versionNumber: version.versionNumber };
}
