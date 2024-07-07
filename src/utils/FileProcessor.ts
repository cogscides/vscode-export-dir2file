import * as vscode from 'vscode'
import * as fs from 'fs'
import * as path from 'path'
import ignore, { Ignore } from 'ignore'
import { minimatch } from 'minimatch'
import stripComments from 'strip-comments'
import { Config, ConfigManager } from './ConfigManager'

export class FileProcessor {
  private rootPath: string
  private configManager: ConfigManager
  private outputChannel: vscode.OutputChannel
  private ignoreRules!: Ignore
  private includeRules!: string[]
  private userChoiceCache: Map<string, string> = new Map()
  private processedFiles: Set<string> = new Set()
  private treeStructure: string[] = []
  private filesToProcess: string[] = []
  private initializationPromise: Promise<void>

  constructor(
    rootPath: string,
    configManager: ConfigManager,
    outputChannel: vscode.OutputChannel
  ) {
    this.rootPath = rootPath
    this.configManager = configManager
    this.outputChannel = outputChannel
    this.initializationPromise = this.initialize()
  }

  private async initialize() {
    this.ignoreRules = await this.getIgnoreRules()
    this.includeRules = await this.getIncludeRules()
    this.log('FileProcessor initialized')
  }

  private async ensureInitialized() {
    await this.initializationPromise
  }

  async processDirectory(
    progress: vscode.Progress<{ message?: string; increment?: number }>,
    token: vscode.CancellationToken
  ): Promise<string[]> {
    await this.ensureInitialized()
    this.log('Starting directory processing')
    const output: string[] = []

    await this.buildTreeStructure(this.rootPath, '')
    const totalFiles = this.filesToProcess.length
    this.log(`Total files to process: ${totalFiles}`)

    for (const [index, relativePath] of this.filesToProcess.entries()) {
      if (token.isCancellationRequested) {
        this.log('Processing cancelled by user')
        throw new vscode.CancellationError()
      }

      progress.report({
        increment: 100 / totalFiles,
        message: `Processing: ${relativePath}`,
      })

      if (this.processedFiles.has(relativePath)) {
        continue
      }

      try {
        const fullPath = path.join(this.rootPath, relativePath)
        const shouldProcess = await this.shouldProcessFile(relativePath)

        if (shouldProcess) {
          const content = await this.processFile(fullPath, relativePath)
          output.push(content)
          this.processedFiles.add(relativePath)
          this.log(`Processed file: ${relativePath}`)
        } else {
          this.log(`Skipped file: ${relativePath}`)
        }
      } catch (error) {
        this.log(`Error processing file ${relativePath}: ${error}`, true)
      }
    }

    this.log(
      `Directory processing completed. Processed files: ${output.length}`
    )
    return output
  }

  async shouldProcessFile(
    relativePath: string,
    applyInclude: boolean = true,
    promptOnIncludeIntersect: boolean = true
  ): Promise<boolean> {
    await this.ensureInitialized()

    const config = await this.configManager.getConfig()
    const isIgnored = this.ignoreRules.ignores(relativePath)
    const isIncluded = applyInclude && this.shouldIncludeFile(relativePath)

    this.log(`Checking file: ${relativePath}`)
    this.log(`  Ignored: ${isIgnored}`)
    this.log(`  Included: ${isIncluded}`)

    if (applyInclude && this.includeRules.length > 0) {
      if (isIncluded) {
        if (isIgnored && promptOnIncludeIntersect) {
          const userChoice = await this.promptUser(relativePath)
          if (userChoice === 'Yes' || userChoice === 'YesAll') {
            this.log(
              `  Result: Processing (user approved ignored but included file)`
            )
            return true
          } else {
            this.log(
              `  Result: Skipping (user rejected ignored but included file)`
            )
            return false
          }
        }
        this.log(`  Result: Processing (explicitly included)`)
        return true
      }
      this.log(`  Result: Skipping (not in include rules)`)
      return false
    }

    if (!isIgnored) {
      this.log(`  Result: Processing (not ignored)`)
      return true
    }

    this.log(`  Result: Skipping (ignored)`)
    return false
  }

