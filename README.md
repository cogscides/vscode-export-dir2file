# Export Directory to File

## Description

This Visual Studio Code extension allows you to export all files in a directory to a single Markdown file with support for ignoring and whitelisting files. This is particularly useful for creating comprehensive documentation or exporting files for AI or any other documentation purposes.

## Features

- Export all files in a directory to `export.md`.
- Support for ignoring and whitelisting files using `.exp-ignore` and `.exp-whitelist`.
- Option to include project structure in the exported Markdown file.
- Configuration through `.exportconfig.json`.

## Configuration

Create a `.exportconfig.json` file in the root of your workspace to configure the extension:

```json
{
  "output": "export.md",
  "description": "This is the project codebase we are working on.",
  "ignoreFile": ".exp-ignore",
  "allowList": ".exp-whitelist",
  "includeProjectStructure": true
}
```

- `output`: Path to the output file (default is `export.md`).
- `descrition`: Description of the project (default is `\n\n`) or actual Markdown content.
- `ignoreFile`: Path to the file containing ignore patterns (default is `.exp-ignore`).
- `allowList`: Path to the file containing whitelist patterns (default is `.exp-whitelist`).
- `includeProjectStructure`: Whether to include the project structure in the exported file (default is `true`).

## Commands

- `Dir2file: Export Directory to Markdown`: Exports the directory to `export.md`.
- `Dir2file: Create/Edit .exp-ignore File`: Creates or edits the `.exp-ignore` file.
- `Dir2file: Create/Edit .exp-whitelist File`: Creates or edits the `.exp-whitelist` file.

## Usage

1. Install the extension.
2. Configure the `.exportconfig.json` file (optional).
3. Run the command `Dir2file: Export Directory to Markdown` to export the directory.

## Example `.exp-ignore`

```
out/
dist/
node_modules/
.vscode/
*.vsix
```

## Example `.exp-whitelist`

```
src/
README.md
```

This extension is a quick way to export your actual files for AI or any other documentation purposes.
