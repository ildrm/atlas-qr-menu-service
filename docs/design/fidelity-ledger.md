# Design fidelity ledger

The frontend was built with the `frontend-app-builder` workflow. No in-app browser connector was available, so Playwright was the required fallback for interaction and screenshot verification.

## Artifacts and native sizes

| Surface         | Concept                      | Implementation                      | Native frame |
| --------------- | ---------------------------- | ----------------------------------- | ------------ |
| Owner dashboard | `dashboard-concept.png`      | `dashboard-implementation.png`      | 1505 × 1045  |
| Public catalog  | `public-catalog-concept.png` | `public-catalog-implementation.png` | 1006 × 1564  |

Concept and implementation pairs were inspected with `view_image` in the same final QA pass after the last CSS adjustment.

## High-fidelity matches

- Dark forest navigation, white workspace, mint utility surfaces, coral primary action.
- Editorial serif headings paired with compact sans-serif controls and data.
- Dashboard topbar, business/branch context, KPI rail, live catalog card, activity chart, popular items, recent activity, public phone preview, and QR.
- Public cover photography, business/contact block, large catalog title, search, category/availability controls, alternating item composition, badges, price, and circular actions.
- Generated product photography is used in the product rather than remote placeholders.
- Responsive behavior preserves the design language while changing the information layout for mobile.

## Copy/data differences

| Concept                           | Implementation                                                         | Reason                                                           |
| --------------------------------- | ---------------------------------------------------------------------- | ---------------------------------------------------------------- |
| “Public menu preview”             | “Public catalog preview”                                               | Universal product terminology works beyond restaurants           |
| “View full menu”                  | “View full catalog”                                                    | Same universal terminology rule                                  |
| Large illustrative KPI values     | Smaller seeded values that change as tests/visitors create real events | Dashboard never presents fabricated runtime metrics              |
| Fixed May dates                   | Current seven-day dates from PostgreSQL                                | Live, timezone-aware reporting                                   |
| Coffee initially active           | All initially active                                                   | Global discoverability and predictable search across categories  |
| Offline banner visible in concept | Banner absent in online screenshot                                     | The product states offline only when `navigator.onLine` is false |

## Intentional implementation deviations

- The dashboard chart uses the real maximum of seeded data instead of the concept’s illustrative 400-point scale.
- The public list was tightened after native-size comparison so all five seeded items fit within the acceptance frame.
- The phone preview is semantic HTML/CSS, not a bitmap mock, and reflects live items.
- QR art is generated from the real resolver token.
- The concept notification control is omitted because notification delivery and inbox behavior are provider-gated; no dead control implies that delivery is active.

## Interaction verification

Playwright exercised:

- owner sign-in and persisted dashboard rendering;
- public global search across categories;
- category switching;
- item detail and variants;
- favorite action;
- Persian translated content and RTL direction;
- desktop and mobile Chromium projects;
- native-size dashboard and public-catalog screenshot capture.

Final browser result: 10/10 core tests passed, plus 2/2 temporary native-size capture tests. The capture-only test file was removed after producing the documented implementation frames.
