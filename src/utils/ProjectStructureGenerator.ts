// src/utils/ProjectStructureGenerator.ts

import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import { Config } from './ConfigManager'
import { FileProcessor } from './FileProcessor'

export class ProjectStructureGenerator {
  private rootPath: string
  private config: Config
  private fileProcessor: FileProcessor

  constructor(rootPath: string, config: Config, fileProcessor: FileProcessor) {
    this.rootPath = rootPath
    this.config = config
    this.fileProcessor = fileProcessor
  }

  async generate(): Promise<string> {
    const treeStructure = await this.buildTreeStructure(this.rootPath, '')
    let result = '# Project Structure\n\n```\n'
    result += treeStructure.join('\n')
    result += '\n```\n\n'
    return result
  }

  private async buildTreeStructure(
    dir: string,
    prefix: string
  ): Promise<string[]> {
    const entries = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(dir)
    )
    const structure: string[] = []

    for (const [name, type] of entries) {
      const relativePath = path.relative(this.rootPath, path.join(dir, name))
      if (await this.fileProcessor.shouldProcessFile(relativePath)) {
        if (type === vscode.FileType.Directory) {
          structure.push(`${prefix}${name}/`)
          const subStructure = await this.buildTreeStructure(
            path.join(dir, name),
            `${prefix}  `
          )
          structure.push(...subStructure)
        } else {
          structure.push(`${prefix}${name}`)
        }
      }
    }

    return structure
  }
}
