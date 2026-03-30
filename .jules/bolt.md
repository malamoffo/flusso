## 2024-05-22 - Optimize High-Frequency Context Updates

**Learning:** When a context provides frequently changing values (like audio progress or scroll position), it triggers re-renders for all consumer components. This can severely degrade performance if the article list or app shell consumes this context directly.

**Action:**
1. Split the context into a stable state context (for data that changes rarely) and a high-frequency context (for data that changes often).
2. Use a "strategy" pattern for component rendering: parent components should use the stable context to identify if a child needs to subscribe to the high-frequency context.
3. Wrap high-frequency consumers in smaller, isolated components to localize re-renders.
