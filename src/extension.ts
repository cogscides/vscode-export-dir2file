import * as vscode from 'vscode'
import { ExportCommand } from './commands/ExportCommand'
import { CreateIgnoreCommand } from './commands/CreateIgnoreCommand'
import { CreateIncludeCommand } from './commands/CreateIncludeCommand'
import { ExportActiveTabsCommand } from './commands/ExportActiveTabsCommand'
import { OpenSettingsCommand } from './commands/OpenSettingsCommand'
import { SelectFilesToExportCommand } from './commands/SelectFilesToExportCommand'
import { ConfigManager } from './utils/ConfigManager'
import { FileProcessor } from './utils/FileProcessor'

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Directory2File')

  const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
  if (!workspaceFolder) {
    vscode.window.showErrorMessage('No workspace folder open')
    return
  }

  const rootPath = workspaceFolder.uri.fsPath
  const configManager = new ConfigManager(rootPath)

  // We need to await the config here
  configManager.getConfig().then((config) => {
    const fileProcessor = new FileProcessor(rootPath, config, outputChannel)

    const exportCommand = new ExportCommand(outputChannel)
    const createIgnoreCommand = new CreateIgnoreCommand()
    const createIncludeCommand = new CreateIncludeCommand()
    const exportActiveTabsCommand = new ExportActiveTabsCommand(outputChannel)
    const openSettingsCommand = new OpenSettingsCommand()
    const selectFilesToExportCommand = new SelectFilesToExportCommand(
      fileProcessor,
      configManager,
      context
    )

    context.subscriptions.push(
      vscode.commands.registerCommand('directory2file.exportToFile', () =>
        exportCommand.execute()
      ),
      vscode.commands.registerCommand('directory2file.createIgnore', () =>
        createIgnoreCommand.execute()
      ),
      vscode.commands.registerCommand('directory2file.createInclude', () =>
        createIncludeCommand.execute()
      ),
      vscode.commands.registerCommand('directory2file.exportActiveTabs', () =>
        exportActiveTabsCommand.execute()
      ),
      vscode.commands.registerCommand('directory2file.openSettings', () =>
        openSettingsCommand.execute()
      ),
      vscode.commands.registerCommand(
        'directory2file.selectFilesToExport',
        () => selectFilesToExportCommand.execute()
      ),
      outputChannel
    )
  })
}

export function deactivate() {
  console.log('Directory2File extension deactivated')
}
