# Skill: Frontend Architecture Standard
**Description:** Defines construction rules for a modern SPA based on Next.js 14 and Tailwind CSS.

## Usage Context
Use whenever creating a new component, page, or layout.

## Critical Rules
- **Stack:** Next.js 14 (App Router), strict TypeScript, Tailwind CSS.
- **Atomic Design:** Separate components into `atoms`, `molecules`, and `organisms`.
- **Server vs Client:** Use Server Components by default. Only use `'use client'` for components requiring interactivity (e.g., Gachapon, Charts).
- **Naming:** PascalCase for components, camelCase for hooks and functions.

## Implementation Workflow
1. Define TypeScript Interfaces for the data.
2. Create the base component with Tailwind (Mobile First).
3. Apply Cyberpunk styles (neon borders, glassmorphism filters).