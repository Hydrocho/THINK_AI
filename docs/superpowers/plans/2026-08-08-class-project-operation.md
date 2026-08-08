# Class Project Operation Implementation Plan

**Goal:** Separate reusable project design from shared class operation, allowing teachers to publish, copy, version, attach, activate, and open lesson plans safely.

## Implementation order

1. Add versioned project, lesson-plan, class-project, and class-session tables with RLS.
2. Add authenticated Edge Functions for creating, publishing, copying, versioning, attaching, activating, and opening/closing classes.
3. Replace the teacher dashboard tabs with `수업 운영`, `수업 설계`, and `계정 관리`.
4. Build project list/editor and class-card operation screens using the APIs.
5. Verify role isolation, version snapshots, project reuse across classes, and class-session transitions.

## Data contracts

- `projects`: author-owned project metadata and public/private state.
- `project_versions`: immutable version snapshot for a project.
- `lesson_plans`: ordered lesson plan data belonging to a version.
- `class_projects`: a selected version snapshot connected to one shared class.
- `class_sessions`: teacher-owned active/inactive lesson opening state for a connected class project.

## Global constraints

- Public projects are copyable by approved teachers; originals remain editable only by their authors.
- Project changes create a new version; existing class links retain their selected snapshot.
- A class may have many connected projects but only one active project per teacher execution context.
- Activating a project does not open a lesson; a teacher explicitly chooses and opens one lesson.
- Student outcomes and evaluation data remain teacher-isolated.
