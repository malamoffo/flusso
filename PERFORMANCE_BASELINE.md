# 📈 Flusso Performance Baseline & Recommended Thresholds

This document establishes the official performance baseline for the Flusso client-side application and defines proposed CI gates/thresholds to prevent performance regressions and bundle bloating.

---

## 💾 1. Bundle Size Baseline

The following baseline is derived from the production build of Flusso on **July 15, 2026**:

| Metric | Raw Size | Gzip Size | Brotli Size | Description |
| :--- | :---: | :---: | :---: | :--- |
| **Initial Bundle Total** | **1.06 MB** | **323.24 KB** | **272.99 KB** | Critical chunks needed on page load |
| **All Assets Total** | **1.21 MB** | **360.84 KB** | **305.67 KB** | Full application package size |

### ⚡ Critical Initial Chunks

These chunks are rendered in the HTML `<head>` on initial load:
- `react-vendor`: React runtime core.
- `utils-vendor`: Core utility libraries (DOMPurify, Readability, Dexie).
- `ui-vendor`: Animation and icons (Framer Motion, Lucide).
- `index.css`: Global styles (Tailwind v4).
- `storage-CEDtGFKx.js`: Dexie local database layer.
- `index.js`: Primary app logic & state managers.

---

## ⏱️ 2. Execution Performance Baseline

These deterministic benchmarks are executed locally (using standard mocked fixtures, ensuring zero network dependence and high reproducibility) on `ubuntu-latest` CI runners:

| Benchmark Operation | Dataset Size | Baseline Duration |
| :--- | :---: | :---: |
| **RSS XML Parsing** | 100 feed items | **~185.50 ms** |
| **Deduplication** | 5,000 articles (30% duplicates) | **~1.46 ms** |
| **Filtering** | 5,000 articles | **~1.00 ms** |
| **Sorting** | 5,000 articles | **~0.34 ms** |
| **Merge (Binary Search)** | 5,000 existing + 1,000 incoming items | **~3.06 ms** |

---

## 🚫 3. Proposed CI Gates & Gates Guidelines

To protect the application's lightweight profile without blocking releases during the initial deployment phase, these rules are **informative only** in Phase 1, but we recommend promoting them to blockers in the next phase:

### 📐 Thresholds for Review

1. **Initial Bundle Expansion Gate**: 
   - **Threshold**: **+5%** maximum increase on any single Pull Request.
   - **Justification**: Protects against unexpected large dependency additions.

2. **Single Chunk Limit**:
   - **Threshold**: **200 KB** Gzip maximum for any single compiled asset chunk.
   - **Justification**: Forces manual chunk splitting if a component grows excessively large.

3. **Performance Regression Limit**:
   - **Threshold**: **15%** maximum increase in local execution durations (under identical runner conditions).
   - **Justification**: Prevents the introduction of O(N^2) algorithms in filtering, sorting, or XML processing.