  private async promptUser(relativePath: string): Promise<string> {
    const dirPath = path.dirname(relativePath)
    if (this.userChoiceCache.has(dirPath)) {
      return this.userChoiceCache.get(dirPath)!
    }

    const choice = await vscode.window.showQuickPick(
      [
        'Yes',
        'No',
        'Yes to all in this directory',
        'No to all in this directory',
      ],
      {
        placeHolder: `${relativePath} is ignored but included. Process it?`,
      }
    )

    switch (choice) {
      case 'Yes to all in this directory':
        this.userChoiceCache.set(dirPath, 'YesAll')
        return 'YesAll'
      case 'No to all in this directory':
        this.userChoiceCache.set(dirPath, 'NoAll')
        return 'NoAll'
      default:
        return choice || 'No'
    }
  }

  async processFile(filePath: string, relativePath: string): Promise<string> {
    const stats = await vscode.workspace.fs.stat(vscode.Uri.file(filePath))
    const config = await this.configManager.getConfig()

    if (stats.size > (config.maxFileSize || 1024 * 1024)) {
      return `## ${relativePath}\n\nFile is too large to process (${stats.size} bytes)\n\n`
    }

    let content = await vscode.workspace.fs.readFile(vscode.Uri.file(filePath))
    let fileContent = new TextDecoder().decode(content)
    const fileExtension = path.extname(filePath).slice(1)

    if (config.removeComments) {
      fileContent = this.stripComments(fileContent, fileExtension)
    }

    return `## ${relativePath}\n\n\`\`\`${fileExtension}\n${fileContent.trimRight()}\n\`\`\`\n\n`
  }

  async writeOutput(content: string): Promise<void> {
    const outputPath = await this.ensureOutputPath()
    this.log(`Writing output to: ${outputPath}`)
    await vscode.workspace.fs.writeFile(
      vscode.Uri.file(outputPath),
      Buffer.from(content)
    )
    this.log('Output written successfully')
  }

  private async getIgnoreRules(): Promise<Ignore> {
    this.log('Getting ignore rules')
    const config = await this.configManager.getConfig()
    const globalIgnoreRules = vscode.workspace
      .getConfiguration('directory2file')
      .get('globalIgnoreRules', []) as string[]

    let ignoreRules = ignore().add(globalIgnoreRules)

    const ignorePath = path.join(this.rootPath, config.ignoreFile)
    if (fs.existsSync(ignorePath)) {
      const ignoreContent = fs.readFileSync(ignorePath, 'utf8')
      const customRules = ignoreContent
        .split('\n')
        .filter((line) => line.trim() !== '' && !line.startsWith('#'))
      ignoreRules.add(customRules)
      this.log(`Custom ignore rules added from: ${config.ignoreFile}`)
    }

    const defaultRules = [
      '.git/**',
      'node_modules/**',
      '.vscode/**',
      'dist/**',
      'out/**',
      '*.vsix',
    ]
    ignoreRules.add(defaultRules)
    this.log('Default ignore rules added')

    return ignoreRules
  }

  private async getIncludeRules(): Promise<string[]> {
    this.log('Getting include rules')
    const config = await this.configManager.getConfig()
    const globalIncludeRules: string[] = vscode.workspace
      .getConfiguration('directory2file')
      .get('globalIncludeRules', [])

    const includePath = path.join(this.rootPath, config.includeFile)
    let includeRules: string[] = [...globalIncludeRules]

    if (fs.existsSync(includePath)) {
      const includeContent = fs.readFileSync(includePath, 'utf8')
      const newRules: string[] = includeContent
        .split('\n')
        .filter((line) => line.trim() !== '')
        .map((pattern) => pattern.trim())
      includeRules = includeRules.concat(newRules)
      this.log(`Custom include rules added from: ${config.includeFile}`)
    }

    return includeRules
  }

  private shouldIncludeFile(relativePath: string): boolean {
    return this.includeRules.some((rule) => {
      if (rule.startsWith('"') && rule.endsWith('"')) {
        // Explicit filename or path rule
        const unquotedRule = rule.slice(1, -1)
        if (path.isAbsolute(unquotedRule)) {
          // Full path rule
          return relativePath === path.relative(this.rootPath, unquotedRule)
        } else {
          // Filename or relative path rule
          return (
            relativePath === unquotedRule ||
            path.basename(relativePath) === unquotedRule
          )
        }
      }
      if (rule.endsWith('/**')) {
        const dirPath = rule.slice(0, -3)
        return (
          relativePath === dirPath ||
          relativePath.startsWith(dirPath + path.sep)
        )
      }
      if (rule.includes('*')) {
        return minimatch(relativePath, rule, { matchBase: true, dot: true })
      }
      return relativePath === rule || relativePath.startsWith(rule + path.sep)
    })
  }

