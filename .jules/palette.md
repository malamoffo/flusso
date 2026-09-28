## 2024-09-15 - [Add ARIA labels to RedditPostReader navigation buttons]
**Learning:** When using standard `react-lucide` icons as the primary content of icon-only navigation buttons in reader modals (like `RedditPostReader.tsx`), it is essential to ensure they have appropriate `aria-label`s and that the icon itself sets `aria-hidden='true'`.
**Action:** Audit other similar full-screen reader components (like `ArticleReader.tsx` or `ImageViewer.tsx`) to apply consistent ARIA labeling to their navigation and close buttons.
