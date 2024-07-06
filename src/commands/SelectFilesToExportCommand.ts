import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs/promises'
import { FileProcessor } from '../utils/FileProcessor'
import { ConfigManager } from '../utils/ConfigManager'
import { ProjectStructureGenerator } from '../utils/ProjectStructureGenerator'
import { Config } from '../utils/ConfigManager'

interface TreeItem extends vscode.QuickPickItem {
  path: string
  isFolder: boolean
  level: number
  children?: TreeItem[]
}

export class SelectFilesToExportCommand {
  private fileProcessor: FileProcessor
  private configManager: ConfigManager
  private rootPath: string
  private projectStructureGenerator!: ProjectStructureGenerator
  private config!: Config
  private selectedItems: Set<string> = new Set()
  private context: vscode.ExtensionContext

  constructor(
    fileProcessor: FileProcessor,
    configManager: ConfigManager,
    context: vscode.ExtensionContext
  ) {
    this.fileProcessor = fileProcessor
    this.configManager = configManager
    this.context = context
    this.rootPath = vscode.workspace.workspaceFolders?.[0].uri.fsPath || ''
    this.initialize()
  }

  private async initialize() {
    this.config = await this.configManager.getConfig()
    this.projectStructureGenerator = new ProjectStructureGenerator(
      this.rootPath,
      this.config,
      this.fileProcessor
    )
    this.loadSelectedItems()
  }

  private loadSelectedItems() {
    const savedItems = this.context.workspaceState.get<string[]>(
      'selectedExportItems',
      []
    )
    this.selectedItems = new Set(
      savedItems.map((item) => this.normalizePath(item))
    )
    console.log('Loaded selected items:', Array.from(this.selectedItems))
  }

  private normalizePath(filePath: string): string {
    return filePath.replace(/\\/g, '/')
  }

  async execute() {
    await this.initialize()
    const treeItems = await this.buildTreeItems(this.rootPath)
    const selectedItems = await this.showQuickPick(treeItems)

    if (selectedItems) {
      await this.exportSelectedItems(selectedItems)
      this.saveSelectedItems(selectedItems)
    } else {
      vscode.window.showInformationMessage('Export cancelled')
    }
  }

  private async buildTreeItems(
    dir: string,
    level: number = 0
  ): Promise<TreeItem[]> {
    const entries = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(dir)
    )
    const items: TreeItem[] = []

    for (const [name, type] of entries) {
      const fullPath = path.join(dir, name)
      const relativePath = this.normalizePath(
        path.relative(this.rootPath, fullPath)
      )

      if (await this.fileProcessor.shouldProcessFile(relativePath)) {
        const isFolder = type === vscode.FileType.Directory
        const item: TreeItem = {
          label: this.getLabel(name, isFolder, level),
          description: relativePath,
          // detail: isFolder ? 'Folder' : path.extname(name).slice(1),
          path: relativePath,
          isFolder,
          level,
          picked: this.selectedItems.has(relativePath),
          buttons: [
            {
              iconPath: new vscode.ThemeIcon('check-all'),
              tooltip: isFolder ? 'Select all in folder' : 'Toggle selection',
            },
          ],
        }

        if (isFolder) {
          item.children = await this.buildTreeItems(fullPath, level + 1)
        }

        items.push(item)
      }
    }

    return items
  }

  private getLabel(name: string, isFolder: boolean, level: number): string {
    const indent = '  '.repeat(level)
    const icon = isFolder ? '$(folder) ' : '$(file) '
    return `${indent}${icon}${name}`
  }

  private async showQuickPick(
    items: TreeItem[]
  ): Promise<TreeItem[] | undefined> {
    const quickPick = vscode.window.createQuickPick<TreeItem>()
    quickPick.items = this.flattenTreeItems(items)
    quickPick.canSelectMany = true
    quickPick.title = 'Select Files and Folders to Export'

    // Pre-select items based on saved selection
    quickPick.selectedItems = quickPick.items.filter((item) =>
      this.selectedItems.has(item.path)
    )

    quickPick.onDidTriggerItemButton(async (event) => {
      this.toggleSelectItem(quickPick, event.item)
    })

    const result = await new Promise<TreeItem[] | undefined>((resolve) => {
      quickPick.onDidAccept(() => {
        resolve(quickPick.selectedItems.map((item) => ({ ...item })))
        quickPick.hide()
      })
      quickPick.onDidHide(() => resolve(undefined))
      quickPick.show()
    })

    quickPick.dispose()
    return result
  }

  private flattenTreeItems(items: TreeItem[]): TreeItem[] {
    let flattened: TreeItem[] = []
    for (const item of items) {
      flattened.push(item)
      if (item.children) {
        flattened = flattened.concat(this.flattenTreeItems(item.children))
      }
    }
    return flattened
  }

  private toggleSelectItem(
    quickPick: vscode.QuickPick<TreeItem>,
    item: TreeItem
  ) {
    const itemsToToggle = item.isFolder
      ? this.getAllDescendants(item, quickPick.items)
      : [item]
    const allSelected = itemsToToggle.every((i) =>
      quickPick.selectedItems.includes(i)
    )

    if (allSelected) {
      quickPick.selectedItems = quickPick.selectedItems.filter(
        (i) => !itemsToToggle.includes(i)
      )
    } else {
      quickPick.selectedItems = [
        ...new Set([...quickPick.selectedItems, ...itemsToToggle]),
      ]
    }
  }

  private getAllDescendants(
    item: TreeItem,
    allItems: readonly TreeItem[]
  ): TreeItem[] {
    let descendants: TreeItem[] = [item]
    const childItems = allItems.filter(
      (i) => i.path.startsWith(item.path) && i.path !== item.path
    )
    descendants = descendants.concat(childItems)
    return descendants
  }

  private async exportSelectedItems(items: TreeItem[]) {
    const filesToExport: string[] = items
      .filter((item) => !item.isFolder)
      .map((item) => item.path)

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting files',
        cancellable: true,
      },
      async (progress, token) => {
        token.onCancellationRequested(() => {
          console.log('User canceled the export')
          return
        })

        const outputPath = path.join(this.rootPath, this.config.output)

        let output = ''

        // Add description
        const description = await this.configManager.getDescription('main')
        if (description) {
          output += description + '\n\n'
        }

        if (this.config.includeProjectStructure) {
          output += (await this.projectStructureGenerator.generate()) + '\n\n'
        }

        output += '# Selected Files Content\n\n'

        for (let i = 0; i < filesToExport.length; i++) {
          if (token.isCancellationRequested) {
            vscode.window.showInformationMessage('Export cancelled')
            return
          }

          const filePath = filesToExport[i]
          progress.report({
            increment: 100 / filesToExport.length,
            message: `Exporting ${filePath}`,
          })

          const fullPath = path.join(this.rootPath, filePath)
          const content = await fs.readFile(fullPath, 'utf-8')

          output += `## ${filePath}\n\n\`\`\`${path
            .extname(filePath)
            .slice(1)}\n${content}\n\`\`\`\n\n`
        }

        await fs.writeFile(outputPath, output)
        vscode.window.showInformationMessage(
          `Exported ${filesToExport.length} files to ${this.config.output}`
        )
      }
    )
    console.log(
      'Exporting selected items:',
      items.map((item) => item.path)
    )
  }

  private saveSelectedItems(items: TreeItem[]) {
    const itemPaths = items.map((item) => this.normalizePath(item.path))
    this.selectedItems = new Set(itemPaths)
    this.context.workspaceState.update(
      'selectedExportItems',
      Array.from(this.selectedItems)
    )
    console.log('Saved selected items:', itemPaths)
  }
}
