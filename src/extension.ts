import * as vscode from 'vscode'
import { ExportCommand } from './commands/ExportCommand'
import { CreateIgnoreCommand } from './commands/CreateIgnoreCommand'
import { CreateIncludeCommand } from './commands/CreateIncludeCommand'
import { ExportActiveTabsCommand } from './commands/ExportActiveTabsCommand'
import { OpenSettingsCommand } from './commands/OpenSettingsCommand'

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel('Directory2File')

  const exportCommand = new ExportCommand(outputChannel)
  const createIgnoreCommand = new CreateIgnoreCommand()
  const createIncludeCommand = new CreateIncludeCommand()
  const exportActiveTabsCommand = new ExportActiveTabsCommand(outputChannel)
  const openSettingsCommand = new OpenSettingsCommand()

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
    outputChannel
  )
}

export function deactivate() {
  console.log('Directory2File extension deactivated')
}
