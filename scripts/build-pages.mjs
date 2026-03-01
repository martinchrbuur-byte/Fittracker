import { rm, mkdir, copyFile, access } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const outputDir = path.join(root, '.site');

const filesToCopy = [
  'index.html',
  'Stiles.css',
  'app.js',
  'auth.js',
  'sync.js',
  'exercise-catalog.js',
  'valid_data.json',
];

async function ensureFilesExist(files) {
  for (const file of files) {
    const filePath = path.join(root, file);
    try {
      await access(filePath);
    } catch {
      throw new Error(`Missing required deploy asset: ${file}`);
    }
  }
}

async function buildPagesArtifact() {
  await ensureFilesExist(filesToCopy);

  await rm(outputDir, { recursive: true, force: true });
  await mkdir(outputDir, { recursive: true });

  for (const file of filesToCopy) {
    await copyFile(path.join(root, file), path.join(outputDir, file));
  }

  console.log(`Built GitHub Pages artifact in ${outputDir}`);
  console.log(`Included files: ${filesToCopy.join(', ')}`);
}

buildPagesArtifact().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
