# CookOut AI - Product & Technical Roadmap

This document outlines the phased roadmap for building **CookOut AI** from initial foundation to full AI-assisted cookout planning.

---

## Phase 1: Monorepo Foundation & Tooling Architecture (Current)

- [x] Modern TypeScript monorepo setup (`npm` workspaces)
- [x] Shared TypeScript base configuration (`tsconfig.base.json`) & project references
- [x] ESLint flat config, Prettier, EditorConfig, Husky, lint-staged
- [x] Core package placeholders in `@cookout-ai/domain` (`units`, `recipes`, `shopping`, `events`, `ai`)
- [x] Backend API service (`apps/api`) with Express & Vitest setup
- [x] Frontend application (`apps/web`) with React, Vite, Tailwind CSS, and shadcn/ui components
- [x] SQLite database integration with Prisma ORM
- [x] Continuous Integration via GitHub Actions (`ci.yml`)

---

## Phase 2: Core Domain Engine (`packages/domain`)

- [ ] Unit system engine: volume, weight, unit count conversions (metric & US customary)
- [ ] Recipe scaling calculator: scaling base quantities by guest headcount and portion ratios
- [ ] Ingredient consolidation engine: merging duplicate ingredients with unit normalization
- [ ] Pantry inventory subtraction: deducting available pantry items from gross shopping demand
- [ ] Comprehensive unit test suites for all arithmetic and edge cases (fractions, mixed units)

---

## Phase 3: Backend Services & Data Persistence (`apps/api`)

- [ ] REST API endpoints for Recipe CRUD management
- [ ] Event planning endpoints: creating cookout events, setting guest counts & menus
- [ ] Shopping list generation API with cost estimation
- [ ] Prisma models & migrations for Users, Events, Recipes, Ingredients, Pantry, and Shopping Lists
- [ ] Integration test coverage with Vitest

---

## Phase 4: Frontend UI & Interactive Event Planning (`apps/web`)

- [ ] Cookout Event Dashboard: guest headcount counter & menu builder
- [ ] Interactive Recipe Scaling view with real-time serving adjustments
- [ ] Consolidated Shopping List view with categorised aisle grouping and checkbox tracking
- [ ] Pantry inventory management interface
- [ ] Modern UI polish with Tailwind CSS, shadcn/ui components, and responsive mobile layout

---

## Phase 5: Gemini AI Integration & Advanced Features

- [ ] Gemini API integration for parsing unformatted recipe text and web URLs into structured JSON
- [ ] AI Cookout Assistant: automatic menu balancing recommendations based on guest preferences/dietary flags
- [ ] Smart Prep Schedule: AI-generated timeline for cookout prep (marinating times, smoking/grilling schedules)
- [ ] Intelligent grocery store substitution suggestions
