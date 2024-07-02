import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { ConfigManager } from '../utils/ConfigManager'

export class CreateIncludeCommand {
  async execute() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open')
      return
    }

    const rootPath = workspaceFolder.uri.fsPath
    const configManager = new ConfigManager(rootPath)
    const config = await configManager.getConfig()
    const expIncludePath = path.join(rootPath, config.includeFile)

    if (fs.existsSync(expIncludePath)) {
      const choice = await vscode.window.showQuickPick(
        ['Overwrite', 'Append', 'Cancel'],
        {
          placeHolder: `${config.includeFile} already exists. What would you like to do?`,
        }
      )

      if (choice === 'Cancel' || !choice) {
        return
      }

      if (choice === 'Append') {
        await this.appendToIncludeFile(expIncludePath, config.includeFile)
        return
      }
    }

    await this.createIncludeFile(expIncludePath, config.includeFile)
  }

  private async appendToIncludeFile(
    expIncludePath: string,
    includeFile: string
  ) {
    const content = await vscode.window.showInputBox({
      prompt: 'Enter patterns to include (separate via comma)',
    })
    if (content) {
      const includeContent =
        content
          .split(',')
          .map((item) => item.trim())
          .join('\n') + '\n'
      fs.appendFileSync(expIncludePath, includeContent)
      vscode.window.showInformationMessage(`${includeFile} updated`)
    }
  }

  private async createIncludeFile(expIncludePath: string, includeFile: string) {
    const content = await vscode.window.showInputBox({
      prompt: 'Enter patterns to include (separate via comma)',
    })

    if (content) {
      const includeContent =
        content
          .split(',')
          .map((item) => item.trim())
          .join('\n') + '\n'
      fs.writeFileSync(expIncludePath, includeContent)
      vscode.window.showInformationMessage(`${includeFile} created`)
    }
  }
}
