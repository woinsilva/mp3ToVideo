import { existsSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';

function findWorkspaceRoot(startDirectory: string): string {
  let currentDirectory = startDirectory;

  while (true) {
    if (existsSync(resolve(currentDirectory, 'pnpm-workspace.yaml'))) {
      return currentDirectory;
    }

    const parentDirectory = dirname(currentDirectory);

    if (parentDirectory === currentDirectory) {
      return startDirectory;
    }

    currentDirectory = parentDirectory;
  }
}

const workspaceRoot = findWorkspaceRoot(__dirname);

export function resolveFromWorkspaceRoot(pathValue: string): string {
  return isAbsolute(pathValue) ? pathValue : resolve(workspaceRoot, pathValue);
}
