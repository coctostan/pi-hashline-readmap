import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

function tryResolveAsTs(parentURL, specifier) {
  const parentPath = fileURLToPath(parentURL);
  const basePath = path.resolve(path.dirname(parentPath), specifier);

  // Case 1: explicit .js -> .ts
  if (basePath.endsWith('.js')) {
    const candidate = basePath.replace(/\.js$/, '.ts');
    if (fs.existsSync(candidate)) return candidate;
  }

  // Case 2: extensionless -> .ts
  if (!path.extname(basePath)) {
    const candidate = `${basePath}.ts`;
    if (fs.existsSync(candidate)) return candidate;
  }

  return null;
}

export async function resolve(specifier, context, defaultResolve) {
  try {
    return await defaultResolve(specifier, context, defaultResolve);
  } catch (err) {
    if (
      typeof specifier === 'string' &&
      (specifier.startsWith('./') || specifier.startsWith('../')) &&
      context?.parentURL?.startsWith('file:')
    ) {
      const candidateTs = tryResolveAsTs(context.parentURL, specifier);
      if (candidateTs) {
        return { url: pathToFileURL(candidateTs).href, shortCircuit: true };
      }
    }
    throw err;
  }
}