  private stripComments(content: string, fileExtension: string): string {
    const supportedLanguages = vscode.workspace
      .getConfiguration('directory2file')
      .get('stripCommentsFromExtensions', [
        'js',
        'ts',
        'jsx',
        'tsx',
        'css',
        'less',
        'scss',
        'html',
        'xml',
        'svg',
        'yaml',
        'yml',
        'py',
        'rb',
        'php',
        'java',
        'c',
        'cpp',
        'cs',
        'go',
        'rs',
        'swift',
        'kt',
      ])

    if (supportedLanguages.includes(fileExtension.toLowerCase())) {
      return stripComments(content, {
        language: fileExtension,
        preserveNewlines: true,
      })
    }

    return content
  }

  private async getFiles(dir: string): Promise<string[]> {
    this.log(`Getting files from directory: ${dir}`)
    const entries = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(dir)
    )
    const files: string[] = []

    for (const [entry, type] of entries) {
      const fullPath = path.join(dir, entry)
      const relativePath = path.relative(this.rootPath, fullPath)

      if (type === vscode.FileType.Directory) {
        files.push(...(await this.getFiles(fullPath)))
      } else if (type === vscode.FileType.File) {
        files.push(fullPath)
      }
    }

    return files
  }

  private async ensureOutputPath(): Promise<string> {
    const config = await this.configManager.getConfig()
    const fullPath = path.join(this.rootPath, config.output)
    const outputDir = path.dirname(fullPath)

    if (!fs.existsSync(outputDir)) {
      const createDir = await vscode.window.showQuickPick(['Yes', 'No'], {
        placeHolder: `Output directory ${outputDir} does not exist. Create it?`,
      })

      if (createDir === 'Yes') {
        fs.mkdirSync(outputDir, { recursive: true })
        this.log(`Created output directory: ${outputDir}`)
      } else {
        this.log('User chose not to create output directory', true)
        throw new Error('Output directory does not exist and was not created.')
      }
    }

    return fullPath
  }

  private getFilesFromTree(): string[] {
    return this.treeStructure
      .filter((line) => !line.endsWith('/'))
      .map((line) => line.trim())
  }

  getTreeStructure(): string[] {
    return this.treeStructure
  }

  private async buildTreeStructure(dir: string, indent: string): Promise<void> {
    const entries = await vscode.workspace.fs.readDirectory(
      vscode.Uri.file(dir)
    )
    const sortedEntries = this.sortEntries(entries)

    for (const [entry, type] of sortedEntries) {
      const fullPath = path.join(dir, entry)
      const relativePath = path.relative(this.rootPath, fullPath)

      if (await this.shouldProcessFile(relativePath, false, false)) {
        if (type === vscode.FileType.Directory) {
          this.treeStructure.push(`${indent}${entry}/`)
          await this.buildTreeStructure(fullPath, indent + '  ')
        } else if (type === vscode.FileType.File) {
          this.treeStructure.push(`${indent}${entry}`)
          this.filesToProcess.push(relativePath)
        }
      }
    }
  }

  sortEntries(
    entries: [string, vscode.FileType][]
  ): [string, vscode.FileType][] {
    // This method doesn't need to be async as it doesn't use ignoreRules or includeRules
    return entries.sort(([aName, aType], [bName, bType]) => {
      if (aType === bType) {
        return aName.localeCompare(bName, undefined, {
          numeric: true,
          sensitivity: 'base',
        })
      }
      return aType === vscode.FileType.Directory ? -1 : 1
    })
  }

  private log(message: string, isError: boolean = false): void {
    const logMessage = `[${new Date().toISOString()}] ${message}`
    this.outputChannel.appendLine(logMessage)
    if (isError) {
      console.error(logMessage)
    } else {
      console.log(logMessage)
    }
  }
}
