## 2024-05-22 - Optimize High-Frequency Context Updates

**Learning:** When a context provides frequently changing values (like audio progress or scroll position), it triggers re-renders for all consumer components. This can severely degrade performance if the article list or app shell consumes this context directly.

**Action:**
1. Split the context into a stable state context (for data that changes rarely) and a high-frequency context (for data that changes often).
2. Use a "strategy" pattern for component rendering: parent components should use the stable context to identify if a child needs to subscribe to the high-frequency context.
3. Wrap high-frequency consumers in smaller, isolated components to localize re-renders.

## 2025-03-24 - Avoid Redundant Sorting in Derived State

**Learning:** When a global state (like an article list) is already sorted by a primary key (e.g., `pubDate`), downstream `useMemo` hooks that filter this list should NOT re-sort it. Sorting is an O(N log N) operation that becomes expensive as the list grows, while `filter()` is O(N) and preserves order.

**Action:** Identify the source of truth for sorting and remove redundant `.sort()` calls in consumer components. Add comments to `useMemo` blocks explaining why the sort is redundant to prevent future regressions.

## 2025-03-24 - Consolidate O(N) Iterations in Context

**Learning:** Multiple components often need different counts derived from the same large array (e.g., `unreadCount`, `savedCount`). Using multiple `filter().length` calls triggers multiple O(N) passes.

**Action:** Consolidate these into a single `useMemo` with a single `for` loop pass to calculate all necessary counters in one go. Export these counts from the context to save CPU cycles in all consuming components.