- allow Output, ignore and whitelist files into folders if they exist if not create them
- fix whitelist rules. At the moment they are not working as expected. When added any rules than I got nothing in the output section of the files export
- add an option to remove in code comments (we need some library here I think to cover different languages)
- add global vscode settings with ignore and whitelist files or folders
- create "allowIgnoredOnTabsExport" flag in config file. Then if some active tab files are "in the ignore list" or "children of ignored folder" and "allowIgnoredOnTabsExport setting is not set" then ask if they should be ignored on active tabs export command.

---

- I don't see vscpde extension seetings of extension
- whitelist not working, please fix it. When specified any file or folder then file contents output is empty.
- create ignore and whitelist files commands should place files in path specified in the config, if not specified then in the project root
- removing comments isn't working. require debugging

---

1. whitelist filepath rules not working properly with folders and files nested in folders. It should track filepath rules similar to ignore rules. If filepaths specified than only files in those paths will be included in the project content's export. There are cases where we can specify a file that is in the folder or folder that is in the folder. We don't need to specify exact path it's optional. So for example I have: `src/test/extension.test.ts` and I can specify `extension.test.ts` or `*test/**` and this should work.
2. Vscode dev console log: [Extension Host] Global ignore rules: undefined
   [Extension Host] Global whitelist rules: undefined
3. Removing comments not working properly. Try to fix this.

---

1. Create command similar to the active tabs but with a list of project files in the right order with checkboxes near each of the files. So user could specify one time Include rules for export.
