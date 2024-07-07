import * as vscode from 'vscode'
import * as path from 'path'
import { ConfigManager } from '../utils/ConfigManager'
import { FileProcessor } from '../utils/FileProcessor'
import { ProjectStructureGenerator } from '../utils/ProjectStructureGenerator'

export class ExportActiveTabsCommand {
  private outputChannel: vscode.OutputChannel

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel
  }

  async execute() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open')
      return
    }

    const rootPath = workspaceFolder.uri.fsPath
    const configManager = new ConfigManager(rootPath)
    const fileProcessor = new FileProcessor(
      rootPath,
      configManager,
      this.outputChannel
    )
    const structureGenerator = new ProjectStructureGenerator(
      rootPath,
      configManager,
      fileProcessor
    )

    const activeTabs = vscode.window.tabGroups.all
      .flatMap((group) => group.tabs)
      .filter((tab) => tab.input instanceof vscode.TabInputText)
      .map((tab) => (tab.input as vscode.TabInputText).uri.fsPath)

    let output: string[] = []

    const config = await configManager.getConfig()
    const description = await configManager.getDescription('activeTabs')
    if (description) {
      output.push(description + '\n\n')
    }

    if (config.includeProjectStructure) {
      output.push(await structureGenerator.generate())
    }

    output.push('# Active Tabs Content\n\n')

    for (const filePath of activeTabs) {
      const relativePath = path.relative(rootPath, filePath)
      const shouldProcess = await fileProcessor.shouldProcessFile(relativePath)

      if (shouldProcess) {
        const content = await fileProcessor.processFile(filePath, relativePath)
        output.push(content)
      } else {
        const userChoice = await this.promptUser(relativePath)
        if (userChoice === 'Yes' || userChoice === 'YesAll') {
          const content = await fileProcessor.processFile(
            filePath,
            relativePath
          )
          output.push(content)
        }
      }
    }

    await fileProcessor.writeOutput(output.join('\n'))
    vscode.window.showInformationMessage(
      `Active tabs exported to ${config.output}`
    )
  }

  private async promptUser(relativePath: string): Promise<string> {
    const choice = await vscode.window.showQuickPick(
      ['Yes', 'No', 'Yes to all', 'No to all'],
      {
        placeHolder: `${relativePath} is ignored. Process it?`,
      }
    )

    return choice || 'No'
  }
}
