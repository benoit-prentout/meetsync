import { ApiError } from '@/lib/api';

function extractScriptId(deploymentUrl: string): string | null {
  const match = deploymentUrl.match(/\/macros\/s\/([^/]+)/);
  return match ? match[1] : null;
}

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
    throw new ApiError(
      `Apps Script API request failed (${response.status}): ${body.slice(0, 200)}`,
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
  source: string,
  accessToken: string
): Promise<void> {
  const body: ProjectContent = {
    files: [{
      name: 'Code',
      type: 'SERVER_JS',
      source,
    }],
  };
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
  deploymentUrl: string,
  bundledCode: string,
  accessToken: string
): Promise<{ versionNumber: number }> {
  const scriptId = extractScriptId(deploymentUrl);
  if (!scriptId) {
    throw new ApiError('Invalid deployment URL: could not extract script ID');
  }

  // 1. Update the script content
  await updateContent(scriptId, bundledCode, accessToken);

  // 2. Create a new version
  const version = await createVersion(scriptId, accessToken);

  // 3. Find the matching deployment and update it
  const deployments = await listDeployments(scriptId, accessToken);
  const target = deployments.find(d =>
    d.entryPoints?.some(ep => ep.url === deploymentUrl)
  );

  if (!target) {
    throw new ApiError(
      'Could not find a deployment matching the current URL. The deployment may have been deleted.'
    );
  }

  await updateDeployment(scriptId, target.deploymentId, version.versionNumber, accessToken);

  return { versionNumber: version.versionNumber };
}
