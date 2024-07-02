# Export Directory to File

[🚧 UNSTABLE - WIP]

## Description

This Visual Studio Code extension allows you to export all files in a directory to a single Markdown file with support for ignoring and whitelisting files. This is particularly useful for creating comprehensive documentation or exporting files for AI or any other documentation purposes.

## Features

- Export all files in a directory to `export.md`.
- Support for ignoring and whitelisting files using config variables `ignoreList` and `includeFile`.
- Set global ignore filepath rules from settings
- Option to include project structure in the exported Markdown file.
- Option to remove in language comments
- Checks if the folder contains too many files (handful for specifying rules)
- Export active tabs
- Configuration through `exportconfig.json`.

## Configuration

Create a `exportconfig.json` file in the root of your workspace to configure the extension:

```json
{
  "output": "export/export.md",
  "descriptions": {
    "main": "export/project-description.md",
    "activeTabs": "export/project-description.md"
  },
  "ignoreFile": "export/.export-ignore",
  "includeFile": "export/.export-whitelist",
  "maxFileSize": 1048576,
  "removeComments": true,
  "includeProjectStructure": true
}
```

- `output`: Path to the output file (default is `export.md`).
- `descriptions`
  - `main`: Path to description of the project (default is `\n\n`) or actual text content than be included at the begining of exported file.
  - `activeTabs`: Path to description of the project for active tabs export (default is `\n\n`) or actual text content than be included at the begining of exported file.
- `ignoreFile`: Path to the file containing ignore patterns (filename should be `.export-ignore`).
- `includeFile`: Path to the file containing whitelist patterns (filename should be `.export-include`).
- `maxFileSize`: Maximum file size in bytes to process (default is 1048576 or 1MB).
- `includeProjectStructure`: Whether to include the project structure in the exported file (default is `true`).

P.S. `ignoreFile` and `includeFile` could be named differently but then VSCode will try to identify them as .md and you may have markup issues during save.

## Commands

- `Dir2file: Export Directory to File`: Exports the directory to `export.md`.
- `Dir2file: Export only active tabs`: Exports only the active tabs to `export.md`.
- `Dir2file: Create/Edit ignore File`: Creates or edits the ignore file specified in `ignoreFile`.
- `Dir2file: Create/Edit include File`: Creates or edits the include file specified in `includeFile`.

## Usage

1. Install the extension.
2. Configure the `exportconfig.json` file (optional).
3. [Optional] Use commands `Dir2file: Create/Edit ignore File` and `Dir2file: Create/Edit include File` to create or edit the ignore and include files specified in `ignoreFile` and `includeFile` config variables.
4. Run the command `Dir2file: Export Directory to Markdown` to export the directory to `output` file.

## Example `.export-ignore`

```
out/
dist/**
node_modules/
.vscode/
*.vsix
```

`directory` and `directory/**` will be ignored including all the files and will be not displayed in the tree structure.
`directory/` will be ignored including all the files but will be displayed in the tree structure.
`*.log` to ignore all file types.

## Example `.export-include`

```
src/**
*.log
README.md
```

This extension is a quick way to export your actual files for AI or any other documentation purposes.
