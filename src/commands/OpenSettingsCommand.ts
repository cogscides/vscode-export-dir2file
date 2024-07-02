import * as vscode from 'vscode'

export class OpenSettingsCommand {
  async execute() {
    await vscode.commands.executeCommand(
      'workbench.action.openSettings',
      'Export Directory to File'
    )
  }
}
