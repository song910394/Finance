---
description: Protocol for updating application version before pushing changes
---

# Version Update Protocol

Before pushing any changes to the repository, you MUST follow this protocol to ensure the application version is updated correctly.

## 1. Determine Change Magnitude
Analyze the changes you have made and categorize them:
- **Small Change (Patch)**: Bug fixes, minor UI tweaks, text changes. (e.g., 1.0.0 -> 1.0.1)
- **Medium Change (Minor)**: New features, significant refactoring, non-breaking changes. (e.g., 1.0.0 -> 1.1.0)
- **Large Change (Major)**: Breaking changes, major architectural overhauls. (e.g., 1.0.0 -> 2.0.0)

## 2. Ask the User
**CRITICAL**: You must ASK the user for their preferred version number before applying it. Do not auto-increment without confirmation unless explicitly instructed.

**Template:**
"I am ready to push the changes. According to our versioning protocol:
- Current Version: [Current Version]
- Proposed Update: [Patch/Minor/Major] -> [New Version]

Do you want to proceed with this version number, or would you like to specify a different one?"

## 3. Update package.json
Once the user confirms the version number:
1. Open `package.json`.
2. Update the `"version"` field.
3. Save the file.

## 4. Commit and Push
1. Stage `package.json` along with your other changes.
2. Commit with a message that includes the version bump (e.g., "Release v1.0.1: Fixed reconciliation logic").
3. Push to the repository.
