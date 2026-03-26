## 1. Spec Promotion

- [ ] 1.1 Add spec promotion step to `archiveChange()` in `src/core/archive.ts` — copy `<change>/specs/` contents to `.foreman/specs/`, overwriting on conflict
- [ ] 1.2 Add tests for spec promotion in `src/__tests__/core/archive.test.ts` — verify specs are copied to `.foreman/specs/` during archive
