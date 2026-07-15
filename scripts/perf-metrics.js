import fs from 'fs';
import path from 'path';
import zlib from 'zlib';

function getFilesRecursive(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(getFilesRecursive(filePath));
    } else {
      results.push(filePath);
    }
  });
  return results;
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function run() {
  const distDir = path.resolve('dist');
  const indexHtmlPath = path.join(distDir, 'index.html');
  const assetsDir = path.join(distDir, 'assets');

  if (!fs.existsSync(distDir) || !fs.existsSync(indexHtmlPath)) {
    console.error('Error: Build files not found in dist. Run npm run build first.');
    process.exit(1);
  }

  // 1. Read index.html to find initial resources
  const indexHtmlContent = fs.readFileSync(indexHtmlPath, 'utf8');
  
  // Find script sources
  const scriptRegex = /<script[^>]+src=["']\/([^"']+)["']/g;
  const modulepreloadRegex = /<link[^>]+rel=["']modulepreload["'][^>]+href=["']\/([^"']+)["']/g;
  const cssRegex = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']\/([^"']+)["']/g;

  const initialAssets = new Set();
  let match;
  
  while ((match = scriptRegex.exec(indexHtmlContent)) !== null) {
    initialAssets.add(match[1]);
  }
  while ((match = modulepreloadRegex.exec(indexHtmlContent)) !== null) {
    initialAssets.add(match[1]);
  }
  while ((match = cssRegex.exec(indexHtmlContent)) !== null) {
    initialAssets.add(match[1]);
  }

  // Fallbacks without leading slash just in case
  const scriptRegexNoSlash = /<script[^>]+src=["']assets\/([^"']+)["']/g;
  const modulepreloadRegexNoSlash = /<link[^>]+rel=["']modulepreload["'][^>]+href=["']assets\/([^"']+)["']/g;
  const cssRegexNoSlash = /<link[^>]+rel=["']stylesheet["'][^>]+href=["']assets\/([^"']+)["']/g;

  while ((match = scriptRegexNoSlash.exec(indexHtmlContent)) !== null) {
    initialAssets.add(`assets/${match[1]}`);
  }
  while ((match = modulepreloadRegexNoSlash.exec(indexHtmlContent)) !== null) {
    initialAssets.add(`assets/${match[1]}`);
  }
  while ((match = cssRegexNoSlash.exec(indexHtmlContent)) !== null) {
    initialAssets.add(`assets/${match[1]}`);
  }

  // 2. Scan dist/assets for all compiled JS/CSS chunk files
  const allFiles = getFilesRecursive(assetsDir);
  const chunkReport = [];

  for (const filePath of allFiles) {
    const ext = path.extname(filePath);
    if (ext !== '.js' && ext !== '.css') continue;

    const relativePath = path.relative(distDir, filePath);
    const content = fs.readFileSync(filePath);
    const rawSize = content.length;
    
    // Gzip Compression
    const gzipContent = zlib.gzipSync(content);
    const gzipSize = gzipContent.length;

    // Brotli Compression (standard in Node 11.7.0+)
    const brotliContent = zlib.brotliCompressSync(content);
    const brotliSize = brotliContent.length;

    const isInitial = initialAssets.has(relativePath) || initialAssets.has(relativePath.replace(/\\/g, '/'));

    chunkReport.push({
      name: path.basename(filePath),
      relativePath: relativePath.replace(/\\/g, '/'),
      type: ext === '.js' ? 'JS' : 'CSS',
      isInitial,
      rawSize,
      gzipSize,
      brotliSize
    });
  }

  // Sort chunks: initial first, then by size descending
  chunkReport.sort((a, b) => {
    if (a.isInitial && !b.isInitial) return -1;
    if (!a.isInitial && b.isInitial) return 1;
    return b.rawSize - a.rawSize;
  });

  // Calculate totals
  let totalRaw = 0;
  let totalGzip = 0;
  let totalBrotli = 0;
  let initialRaw = 0;
  let initialGzip = 0;
  let initialBrotli = 0;

  chunkReport.forEach(c => {
    totalRaw += c.rawSize;
    totalGzip += c.gzipSize;
    totalBrotli += c.brotliSize;
    if (c.isInitial) {
      initialRaw += c.rawSize;
      initialGzip += c.gzipSize;
      initialBrotli += c.brotliSize;
    }
  });

  // 3. Load Benchmark results
  let benchmarks = {};
  const benchPath = path.join(distDir, 'benchmark-results.json');
  if (fs.existsSync(benchPath)) {
    try {
      benchmarks = JSON.parse(fs.readFileSync(benchPath, 'utf8'));
    } catch (e) {
      console.warn('Warning: Could not parse benchmark-results.json');
    }
  }

  // 4. Build Markdown Report
  let md = `## 📊 Flusso Performance & Bundle Report

### 📦 Bundle Size Analysis

| Chunk / Asset | Type | Initial? | Raw Size | Gzip Size | Brotli Size |
| :--- | :---: | :---: | :---: | :---: | :---: |
`;

  chunkReport.forEach(c => {
    const nameStr = c.isInitial ? `**${c.name}**` : c.name;
    const initStr = c.isInitial ? '⚡ Yes' : 'No';
    md += `| ${nameStr} | ${c.type} | ${initStr} | ${formatBytes(c.rawSize)} | ${formatBytes(c.gzipSize)} | ${formatBytes(c.brotliSize)} |\n`;
  });

  md += `
#### 📈 Total Metrics Summary

| Category | Raw Size | Gzip Size | Brotli Size |
| :--- | :---: | :---: | :---: |
| **Initial Bundle Total** | **${formatBytes(initialRaw)}** | **${formatBytes(initialGzip)}** | **${formatBytes(initialBrotli)}** |
| All Compiled Assets | ${formatBytes(totalRaw)} | ${formatBytes(totalGzip)} | ${formatBytes(totalBrotli)} |

---

### ⏱️ Deterministic Benchmarks

These benchmarks run locally in a sandboxed, deterministic virtual environment (using JSDOM where needed) and serve as a baseline for performance metrics.

| Benchmark Operation | Items Processed | Duration | Status |
| :--- | :---: | :---: | :---: |
`;

  const benchLabels = {
    'rss_parsing': 'RSS XML Parsing (100 items)',
    'deduplication': 'Deduplication (5000 items)',
    'filtering': 'Filtering (5000 items)',
    'sorting': 'Sorting (5000 items)',
    'merge': 'Merge (5000 existing + 1000 incoming)'
  };

  Object.keys(benchLabels).forEach(key => {
    const data = benchmarks[key];
    if (data) {
      md += `| ${benchLabels[key]} | ${data.itemsProcessed} | ${data.durationMs.toFixed(2)} ms | Pass ✅ |\n`;
    } else {
      md += `| ${benchLabels[key]} | - | N/A | Missing ⚠️ |\n`;
    }
  });

  md += `
---

### 📉 Documented Baselines & Recommended Thresholds

To maintain Flusso's light-weight and high-performance profile, the following thresholds are proposed for future Pull Request gates:

1. **Initial Bundle Expansion Gate**: Maximum **+5%** increase on any single Pull Request.
2. **Single Chunk Limit**: Alert/Warning if any single asset chunk exceeds **200 KB** (Gzip).
3. **Performance Regression Limit**: Max **15%** slowdown in local benchmark suites (under comparable runner conditions).

*Note: In this current initial phase, metrics are purely informative and will not trigger build failures.*
`;

  // Write report to dist
  fs.writeFileSync(path.join(distDir, 'performance-report.md'), md);
  console.log('Performance report saved to dist/performance-report.md');

  // If in GitHub Actions, write to Step Summary
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.writeFileSync(process.env.GITHUB_STEP_SUMMARY, md);
    console.log('Step Summary written successfully.');
  } else {
    console.log('\n--- REPORT PREVIEW ---');
    console.log(md);
    console.log('----------------------\n');
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
