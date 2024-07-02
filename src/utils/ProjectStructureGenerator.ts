// src/utils/ProjectStructureGenerator.ts

import * as vscode from 'vscode'
import * as path from 'path'
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
    const treeStructure = this.fileProcessor.getTreeStructure()
    let result = '# Project Structure\n\n```\n'
    result += treeStructure.join('\n')
    result += '\n```\n\n'
    return result
  }
}
