import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import { ConfigManager } from '../utils/ConfigManager'

export class CreateIgnoreCommand {
  async execute() {
    const workspaceFolder = vscode.workspace.workspaceFolders?.[0]
    if (!workspaceFolder) {
      vscode.window.showErrorMessage('No workspace folder open')
      return
    }

    const rootPath = workspaceFolder.uri.fsPath
    const configManager = new ConfigManager(rootPath)
    const config = await configManager.getConfig()
    const expIgnorePath = path.join(rootPath, config.ignoreFile)

    if (fs.existsSync(expIgnorePath)) {
      const choice = await vscode.window.showQuickPick(
        ['Overwrite', 'Append', 'Cancel'],
        {
          placeHolder: `${config.ignoreFile} already exists. What would you like to do?`,
        }
      )

      if (choice === 'Cancel' || !choice) {
        return
      }

      if (choice === 'Append') {
        await this.appendToIgnoreFile(expIgnorePath, config.ignoreFile)
        return
      }
    }

    await this.createIgnoreFile(rootPath, expIgnorePath, config.ignoreFile)
  }

  private async appendToIgnoreFile(expIgnorePath: string, ignoreFile: string) {
    const content = await vscode.window.showInputBox({
      prompt: 'Enter patterns to ignore (separate via comma)',
    })
    if (content) {
      const ignoreFile = content.split(',').map((item) => item.trim())
      fs.appendFileSync(expIgnorePath, ignoreFile.join('\n') + '\n')
      vscode.window.showInformationMessage(`${ignoreFile} updated`)
    }
  }

  private async createIgnoreFile(
    rootPath: string,
    expIgnorePath: string,
    ignoreFile: string
  ) {
    const gitignorePath = path.join(rootPath, '.gitignore')
    let initialContent = ''
    if (fs.existsSync(gitignorePath)) {
      initialContent = fs
        .readFileSync(gitignorePath, 'utf8')
        .split('\n')
        .filter((line) => line.trim() !== '')
        .join(', ')
    }

    const content = await vscode.window.showInputBox({
      prompt: 'Enter patterns to ignore (separate via comma)',
      value: initialContent,
    })

    if (content) {
      const ignoreContent =
        content
          .split(',')
          .map((item) => item.trim())
          .join('\n') + '\n'
      fs.writeFileSync(expIgnorePath, ignoreContent)
      vscode.window.showInformationMessage(`${ignoreFile} created`)
    }
  }
}
