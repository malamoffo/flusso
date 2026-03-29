## 2025-05-15 - [Tactile Feedback & Accessibility Patterns]
**Learning:** In mobile-first RSS readers, tactile feedback (e.g., scale-down on tap) significantly improves the perceived responsiveness of navigation controls. Accessibility is often overlooked in icon-heavy interfaces; every icon-only button must have an explicit `aria-label`, and the icons themselves should be hidden from screen readers to reduce noise.
**Action:** Use `motion.button` with `whileTap={{ scale: 0.9 }}` for all primary navigation and action buttons. Always pair `aria-label` on buttons with `aria-hidden="true"` on their internal icons.

## 2025-05-16 - [Onboarding Guidance & Modal Deep-linking]
**Learning:** For apps with an empty initial state, a clear CTA that deep-links to the relevant configuration tab (e.g., Subscriptions) significantly reduces user friction.
**Action:** Use an `initialTab` prop in modals to allow opening them to a specific context from CTA buttons. Pair with `aria-label` and `role="switch"` for accessibility.
