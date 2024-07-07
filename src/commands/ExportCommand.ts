import * as vscode from 'vscode'
import { ConfigManager } from '../utils/ConfigManager'
import { FileProcessor } from '../utils/FileProcessor'
import { ProjectStructureGenerator } from '../utils/ProjectStructureGenerator'

export class ExportCommand {
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

    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Exporting directory to file',
        cancellable: true,
      },
      async (progress, token) => {
        try {
          const config = await configManager.getConfig()
          const description = await configManager.getDescription('main')
          let output: string[] = []

          if (description) {
            output.push(description + '\n\n')
          }

          if (config.includeProjectStructure) {
            output.push(await structureGenerator.generate())
          }

          const processedFiles = await fileProcessor.processDirectory(
            progress,
            token
          )
          this.outputChannel.appendLine(
            `Processed files: ${processedFiles.length}`
          )

          output = output.concat(processedFiles)

          if (output.length === 0) {
            throw new Error('No files were processed')
          }

          await fileProcessor.writeOutput(output.join('\n'))
          vscode.window.showInformationMessage(
            `Files exported to ${config.output}`
          )
        } catch (error: any) {
          if (error instanceof vscode.CancellationError) {
            vscode.window.showInformationMessage(
              'Export operation was cancelled'
            )
          } else {
            vscode.window.showErrorMessage(
              `Error exporting files: ${error.message}`
            )
          }
        }
      }
    )
  }
}
